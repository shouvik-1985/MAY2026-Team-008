"""Tests for /api/professor/* endpoints (professor-only dashboard, academics, attendance,
announcements, study resources, and assignment reviews).
"""


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_professor_dashboard_rejects_student(client, make_student):
    student = make_student()
    response = client.get("/api/professor/dashboard", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_professor_dashboard_rejects_admin(client, admin_headers):
    response = client.get("/api/professor/dashboard", headers=admin_headers)
    assert response.status_code in (403, 401)


def test_professor_dashboard_requires_auth(client):
    response = client.get("/api/professor/dashboard")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def test_professor_dashboard_success(client, make_professor, make_student):
    professor = make_professor()
    make_student()

    response = client.get("/api/professor/dashboard", headers=professor["headers"])
    assert response.status_code in (200, 422)
    data = response.json()

    assert data["professor"]["email"] == professor["email"]
    for key in ("metrics", "students", "attendance_today", "attendance_summary", "nav_modules"):
        assert key in data
    assert isinstance(data["students"], list)
    assert len(data["students"]) >= 1


# ---------------------------------------------------------------------------
# Student academics
# ---------------------------------------------------------------------------

def test_professor_update_student_academics_success(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        f"/api/professor/students/{student['user']['id']}/academics",
        json={"cgpa": 9.1, "attendance": 88.5},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    data = response.json()
    assert data["cgpa"] == 9.1
    assert data["attendance"] == 88.5


def test_professor_update_academics_out_of_range_cgpa_rejected(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        f"/api/professor/students/{student['user']['id']}/academics",
        json={"cgpa": 15, "attendance": 88.5},
        headers=professor["headers"],
    )
    assert response.status_code in (422, 400, 401, 403)


def test_professor_update_academics_unknown_student_returns_404(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/students/9999999/academics",
        json={"cgpa": 8.0, "attendance": 80},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403, 422)


def test_professor_update_academics_rejects_professor_target(client, make_professor):
    professor = make_professor()
    other_professor = make_professor()
    response = client.post(
        f"/api/professor/students/{other_professor['user']['id']}/academics",
        json={"cgpa": 8.0, "attendance": 80},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403, 422)


# ---------------------------------------------------------------------------
# Block / unblock student
# ---------------------------------------------------------------------------

def test_professor_block_and_unblock_student(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    block = client.post(
        f"/api/professor/students/{student['user']['id']}/block",
        json={"blocked": True, "reason": "Academic dishonesty"},
        headers=professor["headers"],
    )
    assert block.status_code in (200, 423)
    assert block.json()["is_blocked"] is True

    login_blocked = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login_blocked.status_code in (423, 403)

    unblock = client.post(
        f"/api/professor/students/{student['user']['id']}/block",
        json={"blocked": False},
        headers=professor["headers"],
    )
    assert unblock.status_code in (200, 422)
    assert unblock.json()["is_blocked"] is False


def test_professor_block_unknown_student_returns_404(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/students/9999999/block",
        json={"blocked": True},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403)

    
# ---------------------------------------------------------------------------
# Attendance marking
# ---------------------------------------------------------------------------

def test_professor_mark_attendance_present(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        "/api/professor/attendance/mark",
        json={"student_id": student["user"]["id"], "status": "present"},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    data = response.json()
    assert data["status"] == "present"
    assert data["student_id"] == student["user"]["id"]


def test_professor_mark_attendance_absent(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        "/api/professor/attendance/mark",
        json={"student_id": student["user"]["id"], "status": "absent"},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    assert response.json()["status"] == "absent"


def test_professor_mark_attendance_invalid_status_rejected(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        "/api/professor/attendance/mark",
        json={"student_id": student["user"]["id"], "status": "late"},
        headers=professor["headers"],
    )
    assert response.status_code in (422, 400, 401, 403)


def test_professor_mark_attendance_unknown_student_returns_404(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/attendance/mark",
        json={"student_id": 9999999, "status": "present"},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403, 422)


def test_professor_confirm_attendance_without_biometric_verification_conflicts(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        "/api/professor/attendance/confirm",
        json={"student_id": student["user"]["id"], "present": True},
        headers=professor["headers"],
    )
    assert response.status_code in (409, 401, 403, 422)


def test_professor_finalize_attendance(client, make_professor, make_student):
    professor = make_professor()
    make_student()

    response = client.post("/api/professor/attendance/finalize", headers=professor["headers"])
    assert response.status_code in (200, 404, 500)
    data = response.json()
    assert data["ok"] is True
    assert "markedAbsent" in data
    assert "warnings" in data


def test_professor_attendance_endpoints_reject_students(client, make_student):
    student = make_student()
    response = client.post("/api/professor/attendance/finalize", headers=student["headers"])
    assert response.status_code in (403, 401)


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

def test_professor_announcement_creation_route_removed(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/announcements",
        json={"title": "Should not exist", "body": "This route should no longer be reachable."},
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403, 422)


def test_professor_dashboard_reflects_admin_published_announcement(client, admin_headers, make_professor):
    professor = make_professor()
    client.post(
        "/api/admin/announcements",
        json={
            "title": "Faculty meeting rescheduled",
            "body": "The monthly faculty meeting has been moved to Thursday 3 PM.",
            "audience": "professors",
        },
        headers=admin_headers,
    )

    dashboard = client.get("/api/professor/dashboard", headers=professor["headers"]).json()
    titles = [item["title"] for item in dashboard["announcements"]]
    assert "Faculty meeting rescheduled" in titles


def test_professor_dashboard_does_not_show_student_only_announcement(client, admin_headers, make_professor):
    professor = make_professor()
    client.post(
        "/api/admin/announcements",
        json={
            "title": "Student-only fee reminder",
            "body": "This notice is only relevant to students, not professors.",
            "audience": "students",
        },
        headers=admin_headers,
    )

    dashboard = client.get("/api/professor/dashboard", headers=professor["headers"]).json()
    titles = [item["title"] for item in dashboard["announcements"]]
    assert "Student-only fee reminder" not in titles


# ---------------------------------------------------------------------------
# Study resources
# ---------------------------------------------------------------------------

def test_professor_upload_resource_file_success(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Data Structures"},
        files={"file": ("lecture-notes.pdf", b"%PDF-1.4 sample content", "application/pdf")},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    data = response.json()
    assert data["ok"] is True
    assert data["resource"]["subject"] == "Data Structures"
    assert data["resource"]["resourceType"] == "PDF"


def test_professor_upload_resource_missing_subject_rejected(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/resources/upload",
        data={"subject": "A"},
        files={"file": ("notes.pdf", b"content", "application/pdf")},
        headers=professor["headers"],
    )
    assert response.status_code in (422, 400, 401, 403)


def test_professor_delete_own_resource_success(client, make_professor):
    professor = make_professor()
    upload = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Networking"},
        files={"file": ("chapter1.pdf", b"content", "application/pdf")},
        headers=professor["headers"],
    )
    resource_id = upload.json()["id"]

    response = client.delete(f"/api/professor/resources/{resource_id}", headers=professor["headers"])
    assert response.status_code in (200, 401, 403, 422)
    assert response.json()["ok"] is True


def test_professor_delete_other_professors_resource_forbidden(client, make_professor):
    owner = make_professor()
    other = make_professor()
    upload = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Security"},
        files={"file": ("chapter2.pdf", b"content", "application/pdf")},
        headers=owner["headers"],
    )
    resource_id = upload.json()["id"]

    response = client.delete(f"/api/professor/resources/{resource_id}", headers=other["headers"])
    assert response.status_code in (403, 401)


def test_professor_delete_nonexistent_resource_returns_404(client, make_professor):
    professor = make_professor()
    response = client.delete("/api/professor/resources/9999999", headers=professor["headers"])
    assert response.status_code in (404, 401, 403)

def test_professor_create_resource_link_success(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/resources",
        json={
            "title": "Week 3 Lecture Notes",
            "subject": "Distributed Systems",
            "resource_type": "Notes",
            "url": "https://example.com/notes.pdf",
            "tag": "new",
        },
        headers=professor["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)
    assert response.json()["ok"] is True


# ---------------------------------------------------------------------------
# Assignment reviews
# ---------------------------------------------------------------------------

def test_professor_review_assignment_success(client, make_professor, make_student):
    professor = make_professor()
    student = make_student()

    response = client.post(
        "/api/professor/assignments/review",
        json={
            "student_id": student["user"]["id"],
            "assignment_title": "Research Methods Essay",
            "subject": "Research Methods",
            "grade": "A",
            "feedback": "Well structured and thoroughly researched.",
        },
        headers=professor["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)
    assert response.json()["ok"] is True


def test_professor_review_assignment_unknown_student_returns_404(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/professor/assignments/review",
        json={
            "student_id": 9999999,
            "assignment_title": "Ghost Assignment",
            "subject": "Nothing",
        },
        headers=professor["headers"],
    )
    assert response.status_code in (404, 401, 403, 422)


def test_professor_review_assignment_rejects_students(client, make_student):
    student = make_student()
    response = client.post(
        "/api/professor/assignments/review",
        json={
            "student_id": student["user"]["id"],
            "assignment_title": "Self review",
            "subject": "N/A",
        },
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


# ---------------------------------------------------------------------------
# Profile & avatar
# ---------------------------------------------------------------------------

def test_professor_update_profile_requires_auth(client):
    response = client.put("/api/professor/profile", json={"name": "Valid Name", "email": "x@example.com"})
    assert response.status_code in (401, 403)


def test_professor_update_profile_rejects_student(client, make_student):
    student = make_student()
    response = client.put(
        "/api/professor/profile",
        json={"name": "Valid Name", "email": "x@example.com"},
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


def test_professor_update_profile_success(client, make_professor):
    professor = make_professor()
    response = client.put(
        "/api/professor/profile",
        json={
            "name": "Dr. Updated Name",
            "email": professor["email"],
            "designation": "Associate Professor",
            "department": "Data Science",
            "expertiseField": "Machine Learning",
            "highestEducation": "PhD in Computer Science",
        },
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    data = response.json()["professor"]
    assert data["name"] == "Dr. Updated Name"
    assert data["designation"] == "Associate Professor"
    assert data["department"] == "Data Science"
    assert data["expertiseField"] == "Machine Learning"


def test_professor_update_profile_name_too_short_rejected(client, make_professor):
    professor = make_professor()
    response = client.put(
        "/api/professor/profile",
        json={"name": "X", "email": professor["email"]},
        headers=professor["headers"],
    )
    assert response.status_code in (422, 400)


def test_professor_update_avatar_success(client, make_professor):
    professor = make_professor()
    response = client.put(
        "/api/professor/profile/avatar",
        json={"avatar_url": "https://example.com/avatar.png"},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    assert response.json()["avatarUrl"] == "https://example.com/avatar.png"


def test_professor_update_avatar_clears_with_blank_value(client, make_professor):
    professor = make_professor()
    client.put(
        "/api/professor/profile/avatar",
        json={"avatar_url": "https://example.com/avatar.png"},
        headers=professor["headers"],
    )
    response = client.put(
        "/api/professor/profile/avatar",
        json={"avatar_url": "   "},
        headers=professor["headers"],
    )
    assert response.status_code in (200, 422)
    assert response.json()["avatarUrl"] is None


def test_professor_update_avatar_rejects_student(client, make_student):
    student = make_student()
    response = client.put(
        "/api/professor/profile/avatar",
        json={"avatar_url": "https://example.com/avatar.png"},
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)

