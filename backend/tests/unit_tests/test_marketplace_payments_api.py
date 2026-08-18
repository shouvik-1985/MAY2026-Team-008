from datetime import datetime, timezone
from uuid import uuid4

from app.db import SessionLocal
from app.models import MarketplaceItem, MarketplacePurchase, User


def test_create_marketplace_purchase_order_without_razorpay_keys_returns_503(client, make_student):
    student = make_student()
    response = client.post(
        "/api/marketplace/items/any-listing/purchase/order",
        headers=student["headers"],
    )

    assert response.status_code == 503
    assert "Razorpay keys" in response.json()["detail"]


def test_admin_can_view_marketplace_purchase_history(client, admin_headers, make_student):
    buyer = make_student()
    db = SessionLocal()
    try:
        buyer_user = db.get(User, buyer["user"]["id"])
        item = MarketplaceItem(
            seller_id=None,
            item_key=f"market-test-{uuid4().hex}",
            name="Campus Bottle",
            category="Other",
            price="550",
            seller_name="Campus Admin",
            tag="Campus Listed",
            description="Milton water bottle.",
            status="Sold",
            visibility="visible",
            approval_status="approved",
            availability="sold",
            created_by_role="admin",
        )
        db.add(item)
        db.flush()
        purchase = MarketplacePurchase(
            item_id=item.id,
            item_key=item.item_key,
            item_name=item.name,
            item_category=item.category,
            buyer_id=buyer_user.id,
            buyer_name=buyer_user.full_name,
            buyer_email=buyer_user.email,
            buyer_student_code=None,
            seller_id=None,
            seller_label=item.seller_name,
            amount=550,
            currency="INR",
            status="paid",
            razorpay_order_id=f"order_{uuid4().hex[:12]}",
            razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
            purchased_at=datetime.now(timezone.utc),
        )
        db.add(purchase)
        db.commit()
    finally:
        db.close()

    response = client.get("/api/marketplace/purchases", headers=admin_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["metrics"]["paidPurchases"] >= 1
    assert any(row["buyerEmail"] == buyer["email"] and row["itemName"] == "Campus Bottle" for row in data["purchases"])


def test_student_cannot_view_marketplace_purchase_history(client, make_student):
    student = make_student()
    response = client.get("/api/marketplace/purchases", headers=student["headers"])

    assert response.status_code == 403


def test_admin_delete_purchased_marketplace_item_archives_without_breaking_history(client, admin_headers, make_student):
    buyer = make_student()
    db = SessionLocal()
    try:
        buyer_user = db.get(User, buyer["user"]["id"])
        item = MarketplaceItem(
            seller_id=None,
            item_key=f"market-delete-{uuid4().hex}",
            name="Purchased Cycle",
            category="Cycles",
            price="4470",
            seller_name="Campus Admin",
            tag="Campus Listed",
            description="College cycle.",
            status="Sold",
            visibility="visible",
            approval_status="approved",
            availability="sold",
            created_by_role="admin",
        )
        db.add(item)
        db.flush()
        purchase = MarketplacePurchase(
            item_id=item.id,
            item_key=item.item_key,
            item_name=item.name,
            item_category=item.category,
            buyer_id=buyer_user.id,
            buyer_name=buyer_user.full_name,
            buyer_email=buyer_user.email,
            buyer_student_code=None,
            seller_id=None,
            seller_label=item.seller_name,
            amount=4470,
            currency="INR",
            status="paid",
            razorpay_order_id=f"order_{uuid4().hex[:12]}",
            razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
            purchased_at=datetime.now(timezone.utc),
        )
        db.add(purchase)
        db.commit()
        item_key = item.item_key
        item_id = item.id
    finally:
        db.close()

    response = client.delete(f"/api/marketplace/items/{item_key}", headers=admin_headers)

    assert response.status_code == 200
    assert "archived" in response.json()["message"]

    list_response = client.get("/api/marketplace/items?include_hidden=true", headers=admin_headers)
    assert list_response.status_code == 200
    assert all(row["key"] != item_key for row in list_response.json()["items"])

    db = SessionLocal()
    try:
        archived = db.query(MarketplaceItem).filter(MarketplaceItem.id == item_id).first()
        assert archived is not None
        assert archived.is_deleted is True
        assert archived.visibility == "hidden"
        assert db.query(MarketplacePurchase).filter(MarketplacePurchase.item_id == item_id).count() == 1
    finally:
        db.close()
