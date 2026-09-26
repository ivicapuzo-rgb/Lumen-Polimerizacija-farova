"""Gallery endpoint tests (Emergent Object Storage integration)."""
import os
import io
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://headlamp-slots.preview.emergentagent.com").rstrip("/")
ADMIN_PW = "puzopb"


def _tiny_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), (255, 200, 0)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def uploaded_image():
    files = {"file": ("test.png", _tiny_png(), "image/png")}
    data = {"caption": "TEST_gallery_item"}
    r = requests.post(
        f"{BASE_URL}/api/admin/gallery",
        files=files,
        data=data,
        headers={"x-admin-password": ADMIN_PW},
        timeout=60,
    )
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    img = r.json()
    assert "id" in img and "url" in img and "storage_path" in img
    assert img["caption"] == "TEST_gallery_item"
    yield img
    # cleanup
    requests.delete(
        f"{BASE_URL}/api/admin/gallery/{img['id']}",
        headers={"x-admin-password": ADMIN_PW},
        timeout=30,
    )


class TestGallery:
    def test_list_gallery_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/gallery", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_upload_requires_password(self):
        files = {"file": ("test.png", _tiny_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/gallery", files=files, data={"caption": ""}, timeout=30)
        assert r.status_code == 401

    def test_upload_wrong_password(self):
        files = {"file": ("test.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers={"x-admin-password": "wrong"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_upload_empty_file_returns_400(self):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": ""},
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert r.status_code == 400

    def test_upload_success_and_persisted(self, uploaded_image):
        r = requests.get(f"{BASE_URL}/api/gallery", timeout=30)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert uploaded_image["id"] in ids

    def test_get_file_returns_image_bytes(self, uploaded_image):
        url = f"{BASE_URL}{uploaded_image['url']}"
        r = requests.get(url, timeout=60)
        assert r.status_code == 200, f"file fetch failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_delete_gallery(self):
        # upload
        files = {"file": ("del.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery",
            files=files,
            data={"caption": "TEST_delete"},
            headers={"x-admin-password": ADMIN_PW},
            timeout=60,
        )
        assert r.status_code == 200
        img = r.json()
        # count
        before = len(requests.get(f"{BASE_URL}/api/gallery", timeout=30).json())
        # delete
        d = requests.delete(
            f"{BASE_URL}/api/admin/gallery/{img['id']}",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert d.status_code == 200
        assert d.json().get("ok") is True
        after = len(requests.get(f"{BASE_URL}/api/gallery", timeout=30).json())
        assert after == before - 1

    def test_delete_wrong_password(self, uploaded_image):
        r = requests.delete(
            f"{BASE_URL}/api/admin/gallery/{uploaded_image['id']}",
            headers={"x-admin-password": "wrong"},
            timeout=30,
        )
        assert r.status_code == 401


class TestRegression:
    def test_settings(self):
        r = requests.get(f"{BASE_URL}/api/settings", timeout=30)
        assert r.status_code == 200
        assert "price" in r.json() and "currency" in r.json()

    def test_slots(self):
        r = requests.get(f"{BASE_URL}/api/slots", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_heartbeat(self):
        r = requests.post(
            f"{BASE_URL}/api/heartbeat",
            json={"session_id": "TEST_sess_gallery", "role": "customer"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_admin_online(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/online",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert r.status_code == 200
        assert "online_total" in r.json()

    def test_admin_stats(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/stats?month=2026-01",
            headers={"x-admin-password": ADMIN_PW},
            timeout=30,
        )
        assert r.status_code == 200
        assert "revenue" in r.json()
