"""Tests for /api/admin/* endpoints (admin-only dashboard, account & campus management)."""


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_admin_dashboard_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.get("/api/admin/dashboard", headers=professor["headers"])
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def test_admin_dashboard_success(client, admin_headers, make_student, make_professor):
    student = make_student()
    professor = make_professor()

    response = client.get("/api/admin/dashboard", headers=admin_headers)
    assert response.status_code == 200

    data = response.json()
    assert "admin" in data
    assert data["admin"]["email"] == "admin@campusverse.edu"
    assert "metrics" in data and isinstance(data["metrics"], list)
    assert "account_ratio" in data
    assert "students" in data and "professors" in data

    student_emails = [row["email"] for row in data["students"]]
    professor_emails = [row["email"] for row in data["professors"]]
    assert student["email"] in student_emails
    assert professor["email"] in professor_emails


def test_admin_dashboard_student_row_shape(client, admin_headers, make_student):
    student = make_student()
    response = client.get("/api/admin/dashboard", headers=admin_headers)
    row = next(item for item in response.json()["students"] if item["email"] == student["email"])
    for key in ("id", "name", "studentCode", "department", "semester", "cgpa", "attendance", "status", "isBlocked"):
        assert key in row


# ---------------------------------------------------------------------------
# Campus / management settings
# ---------------------------------------------------------------------------

def test_admin_management_get(client, admin_headers):
    response = client.get("/api/admin/management", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    for key in ("campus_name", "radius_meters", "semester_duration_months", "campus_configured", "slot_batches"):
        assert key in data


def test_admin_management_requires_admin(client, make_student):
    student = make_student()
    response = client.get("/api/admin/management", headers=student["headers"])
    assert response.status_code == 403


def test_admin_update_attendance_radius_success(client, admin_headers):
    response = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 250, "latitude": 12.9716, "longitude": 77.5946, "campus_name": "Main Campus"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["radius_meters"] == 250
    assert data["latitude"] == 12.9716
    assert data["longitude"] == 77.5946
    assert data["campus_name"] == "Main Campus"
    assert data["campus_configured"] is True


def test_admin_update_attendance_radius_below_minimum_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 5},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_admin_update_attendance_radius_above_maximum_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 5000},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_admin_update_semester_duration_months(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_months": 4, "semester_duration_unit": "months"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["semester_duration_months"] == 4
    assert data["semester_duration_unit"] == "months"


def test_admin_update_semester_duration_days(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_unit": "days", "semester_duration_days": 120},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["semester_duration_unit"] == "days"
    assert data["semester_duration_days"] == 120


def test_admin_update_semester_duration_invalid_unit_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_unit": "weeks"},
        headers=admin_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Slot batches
# ---------------------------------------------------------------------------

def test_admin_create_slot_batch_success(client, admin_headers):
    response = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Batch 2026-A", "total_slots": 60, "open_for_intake": True},
        headers=admin_headers,
    )
    assert response.status_code == 200
    batches = response.json()["slot_batches"]
    names = [batch["batch_name"] for batch in batches]
    assert "Batch 2026-A" in names
    default_batch = next(b for b in batches if b["batch_name"] == "Sem 1 Open Intake")
    restore = client.patch(
        f"/api/admin/management/slot-batches/{default_batch['id']}",
        json={"open_for_intake": True},
        headers=admin_headers,
    )
    assert restore.status_code == 200


def test_admin_create_slot_batch_duplicate_name_rejected(client, admin_headers):
    payload = {"batch_name": "Duplicate Batch", "total_slots": 30, "open_for_intake": False}
    first = client.post("/api/admin/management/slot-batches", json=payload, headers=admin_headers)
    assert first.status_code == 200

    second = client.post("/api/admin/management/slot-batches", json=payload, headers=admin_headers)
    assert second.status_code == 409


def test_admin_create_slot_batch_invalid_total_slots_rejected(client, admin_headers):
    response = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Zero Slots Batch", "total_slots": 0},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_admin_update_slot_batch_not_found(client, admin_headers):
    response = client.patch(
        "/api/admin/management/slot-batches/999999",
        json={"total_slots": 10},
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_admin_update_slot_batch_rename(client, admin_headers):
    create = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Rename Source Batch", "total_slots": 20, "open_for_intake": False},
        headers=admin_headers,
    )
    assert create.status_code == 200
    management = client.get("/api/admin/management", headers=admin_headers).json()
    batch = next(b for b in management["slot_batches"] if b["batch_name"] == "Rename Source Batch")
    batch_id = batch["id"]

    response = client.patch(
        f"/api/admin/management/slot-batches/{batch_id}",
        json={"batch_name": "Renamed Batch"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    updated_names = [b["batch_name"] for b in response.json()["slot_batches"]]
    assert "Renamed Batch" in updated_names


# ---------------------------------------------------------------------------
# Block / unblock accounts
# ---------------------------------------------------------------------------

def test_admin_block_and_unblock_student(client, admin_headers, make_student):
    student = make_student()
    student_id = student["user"]["id"]

    block = client.post(
        f"/api/admin/users/{student_id}/block",
        json={"blocked": True, "reason": "Fee dues pending"},
        headers=admin_headers,
    )
    assert block.status_code == 200
    assert block.json()["is_blocked"] is True

    login_blocked = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login_blocked.status_code == 423

    unblock = client.post(
        f"/api/admin/users/{student_id}/block",
        json={"blocked": False},
        headers=admin_headers,
    )
    assert unblock.status_code == 200
    assert unblock.json()["is_blocked"] is False

    login_ok = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login_ok.status_code == 200


def test_admin_block_nonexistent_user_returns_404(client, admin_headers):
    response = client.post(
        "/api/admin/users/9999999/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_admin_cannot_modify_own_account(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    response = client.post(
        f"/api/admin/users/{me['id']}/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Delete accounts
# ---------------------------------------------------------------------------

def test_admin_delete_student_account(client, admin_headers, make_student):
    student = make_student()
    student_id = student["user"]["id"]

    response = client.delete(f"/api/admin/users/{student_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True

    login = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login.status_code == 401


def test_admin_delete_professor_account(client, admin_headers, make_professor):
    professor = make_professor()
    professor_id = professor["user"]["id"]

    response = client.delete(f"/api/admin/users/{professor_id}", headers=admin_headers)
    assert response.status_code == 200

    login = client.post(
        "/api/auth/login",
        json={"email": professor["email"], "password": "strongpass123"},
    )
    assert login.status_code == 401


def test_admin_delete_nonexistent_account_returns_404(client, admin_headers):
    response = client.delete("/api/admin/users/9999999", headers=admin_headers)
    assert response.status_code == 404


def test_admin_delete_own_account_forbidden(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    response = client.delete(f"/api/admin/users/{me['id']}", headers=admin_headers)
    assert response.status_code == 400
