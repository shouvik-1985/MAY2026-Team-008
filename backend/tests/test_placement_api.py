"""Tests for /api/placement/* endpoints (student placement portal + placement-manager
role management, applications, decisions, and resume access).
"""

from datetime import date, timedelta


def _application_form(**overrides):
    data = {
        "skills": "Python, SQL, React",
        "linkedin_profile": "https://linkedin.com/in/test-student",
        "github_profile": "https://github.com/test-student",
        "phone_number": "9876543210",
    }
    data.update(overrides)
    return data


def _submit_application(client, headers, **overrides):
    files = {"resume": ("resume.pdf", b"%PDF-1.4 fake resume content", "application/pdf")}
    return client.post(
        "/api/placement/student/application",
        data=_application_form(**overrides),
        files=files,
        headers=headers,
    )


def _create_role(client, manager_headers, **overrides):
    payload = {
        "title": "Software Engineering Intern",
        "company_name": "Acme Corp",
        "role_type": "internship",
        "location": "Bengaluru",
        "work_mode": "onsite",
        "compensation": "\u20b9 40,000/month",
        "deadline": (date.today() + timedelta(days=30)).isoformat(),
        "minimum_semester": 1,
        "minimum_cgpa": 5.0,
        "required_skills": "Python, SQL",
        "description": "Work with the platform engineering team on core services.",
    }
    payload.update(overrides)
    return client.post("/api/placement/manager/roles", json=payload, headers=manager_headers)


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_student_portal_requires_auth(client):
    response = client.get("/api/placement/student")
    assert response.status_code == 401


def test_student_portal_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.get("/api/placement/student", headers=professor["headers"])
    assert response.status_code == 403


def test_manager_dashboard_rejects_admin(client, admin_headers):
    response = client.get("/api/placement/manager/dashboard", headers=admin_headers)
    assert response.status_code == 403


def test_manager_dashboard_success(client, placement_manager_headers):
    response = client.get("/api/placement/manager/dashboard", headers=placement_manager_headers)
    assert response.status_code == 200
    data = response.json()
    for key in ("manager", "criteria", "metrics", "applications", "roles"):
        assert key in data


# ---------------------------------------------------------------------------
# Student portal & eligibility
# ---------------------------------------------------------------------------

def test_submit_application_rejected_for_ineligible_student(client, make_student):
    student = make_student()
    response = _submit_application(client, student["headers"])
    assert response.status_code == 409


def test_submit_application_success_for_eligible_student(client, make_eligible_student):
    student = make_eligible_student()
    response = _submit_application(client, student["headers"])
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["application"]["studentEmail"] == student["email"]
    assert data["application"]["resumeFilename"] == "resume.pdf"


def test_submit_application_missing_resume_first_time_rejected(client, make_eligible_student):
    student = make_eligible_student()
    response = client.post(
        "/api/placement/student/application",
        data=_application_form(),
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_submit_application_update_without_resume_keeps_previous_resume(client, make_eligible_student):
    student = make_eligible_student()
    first = _submit_application(client, student["headers"])
    assert first.status_code == 200

    update = client.post(
        "/api/placement/student/application",
        data=_application_form(skills="Python, Django, PostgreSQL"),
        headers=student["headers"],
    )
    assert update.status_code == 200
    assert update.json()["application"]["skills"] == "Python, Django, PostgreSQL"
    assert update.json()["application"]["resumeFilename"] == "resume.pdf"


def test_submit_application_invalid_resume_extension_rejected(client, make_eligible_student):
    student = make_eligible_student()
    response = client.post(
        "/api/placement/student/application",
        data=_application_form(),
        files={"resume": ("resume.exe", b"not a real resume", "application/octet-stream")},
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_submit_application_short_skills_rejected(client, make_eligible_student):
    student = make_eligible_student()
    response = client.post(
        "/api/placement/student/application",
        data=_application_form(skills="x"),
        files={"resume": ("resume.pdf", b"%PDF-1.4 tiny", "application/pdf")},
        headers=student["headers"],
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Roles: manager create / delete
# ---------------------------------------------------------------------------

def test_create_role_success(client, placement_manager_headers):
    response = _create_role(client, placement_manager_headers, title="Backend Intern")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["role"]["title"] == "Backend Intern"
    assert data["role"]["status"] == "open"


def test_create_role_invalid_work_mode_rejected(client, placement_manager_headers):
    response = _create_role(client, placement_manager_headers, work_mode="from-space")
    assert response.status_code == 422


def test_delete_role_before_deadline_conflicts(client, placement_manager_headers):
    created = _create_role(client, placement_manager_headers, title="Active Role Not Expired")
    role_id = created.json()["role"]["id"]

    response = client.delete(f"/api/placement/manager/roles/{role_id}", headers=placement_manager_headers)
    assert response.status_code == 409


def test_delete_expired_role_success(client, placement_manager_headers):
    created = _create_role(
        client,
        placement_manager_headers,
        title="Expired Internship",
        deadline=(date.today() - timedelta(days=5)).isoformat(),
    )
    role_id = created.json()["role"]["id"]

    response = client.delete(f"/api/placement/manager/roles/{role_id}", headers=placement_manager_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_delete_nonexistent_role_returns_404(client, placement_manager_headers):
    response = client.delete("/api/placement/manager/roles/9999999", headers=placement_manager_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Applying to roles
# ---------------------------------------------------------------------------

def test_apply_to_role_requires_placement_profile(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    role = _create_role(client, placement_manager_headers, title="Needs Profile First").json()["role"]

    response = client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    assert response.status_code == 409


def test_apply_to_role_success(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    _submit_application(client, student["headers"])
    role = _create_role(client, placement_manager_headers, title="Apply Success Role").json()["role"]

    response = client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    assert response.status_code == 200
    assert response.json()["role"]["applicationStatus"] == "applied"


def test_apply_to_role_twice_is_idempotent(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    _submit_application(client, student["headers"])
    role = _create_role(client, placement_manager_headers, title="Idempotent Apply Role").json()["role"]

    client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    second = client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    assert second.status_code == 200
    assert "already applied" in second.json()["message"].lower()


def test_apply_to_role_not_meeting_role_criteria_rejected(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    _submit_application(client, student["headers"])
    role = _create_role(
        client,
        placement_manager_headers,
        title="High Bar Role",
        minimum_semester=14,
        minimum_cgpa=9.9,
    ).json()["role"]

    response = client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    assert response.status_code == 409


def test_apply_to_unknown_role_returns_404(client, make_eligible_student):
    student = make_eligible_student()
    _submit_application(client, student["headers"])
    response = client.post("/api/placement/student/roles/9999999/apply", headers=student["headers"])
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Manager decisions on role applications
# ---------------------------------------------------------------------------

def _apply_ready_student(client, make_eligible_student, placement_manager_headers, role_title):
    student = make_eligible_student()
    _submit_application(client, student["headers"])
    role = _create_role(client, placement_manager_headers, title=role_title).json()["role"]
    apply_response = client.post(f"/api/placement/student/roles/{role['id']}/apply", headers=student["headers"])
    role_application_id = apply_response.json()["role"]["roleApplicationId"]
    return student, role, role_application_id


def test_manager_accept_role_application(client, make_eligible_student, placement_manager_headers):
    student, role, role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Decision Accept Role"
    )

    response = client.post(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}/decision",
        json={"status": "accepted"},
        headers=placement_manager_headers,
    )
    assert response.status_code == 200
    assert response.json()["roleApplication"]["status"] == "accepted"


def test_manager_reject_role_application_with_custom_message(client, make_eligible_student, placement_manager_headers):
    student, role, role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Decision Reject Role"
    )

    response = client.post(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}/decision",
        json={"status": "rejected", "message": "Not a fit for this cycle."},
        headers=placement_manager_headers,
    )
    assert response.status_code == 200
    assert response.json()["roleApplication"]["decisionMessage"] == "Not a fit for this cycle."


def test_manager_decision_rejects_non_manager(client, make_eligible_student, placement_manager_headers, make_student):
    student, role, role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Decision Auth Role"
    )
    other_student = make_student()

    response = client.post(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}/decision",
        json={"status": "accepted"},
        headers=other_student["headers"],
    )
    assert response.status_code == 403


def test_manager_decision_unknown_application_returns_404(client, placement_manager_headers):
    created = _create_role(client, placement_manager_headers, title="Empty Applicant Role")
    role_id = created.json()["role"]["id"]
    response = client.post(
        f"/api/placement/manager/roles/{role_id}/applications/9999999/decision",
        json={"status": "accepted"},
        headers=placement_manager_headers,
    )
    assert response.status_code == 404


def test_dismiss_role_applicant_after_decision_success(client, make_eligible_student, placement_manager_headers):
    student, role, role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Dismiss After Decision Role"
    )
    client.post(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}/decision",
        json={"status": "accepted"},
        headers=placement_manager_headers,
    )

    response = client.delete(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}",
        headers=placement_manager_headers,
    )
    assert response.status_code == 200


def test_student_dismiss_own_role_history_after_decision(client, make_eligible_student, placement_manager_headers):
    student, role, role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Student Dismiss Role"
    )
    client.post(
        f"/api/placement/manager/roles/{role['id']}/applications/{role_application_id}/decision",
        json={"status": "rejected"},
        headers=placement_manager_headers,
    )

    response = client.delete(f"/api/placement/student/roles/{role['id']}/application", headers=student["headers"])
    assert response.status_code == 200


def test_student_dismiss_role_application_while_pending_conflicts(client, make_eligible_student, placement_manager_headers):
    student, role, _role_application_id = _apply_ready_student(
        client, make_eligible_student, placement_manager_headers, "Student Dismiss Pending Role"
    )

    response = client.delete(f"/api/placement/student/roles/{role['id']}/application", headers=student["headers"])
    assert response.status_code == 409


def test_student_dismiss_nonexistent_role_application_returns_404(client, make_student):
    student = make_student()
    response = client.delete("/api/placement/student/roles/9999999/application", headers=student["headers"])
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Selecting an applicant (placement offer)
# ---------------------------------------------------------------------------

def test_manager_select_application_success(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    submit = _submit_application(client, student["headers"])
    application_id = submit.json()["application"]["id"]

    response = client.post(
        f"/api/placement/manager/applications/{application_id}/select",
        json={"opportunity_title": "Senior Backend Role"},
        headers=placement_manager_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["application"]["status"] == "selected"
    assert "Senior Backend Role" in data["notification"]


def test_manager_select_unknown_application_returns_404(client, placement_manager_headers):
    response = client.post(
        "/api/placement/manager/applications/9999999/select",
        json={},
        headers=placement_manager_headers,
    )
    assert response.status_code == 404


def test_manager_select_rejects_non_manager(client, make_eligible_student):
    student = make_eligible_student()
    submit = _submit_application(client, student["headers"])
    application_id = submit.json()["application"]["id"]

    response = client.post(
        f"/api/placement/manager/applications/{application_id}/select",
        json={},
        headers=student["headers"],
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Resume access
# ---------------------------------------------------------------------------

def test_owning_student_can_open_own_resume(client, make_eligible_student):
    student = make_eligible_student()
    submit = _submit_application(client, student["headers"])
    application_id = submit.json()["application"]["id"]

    response = client.get(f"/api/placement/applications/{application_id}/resume", headers=student["headers"])
    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 fake resume content"


def test_other_student_cannot_open_someone_elses_resume(client, make_eligible_student):
    owner = make_eligible_student()
    other = make_eligible_student()
    submit = _submit_application(client, owner["headers"])
    application_id = submit.json()["application"]["id"]

    response = client.get(f"/api/placement/applications/{application_id}/resume", headers=other["headers"])
    assert response.status_code == 403


def test_manager_can_open_any_resume(client, make_eligible_student, placement_manager_headers):
    student = make_eligible_student()
    submit = _submit_application(client, student["headers"])
    application_id = submit.json()["application"]["id"]

    response = client.get(
        f"/api/placement/applications/{application_id}/resume", headers=placement_manager_headers
    )
    assert response.status_code == 200


def test_open_nonexistent_resume_returns_404(client, placement_manager_headers):
    response = client.get(
        "/api/placement/applications/9999999/resume", headers=placement_manager_headers
    )
    assert response.status_code == 404

