"""Iteration 6 gallery tests: before/after pair, reorder, delete, dual file resolution."""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://headlamp-slots.preview.emergentagent.com").rstrip("/")
ADMIN_PW = "puzopb"


def _tiny_png(color=(255, 200, 0)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (12, 12), color).save(buf, format="PNG")
    return buf.getvalue()


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


class TestGalleryPair:
    """POST /api/admin/gallery with both before + after files."""

    def test_upload_pair_returns_both_urls(self, cleanup_ids):
        files = {
            "before": ("before.png", _tiny_png((200, 30, 30)), "image/png"),
            "after": ("after.png", _tiny_png((30, 200, 30)), "image/png"),
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_pair"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids.append(doc["id"])
        assert doc["before_url"], "before_url must be populated"
        assert doc["after_url"], "after_url must be populated"
        assert doc["before_url"] != doc["after_url"]
        assert doc["caption"] == "TEST_pair"

    def test_upload_before_only_after_is_null(self, cleanup_ids):
        files = {"before": ("before.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_before_only"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids.append(doc["id"])
        assert doc["before_url"]
        assert doc["after_url"] is None

    def test_upload_legacy_file_field_falls_back_to_before(self, cleanup_ids):
        """Legacy 'file' field should still work (falls back to before)."""
        files = {"file": ("legacy.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_legacy"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids.append(doc["id"])
        assert doc["before_url"], "legacy 'file' should populate before_url"
        assert doc["after_url"] is None
        assert doc["url"] == doc["before_url"]

    def test_pair_both_filenames_resolve_via_files_endpoint(self, cleanup_ids):
        files = {
            "before": ("b.png", _tiny_png((10, 10, 200)), "image/png"),
            "after": ("a.png", _tiny_png((200, 200, 10)), "image/png"),
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_resolve"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200
        doc = r.json()
        cleanup_ids.append(doc["id"])
        for key in ("before_url", "after_url"):
            url = f"{BASE_URL}{doc[key]}"
            resp = requests.get(url, timeout=60)
            assert resp.status_code == 200, f"{key} fetch failed: {resp.status_code}"
            assert resp.headers.get("content-type", "").startswith("image/")
            assert len(resp.content) > 0


class TestReorder:
    def test_reorder_changes_gallery_order(self, cleanup_ids):
        # Create 3 items
        created = []
        for i in range(3):
            files = {"before": (f"r{i}.png", _tiny_png((i * 60, 100, 50)), "image/png")}
            r = requests.post(
                f"{BASE_URL}/api/admin/gallery",
                files=files,
                data={"caption": f"TEST_reorder_{i}"},
                headers={"x-admin-password": ADMIN_PW},
                timeout=60,
            )
            assert r.status_code == 200
            doc = r.json()
            created.append(doc["id"])
            cleanup_ids.append(doc["id"])

        # Reorder: reverse
        desired = list(reversed(created))
        r = requests.patch(
            f"{BASE_URL}/api/admin/gallery/reorder",
            json={"ids": desired},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify GET /api/gallery returns items in requested order (limited to our set)
        gallery = requests.get(f"{BASE_URL}/api/gallery", timeout=30).json()
        ids_in_order = [g["id"] for g in gallery if g["id"] in created]
        assert ids_in_order == desired, f"Expected {desired}, got {ids_in_order}"

    def test_reorder_wrong_password_returns_401(self):
        r = requests.patch(
            f"{BASE_URL}/api/admin/gallery/reorder",
            json={"ids": []},
            headers={"x-admin-password": "wrong", "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 401


class TestDelete:
    def test_delete_decreases_count(self, cleanup_ids):
        files = {"before": ("del.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_del"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200
        doc = r.json()
        before = len(requests.get(f"{BASE_URL}/api/gallery", timeout=30).json())
        d = requests.delete(
            f"{BASE_URL}/api/admin/gallery/{doc['id']}",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert d.status_code == 200
        after = len(requests.get(f"{BASE_URL}/api/gallery", timeout=30).json())
        assert after == before - 1


class TestRegression:
    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PW}, timeout=30)
        assert r.status_code == 200 and r.json().get("ok") is True

    def test_admin_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/admin/login", json={"password": "nope"}, timeout=30)
        assert r.status_code == 401

    def test_settings_price_editing(self):
        # get, patch, get
        r = requests.get(f"{BASE_URL}/api/settings", timeout=30)
        assert r.status_code == 200
        original = r.json()["price"]
        new_price = original + 100
        p = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"price": new_price},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert p.status_code == 200
        assert p.json()["price"] == new_price
        # revert
        requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"price": original},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )

    def test_slots_available(self):
        r = requests.get(f"{BASE_URL}/api/slots", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_blocked_days_add_remove(self):
        date = "2099-12-31"
        # cleanup first
        requests.delete(
            f"{BASE_URL}/api/admin/blocked-days/{date}",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        r = requests.post(
            f"{BASE_URL}/api/admin/blocked-days",
            json={"date": date},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 200 and r.json()["date"] == date
        d = requests.delete(
            f"{BASE_URL}/api/admin/blocked-days/{date}",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert d.status_code == 200

    def test_booking_flow_and_status(self):
        # Grab an available slot
        slots = requests.get(f"{BASE_URL}/api/slots", timeout=30).json()
        if not slots:
            pytest.skip("No available slots to book")
        slot = slots[0]
        payload = {
            "slot_id": slot["id"],
            "customer_name": "TEST_customer",
            "phone": "+381600000TEST",
            "car_brand": "TEST_brand",
            "car_model": "TEST_model",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
        assert r.status_code == 200
        booking = r.json()
        assert booking["status"] == "pending"
        bid = booking["id"]
        # confirm
        c = requests.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}",
            json={"status": "confirmed"},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert c.status_code == 200 and c.json()["status"] == "confirmed"
        # complete
        c2 = requests.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}",
            json={"status": "completed"},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert c2.status_code == 200 and c2.json()["status"] == "completed"
        # reject (frees slot)
        c3 = requests.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}",
            json={"status": "rejected"},
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            timeout=30,
        )
        assert c3.status_code == 200

    def test_heartbeat_and_online(self):
        r = requests.post(
            f"{BASE_URL}/api/heartbeat",
            json={"session_id": "TEST_iter6_sess", "role": "customer"},
            timeout=30,
        )
        assert r.status_code == 200
        o = requests.get(
            f"{BASE_URL}/api/admin/online",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert o.status_code == 200 and "online_total" in o.json()

    def test_pdf_report_endpoint(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/report?period=month",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert r.status_code == 200
        j = r.json()
        assert "count" in j and "revenue" in j and "bookings" in j
