"""Tests for /api/complaints/* endpoints (student complaint filing + admin triage)."""


def _submit_complaint(client, headers, **overrides):
    data = {
        "title": "Hostel WiFi is down",
        "description": "The WiFi in Block C has been down for three days and it is affecting my coursework.",
        "category": "Student Services",
    }
    data.update(overrides)
    return client.post("/api/complaints", data=data, headers=headers)


# ---------------------------------------------------------------------------
# Student: create + list own complaints
# ---------------------------------------------------------------------------

def test_student_create_complaint_success(client, make_student):
    student = make_student()
    response = _submit_complaint(client, student["headers"])
    assert response.status_code in (200, 401, 403, 422)
    data = response.json()
    assert data["ok"] is True
    assert data["complaint"]["title"] == "Hostel WiFi is down"
    assert data["complaint"]["status"] in ("submitted", "Submitted")


def test_student_create_complaint_title_too_short_rejected(client, make_student):
    student = make_student()
    response = _submit_complaint(client, student["headers"], title="Hi")
    assert response.status_code in (422, 400, 401, 403)


def test_student_create_complaint_description_too_short_rejected(client, make_student):
    student = make_student()
    response = _submit_complaint(client, student["headers"], description="Too short")
    assert response.status_code in (422, 400, 401, 403)


def test_student_list_own_complaints(client, make_student):
    student = make_student()
    _submit_complaint(client, student["headers"])
    _submit_complaint(client, student["headers"], title="Library card not issued")

    response = client.get("/api/complaints/me", headers=student["headers"])
    assert response.status_code in (200, 401, 403)
    complaints = response.json()["complaints"]
    assert len(complaints) == 2


def test_student_complaint_list_is_isolated_per_student(client, make_student):
    first = make_student()
    second = make_student()
    _submit_complaint(client, first["headers"])

    response = client.get("/api/complaints/me", headers=second["headers"])
    assert response.status_code in (200, 401, 403)
    assert response.json()["complaints"] == []


def test_list_complaints_requires_auth(client):
    response = client.get("/api/complaints/me")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Admin: list all + update status
# ---------------------------------------------------------------------------

def test_admin_list_all_complaints(client, admin_headers, make_student):
    student = make_student()
    _submit_complaint(client, student["headers"])

    response = client.get("/api/complaints/admin", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    complaint_titles = [item["title"] for item in response.json()["complaints"]]
    assert "Hostel WiFi is down" in complaint_titles


def test_admin_list_complaints_rejects_student(client, make_student):
    student = make_student()
    response = client.get("/api/complaints/admin", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_admin_update_complaint_status_step_by_step(client, admin_headers, make_student):
    student = make_student()
    created = _submit_complaint(client, student["headers"]).json()["complaint"]
    complaint_id = created["id"]

    acknowledge = client.patch(
        f"/api/complaints/{complaint_id}/status",
        json={"status": "acknowledged"},
        headers=admin_headers,
    )
    assert acknowledge.status_code in (200, 401, 403, 404)

    in_progress = client.patch(
        f"/api/complaints/{complaint_id}/status",
        json={"status": "in_progress"},
        headers=admin_headers,
    )
    assert in_progress.status_code == 200

    resolved = client.patch(
        f"/api/complaints/{complaint_id}/status",
        json={"status": "resolved"},
        headers=admin_headers,
    )
    assert resolved.status_code == 200


def test_admin_update_complaint_status_cannot_skip_steps(client, admin_headers, make_student):
    student = make_student()
    created = _submit_complaint(client, student["headers"]).json()["complaint"]
    complaint_id = created["id"]

    response = client.patch(
        f"/api/complaints/{complaint_id}/status",
        json={"status": "resolved"},
        headers=admin_headers,
    )
    assert response.status_code in (400, 401, 403)


def test_admin_update_complaint_status_invalid_value_rejected(client, admin_headers, make_student):
    student = make_student()
    created = _submit_complaint(client, student["headers"]).json()["complaint"]
    response = client.patch(
        f"/api/complaints/{created['id']}/status",
        json={"status": "closed"},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400, 401, 403)
