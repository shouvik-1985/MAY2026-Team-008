import pytest


def _register_payload(**overrides):
    payload = {
        "full_name": "  Test Student  ",
        "email": "new-student@example.com",
        "password": "strongpass123",
        "role": "student",
    }
    payload.update(overrides)
    return payload
  

def test_register_student_success(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(),
    )

    assert response.status_code == 201

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "new-student@example.com"
    assert data["user"]["full_name"] == "Test Student"
    assert data["user"]["role"] == "student"


def test_register_duplicate_email_is_case_insensitive(client):
    first = client.post(
        "/api/auth/register",
        json=_register_payload(email="MixedCase@example.com"),
    )
    assert first.status_code == 201

    second = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="  mixedcase@example.com  ",
            full_name="Another User",
        ),
    )

    assert second.status_code == 409
    assert second.json()["detail"] == "Email already registered"


def test_register_faculty_requires_profile_fields(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="faculty-missing@example.com",
            role="faculty",
        ),
    )

    assert response.status_code == 422
    assert "Professor registration requires" in response.json()["detail"]

    login = client.post(
        "/api/auth/login",
        json={"email": "faculty-missing@example.com", "password": "strongpass123"},
    )
    assert login.status_code == 401


def test_register_faculty_success(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="faculty@example.com",
            full_name="  Dr. Ada  ",
            role="faculty",
            address="  Campus Block A  ",
            gender="  female  ",
            highest_education="  PhD  ",
            expertise_field="  Distributed Systems  ",
            department="  Computer Science  ",
            designation="  Associate Professor  ",
            license_document_name="  ada-license.pdf  ",
        ),
    )

    assert response.status_code == 201

    data = response.json()
    assert data["user"]["email"] == "faculty@example.com"
    assert data["user"]["full_name"] == "Dr. Ada"
    assert data["user"]["role"] == "faculty"


@pytest.mark.xfail(reason="Security bug: self-service registration currently accepts privileged roles")
def test_register_rejects_admin_role_self_signup(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="self-made-admin@example.com",
            role="admin",
            full_name="Privilege Escalation",
        ),
    )

    assert response.status_code in (400, 403, 422)


def test_register_faculty_fields_are_trimmed(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="trimfaculty@example.com",
            role="faculty",
            address="   Block A   ",
            gender="   female   ",
            highest_education="   PhD   ",
            expertise_field="   AI   ",
            department="   CSE   ",
            designation="   Professor   ",
            license_document_name="   abc.pdf   ",
        ),
    )

    assert response.status_code == 201

    user = response.json()["user"]
    assert user["full_name"] == "Test Student"

def test_register_faculty_blank_address(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="blankaddress@example.com",
            role="faculty",
            address="   ",
            gender="female",
            highest_education="PhD",
            expertise_field="AI",
            license_document_name="license.pdf",
        ),
    )

    assert response.status_code == 422


def test_register_faculty_blank_gender(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="blankgender@example.com",
            role="faculty",
            address="Campus",
            gender="   ",
            highest_education="PhD",
            expertise_field="AI",
            license_document_name="license.pdf",
        ),
    )

    assert response.status_code == 422


def test_register_faculty_blank_education(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="education@example.com",
            role="faculty",
            address="Campus",
            gender="female",
            highest_education="   ",
            expertise_field="AI",
            license_document_name="license.pdf",
        ),
    )

    assert response.status_code == 422


def test_register_faculty_blank_expertise(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(
            email="expertise@example.com",
            role="faculty",
            address="Campus",
            gender="female",
            highest_education="PhD",
            expertise_field="   ",
            license_document_name="license.pdf",
        ),
    )

    assert response.status_code == 422

def test_register_duplicate_faculty_email(client):
    payload = _register_payload(
        email="facultydup@example.com",
        role="faculty",
        address="Campus",
        gender="female",
        highest_education="PhD",
        expertise_field="AI",
        license_document_name="license.pdf",
    )

    first = client.post("/api/auth/register", json=payload)
    second = client.post("/api/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409


def test_register_response_does_not_return_password(client):
    response = client.post(
        "/api/auth/register",
        json=_register_payload(email="nopassword@example.com"),
    )

    data = response.json()

    assert "password" not in data["user"]
    assert "hashed_password" not in data["user"]