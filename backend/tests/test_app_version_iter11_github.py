"""Backend tests for GitHub Releases auto-check feature (iteration 11).

Covers the new fields on AppVersion:
- github_releases_url  (validated: must start with https://github.com/)
- electron_update_url  (validated: must start with http(s)://)

Verifies: GET surface, PATCH persistence (partial + full), validation, auth,
backward compatibility with existing apk_url/version/version_code/mandatory/notes.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://headlamp-slots.preview.emergentagent.com").rstrip("/")
ADMIN_PW = "puzopb"


def _hdr():
    return {"x-admin-password": ADMIN_PW, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def original_version(api):
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
            headers=_hdr(),
            json={
                "version": original_version["version"],
                "version_code": original_version["version_code"],
                "apk_url": original_version.get("apk_url", ""),
                "electron_update_url": original_version.get("electron_update_url", ""),
                "github_releases_url": original_version.get("github_releases_url", ""),
                "notes": original_version.get("notes", ""),
                "mandatory": original_version.get("mandatory", False),
            },
        )


# ---------- GET surface ----------
class TestGetAppVersionSurface:
    def test_get_returns_200(self, api):
        r = api.get(f"{BASE_URL}/api/app-version")
        assert r.status_code == 200

    def test_response_contains_new_fields(self, api):
        d = api.get(f"{BASE_URL}/api/app-version").json()
        assert "github_releases_url" in d, "missing github_releases_url"
        assert "electron_update_url" in d, "missing electron_update_url"

    def test_new_fields_are_strings(self, api):
        d = api.get(f"{BASE_URL}/api/app-version").json()
        assert isinstance(d["github_releases_url"], str)
        assert isinstance(d["electron_update_url"], str)

    def test_all_legacy_fields_still_present(self, api):
        d = api.get(f"{BASE_URL}/api/app-version").json()
        for k in ("version", "version_code", "apk_url", "notes", "mandatory", "updated_at"):
            assert k in d


# ---------- Auth ----------
class TestAuth:
    def test_missing_password_is_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            json={"github_releases_url": "https://github.com/foo/bar"},
        )
        assert r.status_code == 401

    def test_wrong_password_is_401(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers={"x-admin-password": "nope", "Content-Type": "application/json"},
            json={"github_releases_url": "https://github.com/foo/bar"},
        )
        assert r.status_code == 401


# ---------- GitHub URL validation ----------
class TestGithubUrlValidation:
    def test_valid_github_repo_url_accepted(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://github.com/octocat/Hello-World"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["github_releases_url"] == "https://github.com/octocat/Hello-World"

    def test_valid_github_releases_path_accepted(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://github.com/octocat/Hello-World/releases/latest"},
        )
        assert r.status_code == 200, r.text
        assert "github.com" in r.json()["github_releases_url"]

    def test_empty_github_url_allowed(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": ""},
        )
        assert r.status_code == 200
        assert r.json()["github_releases_url"] == ""

    def test_whitespace_only_url_treated_as_empty(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "    "},
        )
        assert r.status_code == 200
        assert r.json()["github_releases_url"] == ""

    def test_non_github_url_rejected(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://gitlab.com/foo/bar"},
        )
        assert r.status_code == 400
        assert "github" in r.json().get("detail", "").lower()

    def test_http_github_rejected(self, api):
        # Must be https (spec: 'mora počinjati sa https://github.com/')
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "http://github.com/foo/bar"},
        )
        assert r.status_code == 400

    def test_random_string_rejected(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "not-a-url"},
        )
        assert r.status_code == 400

    def test_case_insensitive_prefix_accepted(self, api):
        # Server lowercases for check but preserves the value as submitted (minus strip).
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "HTTPS://GitHub.com/Owner/Repo"},
        )
        assert r.status_code == 200
        assert r.json()["github_releases_url"] == "HTTPS://GitHub.com/Owner/Repo"


# ---------- Electron update URL validation ----------
class TestElectronUrlValidation:
    def test_valid_https_accepted(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": "https://update.example.com/win32/x64/latest.yml"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["electron_update_url"] == "https://update.example.com/win32/x64/latest.yml"

    def test_valid_http_accepted(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": "http://localhost:9000/latest.yml"},
        )
        assert r.status_code == 200
        assert r.json()["electron_update_url"] == "http://localhost:9000/latest.yml"

    def test_empty_allowed(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": ""},
        )
        assert r.status_code == 200
        assert r.json()["electron_update_url"] == ""

    def test_invalid_url_rejected(self, api):
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": "not-a-url"},
        )
        assert r.status_code == 400
        assert "http" in r.json().get("detail", "").lower()


# ---------- Persistence + GET round-trip ----------
class TestPersistence:
    def test_github_url_persists_across_get(self, api):
        url = "https://github.com/ivicapuzo-rgb/Lumen-Polimerizacija-farova/releases"
        p = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": url},
        )
        assert p.status_code == 200
        assert p.json()["github_releases_url"] == url
        # GET round-trip
        g = api.get(f"{BASE_URL}/api/app-version").json()
        assert g["github_releases_url"] == url

    def test_electron_url_persists_across_get(self, api):
        url = "https://releases.example.com/latest-mac.yml"
        p = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": url},
        )
        assert p.status_code == 200
        g = api.get(f"{BASE_URL}/api/app-version").json()
        assert g["electron_update_url"] == url

    def test_partial_patch_github_only_preserves_others(self, api):
        # Seed known state including legacy fields.
        seed = {
            "version": "4.5.6",
            "version_code": 456,
            "apk_url": "https://example.com/legacy.apk",
            "electron_update_url": "https://example.com/elec.yml",
            "github_releases_url": "https://github.com/old/old",
            "notes": "seed note",
            "mandatory": False,
        }
        api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json=seed)

        # Patch only github_releases_url
        new_gh = "https://github.com/new/newer/releases/latest"
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": new_gh},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["github_releases_url"] == new_gh
        # Everything else preserved
        assert d["version"] == "4.5.6"
        assert d["version_code"] == 456
        assert d["apk_url"] == "https://example.com/legacy.apk"
        assert d["electron_update_url"] == "https://example.com/elec.yml"
        assert d["notes"] == "seed note"
        assert d["mandatory"] is False

    def test_partial_patch_electron_only_preserves_others(self, api):
        api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={
                "version": "1.2.3",
                "version_code": 123,
                "apk_url": "https://example.com/a.apk",
                "electron_update_url": "https://example.com/x.yml",
                "github_releases_url": "https://github.com/a/b",
                "notes": "n",
                "mandatory": True,
            },
        )
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"electron_update_url": "https://example.com/y.yml"},
        )
        d = r.json()
        assert d["electron_update_url"] == "https://example.com/y.yml"
        assert d["github_releases_url"] == "https://github.com/a/b"
        assert d["apk_url"] == "https://example.com/a.apk"
        assert d["version"] == "1.2.3"
        assert d["version_code"] == 123
        assert d["mandatory"] is True
        assert d["notes"] == "n"

    def test_full_update_with_all_fields(self, api):
        payload = {
            "version": "9.8.7",
            "version_code": 987,
            "apk_url": "https://releases.example.com/app.apk",
            "electron_update_url": "https://releases.example.com/latest.yml",
            "github_releases_url": "https://github.com/foo/bar/releases",
            "notes": "iter11 full update",
            "mandatory": True,
        }
        r = api.patch(f"{BASE_URL}/api/admin/app-version", headers=_hdr(), json=payload)
        assert r.status_code == 200
        d = r.json()
        for k, v in payload.items():
            assert d[k] == v, f"{k} not persisted: got {d[k]!r} want {v!r}"
        # GET round-trip
        g = api.get(f"{BASE_URL}/api/app-version").json()
        for k, v in payload.items():
            assert g[k] == v

    def test_clearing_github_url(self, api):
        api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://github.com/to/clear"},
        )
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": ""},
        )
        assert r.status_code == 200
        assert r.json()["github_releases_url"] == ""
        g = api.get(f"{BASE_URL}/api/app-version").json()
        assert g["github_releases_url"] == ""

    def test_updated_at_bumps_on_github_patch(self, api):
        r1 = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://github.com/a/b"},
        )
        u1 = r1.json()["updated_at"]
        time.sleep(1.1)
        r2 = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"github_releases_url": "https://github.com/c/d"},
        )
        u2 = r2.json()["updated_at"]
        assert u1 != u2 and u2 > u1


# ---------- Validation does not partially persist ----------
class TestValidationAtomicity:
    def test_bad_github_url_does_not_touch_other_fields(self, api):
        api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={
                "version": "7.7.7",
                "version_code": 777,
                "github_releases_url": "https://github.com/good/repo",
            },
        )
        # Attempt bad patch
        r = api.patch(
            f"{BASE_URL}/api/admin/app-version",
            headers=_hdr(),
            json={"version": "8.8.8", "github_releases_url": "ftp://bad"},
        )
        assert r.status_code == 400
        # Confirm nothing changed
        g = api.get(f"{BASE_URL}/api/app-version").json()
        assert g["version"] == "7.7.7"
        assert g["github_releases_url"] == "https://github.com/good/repo"
