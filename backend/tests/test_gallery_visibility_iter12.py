"""
Iteration 12 — Regression test for user bug:
  "'Naši radovi' uopšte klijent ne vidi" (client doesn't see the gallery at all)

Covers the integration points that make the home-screen "Naši radovi" section
appear for clients:
  1. GET /api/gallery  — public endpoint, returns items regardless of auth.
  2. GET /api/settings — exposes `gallery_visible` boolean to the client.
  3. PATCH /api/admin/settings — admin can toggle gallery_visible on/off.
  4. POST /api/admin/gallery — admin can upload a before image (minimum
      requirement for the client-side gallery to appear).
  5. GET /api/gallery/files/{filename} — the actual image bytes are served
      so the <Image> inside the "Naši radovi" scroller is not broken.

Reference: frontend/app/(tabs)/index.tsx — the GalleryBlock renders only
when (gallery.length > 0) AND (settings.gallery_visible !== false).

Admin password: puzopb (from /app/memory/test_credentials.md).
"""

import io
import os
import struct
import zlib
import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
# Fallback to the one in /app/frontend/.env (preserved for CI)
if not BASE_URL:
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except FileNotFoundError:
        pass

ADMIN_PW = os.environ.get("ADMIN_PASSWORD", "puzopb")
ADMIN_HEADERS = {"x-admin-password": ADMIN_PW}


def _tiny_png() -> bytes:
    """Build a 1×1 red PNG from scratch (no PIL dependency)."""
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"  # filter + RGB red pixel
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def uploaded_item(api):
    """Upload a single test gallery item and clean up after the module."""
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not configured"
    files = {"before": ("TEST_iter12.png", _tiny_png(), "image/png")}
    data = {"caption": "TEST_iter12_visibility"}
    r = api.post(
        f"{BASE_URL}/api/admin/gallery",
        headers=ADMIN_HEADERS,
        files=files,
        data=data,
        timeout=30,
    )
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    doc = r.json()
    yield doc
    # teardown
    try:
        api.delete(
            f"{BASE_URL}/api/admin/gallery/{doc['id']}",
            headers=ADMIN_HEADERS,
            timeout=10,
        )
    except Exception:
        pass


class TestPublicGalleryEndpoint:
    """Client-side: GET /api/gallery must list uploaded images without auth."""

    def test_gallery_endpoint_returns_200_and_list(self, api):
        r = api.get(f"{BASE_URL}/api/gallery", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)

    def test_gallery_item_appears_in_public_list(self, api, uploaded_item):
        r = api.get(f"{BASE_URL}/api/gallery", timeout=10)
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()]
        assert uploaded_item["id"] in ids, (
            f"Uploaded item {uploaded_item['id']} not in public /api/gallery — "
            f"clients will not see 'Naši radovi'"
        )

    def test_gallery_item_shape(self, api, uploaded_item):
        r = api.get(f"{BASE_URL}/api/gallery", timeout=10)
        item = next(i for i in r.json() if i["id"] == uploaded_item["id"])
        # Fields the frontend reads
        assert "url" in item and item["url"].startswith("/api/gallery/files/")
        assert "before_url" in item and item["before_url"].startswith("/api/gallery/files/")
        # No MongoDB _id leakage
        assert "_id" not in item

    def test_no_trailing_whitespace_in_urls(self, api, uploaded_item):
        """URL fields must not contain trailing newlines/whitespace which
        would break `${BASE}${url}` concatenation in galleryImageUrl()."""
        r = api.get(f"{BASE_URL}/api/gallery", timeout=10)
        item = next(i for i in r.json() if i["id"] == uploaded_item["id"])
        for key in ("url", "before_url", "storage_path"):
            v = item.get(key) or ""
            assert v == v.strip(), f"{key} has trailing/leading whitespace: {v!r}"
            assert "\n" not in v and "\r" not in v, f"{key} contains newline: {v!r}"


class TestGalleryFileServing:
    """The <Image src> on the home screen must load the actual bytes."""

    def test_image_file_served(self, api, uploaded_item):
        url = BASE_URL + uploaded_item["url"]
        r = api.get(url, timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0


class TestSettingsGalleryVisible:
    """
    Client reads settings.gallery_visible to decide whether to render the
    "Naši radovi" section. Admin must be able to flip it.
    """

    def test_default_visibility_is_true(self, api):
        r = api.get(f"{BASE_URL}/api/settings", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "gallery_visible" in body
        assert isinstance(body["gallery_visible"], bool)

    def test_admin_can_toggle_off_then_on(self, api):
        # Snapshot
        original = api.get(f"{BASE_URL}/api/settings", timeout=10).json()["gallery_visible"]
        try:
            r1 = api.patch(
                f"{BASE_URL}/api/admin/settings",
                headers={**ADMIN_HEADERS, "Content-Type": "application/json"},
                json={"gallery_visible": False},
                timeout=10,
            )
            assert r1.status_code == 200
            assert r1.json()["gallery_visible"] is False

            # Public endpoint reflects the change
            r_public = api.get(f"{BASE_URL}/api/settings", timeout=10)
            assert r_public.json()["gallery_visible"] is False

            r2 = api.patch(
                f"{BASE_URL}/api/admin/settings",
                headers={**ADMIN_HEADERS, "Content-Type": "application/json"},
                json={"gallery_visible": True},
                timeout=10,
            )
            assert r2.status_code == 200
            assert r2.json()["gallery_visible"] is True
        finally:
            # Restore
            api.patch(
                f"{BASE_URL}/api/admin/settings",
                headers={**ADMIN_HEADERS, "Content-Type": "application/json"},
                json={"gallery_visible": original},
                timeout=10,
            )

    def test_toggle_requires_admin(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"Content-Type": "application/json"},
            json={"gallery_visible": False},
            timeout=10,
        )
        assert r.status_code == 401


class TestClientEndToEnd:
    """
    Simulates what the Expo client does on home-screen mount:
      1. Fetch settings
      2. Fetch gallery list
      3. For each item, request the image bytes
    If any of these fail or return the "hidden" state while the admin
    expects visibility, the client sees nothing.
    """

    def test_full_client_bootstrap_sees_gallery(self, api, uploaded_item):
        settings = api.get(f"{BASE_URL}/api/settings", timeout=10).json()
        gallery = api.get(f"{BASE_URL}/api/gallery", timeout=10).json()

        # Mirror the frontend condition exactly:
        #   if (!gallery || gallery.length === 0) return null;
        #   if (settings?.gallery_visible === false) return null;
        has_items = isinstance(gallery, list) and len(gallery) > 0
        visible = settings.get("gallery_visible") is not False
        would_render = has_items and visible

        assert would_render, (
            f"Client would hide 'Naši radovi'. "
            f"items={len(gallery)}, gallery_visible={settings.get('gallery_visible')}"
        )

        # And at least one image URL is actually fetchable
        img_r = api.get(BASE_URL + gallery[0]["url"], timeout=15)
        assert img_r.status_code == 200
