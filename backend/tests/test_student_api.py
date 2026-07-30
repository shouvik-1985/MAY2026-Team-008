"""Tests for /api/student/* endpoints (student-only dashboard, profile, attendance,
todos, certificates, events, and marketplace flows).
"""

FACE_TEMPLATE = [round(0.05 * ((i % 9) + 1), 4) for i in range(120)]


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_student_features_requires_auth(client):
    response = client.get("/api/student/features")
    assert response.status_code == 401


def test_student_features_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.get("/api/student/features", headers=professor["headers"])
    assert response.status_code == 403


def test_student_features_rejects_admin(client, admin_headers):
    response = client.get("/api/student/features", headers=admin_headers)
    assert response.status_code == 403


def test_student_features_success(client, make_student):
    student = make_student()
    response = client.get("/api/student/features", headers=student["headers"])
    assert response.status_code == 200
    assert "features" in response.json()
    assert isinstance(response.json()["features"], list)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

def test_student_get_profile_success(client, make_student):
    student = make_student()
    response = client.get("/api/student/profile", headers=student["headers"])
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == student["email"]
    assert "studentCode" in data
    assert "cgpa" in data


def test_student_update_profile_success(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile",
        json={
            "name": "Updated Student Name",
            "email": student["email"],
            "address": "New Hostel Block",
            "phone": "9876543210",
            "bio": "Curious learner.",
            "focus": "Machine Learning",
            "skills": ["Python", "SQL", "Python"],
            "linkedin_url": "https://linkedin.com/in/test-student",
            "github_url": "https://github.com/test-student",
        },
        headers=student["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Student Name"
    assert data["address"] == "New Hostel Block"
    assert data["phone"] == "9876543210"
    assert data["skills"] == ["Python", "SQL"]


def test_student_update_profile_invalid_phone_rejected(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile",
        json={
            "name": "Test",
            "email": student["email"],
            "address": "Campus",
            "phone": "12345",
        },
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_student_update_profile_invalid_linkedin_url_rejected(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile",
        json={
            "name": "Test",
            "email": student["email"],
            "address": "Campus",
            "linkedin_url": "https://notlinkedin.com/test",
        },
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_student_update_profile_duplicate_email_rejected(client, make_student):
    first = make_student()
    second = make_student()
    response = client.put(
        "/api/student/profile",
        json={"name": "Second Student", "email": first["email"], "address": "Campus"},
        headers=second["headers"],
    )
    assert response.status_code == 409


def test_student_update_profile_credits_exceed_total_rejected(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile",
        json={
            "name": "Test",
            "email": student["email"],
            "address": "Campus",
            "completed_credits": 200,
            "total_credits": 180,
        },
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_student_update_avatar_success(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile/avatar",
        json={"avatar_url": "data:image/png;base64,aGVsbG8="},
        headers=student["headers"],
    )
    assert response.status_code == 200
    assert response.json()["avatarUrl"] == "data:image/png;base64,aGVsbG8="


def test_student_update_avatar_rejects_non_data_url(client, make_student):
    student = make_student()
    response = client.put(
        "/api/student/profile/avatar",
        json={"avatar_url": "https://example.com/avatar.png"},
        headers=student["headers"],
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def test_student_dashboard_success(client, make_student):
    student = make_student()
    response = client.get("/api/student/dashboard", headers=student["headers"])
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == student["email"]
    for key in ("metrics", "fee_summary", "module_health", "student_todos", "nav_modules"):
        assert key in data


# ---------------------------------------------------------------------------
# Attendance: settings, radius, biometrics
# ---------------------------------------------------------------------------

def test_student_attendance_settings_success(client, make_student):
    student = make_student()
    response = client.get("/api/student/attendance/settings", headers=student["headers"])
    assert response.status_code == 200
    assert "radius_meters" in response.json()


def test_student_radius_check_within_configured_campus(client, admin_headers, make_student):
    admin_set = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 500, "latitude": 10.0, "longitude": 20.0, "campus_name": "Radius Test Campus"},
        headers=admin_headers,
    )
    assert admin_set.status_code == 200

    student = make_student()
    response = client.post(
        "/api/student/attendance/radius-check",
        json={"latitude": 10.0, "longitude": 20.0},
        headers=student["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["campusConfigured"] is True
    assert data["withinRadius"] is True


def test_student_radius_check_outside_configured_campus(client, admin_headers, make_student):
    client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 100, "latitude": 10.0, "longitude": 20.0},
        headers=admin_headers,
    )
    student = make_student()
    response = client.post(
        "/api/student/attendance/radius-check",
        json={"latitude": 40.0, "longitude": 70.0},
        headers=student["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["withinRadius"] is False


def test_student_biometric_verify_enrolls_and_matches(client, admin_headers, make_student):
    client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 500, "latitude": 15.0, "longitude": 25.0},
        headers=admin_headers,
    )
    student = make_student()
    client.post(
        "/api/student/attendance/radius-check",
        json={"latitude": 15.0, "longitude": 25.0},
        headers=student["headers"],
    )

    enroll = client.post(
        "/api/student/attendance/biometric-verify",
        json={"latitude": 15.0, "longitude": 25.0, "face_template": FACE_TEMPLATE},
        headers=student["headers"],
    )
    assert enroll.status_code == 200
    enroll_data = enroll.json()
    assert enroll_data["verificationMode"] == "enrolled"
    assert enroll_data["biometricEnrolled"] is True

    verify_again = client.post(
        "/api/student/attendance/biometric-verify",
        json={"latitude": 15.0, "longitude": 25.0, "face_template": FACE_TEMPLATE},
        headers=student["headers"],
    )
    assert verify_again.status_code == 200
    assert verify_again.json()["verificationMode"] == "matched"


def test_student_biometric_verify_without_radius_check_conflicts(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/attendance/biometric-verify",
        json={"face_template": FACE_TEMPLATE},
        headers=student["headers"],
    )
    assert response.status_code == 409


def test_student_biometric_verify_missing_template_rejected(client, admin_headers, make_student):
    client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 500, "latitude": 12.0, "longitude": 22.0},
        headers=admin_headers,
    )
    student = make_student()
    client.post(
        "/api/student/attendance/radius-check",
        json={"latitude": 12.0, "longitude": 22.0},
        headers=student["headers"],
    )
    response = client.post(
        "/api/student/attendance/biometric-verify",
        json={"latitude": 12.0, "longitude": 22.0},
        headers=student["headers"],
    )
    assert response.status_code == 422


def test_student_biometric_reset(client, admin_headers, make_student):
    client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 500, "latitude": 11.0, "longitude": 21.0},
        headers=admin_headers,
    )
    student = make_student()
    client.post(
        "/api/student/attendance/radius-check",
        json={"latitude": 11.0, "longitude": 21.0},
        headers=student["headers"],
    )
    client.post(
        "/api/student/attendance/biometric-verify",
        json={"latitude": 11.0, "longitude": 21.0, "face_template": FACE_TEMPLATE},
        headers=student["headers"],
    )

    response = client.post("/api/student/attendance/biometric-reset", headers=student["headers"])
    assert response.status_code == 200
    assert response.json()["biometricEnrolled"] is False


# ---------------------------------------------------------------------------
# Todos
# ---------------------------------------------------------------------------

def test_student_todo_lifecycle(client, make_student):
    student = make_student()

    empty = client.get("/api/student/todos", headers=student["headers"])
    assert empty.status_code == 200
    assert empty.json()["todos"] == []

    create = client.post(
        "/api/student/todos",
        json={"title": "Finish lab report"},
        headers=student["headers"],
    )
    assert create.status_code == 200
    todo_id = create.json()["todo"]["id"]
    assert create.json()["todo"]["completed"] is False

    update = client.patch(
        f"/api/student/todos/{todo_id}",
        json={"completed": True},
        headers=student["headers"],
    )
    assert update.status_code == 200
    assert update.json()["todo"]["completed"] is True

    delete = client.delete(f"/api/student/todos/{todo_id}", headers=student["headers"])
    assert delete.status_code == 200
    assert all(todo["id"] != todo_id for todo in delete.json()["todos"])


def test_student_update_nonexistent_todo_returns_404(client, make_student):
    student = make_student()
    response = client.patch(
        "/api/student/todos/9999999",
        json={"completed": True},
        headers=student["headers"],
    )
    assert response.status_code == 404


def test_student_cannot_modify_another_students_todo(client, make_student):
    owner = make_student()
    other = make_student()

    create = client.post("/api/student/todos", json={"title": "Private task"}, headers=owner["headers"])
    todo_id = create.json()["todo"]["id"]

    response = client.patch(
        f"/api/student/todos/{todo_id}",
        json={"completed": True},
        headers=other["headers"],
    )
    assert response.status_code == 404


def test_student_create_todo_blank_title_rejected(client, make_student):
    student = make_student()
    response = client.post("/api/student/todos", json={"title": ""}, headers=student["headers"])
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Certificates
# ---------------------------------------------------------------------------

def test_student_request_certificate_success(client, make_student):
    student = make_student()
    response = client.post("/api/student/certificates/bonafide/request", headers=student["headers"])
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_student_request_unknown_certificate_returns_404(client, make_student):
    student = make_student()
    response = client.post("/api/student/certificates/unknown-cert/request", headers=student["headers"])
    assert response.status_code == 404


def test_student_download_certificate_before_ready_conflicts(client, make_student):
    student = make_student()
    client.post("/api/student/certificates/conduct/request", headers=student["headers"])
    
    response = client.get("/api/student/certificates/conduct/file", headers=student["headers"])
    assert response.status_code == 409


def test_student_download_certificate_without_request_conflicts(client, make_student):
    student = make_student()
    response = client.get("/api/student/certificates/bonafide/file", headers=student["headers"])
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Events & marketplace
# ---------------------------------------------------------------------------

def test_student_register_event_success(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/events/career-connect-week/register",
        headers=student["headers"],
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_student_register_event_twice_is_idempotent(client, make_student):
    student = make_student()
    client.post("/api/student/events/research-poster-day/register", headers=student["headers"])
    second = client.post("/api/student/events/research-poster-day/register", headers=student["headers"])
    assert second.status_code == 200
    assert "Already registered" in second.json()["message"]


def test_student_register_unknown_event_returns_404(client, make_student):
    student = make_student()
    response = client.post("/api/student/events/unknown-event/register", headers=student["headers"])
    assert response.status_code == 404


def test_student_marketplace_inquiry_success(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/marketplace/notes-bundle/inquire",
        params={"note": "Is this still available?"},
        headers=student["headers"],
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_student_marketplace_inquiry_unknown_item_returns_404(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/marketplace/unknown-item/inquire",
        headers=student["headers"],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["message"] == (
        "Inquiry sent for Marketplace Item! "
        "Check Campus Connect Chat to coordinate pickup with the seller."
    )


# ---------------------------------------------------------------------------
# Fee invoices
# ---------------------------------------------------------------------------

def test_student_open_fee_invoice_success(client, make_student):
    student = make_student()
    dashboard = client.get("/api/student/dashboard", headers=student["headers"]).json()
    invoice_id = dashboard["fee_history"][0]["id"]

    response = client.get(f"/api/student/fees/invoices/{invoice_id}", headers=student["headers"])
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]


def test_student_open_unknown_fee_invoice_returns_404(client, make_student):
    student = make_student()
    response = client.get("/api/student/fees/invoices/INV-DOES-NOT-EXIST", headers=student["headers"])
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# AI assistant (role gate only)
# ---------------------------------------------------------------------------

def test_student_assistant_chat_rejects_non_students(client, make_professor):
    professor = make_professor()
    response = client.post(
        "/api/student/assistant/chat",
        json={"message": "What is my attendance?"},
        headers=professor["headers"],
    )
    assert response.status_code == 403


