import os
import requests
import uuid

BASE = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else 'https://headlamp-slots.preview.emergentagent.com'
PW = 'puzopb'  # new admin password (was 'admin123')
OLD_PW = 'admin123'
H = {'x-admin-password': PW}


# ----- Admin auth (new password) -----
def test_admin_login_new_password_ok():
    r = requests.post(f'{BASE}/api/admin/login', json={'password': PW})
    assert r.status_code == 200, r.text
    assert r.json().get('ok') is True


def test_admin_login_old_password_401():
    r = requests.post(f'{BASE}/api/admin/login', json={'password': OLD_PW})
    assert r.status_code == 401


def test_admin_login_empty_401():
    r = requests.post(f'{BASE}/api/admin/login', json={'password': ''})
    assert r.status_code == 401


# ----- Public routes -----
def test_list_slots_public():
    r = requests.get(f'{BASE}/api/slots')
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    s0 = data[0]
    for k in ('id', 'date', 'time', 'is_booked'):
        assert k in s0


def test_get_settings_public():
    r = requests.get(f'{BASE}/api/settings')
    assert r.status_code == 200
    d = r.json()
    assert 'price' in d and 'currency' in d
    assert isinstance(d['price'], int) and d['price'] >= 0


# ----- Slot admin CRUD -----
def test_admin_create_delete_slot():
    date = f'2027-02-{(uuid.uuid4().int % 27) + 1:02d}'
    time = '09:15'
    r = requests.post(f'{BASE}/api/admin/slots', headers=H, json={'date': date, 'time': time})
    assert r.status_code == 200, r.text
    sid = r.json()['id']
    r2 = requests.delete(f'{BASE}/api/admin/slots/{sid}', headers=H)
    assert r2.status_code == 200


def test_admin_slots_requires_pw():
    r = requests.get(f'{BASE}/api/admin/slots')
    assert r.status_code == 401


# ----- Booking flow: create, price snapshot, phone lookup, status transitions -----
def test_booking_full_status_flow():
    # get current settings price and grab a slot
    settings = requests.get(f'{BASE}/api/settings').json()
    expected_price = settings['price']

    slots = requests.get(f'{BASE}/api/slots').json()
    assert slots, 'No available slots seeded'
    sid = slots[0]['id']

    phone = f'TEST_{uuid.uuid4().hex[:8]}'
    payload = {
        'slot_id': sid,
        'customer_name': 'TEST_User',
        'phone': phone,
        'car_brand': 'BMW',
        'car_model': 'X5',
        'notes': 'TEST_note',
    }
    r = requests.post(f'{BASE}/api/bookings', json=payload)
    assert r.status_code == 200, r.text
    booking = r.json()
    bid = booking['id']

    # unit_price snapshot equals current settings price
    assert booking['unit_price'] == expected_price
    assert booking['status'] == 'pending'
    assert booking['currency'] == settings['currency']

    # GET verify via admin list
    all_b = requests.get(f'{BASE}/api/admin/bookings', headers=H).json()
    assert any(b['id'] == bid and b['status'] == 'pending' for b in all_b)

    # Duplicate booking on same slot -> 400
    r_dup = requests.post(f'{BASE}/api/bookings', json=payload)
    assert r_dup.status_code == 400

    # phone lookup
    r_ph = requests.get(f'{BASE}/api/bookings/phone/{phone}')
    assert r_ph.status_code == 200 and any(b['id'] == bid for b in r_ph.json())

    # pending -> confirmed
    r_c = requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status': 'confirmed'})
    assert r_c.status_code == 200 and r_c.json()['status'] == 'confirmed'

    # confirmed -> completed
    r_done = requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status': 'completed'})
    assert r_done.status_code == 200 and r_done.json()['status'] == 'completed'

    # verify persisted
    all_b2 = requests.get(f'{BASE}/api/admin/bookings', headers=H).json()
    match = [b for b in all_b2 if b['id'] == bid]
    assert match and match[0]['status'] == 'completed'

    # cleanup: reject to free the slot for other tests
    requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status': 'rejected'})
    slot_now = [s for s in requests.get(f'{BASE}/api/slots', params={'only_available': False}).json() if s['id'] == sid]
    assert slot_now and slot_now[0]['is_booked'] is False


def test_invalid_status_400():
    # Create a booking then send invalid status
    slots = requests.get(f'{BASE}/api/slots').json()
    sid = slots[0]['id']
    phone = f'TEST_{uuid.uuid4().hex[:8]}'
    payload = {
        'slot_id': sid, 'customer_name': 'TEST', 'phone': phone,
        'car_brand': 'Audi', 'car_model': 'A4',
    }
    r = requests.post(f'{BASE}/api/bookings', json=payload)
    assert r.status_code == 200
    bid = r.json()['id']
    try:
        r_bad = requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status': 'bogus'})
        assert r_bad.status_code == 400
    finally:
        requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status': 'rejected'})


# ----- Admin bookings requires pw -----
def test_admin_bookings_requires_pw():
    r = requests.get(f'{BASE}/api/admin/bookings')
    assert r.status_code == 401


def test_admin_bookings_list_ok():
    r = requests.get(f'{BASE}/api/admin/bookings', headers=H)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
