from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
import requests
from sqlalchemy.orm import Session, load_only

from app.core.config import get_settings
from app.db import get_db
from app.dependencies import get_current_user
from app.models import MarketplaceAsset, MarketplaceItem, MarketplacePurchase, Role, User
from app.storage import MARKETPLACE_UPLOAD_DIR, ensure_upload_dirs

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"
DB_ASSET_URL_PREFIX = "/api/marketplace/assets/"
STUDENT_ALLOWED_NOTE_TYPES = {"Handwritten Notes", "Short Notes"}
DEFAULT_CATEGORIES = [
    "Notes",
    "Books",
    "Electronics",
    "Cycles",
    "Bags",
    "Hostel Essentials",
    "Professor Modules",
    "Accessories",
    "Other",
]


class MarketplacePaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(filename).name).strip(".-")
    return cleaned or "marketplace-file"


def _normalize_role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_admin(user: User) -> bool:
    return user.role == Role.admin


def _is_student(user: User) -> bool:
    return user.role == Role.student


def _ensure_marketplace_user(user: User) -> None:
    if user.role not in {Role.student, Role.admin}:
        raise HTTPException(status_code=403, detail="Marketplace is available to student and admin users only")


def _clean_text(value: str | None, *, field: str, max_length: int, fallback: str | None = None) -> str | None:
    if value is None:
        return fallback
    cleaned = value.strip()
    if not cleaned:
        return fallback
    return cleaned[:max_length]


def _normalize_category(category: str | None, fallback: str = "Other") -> str:
    cleaned = (category or "").strip()
    return cleaned[:80] or fallback


def _normalize_price(price: str) -> str:
    cleaned = price.strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail="Price is required")
    return cleaned if cleaned.startswith("₹") else f"₹ {cleaned}"


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    return [str(item).strip() for item in payload if str(item).strip()]


def _asset_url(asset_key: str) -> str:
    return f"{DB_ASSET_URL_PREFIX}{asset_key}"


def _is_local_marketplace_upload_url(value: str | None) -> bool:
    return bool(value and value.startswith("/uploads/marketplace/"))


def _local_marketplace_upload_path(value: str) -> Path | None:
    if not _is_local_marketplace_upload_url(value):
        return None
    filename = Path(value).name
    if not filename:
        return None
    target = (MARKETPLACE_UPLOAD_DIR / filename).resolve()
    root = MARKETPLACE_UPLOAD_DIR.resolve()
    if root not in target.parents and target != root:
        return None
    return target


def _save_asset_bytes(
    db: Session,
    *,
    filename: str,
    content_type: str | None,
    payload: bytes,
    source_url: str | None = None,
) -> str:
    safe_name = _safe_filename(filename)
    existing = None
    if source_url:
        existing = db.query(MarketplaceAsset).filter(MarketplaceAsset.source_url == source_url).first()
    if existing:
        return _asset_url(existing.asset_key)

    asset = MarketplaceAsset(
        asset_key=f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:16]}",
        filename=safe_name[:255],
        content_type=(content_type or "application/octet-stream")[:120],
        file_size=len(payload),
        file_data=payload,
        source_url=source_url,
    )
    db.add(asset)
    db.flush()
    return _asset_url(asset.asset_key)


def _save_upload(db: Session, upload: UploadFile) -> str:
    payload = upload.file.read()
    return _save_asset_bytes(
        db,
        filename=Path(upload.filename or "marketplace-image").name,
        content_type=upload.content_type or "application/octet-stream",
        payload=payload,
    )


def _backfill_local_asset_url(db: Session, url: str | None) -> tuple[str | None, bool]:
    if not _is_local_marketplace_upload_url(url):
        return url, False
    existing = db.query(MarketplaceAsset).filter(MarketplaceAsset.source_url == url).first()
    if existing:
        return _asset_url(existing.asset_key), True

    local_path = _local_marketplace_upload_path(url or "")
    if not local_path or not local_path.exists() or not local_path.is_file():
        return url, False

    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    asset_url = _save_asset_bytes(
        db,
        filename=local_path.name,
        content_type=content_type,
        payload=local_path.read_bytes(),
        source_url=url,
    )
    return asset_url, True


def _backfill_local_asset_list(db: Session, value: str | None) -> tuple[str | None, bool]:
    urls = _json_list(value)
    if not urls:
        return value, False
    changed = False
    converted: list[str] = []
    for url in urls:
        next_url, url_changed = _backfill_local_asset_url(db, url)
        converted.append(next_url or url)
        changed = changed or url_changed
    return (json.dumps(converted), True) if changed else (value, False)


def backfill_local_marketplace_upload_assets(db: Session) -> None:
    ensure_upload_dirs()
    changed = False
    items = db.query(MarketplaceItem).all()
    for item in items:
        image_url, image_changed = _backfill_local_asset_url(db, item.image_url)
        thumbnail_url, thumbnail_changed = _backfill_local_asset_url(db, item.thumbnail_url)
        gallery_json, gallery_changed = _backfill_local_asset_list(db, item.image_urls_json)
        preview_json, preview_changed = _backfill_local_asset_list(db, item.preview_image_urls_json)
        if image_changed:
            item.image_url = image_url
        if thumbnail_changed:
            item.thumbnail_url = thumbnail_url
        if gallery_changed:
            item.image_urls_json = gallery_json
        if preview_changed:
            item.preview_image_urls_json = preview_json
        if image_changed or thumbnail_changed or gallery_changed or preview_changed:
            item.updated_at = datetime.now(timezone.utc)
            changed = True
    if changed:
        db.commit()


def _read_upload_bytes(upload: UploadFile | None) -> tuple[str | None, str | None, int | None, bytes | None]:
    if not upload or not upload.filename:
        return None, None, None, None
    payload = upload.file.read()
    return (
        Path(upload.filename).name[:255],
        (upload.content_type or "application/octet-stream")[:120],
        len(payload),
        payload,
    )


def _seller_label(user: User) -> str:
    if user.role == Role.admin:
        return user.full_name
    semester = getattr(user.student_profile, "semester", None)
    first_name = (user.full_name or "Student").split()[0]
    return f"{first_name} / Sem {semester or 1}"


def _category_options(db: Session) -> list[str]:
    custom = [
        item[0]
        for item in db.query(MarketplaceItem.category)
        .filter(MarketplaceItem.category.is_not(None))
        .distinct()
        .all()
    ]
    ordered: list[str] = []
    for name in [*DEFAULT_CATEGORIES, *custom]:
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _marketplace_amount_rupees(price: str | None) -> int:
    amount = int(re.sub(r"[^\d]", "", price or "") or "0")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Listing amount is invalid")
    return amount


def _razorpay_credentials() -> tuple[str, str]:
    settings = get_settings()
    key_id = (settings.razorpay_key_id or "").strip()
    secret = settings.razorpay_secret_key.get_secret_value().strip() if settings.razorpay_secret_key else ""
    if not key_id or not secret:
        raise HTTPException(status_code=503, detail="Razorpay keys are not configured on the backend")
    return key_id, secret


def _student_code(user: User) -> str | None:
    profile = getattr(user, "student_profile", None)
    return profile.student_code if profile and profile.student_code else None


def _purchase_payload(purchase: MarketplacePurchase) -> dict[str, Any]:
    return {
        "id": purchase.id,
        "itemKey": purchase.item_key,
        "itemName": purchase.item_name,
        "itemCategory": purchase.item_category,
        "buyerId": purchase.buyer_id,
        "buyerName": purchase.buyer_name,
        "buyerEmail": purchase.buyer_email,
        "buyerStudentCode": purchase.buyer_student_code,
        "sellerId": purchase.seller_id,
        "sellerLabel": purchase.seller_label,
        "amount": purchase.amount,
        "currency": purchase.currency,
        "status": purchase.status,
        "razorpayOrderId": purchase.razorpay_order_id,
        "razorpayPaymentId": purchase.razorpay_payment_id,
        "createdAt": purchase.created_at.isoformat() if purchase.created_at else None,
        "updatedAt": purchase.updated_at.isoformat() if purchase.updated_at else None,
        "purchasedAt": purchase.purchased_at.isoformat() if purchase.purchased_at else None,
    }


def _student_has_paid_purchase(db: Session, user: User, item: MarketplaceItem) -> bool:
    if not _is_student(user):
        return False
    return (
        db.query(MarketplacePurchase)
        .filter(
            MarketplacePurchase.item_id == item.id,
            MarketplacePurchase.buyer_id == user.id,
            MarketplacePurchase.status == "paid",
        )
        .first()
        is not None
    )


def _marketplace_item_summary_load():
    return load_only(
        MarketplaceItem.id,
        MarketplaceItem.seller_id,
        MarketplaceItem.item_key,
        MarketplaceItem.name,
        MarketplaceItem.category,
        MarketplaceItem.subcategory,
        MarketplaceItem.price,
        MarketplaceItem.seller_name,
        MarketplaceItem.tag,
        MarketplaceItem.image_url,
        MarketplaceItem.thumbnail_url,
        MarketplaceItem.image_urls_json,
        MarketplaceItem.preview_image_urls_json,
        MarketplaceItem.description,
        MarketplaceItem.status,
        MarketplaceItem.visibility,
        MarketplaceItem.approval_status,
        MarketplaceItem.availability,
        MarketplaceItem.condition,
        MarketplaceItem.semester,
        MarketplaceItem.subject,
        MarketplaceItem.notes_preview_mode,
        MarketplaceItem.preview_pages,
        MarketplaceItem.pdf_filename,
        MarketplaceItem.pdf_file_size,
        MarketplaceItem.featured,
        MarketplaceItem.is_deleted,
        MarketplaceItem.created_by_role,
        MarketplaceItem.created_at,
        MarketplaceItem.updated_at,
    )


def _has_pdf_metadata(item: MarketplaceItem) -> bool:
    if item.pdf_file_size or item.pdf_filename:
        return True
    return bool(item.__dict__.get("pdf_file_data"))


def _item_payload(item: MarketplaceItem, *, admin_view: bool) -> dict[str, Any]:
    image_urls = _json_list(item.image_urls_json)
    preview_image_urls = _json_list(item.preview_image_urls_json)
    if item.image_url and item.image_url not in image_urls:
        image_urls.insert(0, item.image_url)
    if item.thumbnail_url and item.thumbnail_url not in image_urls:
        image_urls.insert(0, item.thumbnail_url)

    is_notes = item.category == "Notes"
    visible = item.visibility != "hidden" and not item.is_deleted
    return {
        "id": item.id,
        "key": item.item_key,
        "name": item.name,
        "title": item.name,
        "category": item.category,
        "subcategory": item.subcategory or ("Handwritten Notes" if is_notes else None),
        "price": item.price,
        "seller": item.seller_name,
        "seller_id": item.seller_id,
        "tag": item.tag,
        "description": item.description,
        "imageUrl": item.thumbnail_url or item.image_url,
        "thumbnailUrl": item.thumbnail_url or item.image_url,
        "gallery": image_urls,
        "previewGallery": preview_image_urls,
        "status": item.status,
        "availability": item.availability,
        "visibility": item.visibility,
        "approvalStatus": item.approval_status,
        "featured": item.featured,
        "deleted": item.is_deleted,
        "condition": item.condition,
        "semester": item.semester,
        "subject": item.subject,
        "previewMode": item.notes_preview_mode or ("watermarked-pages" if is_notes else "gallery"),
        "previewPages": item.preview_pages or (2 if is_notes else 0),
        "hasProtectedPdf": _has_pdf_metadata(item),
        "isNotes": is_notes,
        "isVisibleToStudents": visible and item.approval_status != "rejected",
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
        "createdByRole": item.created_by_role,
        "campusVerified": item.tag.lower() in {"verified", "verified notes", "campus verified"},
        "adminMeta": {
            "pdfFilename": item.pdf_filename,
        } if admin_view else None,
    }


def _student_can_view(item: MarketplaceItem) -> bool:
    return item.visibility != "hidden" and not item.is_deleted and item.approval_status != "rejected"


def _query_items(db: Session, *, admin_view: bool) -> list[MarketplaceItem]:
    if admin_view:
        return (
            db.query(MarketplaceItem)
            .options(_marketplace_item_summary_load())
            .filter(MarketplaceItem.is_deleted.is_(False))
            .order_by(MarketplaceItem.featured.desc(), MarketplaceItem.created_at.desc())
            .all()
        )
    return (
        db.query(MarketplaceItem)
        .options(_marketplace_item_summary_load())
        .filter(
            MarketplaceItem.visibility != "hidden",
            MarketplaceItem.is_deleted.is_(False),
            MarketplaceItem.approval_status != "rejected",
        )
        .order_by(MarketplaceItem.featured.desc(), MarketplaceItem.created_at.desc())
        .all()
    )


@router.get("/assets/{asset_key}")
def get_marketplace_asset(
    asset_key: str,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    asset = db.query(MarketplaceAsset).filter(MarketplaceAsset.asset_key == asset_key).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Marketplace asset not found")
    return Response(
        content=asset.file_data,
        media_type=asset.content_type or "application/octet-stream",
        headers={
            "Content-Length": str(asset.file_size or len(asset.file_data)),
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )


def _replace_gallery_urls(
    db: Session,
    existing_json: str | None,
    uploads: list[UploadFile] | None,
) -> tuple[list[str], bool]:
    files = [upload for upload in (uploads or []) if upload.filename]
    if not files:
        return _json_list(existing_json), False
    return [_save_upload(db, upload) for upload in files], True


def _create_or_update_item(
    *,
    db: Session,
    actor: User,
    item: MarketplaceItem | None,
    title: str,
    price: str,
    description: str,
    category: str,
    subcategory: str | None,
    condition: str | None,
    semester: str | None,
    subject: str | None,
    tag: str | None,
    visibility: str | None,
    availability: str | None,
    approval_status: str | None,
    featured: bool | None,
    preview_mode: str | None,
    preview_pages: int | None,
    gallery_urls: list[str],
    preview_gallery_urls: list[str],
    thumbnail_url: str | None,
    pdf_upload: UploadFile | None,
) -> MarketplaceItem:
    creating = item is None
    if creating:
        item = MarketplaceItem(
            seller_id=actor.id,
            item_key=f"market-{actor.id}-{int(datetime.now(timezone.utc).timestamp())}-{uuid4().hex[:6]}",
            name=title,
            category=category,
            subcategory=subcategory,
            price=price,
            seller_name=_seller_label(actor),
            tag=tag or "Verified",
            image_url=(gallery_urls[0] if gallery_urls else thumbnail_url),
            thumbnail_url=thumbnail_url or (gallery_urls[0] if gallery_urls else None),
            image_urls_json=json.dumps(gallery_urls),
            preview_image_urls_json=json.dumps(preview_gallery_urls),
            description=description,
            status="Available",
            visibility=visibility or "visible",
            approval_status=approval_status or ("approved" if _is_admin(actor) else "pending"),
            availability=availability or "in_stock",
            condition=condition,
            semester=semester,
            subject=subject,
            notes_preview_mode=preview_mode,
            preview_pages=preview_pages,
            featured=bool(featured) if featured is not None else False,
            is_deleted=False,
            created_by_role=_normalize_role(actor),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(item)
    else:
        item.name = title
        item.category = category
        item.subcategory = subcategory
        item.price = price
        item.tag = tag or item.tag
        item.description = description
        item.condition = condition
        item.semester = semester
        item.subject = subject
        item.visibility = visibility or item.visibility
        item.availability = availability or item.availability
        item.approval_status = approval_status or item.approval_status
        item.notes_preview_mode = preview_mode or item.notes_preview_mode
        item.preview_pages = preview_pages if preview_pages is not None else item.preview_pages
        item.updated_at = datetime.now(timezone.utc)
        if featured is not None:
            item.featured = featured
        if gallery_urls:
            item.image_url = gallery_urls[0]
            item.image_urls_json = json.dumps(gallery_urls)
        if preview_gallery_urls:
            item.preview_image_urls_json = json.dumps(preview_gallery_urls)
        if thumbnail_url:
            item.thumbnail_url = thumbnail_url

    pdf_filename, pdf_content_type, pdf_file_size, pdf_file_data = _read_upload_bytes(pdf_upload)
    if pdf_file_data:
        item.pdf_filename = pdf_filename
        item.pdf_content_type = pdf_content_type
        item.pdf_file_size = pdf_file_size
        item.pdf_file_data = pdf_file_data

    return item


@router.get("/meta")
def marketplace_meta(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    return {
        "ok": True,
        "categories": _category_options(db),
        "studentAllowedSubcategories": sorted(STUDENT_ALLOWED_NOTE_TYPES),
    }


@router.get("/items")
def list_marketplace_items(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    include_hidden: bool = Query(default=False),
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    admin_view = _is_admin(current_user) and include_hidden
    items = _query_items(db, admin_view=admin_view)
    return {"ok": True, "items": [_item_payload(item, admin_view=admin_view) for item in items]}


@router.post("/items/{item_key}/purchase/order")
def create_marketplace_purchase_order(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    if not _is_student(current_user):
        raise HTTPException(status_code=403, detail="Only students can purchase marketplace listings")

    key_id, secret = _razorpay_credentials()
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    if not _student_can_view(item):
        raise HTTPException(status_code=403, detail="This listing is not available for purchase")
    if item.seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot purchase your own listing")
    if (item.status or "").lower() == "sold" or (item.availability or "").lower() == "sold":
        raise HTTPException(status_code=400, detail="This listing is already sold")
    if _student_has_paid_purchase(db, current_user, item):
        raise HTTPException(status_code=400, detail="You have already purchased this listing")

    amount = _marketplace_amount_rupees(item.price)
    pending_purchase = (
        db.query(MarketplacePurchase)
        .filter(
            MarketplacePurchase.item_id == item.id,
            MarketplacePurchase.buyer_id == current_user.id,
            MarketplacePurchase.status == "created",
        )
        .order_by(MarketplacePurchase.created_at.desc())
        .first()
    )
    if pending_purchase and pending_purchase.razorpay_order_id:
        return {
            "ok": True,
            "keyId": key_id,
            "orderId": pending_purchase.razorpay_order_id,
            "amount": pending_purchase.amount * 100,
            "currency": pending_purchase.currency,
            "purchase": _purchase_payload(pending_purchase),
            "item": _item_payload(item, admin_view=False),
        }

    receipt = f"MP-{item.id}-{current_user.id}-{int(datetime.now(timezone.utc).timestamp()) % 100000}"
    payload = {
        "amount": amount * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "item_key": item.item_key,
            "item_name": item.name,
            "buyer_id": str(current_user.id),
        },
    }
    try:
        response = requests.post(RAZORPAY_ORDERS_URL, json=payload, auth=(key_id, secret), timeout=15)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Razorpay: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("description") or response.text
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {detail}")

    data = response.json()
    order_id = data.get("id")
    if not order_id:
        raise HTTPException(status_code=502, detail="Razorpay did not return an order id")

    purchase = pending_purchase or MarketplacePurchase(
        item_id=item.id,
        item_key=item.item_key,
        item_name=item.name,
        item_category=item.category,
        buyer_id=current_user.id,
        buyer_name=current_user.full_name,
        buyer_email=current_user.email,
        buyer_student_code=_student_code(current_user),
        seller_id=item.seller_id,
        seller_label=item.seller_name,
        amount=amount,
        currency=data.get("currency", "INR"),
        status="created",
    )
    purchase.item_name = item.name
    purchase.item_category = item.category
    purchase.amount = amount
    purchase.currency = data.get("currency", "INR")
    purchase.razorpay_order_id = order_id
    purchase.updated_at = datetime.now(timezone.utc)
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return {
        "ok": True,
        "keyId": key_id,
        "orderId": order_id,
        "amount": data.get("amount", amount * 100),
        "currency": data.get("currency", purchase.currency),
        "purchase": _purchase_payload(purchase),
        "item": _item_payload(item, admin_view=False),
    }


@router.post("/purchases/verify")
def verify_marketplace_purchase_payment(
    payload: MarketplacePaymentVerify,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    if not _is_student(current_user):
        raise HTTPException(status_code=403, detail="Only students can verify marketplace purchases")

    _, secret = _razorpay_credentials()
    purchase = (
        db.query(MarketplacePurchase)
        .filter(
            MarketplacePurchase.buyer_id == current_user.id,
            MarketplacePurchase.razorpay_order_id == payload.razorpay_order_id.strip(),
        )
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Matching marketplace purchase was not found")
    item = db.query(MarketplaceItem).filter(MarketplaceItem.id == purchase.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    if purchase.status == "paid":
        return {
            "ok": True,
            "message": "Marketplace purchase already verified",
            "purchase": _purchase_payload(purchase),
            "item": _item_payload(item, admin_view=False),
        }

    payment_id = payload.razorpay_payment_id.strip()
    signature = payload.razorpay_signature.strip()
    signed_payload = f"{purchase.razorpay_order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        purchase.status = "failed"
        purchase.updated_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=400, detail="Razorpay payment signature verification failed")

    moment = datetime.now(timezone.utc)
    purchase.status = "paid"
    purchase.razorpay_payment_id = payment_id
    purchase.razorpay_signature = signature
    purchase.purchased_at = moment
    purchase.updated_at = moment
    item.status = "Sold"
    item.availability = "sold"
    item.updated_at = moment
    db.commit()
    db.refresh(purchase)
    db.refresh(item)
    return {
        "ok": True,
        "message": f"Purchase verified for {purchase.item_name}",
        "purchase": _purchase_payload(purchase),
        "item": _item_payload(item, admin_view=False),
    }


@router.get("/purchases")
def list_marketplace_purchases(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can view marketplace purchases")

    purchases = db.query(MarketplacePurchase).order_by(MarketplacePurchase.created_at.desc()).all()
    paid = [purchase for purchase in purchases if purchase.status == "paid"]
    return {
        "ok": True,
        "purchases": [_purchase_payload(purchase) for purchase in purchases],
        "metrics": {
            "totalPurchases": len(purchases),
            "paidPurchases": len(paid),
            "totalCollected": sum(purchase.amount for purchase in paid),
        },
    }


@router.post("/items")
def create_marketplace_item(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    title: Annotated[str, Form(...)],
    price: Annotated[str, Form(...)],
    description: Annotated[str, Form(...)],
    category: Annotated[str | None, Form()] = None,
    subcategory: Annotated[str | None, Form()] = None,
    condition: Annotated[str | None, Form()] = None,
    semester: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    tag: Annotated[str | None, Form()] = None,
    visibility: Annotated[str | None, Form()] = None,
    availability: Annotated[str | None, Form()] = None,
    approval_status: Annotated[str | None, Form()] = None,
    featured: Annotated[bool | None, Form()] = None,
    preview_mode: Annotated[str | None, Form()] = None,
    preview_pages: Annotated[int | None, Form()] = None,
    existing_gallery_json: Annotated[str | None, Form()] = None,
    existing_preview_gallery_json: Annotated[str | None, Form()] = None,
    images: Annotated[list[UploadFile] | None, File()] = None,
    preview_images: Annotated[list[UploadFile] | None, File()] = None,
    thumbnail: Annotated[UploadFile | None, File()] = None,
    notes_pdf: Annotated[UploadFile | None, File()] = None,
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)

    cleaned_title = _clean_text(title, field="Title", max_length=180)
    cleaned_description = _clean_text(description, field="Description", max_length=3000)
    if not cleaned_title or not cleaned_description:
        raise HTTPException(status_code=422, detail="Title and description are required")

    if _is_student(current_user):
        category = "Notes"
        if (subcategory or "").strip() not in STUDENT_ALLOWED_NOTE_TYPES:
            raise HTTPException(status_code=403, detail="Students can create handwritten notes or short notes only")
        visibility = "visible"
        approval_status = "pending"
        featured = False
        preview_mode = preview_mode or "watermarked-pages"
        preview_pages = preview_pages or 2

    normalized_category = _normalize_category(category, fallback="Notes" if _is_student(current_user) else "Other")
    gallery_urls = _json_list(existing_gallery_json)
    preview_gallery_urls = _json_list(existing_preview_gallery_json)
    for upload in images or []:
        if upload.filename:
            gallery_urls.append(_save_upload(db, upload))
    for upload in preview_images or []:
        if upload.filename:
            preview_gallery_urls.append(_save_upload(db, upload))
    thumbnail_url = _save_upload(db, thumbnail) if thumbnail and thumbnail.filename else None

    item = _create_or_update_item(
        db=db,
        actor=current_user,
        item=None,
        title=cleaned_title,
        price=_normalize_price(price),
        description=cleaned_description,
        category=normalized_category,
        subcategory=_clean_text(subcategory, field="Subcategory", max_length=80),
        condition=_clean_text(condition, field="Condition", max_length=80),
        semester=_clean_text(semester, field="Semester", max_length=40),
        subject=_clean_text(subject, field="Subject", max_length=120),
        tag=_clean_text(tag, field="Tag", max_length=80, fallback="Verified Notes" if normalized_category == "Notes" else "Campus Listed"),
        visibility=_clean_text(visibility, field="Visibility", max_length=20, fallback="visible"),
        availability=_clean_text(availability, field="Availability", max_length=20, fallback="in_stock"),
        approval_status=_clean_text(approval_status, field="Approval", max_length=20, fallback="approved" if _is_admin(current_user) else "pending"),
        featured=featured,
        preview_mode=_clean_text(preview_mode, field="Preview Mode", max_length=40, fallback="gallery"),
        preview_pages=preview_pages,
        gallery_urls=gallery_urls,
        preview_gallery_urls=preview_gallery_urls,
        thumbnail_url=thumbnail_url,
        pdf_upload=notes_pdf,
    )
    db.commit()
    db.refresh(item)
    return {"ok": True, "message": f"Listing '{item.name}' published successfully.", "item": _item_payload(item, admin_view=_is_admin(current_user))}


@router.patch("/items/{item_key}")
def update_marketplace_item(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    payload: dict[str, Any],
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    if _is_student(current_user) and item.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own listings")

    if "name" in payload:
        item.name = _clean_text(str(payload["name"]), field="Title", max_length=180) or item.name
    if "description" in payload:
        item.description = _clean_text(str(payload["description"]), field="Description", max_length=3000) or item.description
    if "price" in payload:
        item.price = _normalize_price(str(payload["price"]))
    if "tag" in payload:
        item.tag = _clean_text(str(payload["tag"]), field="Tag", max_length=80) or item.tag
    if "category" in payload and _is_admin(current_user):
        item.category = _normalize_category(str(payload["category"]))
    if "subcategory" in payload:
        if _is_student(current_user) and str(payload["subcategory"]) not in STUDENT_ALLOWED_NOTE_TYPES:
            raise HTTPException(status_code=403, detail="Students can list handwritten notes or short notes only")
        item.subcategory = _clean_text(str(payload["subcategory"]), field="Subcategory", max_length=80)
    if "availability" in payload:
        item.availability = _clean_text(str(payload["availability"]), field="Availability", max_length=20) or item.availability
    if "status" in payload:
        item.status = _clean_text(str(payload["status"]), field="Status", max_length=20) or item.status
    if "visibility" in payload and _is_admin(current_user):
        item.visibility = _clean_text(str(payload["visibility"]), field="Visibility", max_length=20) or item.visibility
    if "approvalStatus" in payload and _is_admin(current_user):
        item.approval_status = _clean_text(str(payload["approvalStatus"]), field="Approval", max_length=20) or item.approval_status
    if "featured" in payload and _is_admin(current_user):
        item.featured = bool(payload["featured"])
    if "deleted" in payload and _is_admin(current_user):
        item.is_deleted = bool(payload["deleted"])
    if "condition" in payload:
        item.condition = _clean_text(str(payload["condition"]), field="Condition", max_length=80)
    if "semester" in payload:
        item.semester = _clean_text(str(payload["semester"]), field="Semester", max_length=40)
    if "subject" in payload:
        item.subject = _clean_text(str(payload["subject"]), field="Subject", max_length=120)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return {"ok": True, "message": f"Listing '{item.name}' updated.", "item": _item_payload(item, admin_view=_is_admin(current_user))}


@router.post("/items/{item_key}/edit")
def edit_marketplace_item(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    title: Annotated[str, Form(...)],
    price: Annotated[str, Form(...)],
    description: Annotated[str, Form(...)],
    category: Annotated[str | None, Form()] = None,
    subcategory: Annotated[str | None, Form()] = None,
    condition: Annotated[str | None, Form()] = None,
    semester: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    tag: Annotated[str | None, Form()] = None,
    visibility: Annotated[str | None, Form()] = None,
    availability: Annotated[str | None, Form()] = None,
    approval_status: Annotated[str | None, Form()] = None,
    featured: Annotated[bool | None, Form()] = None,
    preview_mode: Annotated[str | None, Form()] = None,
    preview_pages: Annotated[int | None, Form()] = None,
    images: Annotated[list[UploadFile] | None, File()] = None,
    preview_images: Annotated[list[UploadFile] | None, File()] = None,
    thumbnail: Annotated[UploadFile | None, File()] = None,
    notes_pdf: Annotated[UploadFile | None, File()] = None,
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    if _is_student(current_user) and item.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own listings")

    if _is_student(current_user):
        category = "Notes"
        if (subcategory or "").strip() not in STUDENT_ALLOWED_NOTE_TYPES:
            raise HTTPException(status_code=403, detail="Students can create handwritten notes or short notes only")
        approval_status = item.approval_status
        featured = item.featured
        visibility = item.visibility

    gallery_urls, replaced_gallery = _replace_gallery_urls(db, item.image_urls_json, images)
    preview_gallery_urls, replaced_preview_gallery = _replace_gallery_urls(db, item.preview_image_urls_json, preview_images)
    thumbnail_url = _save_upload(db, thumbnail) if thumbnail and thumbnail.filename else item.thumbnail_url

    item = _create_or_update_item(
        db=db,
        actor=current_user,
        item=item,
        title=_clean_text(title, field="Title", max_length=180) or item.name,
        price=_normalize_price(price),
        description=_clean_text(description, field="Description", max_length=3000) or item.description,
        category=_normalize_category(category, fallback=item.category),
        subcategory=_clean_text(subcategory, field="Subcategory", max_length=80, fallback=item.subcategory),
        condition=_clean_text(condition, field="Condition", max_length=80, fallback=item.condition),
        semester=_clean_text(semester, field="Semester", max_length=40, fallback=item.semester),
        subject=_clean_text(subject, field="Subject", max_length=120, fallback=item.subject),
        tag=_clean_text(tag, field="Tag", max_length=80, fallback=item.tag),
        visibility=_clean_text(visibility, field="Visibility", max_length=20, fallback=item.visibility),
        availability=_clean_text(availability, field="Availability", max_length=20, fallback=item.availability),
        approval_status=_clean_text(approval_status, field="Approval", max_length=20, fallback=item.approval_status),
        featured=featured if featured is not None else item.featured,
        preview_mode=_clean_text(preview_mode, field="Preview Mode", max_length=40, fallback=item.notes_preview_mode),
        preview_pages=preview_pages if preview_pages is not None else item.preview_pages,
        gallery_urls=gallery_urls if replaced_gallery else _json_list(item.image_urls_json),
        preview_gallery_urls=preview_gallery_urls if replaced_preview_gallery else _json_list(item.preview_image_urls_json),
        thumbnail_url=thumbnail_url,
        pdf_upload=notes_pdf,
    )
    if thumbnail_url:
        item.thumbnail_url = thumbnail_url
    db.commit()
    db.refresh(item)
    return {"ok": True, "message": f"Listing '{item.name}' updated.", "item": _item_payload(item, admin_view=_is_admin(current_user))}


@router.delete("/items/{item_key}")
def delete_marketplace_item(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can delete marketplace listings")
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    item_name = item.name
    has_purchase_history = (
        db.query(MarketplacePurchase.id)
        .filter(MarketplacePurchase.item_id == item.id)
        .first()
        is not None
    )
    if has_purchase_history:
        item.is_deleted = True
        item.visibility = "hidden"
        item.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True, "message": f"Listing '{item_name}' archived and hidden from the marketplace."}

    db.delete(item)
    db.commit()
    return {"ok": True, "message": f"Listing '{item_name}' removed from the marketplace."}


@router.get("/items/{item_key}/notes-preview")
def get_notes_preview(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _ensure_marketplace_user(current_user)
    item = (
        db.query(MarketplaceItem)
        .options(_marketplace_item_summary_load())
        .filter(MarketplaceItem.item_key == item_key)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    if item.category != "Notes":
        raise HTTPException(status_code=422, detail="Preview protection is only available for notes listings")
    if not _is_admin(current_user) and not _student_can_view(item):
        raise HTTPException(status_code=403, detail="This listing is not visible")
    watermark_lines = ["CampusVerse Preview", "Preview Only", "Protected Content", "Not Purchased"]
    return {
        "ok": True,
        "item_key": item.item_key,
        "previewMode": item.notes_preview_mode or "watermarked-pages",
        "previewPages": item.preview_pages or 2,
        "gallery": _json_list(item.preview_image_urls_json),
        "watermarkLines": watermark_lines,
        "pdfAvailableAfterPurchase": _has_pdf_metadata(item),
    }


@router.get("/items/{item_key}/notes-file")
def download_notes_file(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(default=False),
) -> Response:
    _ensure_marketplace_user(current_user)
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item or not item.pdf_file_data:
        raise HTTPException(status_code=404, detail="Notes file not found")
    if not _is_admin(current_user) and not _student_has_paid_purchase(db, current_user, item):
        raise HTTPException(status_code=403, detail="Purchase this listing before opening the complete notes file")
    disposition = "attachment" if download else "inline"
    return Response(
        content=item.pdf_file_data,
        media_type=item.pdf_content_type or "application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{item.pdf_filename or "notes.pdf"}"',
            "Content-Length": str(item.pdf_file_size or len(item.pdf_file_data)),
        },
    )
