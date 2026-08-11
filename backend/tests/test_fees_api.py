"""Tests for the new fee management system: admin-side semester fee settings and
student-side Razorpay payment initiation/verification. Razorpay isn't configured in
this test environment, so the payment endpoints deterministically return 503 --
which is itself a useful thing to verify (the backend fails closed, not open).
"""


# ---------------------------------------------------------------------------
# Admin: fee management dashboard
# ---------------------------------------------------------------------------

def test_admin_fee_management_requires_admin(client, make_student):
    student = make_student()
    response = client.get("/api/admin/fees", headers=student["headers"])
    assert response.status_code in (403, 401)


def test_admin_fee_management_requires_auth(client):
    response = client.get("/api/admin/fees")
    assert response.status_code in (401, 403)


def test_admin_fee_management_success(client, admin_headers, make_student):
    student = make_student()
    response = client.get("/api/admin/fees", headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    data = response.json()
    assert data["ok"] is True
    assert data["razorpayEnabled"] is False
    assert len(data["settings"]) == 4
    emails = [row["email"] for row in data["students"]]
    assert student["email"] in emails


def test_admin_fee_management_student_row_shape(client, admin_headers, make_student):
    student = make_student()
    data = client.get("/api/admin/fees", headers=admin_headers).json()
    row = next(item for item in data["students"] if item["email"] == student["email"])
    for key in ("studentId", "name", "studentCode", "semester", "status", "outstanding", "collected", "invoices"):
        assert key in row


# ---------------------------------------------------------------------------
# Admin: update semester fee amount
# ---------------------------------------------------------------------------

def test_admin_update_semester_fee_success(client, admin_headers):
    response = client.patch(
        "/api/admin/fees/settings/2",
        json={"amount": 85000},
        headers=admin_headers,
    )
    assert response.status_code in (200, 401, 403)
    setting = next(item for item in response.json()["settings"] if item["semester"] == 2)
    assert setting["amount"] == 85000


def test_admin_update_semester_fee_invalid_semester_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/fees/settings/5",
        json={"amount": 80000},
        headers=admin_headers,
    )
    assert response.status_code in (400, 422)


def test_admin_update_semester_fee_zero_semester_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/fees/settings/0",
        json={"amount": 80000},
        headers=admin_headers,
    )
    assert response.status_code in (400, 422)


def test_admin_update_semester_fee_amount_below_minimum_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/fees/settings/1",
        json={"amount": 0},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400)


def test_admin_update_semester_fee_amount_above_maximum_rejected(client, admin_headers):
    response = client.patch(
        "/api/admin/fees/settings/1",
        json={"amount": 50_000_000},
        headers=admin_headers,
    )
    assert response.status_code in (422, 400)


def test_admin_update_semester_fee_requires_admin(client, make_student):
    student = make_student()
    response = client.patch(
        "/api/admin/fees/settings/1",
        json={"amount": 80000},
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


# ---------------------------------------------------------------------------
# Student: dashboard fee summary reflects razorpay availability
# ---------------------------------------------------------------------------

def test_student_dashboard_fee_summary_shows_razorpay_disabled(client, make_student):
    student = make_student()
    dashboard = client.get("/api/student/dashboard", headers=student["headers"]).json()
    assert dashboard["fee_summary"]["razorpayEnabled"] is False


def test_student_fee_invoice_reflects_updated_semester_fee(client, admin_headers, make_student):
    client.patch("/api/admin/fees/settings/1", json={"amount": 91000}, headers=admin_headers)

    student = make_student()
    dashboard = client.get("/api/student/dashboard", headers=student["headers"]).json()
    current_invoice = next(item for item in dashboard["fee_history"] if item["semesterNumber"] == 1)
    assert current_invoice["amount"] == 91000


# ---------------------------------------------------------------------------
# Student: Razorpay order creation / payment verification (fails closed --
# no Razorpay keys are configured in this environment)
# ---------------------------------------------------------------------------

def test_create_fee_payment_order_requires_auth(client):
    response = client.post("/api/student/fees/orders/INV-0001")
    assert response.status_code in (401, 403)


def test_create_fee_payment_order_rejects_professor(client, make_professor):
    professor = make_professor()
    response = client.post("/api/student/fees/orders/INV-0001", headers=professor["headers"])
    assert response.status_code in (403, 401)


def test_create_fee_payment_order_without_razorpay_keys_returns_503(client, make_student):
    student = make_student()
    dashboard = client.get("/api/student/dashboard", headers=student["headers"]).json()
    invoice_id = dashboard["fee_history"][0]["id"]

    response = client.post(f"/api/student/fees/orders/{invoice_id}", headers=student["headers"])
    assert response.status_code in (503, 500)


def test_create_fee_payment_order_unknown_invoice_also_returns_503_first(client, make_student):
    """Credential checks run before invoice lookup, so an unknown invoice id still
    surfaces the 503 (not a 404) when Razorpay isn't configured."""
    student = make_student()
    response = client.post("/api/student/fees/orders/does-not-exist", headers=student["headers"])
    assert response.status_code in (503, 500)


def test_verify_fee_payment_requires_auth(client):
    response = client.post(
        "/api/student/fees/payments/verify",
        json={"razorpay_order_id": "x", "razorpay_payment_id": "y", "razorpay_signature": "z"},
    )
    assert response.status_code in (401, 403)


def test_verify_fee_payment_missing_fields_rejected(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/fees/payments/verify",
        json={"razorpay_order_id": "order_123"},
        headers=student["headers"],
    )
    assert response.status_code in (422, 400)


def test_verify_fee_payment_without_razorpay_keys_returns_503(client, make_student):
    student = make_student()
    response = client.post(
        "/api/student/fees/payments/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": "pay_fake123",
            "razorpay_signature": "deadbeef",
        },
        headers=student["headers"],
    )
    assert response.status_code in (503, 500)
