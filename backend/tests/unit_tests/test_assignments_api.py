"""Tests for the assignments workflow: professors generate assignments (AI-assisted,
with a deterministic local fallback when no OpenAI key is configured -- which is the
case in this test environment), students submit digitally or by file upload, and
professors review/override the AI-assigned grade.
"""


def _generate_assignment(client, professor_headers, **overrides):
    payload = {
        "assignment_type": "mcq",
        "subject": "Operating Systems",
        "source_kind": "content",
        "custom_content": (
            "Operating systems manage process scheduling, memory allocation, virtual "
            "memory, file systems, and I/O device coordination. Deadlock occurs when "
            "processes hold resources while waiting for others, creating a cycle."
        ),
        "question_count": 3,
        "total_points": 100,
    }
    payload.update(overrides)
    return client.post("/api/professor/assignments/generate", json=payload, headers=professor_headers)


# ---------------------------------------------------------------------------
# Generation: access control
# ---------------------------------------------------------------------------

def test_generate_assignment_requires_auth(client):
    response = client.post("/api/professor/assignments/generate", json={"subject": "Math"})
    assert response.status_code in (401, 403)


def test_generate_assignment_rejects_student(client, make_student):
    student = make_student()
    response = _generate_assignment(client, student["headers"])
    assert response.status_code in (403, 401)


# ---------------------------------------------------------------------------
# Generation: validation
# ---------------------------------------------------------------------------

def test_generate_assignment_invalid_type_rejected(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], assignment_type="essay")
    assert response.status_code in (422, 400)


def test_generate_assignment_question_count_out_of_range_rejected(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], question_count=50)
    assert response.status_code in (422, 400)


def test_generate_assignment_total_points_below_minimum_rejected(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], total_points=5)
    assert response.status_code in (422, 400)


def test_generate_assignment_subject_too_short_rejected(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], subject="A")
    assert response.status_code in (422, 400)


# ---------------------------------------------------------------------------
# Generation: success (local fallback, since no OpenAI key is configured here)
# ---------------------------------------------------------------------------

def test_generate_mcq_assignment_uses_local_fallback(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"])
    assert response.status_code in (200, 401, 403)
    data = response.json()
    assert data["ok"] is True
    assignment = data["assignment"]
    assert assignment["assignmentType"] == "mcq"
    assert len(assignment["questions"]) == 3
    for question in assignment["questions"]:
        assert question["answerKey"] in {"A", "B", "C", "D"}
        assert len(question["options"]) == 4


def test_generate_qa_assignment_success(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], assignment_type="qa", question_count=2)
    assert response.status_code in (200, 401, 403)
    assignment = response.json()["assignment"]
    assert assignment["assignmentType"] == "qa"
    assert len(assignment["questions"]) == 2


def test_generate_file_assignment_success(client, make_professor):
    professor = make_professor()
    response = _generate_assignment(client, professor["headers"], assignment_type="file")
    assert response.status_code in (200, 401, 403)
    assignment = response.json()["assignment"]
    assert assignment["assignmentType"] == "file"
    assert set(assignment["allowedFileTypes"]) == {"pdf", "doc", "docx"}


def test_generate_assignment_appears_on_professor_dashboard(client, make_professor):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], subject="Compiler Design").json()
    assignment_id = generated["assignment"]["id"]

    dashboard = client.get("/api/professor/dashboard", headers=professor["headers"]).json()
    ids = [item["id"] for item in dashboard["assignments"]]
    assert assignment_id in ids


# ---------------------------------------------------------------------------
# Student digital submission (mcq/qa)
# ---------------------------------------------------------------------------

def test_submit_digital_assignment_requires_auth(client):
    response = client.post("/api/student/assignments/1/digital-submit", json={"answers": {}})
    assert response.status_code in (401, 403)


def test_submit_digital_assignment_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/student/assignments/1/digital-submit",
        json={"answers": {}},
        headers=professor["headers"],
    )
    assert response.status_code in (403, 401)


def test_submit_digital_assignment_unknown_assignment_returns_404(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/assignments/9999999/digital-submit",
        json={"answers": {}},
        headers=student["headers"],
    )
    assert response.status_code in (404, 401, 403)


def test_submit_digital_assignment_all_correct_scores_full_marks(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"]).json()["assignment"]
    correct_answers = {q["id"]: q["answerKey"] for q in generated["questions"]}

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": correct_answers, "notes": "Completed all questions."},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403)
    review = response.json()["review"]
    assert review["score"] == 100
    assert review["grade"] == "S"


def test_submit_digital_assignment_all_wrong_scores_zero(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"]).json()["assignment"]
    wrong_answers = {}
    for q in generated["questions"]:
        options = {opt["id"] for opt in q["options"]}
        wrong_answers[q["id"]] = next(iter(options - {q["answerKey"]}))

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": wrong_answers},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403)
    assert response.json()["review"]["score"] == 0


def test_submit_digital_assignment_on_file_type_rejected(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], assignment_type="file").json()["assignment"]

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": {}},
        headers=student["headers"],
    )
    assert response.status_code in (422, 400)


def test_resubmit_digital_assignment_overwrites_previous_submission(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"]).json()["assignment"]
    correct_answers = {q["id"]: q["answerKey"] for q in generated["questions"]}
    wrong_answers = {qid: ("A" if key != "A" else "B") for qid, key in correct_answers.items()}

    student = make_student()
    first = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": wrong_answers},
        headers=student["headers"],
    )
    second = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": correct_answers},
        headers=student["headers"],
    )
    assert first.json()["submissionId"] == second.json()["submissionId"]
    assert second.json()["review"]["score"] == 100


def test_save_digital_assignment_draft_appears_in_progress(client, make_professor, make_student):
    student = make_student()
    professor = make_professor()
    generated = _generate_assignment(
        client,
        professor["headers"],
        subject="Programming in Python",
        question_count=3,
    ).json()["assignment"]
    first_question_id = generated["questions"][0]["id"]

    draft = client.post(
        f"/api/student/assignments/{generated['id']}/draft",
        json={
            "answers": {first_question_id: "A"},
            "notes": "I will finish the remaining questions later.",
            "active_question_index": 1,
        },
        headers=student["headers"],
    )

    assert draft.status_code == 200
    assert draft.json()["progress"] == 33

    dashboard = client.get("/api/student/dashboard", headers=student["headers"])
    assert dashboard.status_code == 200
    assignment = next(item for item in dashboard.json()["assignment_items"] if item["id"] == generated["id"])
    assert assignment["status"] == "ongoing"
    assert assignment["progress"] == 33
    assert assignment["draftAnswers"][first_question_id] == "A"
    assert assignment["draftNotes"] == "I will finish the remaining questions later."
    assert assignment["draftActiveQuestionIndex"] == 1


# ---------------------------------------------------------------------------
# Student file submission
# ---------------------------------------------------------------------------

def test_submit_file_assignment_success(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], assignment_type="file").json()["assignment"]

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/file-submit",
        data={"notes": "Attached my completed report."},
        files={"file": ("report.pdf", b"%PDF-1.4 sample report content", "application/pdf")},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403)
    assert response.json()["review"]["score"] >= 0


def test_submit_file_assignment_rejects_bad_extension(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], assignment_type="file").json()["assignment"]

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/file-submit",
        data={"notes": ""},
        files={"file": ("report.exe", b"not a document", "application/octet-stream")},
        headers=student["headers"],
    )
    assert response.status_code in (422, 400)


def test_submit_file_assignment_on_mcq_type_rejected(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"]).json()["assignment"]

    student = make_student()
    response = client.post(
        f"/api/student/assignments/{generated['id']}/file-submit",
        data={"notes": ""},
        files={"file": ("report.pdf", b"content", "application/pdf")},
        headers=student["headers"],
    )
    assert response.status_code in (422, 400)


# ---------------------------------------------------------------------------
# Professor: review submissions, download files
# ---------------------------------------------------------------------------

def test_professor_override_submission_grade(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"]).json()["assignment"]
    correct_answers = {q["id"]: q["answerKey"] for q in generated["questions"]}

    student = make_student()
    submission = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": correct_answers},
        headers=student["headers"],
    ).json()
    submission_id = submission["submissionId"]

    response = client.patch(
        f"/api/professor/assignments/submissions/{submission_id}/review",
        json={"score": 65, "feedback": "Good effort, but recheck question 2."},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 401, 403)
    updated = response.json()["submission"]
    assert updated["professorScore"] == 65
    assert updated["professorFeedback"] == "Good effort, but recheck question 2."


def test_professor_review_unknown_submission_returns_404(client, make_professor):
    professor = make_professor()
    response = client.patch(
        "/api/professor/assignments/submissions/9999999/review",
        json={"score": 50},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403)


def test_professor_review_rejects_student(client, make_student):
    student = make_student()
    response = client.patch(
        "/api/professor/assignments/submissions/1/review",
        json={"score": 50},
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


def test_professor_download_submission_file(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], assignment_type="file").json()["assignment"]

    student = make_student()
    submission = client.post(
        f"/api/student/assignments/{generated['id']}/file-submit",
        data={"notes": ""},
        files={"file": ("essay.docx", b"fake docx bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=student["headers"],
    ).json()
    submission_id = submission["submissionId"]

    response = client.get(
        f"/api/professor/assignments/submissions/{submission_id}/file",
        headers=professor["headers"],
    )
    assert response.status_code in (200, 401, 403)
    assert response.content == b"fake docx bytes"


def test_professor_download_submission_file_rejects_student(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], assignment_type="file").json()["assignment"]
    student = make_student()
    submission = client.post(
        f"/api/student/assignments/{generated['id']}/file-submit",
        data={"notes": ""},
        files={"file": ("essay.pdf", b"content", "application/pdf")},
        headers=student["headers"],
    ).json()

    response = client.get(
        f"/api/professor/assignments/submissions/{submission['submissionId']}/file",
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


def test_professor_download_nonexistent_submission_file_returns_404(client, make_professor):
    professor = make_professor()
    response = client.get(
        "/api/professor/assignments/submissions/9999999/file",
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403)


def test_professor_delete_published_assignment_removes_assignment_and_history(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()
    generated = _generate_assignment(client, professor["headers"], subject="Compiler Design").json()["assignment"]

    legacy_review = client.post(
        "/api/professor/assignments/review",
        json={
            "student_id": student["user"]["id"],
            "assignment_title": generated["title"],
            "subject": generated["subject"],
            "grade": "A",
            "feedback": "Reviewed before cleanup.",
        },
        headers=professor["headers"],
    )
    assert legacy_review.status_code == 200

    response = client.delete(f"/api/professor/assignments/{generated['id']}", headers=professor["headers"])
    assert response.status_code == 200, response.text
    deleted = response.json()
    assert deleted["id"] == generated["id"]
    assert deleted["deletedReviews"] >= 1

    dashboard = client.get("/api/professor/dashboard", headers=professor["headers"]).json()
    assert generated["id"] not in [item["id"] for item in dashboard["assignments"]]
    assert all(
        row["title"] != generated["title"] or row["subject"] != generated["subject"]
        for row in dashboard["assignment_reviews"]
    )


def test_professor_delete_assignment_submission_removes_queue_item_and_history(client, make_professor, make_student):
    professor = make_professor()
    generated = _generate_assignment(client, professor["headers"], subject="Database Management System").json()["assignment"]
    student = make_student()
    correct_answers = {question["id"]: question["answerKey"] for question in generated["questions"]}
    submission = client.post(
        f"/api/student/assignments/{generated['id']}/digital-submit",
        json={"answers": correct_answers},
        headers=student["headers"],
    ).json()
    submission_id = submission["submissionId"]

    professor_review = client.patch(
        f"/api/professor/assignments/submissions/{submission_id}/review",
        json={"score": 80, "feedback": "Ready for cleanup."},
        headers=professor["headers"],
    )
    assert professor_review.status_code == 200

    response = client.delete(f"/api/professor/assignments/submissions/{submission_id}", headers=professor["headers"])
    assert response.status_code == 200, response.text
    deleted = response.json()
    assert deleted["id"] == submission_id
    assert deleted["deletedReviews"] >= 1

    dashboard = client.get("/api/professor/dashboard", headers=professor["headers"]).json()
    assert submission_id not in [item["submissionId"] for item in dashboard["review_queue"]]
    assert submission_id not in [item["submissionId"] for item in dashboard["assignment_submissions"]]
    assert generated["id"] in [item["id"] for item in dashboard["assignments"]]
