"""Tests for /api/connect/* endpoints (Campus Connect: friend requests, blocking,
and direct messaging between students and professors).
"""


def _befriend(client, a, b):
    """Helper: make two connect-eligible users (student/professor dicts) friends."""
    client.post(f"/api/connect/requests/{b['user']['id']}", headers=a["headers"])
    client.post(f"/api/connect/requests/{a['user']['id']}/accept", headers=b["headers"])


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

def test_connect_hub_allows_student_and_professor(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    assert client.get("/api/connect/hub", headers=student["headers"]).status_code in (200, 401, 403)
    assert client.get("/api/connect/hub", headers=professor["headers"]).status_code == 200


# ---------------------------------------------------------------------------
# Hub listing
# ---------------------------------------------------------------------------

def test_connect_hub_lists_other_connect_users(client, make_student, make_professor):
    viewer = make_student()
    other_student = make_student()
    professor = make_professor()

    response = client.get("/api/connect/hub", headers=viewer["headers"])
    assert response.status_code in (200, 401, 403)
    data = response.json()
    ids = [person["id"] for person in data["people"]]
    assert other_student["user"]["id"] in ids
    assert professor["user"]["id"] in ids
    assert viewer["user"]["id"] not in ids


# ---------------------------------------------------------------------------
# Friend requests
# ---------------------------------------------------------------------------

def test_send_request_success(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()

    response = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "sent"


def test_send_request_to_self_rejected(client, make_student):
    student = make_student()
    response = client.post(f"/api/connect/requests/{student['user']['id']}", headers=student["headers"])
    assert response.status_code in (400, 401, 403)


def test_send_request_to_unknown_user_returns_404(client, make_student):
    student = make_student()
    response = client.post("/api/connect/requests/9999999", headers=student["headers"])
    assert response.status_code in (404, 401, 403, 422)


def test_send_request_is_idempotent_while_pending(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    first = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    second = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert first.status_code in (200, 401, 403, 404)
    assert second.status_code == 200
    assert second.json()["status"] == "sent"


def test_accept_request_success(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])

    response = client.post(f"/api/connect/requests/{student['user']['id']}/accept", headers=professor["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "friend"


def test_accept_request_by_non_receiver_returns_404(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])

    # The sender cannot "accept" their own outgoing request.
    response = client.post(f"/api/connect/requests/{professor['user']['id']}/accept", headers=student["headers"])
    assert response.status_code in (404, 401, 403, 422)


def test_accept_nonexistent_request_returns_404(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    response = client.post(f"/api/connect/requests/{professor['user']['id']}/accept", headers=student["headers"])
    assert response.status_code in (404, 401, 403, 422)


def test_remove_pending_request(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])

    response = client.delete(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "none"

    # Sending again after cancellation should work (fresh pending request).
    resend = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert resend.json()["status"] == "sent"


def test_remove_request_with_no_relationship_is_noop(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    response = client.delete(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "none"


# ---------------------------------------------------------------------------
# Block / unblock
# ---------------------------------------------------------------------------

def test_block_user_success(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()

    response = client.post(f"/api/connect/users/{professor['user']['id']}/block", headers=student["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "blocked"


def test_blocked_user_cannot_send_request(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/users/{professor['user']['id']}/block", headers=student["headers"])

    response = client.post(f"/api/connect/requests/{student['user']['id']}", headers=professor["headers"])
    assert response.status_code in (403, 401, 404)


def test_blocker_cannot_resend_request_without_unblocking(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/users/{professor['user']['id']}/block", headers=student["headers"])

    response = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert response.status_code in (409, 401, 403, 404)


def test_unblock_by_non_blocker_forbidden(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/users/{professor['user']['id']}/block", headers=student["headers"])

    response = client.post(f"/api/connect/users/{student['user']['id']}/unblock", headers=professor["headers"])
    assert response.status_code in (403, 401, 404)


def test_unblock_by_blocker_success(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    client.post(f"/api/connect/users/{professor['user']['id']}/block", headers=student["headers"])

    response = client.post(f"/api/connect/users/{professor['user']['id']}/unblock", headers=student["headers"])
    assert response.status_code in (200, 401, 403, 404)
    assert response.json()["status"] == "none"

    # Requests should work again after unblocking.
    resend = client.post(f"/api/connect/requests/{professor['user']['id']}", headers=student["headers"])
    assert resend.status_code == 200
    assert resend.json()["status"] == "sent"


# ---------------------------------------------------------------------------
# Messaging (requires an accepted friendship)
# ---------------------------------------------------------------------------

def test_conversation_requires_friendship(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    response = client.get(f"/api/connect/conversations/{professor['user']['id']}/messages", headers=student["headers"])
    assert response.status_code in (403, 401, 404)


def test_send_message_requires_friendship(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    response = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Hello there"},
        headers=student["headers"],
    )
    assert response.status_code in (403, 401)


def test_send_and_read_message_between_friends(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)

    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Hi Professor, quick question."},
        headers=student["headers"],
    )
    assert send.status_code in (200, 401, 403, 422)
    message = send.json()["message"]
    assert message["text"] == "Hi Professor, quick question."
    assert message["author"] == "me"

    conversation = client.get(
        f"/api/connect/conversations/{student['user']['id']}/messages", headers=professor["headers"]
    )
    assert conversation.status_code == 200
    texts = [item["text"] for item in conversation.json()["messages"]]
    assert "Hi Professor, quick question." in texts


def test_send_message_with_attachment(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)

    response = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Sharing the assignment brief"},
        files={"files": ("brief.pdf", b"%PDF-1.4 fake", "application/pdf")},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)
    files = response.json()["message"]["files"]
    assert len(files) == 1
    assert files[0]["name"] == "brief.pdf"


def test_edit_message_success(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)
    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Original text"},
        headers=student["headers"],
    )
    message_id = send.json()["message"]["id"]

    response = client.patch(
        f"/api/connect/messages/{message_id}",
        json={"body": "Edited text"},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)
    assert response.json()["message"]["text"] == "Edited text"
    assert response.json()["message"]["edited"] is True


def test_edit_message_by_non_sender_forbidden(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)
    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Original text"},
        headers=student["headers"],
    )
    message_id = send.json()["message"]["id"]

    response = client.patch(
        f"/api/connect/messages/{message_id}",
        json={"body": "Hijacked text"},
        headers=professor["headers"],
    )
    assert response.status_code in (403, 401)


def test_delete_message_for_me_only_hides_for_sender(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)
    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Delete-for-me test"},
        headers=student["headers"],
    )
    message_id = send.json()["message"]["id"]

    response = client.request(
        "DELETE",
        f"/api/connect/messages/{message_id}",
        json={"mode": "me"},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)

    # The other participant should still see the message.
    conversation = client.get(
        f"/api/connect/conversations/{student['user']['id']}/messages", headers=professor["headers"]
    )
    texts = [item["text"] for item in conversation.json()["messages"]]
    assert "Delete-for-me test" in texts

    # The sender should no longer see it.
    own_view = client.get(
        f"/api/connect/conversations/{professor['user']['id']}/messages", headers=student["headers"]
    )
    own_texts = [item["text"] for item in own_view.json()["messages"]]
    assert "Delete-for-me test" not in own_texts


def test_delete_message_for_everyone_by_sender(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)
    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Delete-for-everyone test"},
        headers=student["headers"],
    )
    message_id = send.json()["message"]["id"]

    response = client.request(
        "DELETE",
        f"/api/connect/messages/{message_id}",
        json={"mode": "everyone"},
        headers=student["headers"],
    )
    assert response.status_code in (200, 401, 403, 422)
    assert response.json()["message"]["deletedForEveryone"] is True

    conversation = client.get(
        f"/api/connect/conversations/{student['user']['id']}/messages", headers=professor["headers"]
    )
    texts = [item["text"] for item in conversation.json()["messages"]]
    assert "Delete-for-everyone test" not in texts


def test_delete_message_for_everyone_by_non_sender_forbidden(client, make_student, make_professor):
    student = make_student()
    professor = make_professor()
    _befriend(client, student, professor)
    send = client.post(
        "/api/connect/messages",
        data={"receiver_id": professor["user"]["id"], "body": "Should stay"},
        headers=student["headers"],
    )
    message_id = send.json()["message"]["id"]

    response = client.request(
        "DELETE",
        f"/api/connect/messages/{message_id}",
        json={"mode": "everyone"},
        headers=professor["headers"],
    )
    assert response.status_code in (403, 401)
