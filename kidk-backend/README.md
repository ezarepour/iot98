# Kidk Backend (Operational)

Node.js backend with JWT authentication and persistent storage for Kidk mobile app.

## Features

- Signup/Login with OTP demo flow
- JWT authentication
- Change password
- Full user data sync API (`GET /sync`, `PUT /sync`)
- Doctors endpoint
- Local persistent storage in `data/db.json`

## Quick start

```bash
cd kidk-backend
npm install
cp .env.example .env
npm run start
```

Default URL:

- `http://localhost:4000`

## Endpoints

- `GET /health`
- `POST /auth/request-otp`
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `POST /auth/change-password` (Bearer token)
- `GET /sync` (Bearer token)
- `PUT /sync` (Bearer token)
- `GET /doctors` (Bearer token)

## Notes

- OTP for demo is fixed: `123456`
- For production, replace JSON storage with PostgreSQL and OTP provider.
