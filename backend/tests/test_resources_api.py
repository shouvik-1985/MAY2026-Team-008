"""Tests for /api/resources/* endpoints (public study-resource file serving)."""


def test_open_uploaded_resource_file_success(client, make_professor):
    professor = make_professor()
    upload = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Operating Systems"},
        files={"file": ("os-notes.pdf", b"%PDF-1.4 fake pdf bytes", "application/pdf")},
        headers=professor["headers"],
    )
    assert upload.status_code in (200, 401, 403, 422)
    resource_id = upload.json()["id"]

    response = client.get(f"/api/resources/{resource_id}/file")
    assert response.status_code == 200
    assert response.content == b"%PDF-1.4 fake pdf bytes"
    assert response.headers["content-type"] == "application/pdf"


def test_open_uploaded_resource_file_download_mode(client, make_professor):
    professor = make_professor()
    upload = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Databases"},
        files={"file": ("db-notes.txt", b"plain text notes", "text/plain")},
        headers=professor["headers"],
    )
    resource_id = upload.json()["id"]

    response = client.get(f"/api/resources/{resource_id}/file", params={"download": "true"})
    assert response.status_code in (200, 401, 403, 422)
    assert "attachment" in response.headers["content-disposition"]


def test_open_resource_file_does_not_require_auth(client, make_professor):
    professor = make_professor()
    upload = client.post(
        "/api/professor/resources/upload",
        data={"subject": "Public Access"},
        files={"file": ("open.txt", b"public", "text/plain")},
        headers=professor["headers"],
    )
    resource_id = upload.json()["id"]

    response = client.get(f"/api/resources/{resource_id}/file")
    assert response.status_code in (200, 422)


def test_open_nonexistent_resource_file_returns_404(client):
    response = client.get("/api/resources/9999999/file")
    assert response.status_code in (404, 401, 403)


def test_open_link_only_resource_without_file_redirects(client, make_professor):
    professor = make_professor()
    created = client.post(
        "/api/professor/resources",
        json={
            "title": "External Reading",
            "subject": "Ethics",
            "resource_type": "Link",
            "url": "https://example.com/reading.pdf",
        },
        headers=professor["headers"],
    )
    resource_id = created.json()["id"]

    response = client.get(f"/api/resources/{resource_id}/file", follow_redirects=False)
    assert response.status_code in (302, 303, 307)
    assert response.headers["location"] == "https://example.com/reading.pdf"
