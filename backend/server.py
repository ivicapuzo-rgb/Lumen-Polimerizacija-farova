from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

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


class SettingsUpdate(BaseModel):
    price: Optional[int] = None
    currency: Optional[str] = None


async def get_settings_doc() -> Settings:
    doc = await db.settings.find_one({"_id": "singleton"})
    if not doc:
        s = Settings()
        await db.settings.insert_one({"_id": "singleton", **s.dict()})
        return s
    return Settings(price=doc.get("price", 2500), currency=doc.get("currency", "RSD"))


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
    docs = await db.slots.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return [Slot(**d) for d in docs]


@api_router.get("/settings", response_model=Settings)
async def get_settings():
    return await get_settings_doc()


@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate):
    slot = await db.slots.find_one({"id": payload.slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Termin nije pronađen")
    if slot.get("is_booked"):
        raise HTTPException(status_code=400, detail="Termin je već zauzet")

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
    if payload.status not in ("pending", "confirmed", "rejected"):
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
    if updates:
        await db.settings.update_one({"_id": "singleton"}, {"$set": updates}, upsert=True)
    return await get_settings_doc()


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
