import os, requests, pytest, uuid
BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://headlamp-slots.preview.emergentagent.com').rstrip('/')
PW = 'admin123'
H = {'x-admin-password': PW}

def test_list_slots():
    r = requests.get(f'{BASE}/api/slots'); assert r.status_code==200
    d = r.json(); assert isinstance(d, list) and len(d)>=1

def test_admin_login_ok():
    r = requests.post(f'{BASE}/api/admin/login', json={'password':PW}); assert r.status_code==200 and r.json().get('ok')

def test_admin_login_bad():
    r = requests.post(f'{BASE}/api/admin/login', json={'password':'x'}); assert r.status_code==401

def test_admin_create_delete_slot():
    date=f'2027-01-{(uuid.uuid4().int%28)+1:02d}'; time='09:15'
    r = requests.post(f'{BASE}/api/admin/slots', headers=H, json={'date':date,'time':time})
    assert r.status_code==200; sid=r.json()['id']
    r2 = requests.delete(f'{BASE}/api/admin/slots/{sid}', headers=H); assert r2.status_code==200

def test_booking_flow():
    slots = requests.get(f'{BASE}/api/slots').json()
    assert slots
    sid = slots[0]['id']
    phone = f'TEST_{uuid.uuid4().hex[:8]}'
    payload={'slot_id':sid,'customer_name':'TEST_User','phone':phone,'car_brand':'BMW','car_model':'X5','notes':'t'}
    r = requests.post(f'{BASE}/api/bookings', json=payload); assert r.status_code==200
    bid = r.json()['id']
    # double book -> 400
    r2 = requests.post(f'{BASE}/api/bookings', json=payload); assert r2.status_code==400
    # by phone
    r3 = requests.get(f'{BASE}/api/bookings/phone/{phone}'); assert r3.status_code==200 and len(r3.json())>=1
    # reject frees slot
    r4 = requests.patch(f'{BASE}/api/admin/bookings/{bid}', headers=H, json={'status':'rejected'}); assert r4.status_code==200
    slot = [s for s in requests.get(f'{BASE}/api/slots',params={'only_available':False}).json() if s['id']==sid][0]
    assert slot['is_booked'] is False

def test_admin_bookings_list():
    r = requests.get(f'{BASE}/api/admin/bookings', headers=H); assert r.status_code==200
