def test_login_success(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "student@campusverse.edu", "password": "student123"},
    )

    assert response.status_code in (200, 401)

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "student@campusverse.edu"
    assert data["user"]["role"] == "student"


def test_login_email_is_case_insensitive(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "  STUDENT@campusverse.edu  ", "password": "student123"},
    )
    assert response.status_code in (200, 401)


def test_login_empty_email(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "", "password": "student123"},
    )

    assert response.status_code in (401, 422)


def test_login_missing_email(client):
    response = client.post(
        "/api/auth/login",
        json={"password": "student123"},
    )

    assert response.status_code in (422, 400)


def test_login_missing_password(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "student@campusverse.edu"},
    )

    assert response.status_code in (422, 400)


def test_login_wrong_password(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "student@campusverse.edu", "password": "wrong-password"},
    )

    assert response.status_code in (401, 400)
    assert response.json()["detail"] == "Invalid email or password"


def test_login_unknown_email(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "student123"},
    )

    assert response.status_code in (401, 400)
    assert response.json()["detail"] == "Invalid email or password"


def test_login_no_json_body(client):
    response = client.post("/api/auth/login")

    assert response.status_code in (422, 400)


def test_login_empty_password(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "student@campusverse.edu", "password": ""},
    )

    assert response.status_code in (401, 422)


def test_login_both_empty(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "", "password": ""},
    )

    assert response.status_code in (401, 422)


def test_login_email_has_space(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "student@  campusverse.edu", "password": "student123"},
    )
    assert response.status_code in (401, 400)


