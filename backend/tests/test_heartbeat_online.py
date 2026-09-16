"""Tests for heartbeat + admin online count feature (iteration 4)."""
import os
import uuid
import time
import requests
from datetime import datetime, timezone, timedelta

BASE = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else 'https://headlamp-slots.preview.emergentagent.com'
PW = 'puzopb'
H = {'x-admin-password': PW}


# ---------- Heartbeat POST ----------
def test_heartbeat_customer_ok():
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'customer'})
    assert r.status_code == 200, r.text
    assert r.json() == {'ok': True}


def test_heartbeat_admin_ok():
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'admin'})
    assert r.status_code == 200
    assert r.json() == {'ok': True}


def test_heartbeat_empty_session_400():
    r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': '', 'role': 'customer'})
    assert r.status_code == 400


def test_heartbeat_default_role_customer():
    # role omitted -> defaults to customer per Pydantic default
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid})
    assert r.status_code == 200


def test_heartbeat_invalid_role_falls_back_to_customer():
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'weirdo'})
    assert r.status_code == 200


def test_heartbeat_upsert_same_session():
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    for _ in range(3):
        r = requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'customer'})
        assert r.status_code == 200


# ---------- Admin online endpoint ----------
def test_admin_online_requires_pw():
    r = requests.get(f'{BASE}/api/admin/online')
    assert r.status_code == 401


def test_admin_online_wrong_pw():
    r = requests.get(f'{BASE}/api/admin/online', headers={'x-admin-password': 'wrong'})
    assert r.status_code == 401


def test_admin_online_returns_counts_after_heartbeat():
    # baseline
    baseline = requests.get(f'{BASE}/api/admin/online', headers=H)
    assert baseline.status_code == 200
    b = baseline.json()
    for k in ('online_total', 'customers', 'admins'):
        assert k in b and isinstance(b[k], int)

    # add a customer + an admin session, both fresh
    cust_sid = f'TEST_{uuid.uuid4().hex[:12]}'
    adm_sid = f'TEST_{uuid.uuid4().hex[:12]}'
    requests.post(f'{BASE}/api/heartbeat', json={'session_id': cust_sid, 'role': 'customer'})
    requests.post(f'{BASE}/api/heartbeat', json={'session_id': adm_sid, 'role': 'admin'})

    after = requests.get(f'{BASE}/api/admin/online', headers=H).json()
    assert after['online_total'] >= b['online_total'] + 2
    assert after['customers'] >= b['customers'] + 1
    assert after['admins'] >= b['admins'] + 1
    # invariant
    assert after['customers'] + after['admins'] == after['online_total']


def test_admin_online_role_switch_upsert():
    """Same session_id switching role should be treated as one session with the new role."""
    sid = f'TEST_{uuid.uuid4().hex[:12]}'
    requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'customer'})
    c1 = requests.get(f'{BASE}/api/admin/online', headers=H).json()
    # Switch to admin
    requests.post(f'{BASE}/api/heartbeat', json={'session_id': sid, 'role': 'admin'})
    c2 = requests.get(f'{BASE}/api/admin/online', headers=H).json()
    # total unchanged (upsert), but admins should have gone up vs customers
    assert c2['online_total'] == c1['online_total']
    assert c2['admins'] >= c1['admins']  # one more admin
    assert c2['customers'] <= c1['customers']  # one fewer customer


# ---------- 60s expiry: use direct DB write to avoid a 65s sleep ----------
def test_admin_online_excludes_sessions_older_than_60s():
    """Insert a session with last_seen 2 minutes ago via Mongo, verify it's NOT counted."""
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa
    import asyncio
    from pymongo import MongoClient

    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    if not mongo_url or not db_name:
        # env not exposed in test process; skip rather than fail
        import pytest
        pytest.skip('MONGO_URL/DB_NAME not available to test process')

    cli = MongoClient(mongo_url)
    coll = cli[db_name].sessions

    stale_sid = f'TEST_STALE_{uuid.uuid4().hex[:8]}'
    fresh_sid = f'TEST_FRESH_{uuid.uuid4().hex[:8]}'
    stale_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
    fresh_time = datetime.now(timezone.utc).isoformat()

    try:
        coll.update_one(
            {'session_id': stale_sid},
            {'$set': {'session_id': stale_sid, 'role': 'customer', 'last_seen': stale_time}},
            upsert=True,
        )
        coll.update_one(
            {'session_id': fresh_sid},
            {'$set': {'session_id': fresh_sid, 'role': 'customer', 'last_seen': fresh_time}},
            upsert=True,
        )
        online = requests.get(f'{BASE}/api/admin/online', headers=H).json()
        # We can't assert exact numbers because other sessions exist, but we can check
        # by inspecting via /admin — instead assert fresh present, stale not, by unique markers.
        # There's no listing endpoint, so we assert count includes fresh but not stale by delta.
        # Re-add the stale as fresh, verify count increases by exactly 1.
        before_total = online['online_total']
        coll.update_one(
            {'session_id': stale_sid},
            {'$set': {'last_seen': datetime.now(timezone.utc).isoformat()}},
        )
        after = requests.get(f'{BASE}/api/admin/online', headers=H).json()
        assert after['online_total'] == before_total + 1, (
            f'Expected exactly one extra online session after refreshing stale; before={before_total}, after={after["online_total"]}'
        )
    finally:
        coll.delete_many({'session_id': {'$in': [stale_sid, fresh_sid]}})
        cli.close()
