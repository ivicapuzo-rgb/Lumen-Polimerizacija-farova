"""Iteration 7: watermark, content-type normalization, pair upload watermarking."""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://headlamp-slots.preview.emergentagent.com").rstrip("/")
ADMIN_PW = "puzopb"


def _solid_image(fmt: str = "PNG", size=(400, 300), color=(20, 20, 20)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def _has_amber_in_bottom_right(png_bytes: bytes) -> bool:
    """Check bottom-right quadrant has amber-ish pixels (~#FF9800)."""
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    px = img.load()
    # Sample bottom-right region (last 40% width x 25% height)
    x0, y0 = int(w * 0.6), int(h * 0.75)
    hits = 0
    for y in range(y0, h):
        for x in range(x0, w):
            r, g, b = px[x, y]
            # Amber #FF9800 ~ (255, 152, 0); allow tolerance
            if r > 200 and 100 < g < 200 and b < 80:
                hits += 1
                if hits > 5:
                    return True
    return False


@pytest.fixture
def cleanup_ids():
    ids = []
    yield ids
    for gid in ids:
        try:
            requests.delete(
                f"{BASE_URL}/api/admin/gallery/{gid}",
                headers={"x-admin-password": ADMIN_PW},
                timeout=30,
            )
        except Exception:
            pass


class TestWatermark:
    def test_watermark_added_bottom_right(self, cleanup_ids):
        files = {"before": ("plain.png", _solid_image("PNG"), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_wm"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids.append(doc["id"])
        url = f"{BASE_URL}{doc['before_url']}"
        fetched = requests.get(url, timeout=60)
        assert fetched.status_code == 200
        assert fetched.headers.get("content-type", "").startswith("image/")
        assert _has_amber_in_bottom_right(fetched.content), \
            "Expected amber (#FF9800) pixels in bottom-right corner region"

    def test_watermark_on_both_pair_files(self, cleanup_ids):
        files = {
            "before": ("b.png", _solid_image("PNG", color=(15, 15, 15)), "image/png"),
            "after": ("a.png", _solid_image("PNG", color=(30, 30, 30)), "image/png"),
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_pair_wm"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids.append(doc["id"])
        for key in ("before_url", "after_url"):
            assert doc[key], f"{key} missing"
            resp = requests.get(f"{BASE_URL}{doc[key]}", timeout=60)
            assert resp.status_code == 200
            assert _has_amber_in_bottom_right(resp.content), \
                f"No amber pixels found in bottom-right of {key}"


class TestContentTypeNormalization:
    def test_jpeg_stays_jpeg(self, cleanup_ids):
        files = {"before": ("photo.jpg", _solid_image("JPEG"), "image/jpeg")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files, data={"caption": "TEST_jpg"},
            headers={"x-admin-password": ADMIN_PW}, timeout=90,
        )
        assert r.status_code == 200
        doc = r.json()
        cleanup_ids.append(doc["id"])
        assert doc["before_url"].endswith(".jpg"), f"URL ext should be .jpg, got {doc['before_url']}"
        resp = requests.get(f"{BASE_URL}{doc['before_url']}", timeout=60)
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").lower() == "image/jpeg"

    def test_png_stays_png(self, cleanup_ids):
        files = {"before": ("shot.png", _solid_image("PNG"), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files, data={"caption": "TEST_png"},
            headers={"x-admin-password": ADMIN_PW}, timeout=90,
        )
        assert r.status_code == 200
        doc = r.json()
        cleanup_ids.append(doc["id"])
        assert doc["before_url"].endswith(".png"), f"URL ext should be .png, got {doc['before_url']}"
        resp = requests.get(f"{BASE_URL}{doc['before_url']}", timeout=60)
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").lower() == "image/png"


class TestRegression:
    def test_reorder_wrong_password_401(self):
        r = requests.patch(
            f"{BASE_URL}/api/admin/gallery/reorder",
            json={"ids": []},
            headers={"x-admin-password": "wrong", "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_admin_login_ok_and_bad(self):
        ok = requests.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PW}, timeout=30)
        assert ok.status_code == 200
        bad = requests.post(f"{BASE_URL}/api/admin/login", json={"password": "nope"}, timeout=30)
        assert bad.status_code == 401

    def test_slots_seeded_25(self):
        r = requests.get(f"{BASE_URL}/api/slots?only_available=false", timeout=30)
        assert r.status_code == 200
        slots = r.json()
        assert len(slots) >= 20, f"Expected ~25 seeded slots, got {len(slots)}"

    def test_booking_full_status_flow(self):
        avail = requests.get(f"{BASE_URL}/api/slots", timeout=30).json()
        if not avail:
            pytest.skip("no available slots")
        slot = avail[0]
        payload = {
            "slot_id": slot["id"],
            "customer_name": "TEST_iter7",
            "phone": "+381600TEST7",
            "car_brand": "BMW",
            "car_model": "M3",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        assert r.json()["status"] == "pending"
        assert r.json()["car_brand"] == "BMW"
        for s in ("confirmed", "completed"):
            u = requests.patch(
                f"{BASE_URL}/api/admin/bookings/{bid}",
                json={"status": s},
                headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
                timeout=30,
            )
            assert u.status_code == 200 and u.json()["status"] == s
        # cleanup: reject to free the slot
        requests.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}",
            json={"status": "rejected"},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
