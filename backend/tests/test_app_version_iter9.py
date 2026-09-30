"""Backend tests for AppVersion feature (iteration 9)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://headlamp-slots.preview.emergentagent.com").rstrip("/")
ADMIN_PW = "puzopb"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def original_version(api):
    """Snapshot current app version to restore after tests."""
    r = api.get(f"{BASE_URL}/api/app-version")
    if r.status_code == 200:
        return r.json()
    return None


@pytest.fixture(scope="module", autouse=True)
def restore_after(api, original_version):
    yield
    if original_version:
        api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers={"x-admin-password": ADMIN_PW, "Content-Type": "application/json"},
            json={
                "version": original_version["version"],
                "version_code": original_version["version_code"],
                "apk_url": original_version["apk_url"],
                "notes": original_version["notes"],
                "mandatory": original_version["mandatory"],
            },
        )


# ---------- GET /api/app-version ----------
class TestGetAppVersion:
    def test_get_returns_200_and_fields(self, api):
        r = api.get(f"{BASE_URL}/api/app-version")
        assert r.status_code == 200
        data = r.json()
        for k in ("version", "version_code", "apk_url", "notes", "mandatory", "updated_at"):
            assert k in data, f"missing field {k}"
        assert isinstance(data["version"], str)
        assert isinstance(data["version_code"], int)
        assert isinstance(data["apk_url"], str)
        assert isinstance(data["notes"], str)
        assert isinstance(data["mandatory"], bool)
        assert isinstance(data["updated_at"], str)

    def test_defaults_present(self, api):
        # It's a singleton; should exist and defaults are 1.0.0/1 initially — but may have been mutated.
        r = api.get(f"{BASE_URL}/api/app-version")
        d = r.json()
        assert d["version"]  # non-empty
        assert d["version_code"] >= 1


# ---------- PATCH auth ----------
class TestPatchAuth:
    def test_missing_password_is_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            json={"version": "9.9.9"},
        )
        assert r.status_code == 401

    def test_wrong_password_is_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers={"x-admin-password": "wrong", "Content-Type": "application/json"},
            json={"version": "9.9.9"},
        )
        assert r.status_code == 401


def _hdr():
    return {"x-admin-password": ADMIN_PW, "Content-Type": "application/json"}


# ---------- PATCH validation ----------
class TestPatchValidation:
    def test_empty_version_400(self, api):
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"version": "   "})
        assert r.status_code == 400
        assert "Verzija" in r.json().get("detail", "")

    def test_version_code_zero_400(self, api):
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"version_code": 0})
        assert r.status_code == 400

    def test_version_code_negative_400(self, api):
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"version_code": -5})
        assert r.status_code == 400

    def test_invalid_apk_url_400(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"apk_url": "not-a-url"},
        )
        assert r.status_code == 400
        assert "http" in r.json().get("detail", "").lower()

    def test_empty_apk_url_allowed(self, api):
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"apk_url": ""})
        assert r.status_code == 200
        assert r.json()["apk_url"] == ""


# ---------- PATCH persistence ----------
class TestPatchPersistence:
    def test_full_update_persists(self, api):
        payload = {
            "version": "2.3.4",
            "version_code": 42,
            "apk_url": "https://github.com/test/repo/releases/latest/download/app.apk",
            "notes": "Test iteration 9 notes",
            "mandatory": True,
        }
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == "2.3.4"
        assert d["version_code"] == 42
        assert d["apk_url"] == payload["apk_url"]
        assert d["notes"] == "Test iteration 9 notes"
        assert d["mandatory"] is True
        assert d["updated_at"]

        # Verify persistence via GET
        r2 = api.get(f"{BASE_URL}/api/app-version")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["version"] == "2.3.4"
        assert d2["version_code"] == 42
        assert d2["apk_url"] == payload["apk_url"]
        assert d2["notes"] == "Test iteration 9 notes"
        assert d2["mandatory"] is True

    def test_partial_patch_only_updates_provided(self, api):
        # Seed known state
        api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={
                "version": "1.5.0",
                "version_code": 10,
                "apk_url": "https://example.com/a.apk",
                "notes": "seed",
                "mandatory": False,
            },
        )
        # Patch only mandatory
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"mandatory": True})
        assert r.status_code == 200
        d = r.json()
        assert d["mandatory"] is True
        assert d["version"] == "1.5.0"
        assert d["version_code"] == 10
        assert d["apk_url"] == "https://example.com/a.apk"
        assert d["notes"] == "seed"

        # Patch only version_code
        r2 = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"version_code": 11})
        d2 = r2.json()
        assert d2["version_code"] == 11
        assert d2["mandatory"] is True
        assert d2["version"] == "1.5.0"
        assert d2["apk_url"] == "https://example.com/a.apk"

    def test_updated_at_changes_on_update(self, api):
        r1 = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"notes": "first"})
        u1 = r1.json()["updated_at"]
        import time
        time.sleep(1.05)
        r2 = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json={"notes": "second"})
        u2 = r2.json()["updated_at"]
        assert u1 != u2
        assert u2 > u1

    def test_http_url_allowed(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"apk_url": "http://example.com/x.apk"},
        )
        assert r.status_code == 200
        assert r.json()["apk_url"] == "http://example.com/x.apk"
