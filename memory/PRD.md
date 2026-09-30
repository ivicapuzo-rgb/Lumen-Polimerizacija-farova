# Lumen Service — Headlight Cleaning Booking App

## Problem
Serbian-language mobile app where customers browse available slots for headlight cleaning and book them by entering name, phone, car brand/model, and notes. Owner (admin) manages available slots and confirms/rejects bookings.

## Users
- **Customer**: no account; enters name + phone + car info to book; tracks bookings by phone number lookup.
- **Admin (owner)**: password-protected panel to create/delete slots and confirm/reject booking requests.

## Core Features
1. **Browse available slots** — grouped by date, tap a time to book.
2. **Booking form** — name, phone, car brand + model (from list of 20+ brands), notes.
3. **My Bookings** — lookup bookings by phone, see status (pending / confirmed / rejected).
4. **Admin — Slots tab** — list all slots, add new (date+time), delete unused.
5. **Admin — Bookings tab** — filter by status, confirm/reject pending requests. Rejecting a booking frees the slot again.
6. **Admin — Settings tab** — dynamic price, blocked dates, custom share URL (used in "Preporuči" and QR), toggle for gallery visibility (hide/show entire "Naši radovi" section), entry to Version Manager, danger-zone wipes.
7. **Admin — Version Manager** — dedicated sub-screen (`/admin/app-version`) to set version string, versionCode, GitHub APK link, release notes and mandatory-update toggle. On next launch, installed apps compare local vs remote versionCode and show an in-app modal with "Preuzmi i ažuriraj" (opens the APK link) and optional "Kasnije" (hidden when mandatory).
8. **Gallery** — before/after slider, pinch-zoom, drag-to-reorder, LUMEN watermark, camera + library upload, per-item delete, admin-controlled visibility.

## Tech
- **Frontend**: Expo Router, React Native, Reanimated, expo-image, expo-linear-gradient, expo-haptics, @react-native-vector-icons/material-design-icons, AsyncStorage, React Query.
- **Backend**: FastAPI + Motor (MongoDB). Admin auth via `x-admin-password` header (env var `ADMIN_PASSWORD`, default `admin123`).
- **Design**: Dark-first automotive theme; amber `#FF9800` accents on carbon `#0D0D0D`.

## Endpoints
- `GET /api/slots` — available slots (customer).
- `POST /api/bookings` — create booking.
- `GET /api/bookings/phone/{phone}` — customer lookup.
- `POST /api/admin/login` — validate password.
- `GET/POST/DELETE /api/admin/slots(/:id)` — admin slot CRUD.
- `GET/PATCH /api/admin/bookings(/:id)` — list all bookings, update status.

## Not in MVP
- Notifications (per user choice — status visible in app only).
- Multi-language, payments, service history.
