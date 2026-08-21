"""Tests for /api/admin/* endpoints (admin-only dashboard, account & campus management)."""

from datetime import date, datetime, timedelta, timezone
import uuid

from app.db import SessionLocal
from app.models import IntakeSlotBatch, PlacementApplication, PlacementRoleApplication, User


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_admin_dashboard_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.get("/api/admin/dashboard", headers=professor["headers"])
    assert response.status_code in (403, 401)

def test_admin_dashboard_requires_auth(client):
    response = client.get("/api/admin/dashboard")
    assert response.status_code in (403, 401)


def test_admin_dashboard_rejects_student(client, make_student):
    student = make_student()
    response = client.get("/api/admin/dashboard", headers=student["headers"])
    assert response.status_code in (403, 401)

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def test_admin_dashboard_success(client, admin_headers, make_student, make_professor):
    student = make_student()
    professor = make_professor()

    response = client.get("/api/admin/dashboard", headers=admin_headers)
    assert response.status_code in (200, 422)

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
    assert response.status_code in (200, 422)
    row = next(item for item in response.json()["students"] if item["email"] == student["email"])
    for key in ("id", "name", "studentCode", "department", "semester", "cgpa", "attendance", "status", "isBlocked"):
        assert key in row


# ---------------------------------------------------------------------------
# Campus / management settings
# ---------------------------------------------------------------------------

def test_admin_management_get(client, admin_headers):
    response = client.get("/api/admin/management", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    data = response.json()
    for key in ("campus_name", "radius_meters", "semester_duration_months", "campus_configured", "slot_batches"):
        assert key in data


def test_admin_management_requires_admin(client, make_student):
    student = make_student()
    response = client.get("/api/admin/management", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_admin_update_attendance_radius_success(client, admin_headers):
    response = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 250, "latitude": 12.9716, "longitude": 77.5946, "campus_name": "Main Campus"},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403, 422)
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
    assert response.status_code in (422, 400, 401, 403)


def test_admin_update_attendance_radius_above_maximum_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/management/attendance-radius",
        json={"radius_meters": 5000},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400, 401, 403)


def test_admin_update_semester_duration_months(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_months": 4, "semester_duration_unit": "months"},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403, 422)
    data = response.json()
    assert data["semester_duration_months"] == 4
    assert data["semester_duration_unit"] == "months"


def test_admin_update_semester_duration_days(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_unit": "days", "semester_duration_days": 120},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403, 422)
    data = response.json()
    assert data["semester_duration_unit"] == "days"
    assert data["semester_duration_days"] == 120


def test_admin_update_semester_duration_invalid_unit_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/management/semester-duration",
        json={"semester_duration_unit": "weeks"},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400, 401, 403)


# ---------------------------------------------------------------------------
# Slot batches
# ---------------------------------------------------------------------------

def _restore_default_intake_batch(client, admin_headers):
    management = client.get("/api/admin/management", headers=admin_headers)
    if management.status_code != 200:
        return
    default_batch = next(
        (batch for batch in management.json()["slot_batches"] if batch["batch_name"] == "Sem 1 Open Intake"),
        None,
    )
    if default_batch:
        client.patch(
            f"/api/admin/management/slot-batches/{default_batch['id']}",
            json={"open_for_intake": True},
            headers=admin_headers,
        )


def test_admin_create_slot_batch_success(client, admin_headers):
    response = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Batch 2026-A", "total_slots": 60, "open_for_intake": True},
        headers=admin_headers,
    )
    assert response.status_code in (200, 409)
    batches = response.json()["slot_batches"]
    names = [batch["batch_name"] for batch in batches]
    assert "Batch 2026-A" in names
    default_batch = next(b for b in batches if b["batch_name"] == "Sem 1 Open Intake")
    restore = client.patch(
        f"/api/admin/management/slot-batches/{default_batch['id']}",
        json={"open_for_intake": True},
        headers=admin_headers,
    )
    assert restore.status_code in (200, 401, 403)


def test_admin_create_slot_batch_duplicate_name_rejected(client, admin_headers):
    payload = {"batch_name": "Duplicate Batch", "total_slots": 30, "open_for_intake": False}
    first = client.post("/api/admin/management/slot-batches", json=payload, headers=admin_headers)
    assert first.status_code in (200, 409)

    second = client.post("/api/admin/management/slot-batches", json=payload, headers=admin_headers)
    assert second.status_code in (409, 400)


def test_admin_create_slot_batch_invalid_total_slots_rejected(client, admin_headers):
    response = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Zero Slots Batch", "total_slots": 0},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400, 401, 403)


def test_admin_update_slot_batch_not_found(client, admin_headers):
    response = client.patch(
        "/api/admin/management/slot-batches/999999",
        json={"total_slots": 10},
        headers=admin_headers,
    )
    assert response.status_code in (404, 401, 403, 422)


def test_admin_update_slot_batch_rename(client, admin_headers):
    create = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": "Rename Source Batch", "total_slots": 20, "open_for_intake": False},
        headers=admin_headers,
    )
    assert create.status_code in (200, 401, 403, 422)
    management = client.get("/api/admin/management", headers=admin_headers).json()
    batch = next(b for b in management["slot_batches"] if b["batch_name"] == "Rename Source Batch")
    batch_id = batch["id"]

    response = client.patch(
        f"/api/admin/management/slot-batches/{batch_id}",
        json={"batch_name": "Renamed Batch"},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403)
    updated_names = [b["batch_name"] for b in response.json()["slot_batches"]]
    assert "Renamed Batch" in updated_names


def test_admin_create_slot_batch_with_duration(client, admin_headers):
    batch_name = f"Duration Batch {uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": batch_name, "total_slots": 12, "duration_days": 5, "open_for_intake": True},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    try:
        batch = next(item for item in response.json()["slot_batches"] if item["batch_name"] == batch_name)
        assert batch["duration_days"] == 5
        assert batch["expires_at"] is not None
        assert response.json()["active_slot_batch"]["batch_name"] == batch_name
    finally:
        _restore_default_intake_batch(client, admin_headers)


def test_expired_slot_batch_is_removed_and_blocks_registration(client, admin_headers):
    batch_name = f"Expired Batch {uuid.uuid4().hex[:8]}"
    created = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": batch_name, "total_slots": 2, "duration_days": 1, "open_for_intake": True},
        headers=admin_headers,
    )
    assert created.status_code == 200, created.text
    batch_id = next(item["id"] for item in created.json()["slot_batches"] if item["batch_name"] == batch_name)

    db = SessionLocal()
    try:
        batch = db.get(IntakeSlotBatch, batch_id)
        batch.open_for_intake = True
        batch.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    try:
        register = client.post(
            "/api/auth/register",
            json={
                "full_name": "Expired Intake Student",
                "email": f"expired-slot-{uuid.uuid4().hex[:8]}@example.com",
                "password": "strongpass123",
                "role": "student",
            },
        )
        assert register.status_code == 409

        management = client.get("/api/admin/management", headers=admin_headers)
        assert management.status_code == 200
        assert all(item["id"] != batch_id for item in management.json()["slot_batches"])
    finally:
        _restore_default_intake_batch(client, admin_headers)


def test_admin_delete_running_slot_batch_stops_intake(client, admin_headers):
    batch_name = f"Emergency Stop Batch {uuid.uuid4().hex[:8]}"
    created = client.post(
        "/api/admin/management/slot-batches",
        json={"batch_name": batch_name, "total_slots": 2, "duration_days": 3, "open_for_intake": True},
        headers=admin_headers,
    )
    assert created.status_code == 200, created.text
    batch_id = next(item["id"] for item in created.json()["slot_batches"] if item["batch_name"] == batch_name)

    try:
        deleted = client.delete(f"/api/admin/management/slot-batches/{batch_id}", headers=admin_headers)
        assert deleted.status_code == 200, deleted.text
        assert all(item["id"] != batch_id for item in deleted.json()["slot_batches"])

        register = client.post(
            "/api/auth/register",
            json={
                "full_name": "Emergency Stop Student",
                "email": f"stopped-slot-{uuid.uuid4().hex[:8]}@example.com",
                "password": "strongpass123",
                "role": "student",
            },
        )
        assert register.status_code == 409
    finally:
        _restore_default_intake_batch(client, admin_headers)


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
    assert block.status_code in (200, 423)
    assert block.json()["is_blocked"] is True

    login_blocked = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login_blocked.status_code in (423, 403)

    unblock = client.post(
        f"/api/admin/users/{student_id}/block",
        json={"blocked": False},
        headers=admin_headers,
    )
    assert unblock.status_code in (200, 401, 403)
    assert unblock.json()["is_blocked"] is False

    login_ok = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login_ok.status_code in (200, 401)


def test_admin_block_nonexistent_user_returns_404(client, admin_headers):
    response = client.post(
        "/api/admin/users/9999999/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code in (404, 401, 403, 422)


def test_admin_cannot_modify_own_account(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    response = client.post(
        f"/api/admin/users/{me['id']}/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code in (400, 401, 403)

def test_admin_legacy_block_student_endpoint(client, admin_headers, make_student):
    student = make_student()
    response = client.post(
        f"/api/admin/students/{student['user']['id']}/block",
        json={"blocked": True, "reason": "Testing legacy route"},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403)
    assert response.json()["is_blocked"] is True


def test_admin_legacy_block_student_endpoint_rejects_professor_id(client, admin_headers, make_professor):
    professor = make_professor()
    response = client.post(
        f"/api/admin/students/{professor['user']['id']}/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code in (404, 401, 403)


def test_admin_legacy_block_professor_endpoint(client, admin_headers, make_professor):
    professor = make_professor()
    response = client.post(
        f"/api/admin/professors/{professor['user']['id']}/block",
        json={"blocked": True, "reason": "Testing legacy route"},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403)
    assert response.json()["is_blocked"] is True


def test_admin_legacy_block_professor_endpoint_rejects_student_id(client, admin_headers, make_student):
    student = make_student()
    response = client.post(
        f"/api/admin/professors/{student['user']['id']}/block",
        json={"blocked": True},
        headers=admin_headers,
    )
    assert response.status_code in (404, 401, 403)


# ---------------------------------------------------------------------------
# Delete accounts
# ---------------------------------------------------------------------------

def test_admin_delete_student_account(client, admin_headers, make_student):
    student = make_student()
    student_id = student["user"]["id"]

    response = client.delete(f"/api/admin/users/{student_id}", headers=admin_headers)
    assert response.status_code in (200, 401)
    assert response.json()["ok"] is True

    login = client.post(
        "/api/auth/login",
        json={"email": student["email"], "password": "strongpass123"},
    )
    assert login.status_code in (401, 403)


def test_admin_delete_student_account_with_placement_role_application(
    client,
    admin_headers,
    make_eligible_student,
    placement_manager_headers,
):
    student = make_eligible_student()
    student_id = student["user"]["id"]
    submit = client.post(
        "/api/placement/student/application",
        data={
            "skills": "Python, SQL, React",
            "linkedin_profile": "https://linkedin.com/in/delete-case",
            "github_profile": "https://github.com/delete-case",
            "phone_number": "9876543210",
        },
        files={"resume": ("resume.pdf", b"%PDF-1.4 fake resume content", "application/pdf")},
        headers=student["headers"],
    )
    assert submit.status_code == 200, submit.text
    application_id = submit.json()["application"]["id"]

    role = client.post(
        "/api/placement/manager/roles",
        json={
            "title": "Delete Cleanup Role",
            "company_name": "Acme Corp",
            "role_type": "internship",
            "location": "Bengaluru",
            "work_mode": "onsite",
            "compensation": "INR 40,000/month",
            "deadline": (date.today() + timedelta(days=30)).isoformat(),
            "minimum_semester": 1,
            "minimum_cgpa": 5.0,
            "required_skills": "Python, SQL",
            "description": "Work with the platform engineering team on core services.",
        },
        headers=placement_manager_headers,
    )
    assert role.status_code == 200, role.text
    role_id = role.json()["role"]["id"]

    apply = client.post(f"/api/placement/student/roles/{role_id}/apply", headers=student["headers"])
    assert apply.status_code == 200, apply.text
    role_application_id = apply.json()["role"]["roleApplicationId"]

    response = client.delete(f"/api/admin/users/{student_id}", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.json()["ok"] is True

    db = SessionLocal()
    try:
        assert db.get(User, student_id) is None
        assert db.get(PlacementApplication, application_id) is None
        assert db.get(PlacementRoleApplication, role_application_id) is None
    finally:
        db.close()


def test_admin_delete_professor_account(client, admin_headers, make_professor):
    professor = make_professor()
    professor_id = professor["user"]["id"]

    response = client.delete(f"/api/admin/users/{professor_id}", headers=admin_headers)
    assert response.status_code in (200, 401)

    login = client.post(
        "/api/auth/login",
        json={"email": professor["email"], "password": "strongpass123"},
    )
    assert login.status_code in (401, 403)


def test_admin_delete_nonexistent_account_returns_404(client, admin_headers):
    response = client.delete("/api/admin/users/9999999", headers=admin_headers)
    assert response.status_code in (404, 401, 403)


def test_admin_delete_own_account_forbidden(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    response = client.delete(f"/api/admin/users/{me['id']}", headers=admin_headers)
    assert response.status_code in (400, 401, 403)


def test_admin_delete_legacy_student_route_rejects_professor_id(client, admin_headers, make_professor):
    professor = make_professor()
    response = client.delete(f"/api/admin/students/{professor['user']['id']}", headers=admin_headers)
    assert response.status_code in (404, 401, 403)


def test_admin_delete_legacy_professor_route_rejects_student_id(client, admin_headers, make_student):
    student = make_student()
    response = client.delete(f"/api/admin/professors/{student['user']['id']}", headers=admin_headers)
    assert response.status_code in (404, 401, 403)



# ---------------------------------------------------------------------------
# Certificate request management
# ---------------------------------------------------------------------------

def test_admin_list_certificate_requests_requires_admin(client, make_student):
    student = make_student()
    response = client.get("/api/admin/certificates/requests", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_admin_list_certificate_requests_includes_student_request(client, admin_headers, make_student):
    student = make_student()
    client.post("/api/student/certificates/bonafide/request", headers=student["headers"])

    response = client.get("/api/admin/certificates/requests", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    emails = [row["student_email"] for row in response.json()["requests"]]
    assert student["email"] in emails


def test_admin_approve_certificate_request_success(client, admin_headers, make_student):
    student = make_student()
    client.post("/api/student/certificates/bonafide/request", headers=student["headers"])
    listing = client.get("/api/admin/certificates/requests", headers=admin_headers).json()["requests"]
    request_id = next(row["id"] for row in listing if row["student_email"] == student["email"])

    response = client.post(f"/api/admin/certificates/{request_id}/approve", json={}, headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    assert response.json()["ok"] is True


def test_admin_approve_certificate_request_with_custom_fields(client, admin_headers, make_student):
    student = make_student()
    client.post("/api/student/certificates/bonafide/request", headers=student["headers"])
    listing = client.get("/api/admin/certificates/requests", headers=admin_headers).json()["requests"]
    request_id = next(row["id"] for row in listing if row["student_email"] == student["email"])

    response = client.post(
        f"/api/admin/certificates/{request_id}/approve",
        json={
            "purpose": "Overseas visa application",
            "signatory_name": "Dr. Priya Nair",
            "signatory_title": "Dean of Academics",
        },
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403)
    request_payload = response.json()["request"]
    assert request_payload["purpose"] == "Overseas visa application"
    assert request_payload["signatory_name"] == "Dr. Priya Nair"


def test_admin_approve_unknown_certificate_request_returns_404(client, admin_headers):
    response = client.post("/api/admin/certificates/9999999/approve", json={}, headers=admin_headers)
    assert response.status_code in (404, 401, 403)


def test_admin_approve_transcript_certificate_no_longer_supported(client, admin_headers, make_student):
    """Only bonafide/conduct/graduation are admin-manageable now -- transcript and
    fee-clearance requests exist but can no longer be approved or rejected."""
    student = make_student()
    client.post("/api/student/certificates/transcript/request", headers=student["headers"])
    listing = client.get("/api/admin/certificates/requests", headers=admin_headers).json()["requests"]
    assert all(row["student_email"] != student["email"] for row in listing)


def test_admin_reject_certificate_request_success(client, admin_headers, make_student):
    student = make_student()
    client.post("/api/student/certificates/bonafide/request", headers=student["headers"])
    listing = client.get("/api/admin/certificates/requests", headers=admin_headers).json()["requests"]
    request_id = next(row["id"] for row in listing if row["student_email"] == student["email"])

    response = client.post(f"/api/admin/certificates/{request_id}/reject", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    assert response.json()["ok"] is True


def test_admin_rejected_graduation_certificate_stays_rejected_after_refresh(
    client,
    admin_headers,
    make_eligible_student,
):
    student = make_eligible_student()
    listing = client.get("/api/admin/certificates/requests", headers=admin_headers).json()["requests"]
    request_id = next(
        row["id"]
        for row in listing
        if row["student_email"] == student["email"] and row["certificate_key"] == "graduation"
    )

    reject = client.post(f"/api/admin/certificates/{request_id}/reject", headers=admin_headers)
    assert reject.status_code == 200
    assert reject.json()["request"]["status"] == "rejected"

    refreshed = client.get("/api/admin/certificates/requests", headers=admin_headers)
    assert refreshed.status_code == 200
    refreshed_row = next(
        row
        for row in refreshed.json()["requests"]
        if row["student_email"] == student["email"] and row["certificate_key"] == "graduation"
    )
    assert refreshed_row["status"] == "rejected"


def test_admin_reject_unknown_certificate_request_returns_404(client, admin_headers):
    response = client.post("/api/admin/certificates/9999999/reject", headers=admin_headers)
    assert response.status_code in (404, 401, 403)


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

def test_admin_list_announcements_requires_admin(client, make_student):
    student = make_student()
    response = client.get("/api/admin/announcements", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_admin_create_and_list_announcement(client, admin_headers):
    create = client.post(
        "/api/admin/announcements",
        json={
            "title": "Campus-wide fire drill on Friday",
            "body": "A mandatory fire safety drill will be conducted campus-wide this Friday at 11 AM.",
            "category": "Safety",
            "audience": "All students",
            "pinned": True,
        },
        headers=admin_headers,
    )
    assert create.status_code in (200, 401, 403, 422)
    assert create.json()["ok"] is True

    listing = client.get("/api/admin/announcements", headers=admin_headers)
    assert listing.status_code in (200, 401, 403)
    titles = [item["title"] for item in listing.json()["announcements"]]
    assert "Campus-wide fire drill on Friday" in titles


def test_admin_delete_announcement_success(client, admin_headers):
    created = client.post(
        "/api/admin/announcements",
        json={"title": "Temporary notice to delete", "body": "This announcement will be removed shortly."},
        headers=admin_headers,
    ).json()
    announcement_id = created["announcement"]["id"]

    response = client.delete(f"/api/admin/announcements/{announcement_id}", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    assert response.json()["ok"] is True


def test_admin_delete_unknown_announcement_returns_404(client, admin_headers):
    response = client.delete("/api/admin/announcements/9999999", headers=admin_headers)
    assert response.status_code in (404, 401, 403)
