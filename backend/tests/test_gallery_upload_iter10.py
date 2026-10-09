"""
Iteration 10 — Gallery upload fix verification.

Context: Frontend admin upload (adminUploadGallery) was failing on native
(Expo SDK 54+ WinterCG fetch no longer accepts {uri,name,type}). The fix
switches to expo-file-system File / blob and sends multipart with field
names `before` and (optionally) `after`.

These backend-only tests verify that POST /api/admin/gallery correctly
accepts the new field names, enforces auth/validation, persists the
record with the right URLs, and that uploaded bytes can be retrieved
through /api/gallery/files/{filename}. Legacy `file` field is still
accepted for backward compatibility.
"""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_PW = "puzopb"
TIMEOUT = 60


# --- helpers -------------------------------------------------------------
def _png(color=(255, 200, 0), size=(10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _jpg(color=(10, 100, 200), size=(12, 12)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def _hdr():
    return {"x-admin-password": ADMIN_PW}


# --- fixtures ------------------------------------------------------------
@pytest.fixture
def cleanup_ids():
    ids = []
    yield ids
    for gid in ids:
        try:
            requests.delete(
                f"{BASE_URL}/api/admin/gallery/{gid}",
                headers=_hdr(),
                timeout=TIMEOUT,
            )
        except Exception:
            pass


# --- Admin gallery upload (new `before`/`after` fields) ------------------
class TestAdminGalleryUpload:
    """Verify fix: upload via `before` field name (what adminUploadGallery sends)."""

    def test_upload_before_only_success(self, cleanup_ids):
        files = {"before": ("before.png", _png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_before_only"},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        img = r.json()
        cleanup_ids.append(img["id"])

        # Core fields
        assert img["caption"] == "TEST_before_only"
        assert img["before_url"] and img["before_url"].startswith("/api/gallery/files/")
        assert img["url"] == img["before_url"], "legacy url must mirror before_url"
        assert img["storage_path"], "storage_path must be set"
        # No `after` provided → nullable fields are null
        assert img.get("after_url") in (None, ""), f"after_url expected None, got {img.get('after_url')!r}"

    def test_upload_before_and_after_success(self, cleanup_ids):
        files = {
            "before": ("b.jpg", _jpg(), "image/jpeg"),
            "after": ("a.jpg", _jpg((0, 200, 0)), "image/jpeg"),
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_before_after"},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        img = r.json()
        cleanup_ids.append(img["id"])
        assert img["before_url"].startswith("/api/gallery/files/")
        assert img["after_url"].startswith("/api/gallery/files/")
        assert img["before_url"] != img["after_url"]
        assert img["caption"] == "TEST_before_after"

    def test_upload_empty_caption_allowed(self, cleanup_ids):
        files = {"before": ("x.png", _png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        img = r.json()
        cleanup_ids.append(img["id"])
        assert img["caption"] == ""

    def test_upload_legacy_file_field_still_works(self, cleanup_ids):
        """Backward compatibility: old `file` field should still be accepted."""
        files = {"file": ("legacy.png", _png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_legacy"},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        img = r.json()
        cleanup_ids.append(img["id"])
        assert img["url"].startswith("/api/gallery/files/")


class TestAdminGalleryValidation:
    def test_no_file_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            data={"caption": "nope"},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        assert "obavezna" in r.json().get("detail", "").lower()

    def test_empty_before_returns_400(self):
        files = {"before": ("empty.png", b"", "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

    def test_missing_admin_password_returns_401(self):
        files = {"before": ("x.png", _png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401

    def test_wrong_admin_password_returns_401(self):
        files = {"before": ("x.png", _png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers={"x-admin-password": "bad"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401

    def test_oversize_file_returns_400(self):
        # Craft >8MB payload (fast: random bytes, server rejects before PIL).
        big = b"\xff" * (9 * 1024 * 1024)
        files = {"before": ("big.jpg", big, "image/jpeg")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers=_hdr(),
            timeout=120,
        )
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")  # "maks 8MB"


class TestUploadPersistAndFetch:
    """End-to-end: upload → list contains it → file bytes retrievable."""

    def test_full_roundtrip(self, cleanup_ids):
        # Use larger images so watermark succeeds and bytes grow meaningfully.
        files = {
            "before": ("rt_before.png", _png((50, 50, 50), (200, 200)), "image/png"),
            "after": ("rt_after.png", _png((200, 200, 200), (200, 200)), "image/png"),
        }
        up = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_roundtrip"},
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert up.status_code == 200, f"{up.status_code} {up.text}"
        img = up.json()
        cleanup_ids.append(img["id"])

        # Appears in list
        lst = requests.get(f"{BASE_URL}/api/gallery", timeout=TIMEOUT)
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json()]
        assert img["id"] in ids

        # Before bytes retrievable + watermarked (image/*)
        b_resp = requests.get(f"{BASE_URL}{img['before_url']}", timeout=TIMEOUT)
        assert b_resp.status_code == 200
        assert b_resp.headers.get("content-type", "").startswith("image/")
        assert len(b_resp.content) > 100

        # After bytes retrievable
        a_resp = requests.get(f"{BASE_URL}{img['after_url']}", timeout=TIMEOUT)
        assert a_resp.status_code == 200
        assert a_resp.headers.get("content-type", "").startswith("image/")
        assert len(a_resp.content) > 100

    def test_reorder_and_delete(self, cleanup_ids):
        # Create 2 images
        created = []
        for i in range(2):
            r = requests.post(
                f"{BASE_URL}/api/admin/gallery",
                files={"before": (f"r{i}.png", _png((i * 50, 100, 150)), "image/png")},
                data={"caption": f"TEST_order_{i}"},
                headers=_hdr(),
                timeout=TIMEOUT,
            )
            assert r.status_code == 200
            created.append(r.json()["id"])
            cleanup_ids.append(r.json()["id"])

        # Reorder (swap)
        rr = requests.patch(
            f"{BASE_URL}/api/admin/gallery/reorder",
            json={"ids": [created[1], created[0]]},
            headers={**_hdr(), "Content-Type": "application/json"},
            timeout=TIMEOUT,
        )
        assert rr.status_code == 200
        assert rr.json().get("count") == 2

        # Delete one explicitly, then confirm it's gone from list
        d = requests.delete(
            f"{BASE_URL}/api/admin/gallery/{created[0]}",
            headers=_hdr(),
            timeout=TIMEOUT,
        )
        assert d.status_code == 200
        cleanup_ids.remove(created[0])
        ids_after = [x["id"] for x in requests.get(f"{BASE_URL}/api/gallery", timeout=TIMEOUT).json()]
        assert created[0] not in ids_after
        assert created[1] in ids_after


class TestRegressionCore:
    def test_gallery_list_public(self):
        r = requests.get(f"{BASE_URL}/api/gallery", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_settings_public(self):
        r = requests.get(f"{BASE_URL}/api/settings", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert "gallery_visible" in body
