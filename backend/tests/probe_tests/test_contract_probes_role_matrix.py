"""Role-boundary contract probes.

This is a data-driven expansion of test_contract_probes.py, focused specifically
on one contract: **every role-gated endpoint rejects every role it isn't meant
for, with a valid request body**. That last part matters -- role checks in this
codebase are plain function calls inside the route body (`_require_admin(...)`,
`_require_professor(...)`, etc.), not FastAPI `Depends()` dependencies. That
means, unlike the missing-auth probes in test_contract_probes.py, a role check
only runs *after* the request body has already validated successfully. So every
entry below carries a body that's valid enough to clear schema validation for
*any* caller, which means a 401/403 in the result can only mean the auth or role gate
itself, not an incidental 422 masquerading as one.

ROLE_MATRIX is one row per endpoint: (label, method, path, kwargs, allowed
roles). For every role *not* in the allowed set, a test is generated asserting
an authentication/authorization failure (401 or 403). This is intentionally not exhaustive -- the marketplace.py router's
permission model is view/approval-status based rather than a flat role gate,
so it's deliberately out of scope here (see the bottom of the file for the
two endpoints simple enough to include safely).

Path params are stubbed with harmless placeholder IDs; role checks fire before
any "does this ID exist" lookup in every case below, so a nonexistent ID
never masks the role check.
"""
import uuid

import pytest

ALL_ROLES = {"student", "professor", "admin", "placement"}


def _headers_for_role(role, client, make_student, make_professor, admin_headers, placement_manager_headers):
    if role == "student":
        return make_student()["headers"]
    if role == "professor":
        return make_professor()["headers"]
    if role == "admin":
        return admin_headers
    if role == "placement":
        return placement_manager_headers
    raise ValueError(f"unknown role: {role}")


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# Each row: (label, method, path, kwargs_or_callable, allowed_roles)
# kwargs_or_callable may be a plain dict of request kwargs, or a zero-arg
# callable returning one (used where the body must be unique per call, e.g.
# names with a uniqueness constraint that would otherwise 409 on repeat probes).
ROLE_MATRIX = [
    # ---------------------------------------------------------------- admin
    ("admin dashboard", "GET", "/api/admin/dashboard", {}, {"admin"}),
    ("admin management get", "GET", "/api/admin/management", {}, {"admin"}),
    (
        "admin update attendance radius",
        "PATCH",
        "/api/admin/management/attendance-radius",
        {"json": {"radius_meters": 200}},
        {"admin"},
    ),
    (
        "admin update semester duration",
        "PATCH",
        "/api/admin/management/semester-duration",
        {"json": {"semester_duration_unit": "months", "semester_duration_months": 6}},
        {"admin"},
    ),
    (
        "admin create slot batch",
        "POST",
        "/api/admin/management/slot-batches",
        lambda: {"json": {"batch_name": _unique("Probe Batch"), "total_slots": 10, "open_for_intake": False}},
        {"admin"},
    ),
    ("admin block user", "POST", "/api/admin/users/999999/block", {"json": {"blocked": True}}, {"admin"}),
    ("admin delete user", "DELETE", "/api/admin/users/999999", {}, {"admin"}),
    ("admin list certificate requests", "GET", "/api/admin/certificates/requests", {}, {"admin"}),
    ("admin approve certificate", "POST", "/api/admin/certificates/999999/approve", {"json": {}}, {"admin"}),
    ("admin list announcements", "GET", "/api/admin/announcements", {}, {"admin"}),
    (
        "admin create announcement",
        "POST",
        "/api/admin/announcements",
        {"json": {"title": "Probe announcement", "body": "Probe body text for contract testing purposes."}},
        {"admin"},
    ),
    ("admin delete announcement", "DELETE", "/api/admin/announcements/999999", {}, {"admin"}),
    ("admin fee management get", "GET", "/api/admin/fees", {}, {"admin"}),
    ("admin update semester fee", "PATCH", "/api/admin/fees/settings/1", {"json": {"amount": 80000}}, {"admin"}),
    ("admin list complaints", "GET", "/api/complaints/admin", {}, {"admin"}),
    (
        "admin update complaint status",
        "PATCH",
        "/api/complaints/999999/status",
        {"json": {"status": "acknowledged"}},
        {"admin"},
    ),
    # ------------------------------------------------------------ professor
    ("professor dashboard", "GET", "/api/professor/dashboard", {}, {"professor"}),
    (
        "professor update academics",
        "POST",
        "/api/professor/students/999999/academics",
        {"json": {"cgpa": 8.0, "attendance": 80}},
        {"professor"},
    ),
    (
        "professor block student",
        "POST",
        "/api/professor/students/999999/block",
        {"json": {"blocked": True}},
        {"professor"},
    ),
    (
        "professor mark attendance",
        "POST",
        "/api/professor/attendance/mark",
        {"json": {"student_id": 999999, "status": "present"}},
        {"professor"},
    ),
    (
        "professor confirm attendance",
        "POST",
        "/api/professor/attendance/confirm",
        {"json": {"student_id": 999999, "present": True}},
        {"professor"},
    ),
    ("professor finalize attendance", "POST", "/api/professor/attendance/finalize", {}, {"professor"}),
    (
        "professor create resource",
        "POST",
        "/api/professor/resources",
        {
            "json": {
                "title": "Probe Resource",
                "subject": "Probe Subject",
                "resource_type": "Notes",
                "url": "https://example.com/probe.pdf",
            }
        },
        {"professor"},
    ),
    ("professor delete resource", "DELETE", "/api/professor/resources/999999", {}, {"professor"}),
    (
        "professor generate assignment",
        "POST",
        "/api/professor/assignments/generate",
        {"json": {"subject": "Probe Subject"}},
        {"professor"},
    ),
    (
        "professor review submission",
        "PATCH",
        "/api/professor/assignments/submissions/999999/review",
        {"json": {"score": 50}},
        {"professor"},
    ),
    (
        "professor update profile",
        "PUT",
        "/api/professor/profile",
        {"json": {"name": "Probe Name", "email": "probe-professor@example.com"}},
        {"professor"},
    ),
    (
        "professor update avatar",
        "PUT",
        "/api/professor/profile/avatar",
        {"json": {"avatar_url": "https://example.com/avatar.png"}},
        {"professor"},
    ),
    # --------------------------------------------------------------- student
    ("student features", "GET", "/api/student/features", {}, {"student"}),
    ("student attendance settings", "GET", "/api/student/attendance/settings", {}, {"student"}),
    (
        "student radius check",
        "POST",
        "/api/student/attendance/radius-check",
        {"json": {"latitude": 1.0, "longitude": 1.0}},
        {"student"},
    ),
    (
        "student biometric verify",
        "POST",
        "/api/student/attendance/biometric-verify",
        {"json": {"latitude": 1.0, "longitude": 1.0, "face_template": [0.1] * 100}},
        {"student"},
    ),
    ("student biometric reset", "POST", "/api/student/attendance/biometric-reset", {}, {"student"}),
    ("student get profile", "GET", "/api/student/profile", {}, {"student"}),
    (
        "student update profile",
        "PUT",
        "/api/student/profile",
        lambda: {
            "json": {
                "name": "Probe Student",
                "email": f"{_unique('probe-student')}@example.com",
                "address": "Campus",
            }
        },
        {"student"},
    ),
    (
        "student update avatar",
        "PUT",
        "/api/student/profile/avatar",
        {"json": {"avatar_url": "data:image/png;base64,aGVsbG8="}},
        {"student"},
    ),
    ("student dashboard", "GET", "/api/student/dashboard", {}, {"student"}),
    ("student resource ai-summary", "POST", "/api/student/resources/999999/ai-summary", {}, {"student"}),
    (
        "student digital-submit assignment",
        "POST",
        "/api/student/assignments/999999/digital-submit",
        {"json": {"answers": {}}},
        {"student"},
    ),
    ("student list todos", "GET", "/api/student/todos", {}, {"student"}),
    ("student create todo", "POST", "/api/student/todos", {"json": {"title": "Probe todo"}}, {"student"}),
    ("student update todo", "PATCH", "/api/student/todos/999999", {"json": {"completed": True}}, {"student"}),
    ("student delete todo", "DELETE", "/api/student/todos/999999", {}, {"student"}),
    ("student request certificate", "POST", "/api/student/certificates/bonafide/request", {}, {"student"}),
    ("student open certificate file", "GET", "/api/student/certificates/bonafide/file", {}, {"student"}),
    (
        "student create marketplace item (legacy)",
        "POST",
        "/api/student/marketplace/items",
        {
            "json": {
                "name": "Probe Item",
                "subcategory": "Handwritten Notes",
                "price": "100",
                "description": "Probe description text for contract testing.",
            }
        },
        {"student"},
    ),
    (
        "student create fee order",
        "POST",
        "/api/student/fees/orders/probe-invoice",
        {},
        {"student"},
    ),
    ("student list own complaints", "GET", "/api/complaints/me", {}, {"student"}),
    ("student placement portal", "GET", "/api/placement/student", {}, {"student"}),
    # ------------------------------------------------------ placement manager
    ("placement manager dashboard", "GET", "/api/placement/manager/dashboard", {}, {"placement"}),
    (
        "placement manager create role",
        "POST",
        "/api/placement/manager/roles",
        {
            "json": {
                "title": "Probe Analyst Role",
                "company_name": "Probe Corp",
                "location": "Remote",
                "compensation": "Rs 8 LPA",
                "deadline": "2026-12-31",
                "required_skills": "Python, SQL",
                "description": "A detailed probe role description used for contract testing purposes.",
            }
        },
        {"placement"},
    ),
    ("placement manager delete role", "DELETE", "/api/placement/manager/roles/999999", {}, {"placement"}),
    (
        "placement manager decide application",
        "POST",
        "/api/placement/manager/roles/999999/applications/999999/decision",
        {"json": {"status": "accepted"}},
        {"placement"},
    ),
    (
        "placement manager dismiss applicant",
        "DELETE",
        "/api/placement/manager/roles/999999/applications/999999",
        {},
        {"placement"},
    ),
    # --------------------------------------------------------------- connect
    # (student + professor allowed; admin + placement forbidden)
    ("connect hub", "GET", "/api/connect/hub", {}, {"student", "professor"}),
    ("connect send request", "POST", "/api/connect/requests/999999", {}, {"student", "professor"}),
    ("connect accept request", "POST", "/api/connect/requests/999999/accept", {}, {"student", "professor"}),
    ("connect withdraw request", "DELETE", "/api/connect/requests/999999", {}, {"student", "professor"}),
    ("connect block user", "POST", "/api/connect/users/999999/block", {}, {"student", "professor"}),
    (
        "connect conversation messages",
        "GET",
        "/api/connect/conversations/999999/messages",
        {},
        {"student", "professor"},
    ),
    (
        "connect send message",
        "POST",
        "/api/connect/messages",
        {"data": {"receiver_id": "999999", "body": "probe message"}},
        {"student", "professor"},
    ),
    (
        "connect edit message",
        "PATCH",
        "/api/connect/messages/999999",
        {"json": {"body": "probe edit"}},
        {"student", "professor"},
    ),
    # ------------------------------------------------------------ marketplace
    # (deliberately limited -- see module docstring)
    ("marketplace meta", "GET", "/api/marketplace/meta", {}, {"student", "admin"}),
]


def _build_test_id(entry_label, method, path, role):
    return f"{entry_label} [{method}] denies {role}"


_PARAMETRIZED_CASES = []
_PARAMETRIZED_IDS = []
for _label, _method, _path, _kwargs, _allowed in ROLE_MATRIX:
    for _role in sorted(ALL_ROLES - _allowed):
        _PARAMETRIZED_CASES.append((_label, _method, _path, _kwargs, _role))
        _PARAMETRIZED_IDS.append(_build_test_id(_label, _method, _path, _role))


def test_role_matrix_actually_generated_cases():
    """Sanity floor so a refactor that empties ROLE_MATRIX by accident doesn't
    silently pass by running zero tests."""
    assert len(ROLE_MATRIX) > 40
    assert len(_PARAMETRIZED_CASES) > 100


@pytest.mark.parametrize("label,method,path,kwargs,role", _PARAMETRIZED_CASES, ids=_PARAMETRIZED_IDS)
def test_role_boundary_denies_wrong_role(
    client, make_student, make_professor, admin_headers, placement_manager_headers, label, method, path, kwargs, role
):
    headers = _headers_for_role(role, client, make_student, make_professor, admin_headers, placement_manager_headers)
    resolved_kwargs = kwargs() if callable(kwargs) else kwargs
    response = client.request(method, path, headers=headers, **resolved_kwargs)
    assert response.status_code in (401, 403), (
        f"[{label}] {method} {path} as {role} returned {response.status_code}, not an auth/role failure "
        f"(body: {response.text[:200]})"
    )
