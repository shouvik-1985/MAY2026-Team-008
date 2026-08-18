from uuid import uuid4

from app.db import SessionLocal
from app.models import MarketplaceItem
from app.routers.marketplace import backfill_local_marketplace_upload_assets
from app.storage import MARKETPLACE_UPLOAD_DIR, ensure_upload_dirs


def test_admin_marketplace_image_upload_is_served_from_database(client, admin_headers):
    image_bytes = b"marketplace-image-from-db"
    response = client.post(
        "/api/marketplace/items",
        data={
            "title": "DB Image Backpack",
            "price": "500",
            "description": "Image should be shared across laptops.",
            "category": "Bags",
            "condition": "Excellent",
            "subject": "All",
        },
        files={"thumbnail": ("bag.png", image_bytes, "image/png")},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    item = response.json()["item"]
    assert item["thumbnailUrl"].startswith("/api/marketplace/assets/")

    asset_response = client.get(item["thumbnailUrl"])
    assert asset_response.status_code == 200
    assert asset_response.headers["content-type"] == "image/png"
    assert asset_response.content == image_bytes


def test_existing_local_marketplace_uploads_backfill_to_database(client):
    ensure_upload_dirs()
    filename = f"legacy-{uuid4().hex}.webp"
    local_path = MARKETPLACE_UPLOAD_DIR / filename
    local_url = f"/uploads/marketplace/{filename}"
    image_bytes = b"legacy-local-image"
    local_path.write_bytes(image_bytes)

    db = SessionLocal()
    try:
        item = MarketplaceItem(
            seller_id=None,
            item_key=f"market-legacy-{uuid4().hex}",
            name="Legacy Local Image",
            category="Bags",
            price="500",
            seller_name="Campus Admin",
            tag="Campus Listed",
            image_url=local_url,
            thumbnail_url=local_url,
            image_urls_json=f'["{local_url}"]',
            description="Should be converted from local storage.",
            status="Available",
            visibility="visible",
            approval_status="approved",
            availability="in_stock",
            created_by_role="admin",
        )
        db.add(item)
        db.commit()
        item_key = item.item_key

        backfill_local_marketplace_upload_assets(db)

        updated = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
        assert updated.thumbnail_url.startswith("/api/marketplace/assets/")
        assert updated.image_url == updated.thumbnail_url
    finally:
        db.close()
        local_path.unlink(missing_ok=True)
