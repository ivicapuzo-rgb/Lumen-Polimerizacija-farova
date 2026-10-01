from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form, Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import mimetypes
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import requests
from PIL import Image, ImageDraw, ImageFont


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# Emergent Object Storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "lumen-service"
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json().get("storage_key")
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage nije konfigurisan")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        # stale key — retry once
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage nije konfigurisan")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============= Models =============
class Slot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # ISO date string YYYY-MM-DD
    time: str  # HH:MM
    is_booked: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SlotCreate(BaseModel):
    date: str
    time: str


class Booking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slot_id: str
    slot_date: str
    slot_time: str
    customer_name: str
    phone: str
    car_brand: str
    car_model: str
    notes: Optional[str] = ""
    home_visit: bool = False
    address: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    unit_price: int = 0
    currency: str = "RSD"
    status: str = "pending"  # pending | confirmed | rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BookingCreate(BaseModel):
    slot_id: str
    customer_name: str
    phone: str
    car_brand: str
    car_model: str
    notes: Optional[str] = ""
    home_visit: bool = False
    address: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class BookingStatusUpdate(BaseModel):
    status: str  # confirmed | rejected


class AdminLogin(BaseModel):
    password: str


class Settings(BaseModel):
    price: int = 2500
    currency: str = "RSD"
    share_url: str = ""
    gallery_visible: bool = True


class SettingsUpdate(BaseModel):
    price: Optional[int] = None
    currency: Optional[str] = None
    share_url: Optional[str] = None
    gallery_visible: Optional[bool] = None


class BlockedDay(BaseModel):
    date: str


class HeartbeatIn(BaseModel):
    session_id: str
    role: str = "customer"  # "customer" | "admin"


class GalleryImage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    storage_path: str  # legacy single-image path (kept for old records)
    url: str  # legacy single-image url
    before_url: Optional[str] = None
    after_url: Optional[str] = None
    caption: Optional[str] = ""
    sort_order: float = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReorderIn(BaseModel):
    ids: List[str]


class AppVersion(BaseModel):
    version: str = "1.0.0"
    version_code: int = 1
    apk_url: str = ""
    electron_update_url: str = ""
    notes: str = ""
    mandatory: bool = False
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AppVersionUpdate(BaseModel):
    version: Optional[str] = None
    version_code: Optional[int] = None
    apk_url: Optional[str] = None
    electron_update_url: Optional[str] = None
    notes: Optional[str] = None
    mandatory: Optional[bool] = None


async def get_app_version_doc() -> AppVersion:
    doc = await db.app_version.find_one({"_id": "singleton"})
    if not doc:
        v = AppVersion()
        await db.app_version.insert_one({"_id": "singleton", **v.dict()})
        return v
    return AppVersion(
        version=str(doc.get("version", "1.0.0") or "1.0.0"),
        version_code=int(doc.get("version_code", 1) or 1),
        apk_url=str(doc.get("apk_url", "") or ""),
        electron_update_url=str(doc.get("electron_update_url", "") or ""),
        notes=str(doc.get("notes", "") or ""),
        mandatory=bool(doc.get("mandatory", False)),
        updated_at=str(doc.get("updated_at") or datetime.now(timezone.utc).isoformat()),
    )


async def get_settings_doc() -> Settings:
    doc = await db.settings.find_one({"_id": "singleton"})
    if not doc:
        s = Settings()
        await db.settings.insert_one({"_id": "singleton", **s.dict()})
        return s
    return Settings(
        price=doc.get("price", 2500),
        currency=doc.get("currency", "RSD"),
        share_url=doc.get("share_url", "") or "",
        gallery_visible=bool(doc.get("gallery_visible", True)),
    )


# ============= Helpers =============
def _check_admin(password: Optional[str]):
    if not password or password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Neispravna admin lozinka")


# ============= Public Routes =============
@api_router.get("/")
async def root():
    return {"message": "Lumen Service API"}


@api_router.get("/slots", response_model=List[Slot])
async def list_slots(only_available: bool = True):
    query = {"is_booked": False} if only_available else {}
    blocked = await db.blocked_days.find({}, {"_id": 0}).to_list(1000)
    blocked_dates = [b["date"] for b in blocked]
    if blocked_dates:
        query["date"] = {"$nin": blocked_dates}
    docs = await db.slots.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return [Slot(**d) for d in docs]


@api_router.get("/settings", response_model=Settings)
async def get_settings():
    return await get_settings_doc()


@api_router.get("/app-version", response_model=AppVersion)
async def get_app_version():
    return await get_app_version_doc()


@api_router.post("/heartbeat")
async def heartbeat(payload: HeartbeatIn):
    sid = (payload.session_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="session_id je obavezan")
    role = payload.role if payload.role in ("customer", "admin") else "customer"
    now = datetime.now(timezone.utc)
    await db.sessions.update_one(
        {"session_id": sid},
        {"$set": {"session_id": sid, "role": role, "last_seen": now.isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/admin/online")
async def admin_online(x_admin_password: Optional[str] = Header(default=None)):
    from datetime import timedelta

    _check_admin(x_admin_password)
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    docs = await db.sessions.find({"last_seen": {"$gte": cutoff}}, {"_id": 0}).to_list(500)
    customers = sum(1 for d in docs if d.get("role") != "admin")
    admins = sum(1 for d in docs if d.get("role") == "admin")
    return {"online_total": len(docs), "customers": customers, "admins": admins}


# ---- Gallery
@api_router.get("/gallery", response_model=List[GalleryImage])
async def list_gallery():
    docs = await db.gallery.find({}, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    return [GalleryImage(**d) for d in docs]


@api_router.get("/gallery/files/{filename}")
async def get_gallery_file(filename: str):
    # Search across storage_path, before_url, after_url
    q = {
        "$or": [
            {"storage_path": {"$regex": f"/{filename}$"}},
            {"before_url": {"$regex": f"/{filename}$"}},
            {"after_url": {"$regex": f"/{filename}$"}},
        ]
    }
    doc = await db.gallery.find_one(q, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Slika nije pronađena")
    # Resolve which path this filename maps to
    target_path = None
    for field in ("storage_path", "before_path", "after_path"):
        val = doc.get(field) or ""
        if val.endswith(f"/{filename}"):
            target_path = val
            break
    if not target_path:
        target_path = doc.get("storage_path")
    try:
        content, ctype = await run_in_threadpool(get_object, target_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Slika nije pronađena")
    return Response(content=content, media_type=ctype)


def _detect_ext(upload: UploadFile) -> str:
    if upload.filename and "." in upload.filename:
        return "." + upload.filename.rsplit(".", 1)[1].lower()
    return mimetypes.guess_extension(upload.content_type or "image/jpeg") or ".jpg"


_WATERMARK_FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def _watermark_bytes(data: bytes, content_type: str) -> tuple[bytes, str]:
    """Apply a small semi-transparent LUMEN watermark bottom-right and return (bytes, content_type)."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert("RGBA")
            w, h = im.size
            # Font size ~ 6% of the shorter side, clamped
            base = min(w, h)
            font_size = max(18, min(72, int(base * 0.06)))
            try:
                font = ImageFont.truetype(_WATERMARK_FONT_PATH, font_size)
            except Exception:
                font = ImageFont.load_default()

            text = "LUMEN"
            # Measure text
            dummy = ImageDraw.Draw(im)
            try:
                bbox = dummy.textbbox((0, 0), text, font=font)
                tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            except Exception:
                tw, th = dummy.textsize(text, font=font)

            pad = max(8, int(base * 0.02))
            x = w - tw - pad * 2
            y = h - th - pad * 2

            overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
            od = ImageDraw.Draw(overlay)
            # subtle rounded background pill
            radius = max(6, int(font_size * 0.4))
            od.rounded_rectangle(
                (x - pad, y - pad, x + tw + pad, y + th + pad),
                radius=radius,
                fill=(0, 0, 0, 110),
            )
            # Dark shadow then white text for readability
            od.text((x + 1, y + 1), text, font=font, fill=(0, 0, 0, 200))
            od.text((x, y), text, font=font, fill=(255, 152, 0, 235))  # amber

            merged = Image.alpha_composite(im, overlay)

            out = io.BytesIO()
            ct = (content_type or "image/jpeg").lower()
            if "png" in ct:
                merged.save(out, format="PNG", optimize=True)
                return out.getvalue(), "image/png"
            # Default to JPEG (smaller)
            merged.convert("RGB").save(out, format="JPEG", quality=85, optimize=True)
            return out.getvalue(), "image/jpeg"
    except Exception:
        # If watermarking fails, return the original untouched
        return data, content_type or "application/octet-stream"


async def _upload_to_storage(upload: UploadFile) -> tuple[str, str]:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="Prazan fajl")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Slika je prevelika (maks 8MB)")

    watermarked, ctype = await run_in_threadpool(_watermark_bytes, data, upload.content_type or "image/jpeg")

    # Derive extension from watermarked ctype (may downgrade to jpeg)
    ext = ".jpg"
    if ctype == "image/png":
        ext = ".png"
    elif ctype == "image/jpeg":
        ext = ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    path = f"{APP_NAME}/gallery/{filename}"
    try:
        await run_in_threadpool(put_object, path, watermarked, ctype)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Greška pri uploadu: {e}")
    return path, f"/api/gallery/files/{filename}"


@api_router.post("/admin/gallery", response_model=GalleryImage)
async def admin_upload_gallery(
    file: Optional[UploadFile] = File(None),
    before: Optional[UploadFile] = File(None),
    after: Optional[UploadFile] = File(None),
    caption: str = Form(""),
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)

    before_upload = before or file
    if not before_upload:
        raise HTTPException(status_code=400, detail="Slika je obavezna")

    before_path, before_url = await _upload_to_storage(before_upload)
    after_path: Optional[str] = None
    after_url: Optional[str] = None
    if after:
        after_path, after_url = await _upload_to_storage(after)

    # New records: put "before" URL in both legacy storage_path/url and before_url.
    # Compute next sort_order (smaller = earlier).
    top = await db.gallery.find({}, {"_id": 0, "sort_order": 1}).sort([("sort_order", 1)]).limit(1).to_list(1)
    next_order = (top[0].get("sort_order", 0) if top else 0) - 1

    img_doc = {
        "id": str(uuid.uuid4()),
        "storage_path": before_path,
        "url": before_url,
        "before_url": before_url,
        "before_path": before_path,
        "after_url": after_url,
        "after_path": after_path,
        "caption": caption.strip(),
        "sort_order": next_order,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gallery.insert_one(img_doc)
    # Return public-safe fields only
    return GalleryImage(
        id=img_doc["id"],
        storage_path=img_doc["storage_path"],
        url=img_doc["url"],
        before_url=img_doc["before_url"],
        after_url=img_doc["after_url"],
        caption=img_doc["caption"],
        sort_order=img_doc["sort_order"],
        created_at=img_doc["created_at"],
    )


@api_router.patch("/admin/gallery/reorder")
async def admin_reorder_gallery(
    payload: ReorderIn,
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    for i, gid in enumerate(payload.ids):
        await db.gallery.update_one({"id": gid}, {"$set": {"sort_order": i}})
    return {"ok": True, "count": len(payload.ids)}


@api_router.delete("/admin/gallery/{image_id}")
async def admin_delete_gallery(image_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    doc = await db.gallery.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Slika nije pronađena")
    await db.gallery.delete_one({"id": image_id})
    return {"ok": True}


@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate):
    slot = await db.slots.find_one({"id": payload.slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Termin nije pronađen")
    if slot.get("is_booked"):
        raise HTTPException(status_code=400, detail="Termin je već zauzet")

    settings = await get_settings_doc()

    booking = Booking(
        slot_id=payload.slot_id,
        slot_date=slot["date"],
        slot_time=slot["time"],
        customer_name=payload.customer_name.strip(),
        phone=payload.phone.strip(),
        car_brand=payload.car_brand.strip(),
        car_model=payload.car_model.strip(),
        notes=(payload.notes or "").strip(),
        home_visit=bool(payload.home_visit),
        address=(payload.address or "").strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        unit_price=settings.price,
        currency=settings.currency,
    )
    await db.bookings.insert_one(booking.dict())
    await db.slots.update_one({"id": payload.slot_id}, {"$set": {"is_booked": True}})
    return booking


@api_router.get("/bookings/phone/{phone}", response_model=List[Booking])
async def bookings_by_phone(phone: str):
    docs = await db.bookings.find({"phone": phone}, {"_id": 0}).sort([("created_at", -1)]).to_list(1000)
    return [Booking(**d) for d in docs]


# ============= Admin Routes =============
@api_router.post("/admin/login")
async def admin_login(payload: AdminLogin):
    _check_admin(payload.password)
    return {"ok": True}


@api_router.post("/admin/slots", response_model=Slot)
async def admin_create_slot(payload: SlotCreate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    existing = await db.slots.find_one({"date": payload.date, "time": payload.time}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ovaj termin već postoji")
    slot = Slot(date=payload.date, time=payload.time)
    await db.slots.insert_one(slot.dict())
    return slot


@api_router.get("/admin/slots", response_model=List[Slot])
async def admin_list_slots(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    docs = await db.slots.find({}, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return [Slot(**d) for d in docs]


@api_router.delete("/admin/slots/{slot_id}")
async def admin_delete_slot(slot_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    slot = await db.slots.find_one({"id": slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Termin nije pronađen")
    if slot.get("is_booked"):
        raise HTTPException(status_code=400, detail="Ne možete obrisati zauzet termin. Prvo odbijte rezervaciju.")
    await db.slots.delete_one({"id": slot_id})
    return {"ok": True}


@api_router.get("/admin/bookings", response_model=List[Booking])
async def admin_list_bookings(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    docs = await db.bookings.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(1000)
    return [Booking(**d) for d in docs]


@api_router.patch("/admin/bookings/{booking_id}", response_model=Booking)
async def admin_update_booking(booking_id: str, payload: BookingStatusUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    if payload.status not in ("pending", "confirmed", "rejected", "completed"):
        raise HTTPException(status_code=400, detail="Neispravan status")
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Rezervacija nije pronađena")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": payload.status}})
    # If rejected, free the slot
    if payload.status == "rejected":
        await db.slots.update_one({"id": booking["slot_id"]}, {"$set": {"is_booked": False}})
    booking["status"] = payload.status
    return Booking(**booking)


@api_router.patch("/admin/settings", response_model=Settings)
async def admin_update_settings(payload: SettingsUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    updates = {}
    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(status_code=400, detail="Cena ne može biti negativna")
        updates["price"] = int(payload.price)
    if payload.currency is not None:
        updates["currency"] = payload.currency.strip() or "RSD"
    if payload.share_url is not None:
        updates["share_url"] = payload.share_url.strip()
    if payload.gallery_visible is not None:
        updates["gallery_visible"] = bool(payload.gallery_visible)
    if updates:
        await db.settings.update_one({"_id": "singleton"}, {"$set": updates}, upsert=True)
    return await get_settings_doc()


@api_router.patch("/admin/app-version", response_model=AppVersion)
async def admin_update_app_version(
    payload: AppVersionUpdate,
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    updates: dict = {}
    if payload.version is not None:
        v = payload.version.strip()
        if not v:
            raise HTTPException(status_code=400, detail="Verzija ne može biti prazna")
        updates["version"] = v
    if payload.version_code is not None:
        if payload.version_code < 1:
            raise HTTPException(status_code=400, detail="Kod verzije mora biti pozitivan broj")
        updates["version_code"] = int(payload.version_code)
    if payload.apk_url is not None:
        url = payload.apk_url.strip()
        if url and not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(status_code=400, detail="APK link mora počinjati sa http:// ili https://")
        updates["apk_url"] = url
    if payload.electron_update_url is not None:
        eurl = payload.electron_update_url.strip()
        if eurl and not (eurl.startswith("http://") or eurl.startswith("https://")):
            raise HTTPException(status_code=400, detail="Electron update link mora počinjati sa http:// ili https://")
        updates["electron_update_url"] = eurl
    if payload.notes is not None:
        updates["notes"] = payload.notes.strip()
    if payload.mandatory is not None:
        updates["mandatory"] = bool(payload.mandatory)
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.app_version.update_one({"_id": "singleton"}, {"$set": updates}, upsert=True)
    return await get_app_version_doc()


@api_router.delete("/admin/bookings")
async def admin_delete_all_bookings(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.bookings.delete_many({})
    # Free all slots
    await db.slots.update_many({}, {"$set": {"is_booked": False}})
    return {"ok": True, "deleted": res.deleted_count}


@api_router.delete("/admin/slots")
async def admin_delete_all_slots(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res_slots = await db.slots.delete_many({})
    res_book = await db.bookings.delete_many({})
    return {"ok": True, "slots_deleted": res_slots.deleted_count, "bookings_deleted": res_book.deleted_count}


# ---- Blocked days
@api_router.get("/admin/blocked-days", response_model=List[BlockedDay])
async def admin_list_blocked(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    docs = await db.blocked_days.find({}, {"_id": 0}).sort([("date", 1)]).to_list(1000)
    return [BlockedDay(**d) for d in docs]


@api_router.post("/admin/blocked-days", response_model=BlockedDay)
async def admin_add_blocked(payload: BlockedDay, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    if not payload.date or len(payload.date) != 10:
        raise HTTPException(status_code=400, detail="Datum mora biti GGGG-MM-DD")
    existing = await db.blocked_days.find_one({"date": payload.date}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Datum je već blokiran")
    await db.blocked_days.insert_one({"date": payload.date})
    return BlockedDay(date=payload.date)


@api_router.delete("/admin/blocked-days/{date}")
async def admin_remove_blocked(date: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.blocked_days.delete_one({"date": date})
    return {"ok": True, "deleted": res.deleted_count}


# ---- Stats
@api_router.get("/admin/stats")
async def admin_stats(month: str, x_admin_password: Optional[str] = Header(default=None)):
    """month: YYYY-MM. Returns confirmed count + revenue for that month + last 6 months history."""
    _check_admin(x_admin_password)
    if not month or len(month) != 7 or month[4] != "-":
        raise HTTPException(status_code=400, detail="month mora biti u formatu YYYY-MM")

    # Current month totals (only confirmed count toward revenue)
    month_bookings = await db.bookings.find(
        {"slot_date": {"$regex": f"^{month}-"}}, {"_id": 0}
    ).to_list(2000)
    completed = [b for b in month_bookings if b.get("status") == "completed"]
    confirmed = [b for b in month_bookings if b.get("status") == "confirmed"]
    pending = [b for b in month_bookings if b.get("status") == "pending"]
    rejected = [b for b in month_bookings if b.get("status") == "rejected"]

    earning_bookings = completed + confirmed
    revenue = sum(int(b.get("unit_price", 0) or 0) for b in earning_bookings)

    # Per day breakdown for current month (confirmed + completed)
    by_day: dict = {}
    for b in earning_bookings:
        d = b.get("slot_date", "")
        by_day.setdefault(d, {"count": 0, "revenue": 0})
        by_day[d]["count"] += 1
        by_day[d]["revenue"] += int(b.get("unit_price", 0) or 0)
    daily = [{"date": d, **v} for d, v in sorted(by_day.items())]

    # Last 6 months history (including this month)
    year = int(month[:4])
    mo = int(month[5:])
    history = []
    for i in range(5, -1, -1):
        y = year
        m = mo - i
        while m <= 0:
            m += 12
            y -= 1
        key = f"{y:04d}-{m:02d}"
        docs = await db.bookings.find(
            {"slot_date": {"$regex": f"^{key}-"}, "status": {"$in": ["confirmed", "completed"]}}, {"_id": 0}
        ).to_list(2000)
        history.append({
            "month": key,
            "count": len(docs),
            "revenue": sum(int(d.get("unit_price", 0) or 0) for d in docs),
        })

    return {
        "month": month,
        "confirmed_count": len(confirmed),
        "completed_count": len(completed),
        "pending_count": len(pending),
        "rejected_count": len(rejected),
        "total_bookings": len(month_bookings),
        "revenue": revenue,
        "daily": daily,
        "history": history,
    }


@api_router.get("/admin/report")
async def admin_report(period: str, date: Optional[str] = None, x_admin_password: Optional[str] = Header(default=None)):
    """period: day | week | month. Returns completed bookings for the range + summary."""
    _check_admin(x_admin_password)
    if period not in ("day", "week", "month"):
        raise HTTPException(status_code=400, detail="period mora biti day, week ili month")

    try:
        ref = datetime.strptime(date, "%Y-%m-%d") if date else datetime.now()
    except ValueError:
        raise HTTPException(status_code=400, detail="date mora biti YYYY-MM-DD")

    from datetime import timedelta

    if period == "day":
        start = ref.date()
        end = start
    elif period == "week":
        # Monday as start of week
        start = (ref - timedelta(days=ref.weekday())).date()
        end = start + timedelta(days=6)
    else:  # month
        start = ref.replace(day=1).date()
        # last day of the month
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
        else:
            end = start.replace(month=start.month + 1) - timedelta(days=1)

    start_s = start.isoformat()
    end_s = end.isoformat()

    docs = await db.bookings.find(
        {
            "slot_date": {"$gte": start_s, "$lte": end_s},
            "status": "completed",
        },
        {"_id": 0},
    ).sort([("slot_date", 1), ("slot_time", 1)]).to_list(2000)

    return {
        "period": period,
        "start": start_s,
        "end": end_s,
        "count": len(docs),
        "revenue": sum(int(b.get("unit_price", 0) or 0) for b in docs),
        "bookings": [Booking(**b).dict() for b in docs],
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
