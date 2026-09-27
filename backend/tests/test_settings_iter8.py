"""Backend tests for iter8 Settings additions: share_url + gallery_visible.

Covers:
- GET /api/settings returns new fields with correct defaults / persisted values
- PATCH /api/admin/settings persists share_url (any string accepted at backend)
- PATCH /api/admin/settings persists gallery_visible as bool
- PATCH with only price does NOT clobber share_url or gallery_visible
- Auth guard on PATCH /api/admin/settings
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_PASSWORD = "puzopb"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def initial_settings(api):
    r = api.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def _restore_settings(api, initial_settings):
    """Restore original settings after tests run."""
    yield
    api.patch(
        f"{BASE_URL}/api/admin/settings",
        headers={"x-admin-password": ADMIN_PASSWORD},
        json={
            "price": int(initial_settings.get("price", 2500)),
            "share_url": initial_settings.get("share_url", ""),
            "gallery_visible": bool(initial_settings.get("gallery_visible", True)),
        },
    )


# === GET /api/settings shape ===
class TestSettingsShape:
    def test_get_settings_has_new_fields(self, api):
        r = api.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        data = r.json()
        assert "share_url" in data, "share_url missing from GET /api/settings"
        assert "gallery_visible" in data, "gallery_visible missing from GET /api/settings"
        assert isinstance(data["share_url"], str)
        assert isinstance(data["gallery_visible"], bool)


# === PATCH share_url ===
class TestShareUrl:
    def test_patch_share_url_persists(self, api):
        url = "https://example.com/lumen-app-test"
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": url},
        )
        assert r.status_code == 200, r.text
        assert r.json()["share_url"] == url

        # Verify via GET
        g = api.get(f"{BASE_URL}/api/settings").json()
        assert g["share_url"] == url

    def test_patch_share_url_accepts_any_string(self, api):
        # Backend does not validate URL format; only frontend does.
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": "not-a-valid-url"},
        )
        assert r.status_code == 200
        assert r.json()["share_url"] == "not-a-valid-url"

    def test_patch_share_url_empty_clears(self, api):
        # First set, then clear
        api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": "https://foo.bar"},
        )
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": ""},
        )
        assert r.status_code == 200
        assert r.json()["share_url"] == ""

    def test_patch_share_url_strips_whitespace(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": "  https://spaced.example  "},
        )
        assert r.status_code == 200
        assert r.json()["share_url"] == "https://spaced.example"


# === PATCH gallery_visible ===
class TestGalleryVisibility:
    def test_patch_gallery_visible_false(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"gallery_visible": False},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["gallery_visible"] is False
        assert isinstance(data["gallery_visible"], bool)

        # Verify via GET
        g = api.get(f"{BASE_URL}/api/settings").json()
        assert g["gallery_visible"] is False

    def test_patch_gallery_visible_true(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"gallery_visible": True},
        )
        assert r.status_code == 200
        assert r.json()["gallery_visible"] is True


# === Non-clobber behavior ===
class TestNonClobber:
    def test_patch_price_does_not_clobber_share_url_and_gallery(self, api):
        # Set both new fields to non-defaults
        api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"share_url": "https://persist-me.example", "gallery_visible": False},
        )
        # Patch only price
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": ADMIN_PASSWORD},
            json={"price": 3333},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["price"] == 3333
        assert data["share_url"] == "https://persist-me.example", "share_url was clobbered by price patch"
        assert data["gallery_visible"] is False, "gallery_visible was clobbered by price patch"


# === Auth guard ===
class TestAuth:
    def test_patch_settings_without_password_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"share_url": "https://x.com"},
        )
        assert r.status_code == 401

    def test_patch_settings_wrong_password_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/settings",
            headers={"x-admin-password": "wrong"},
            json={"gallery_visible": False},
        )
        assert r.status_code == 401
