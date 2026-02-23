# Kidk Mobile (MVP)

Operational Expo/React Native mobile app connected to a real backend API.

## Implemented modules

- Authentication (signup with OTP simulation + login + change password)
- Dashboard with health summary
- Child management (add/edit profile + fever threshold)
- Fever monitoring (simulated BLE stream, live chart, battery/signal, treatment events, history)
- Jaundice monitoring (4-step capture flow + AI-like estimation simulation + history)
- Vaccination (schedule, status colors, quick injection register)
- Growth monitoring (weight/height/head records + quick status)
- Online consultation (doctor selection, payment simulation, chat history)
- Remote fever monitoring (latest status + caregiver messaging simulation)
- Settings (notifications channel + password change)

## Tech stack

- Expo SDK 54
- React Native + TypeScript
- React Navigation (native stack)
- AsyncStorage (persistent local data)
- react-native-chart-kit + react-native-svg
- expo-image-picker

## Backend first (required)

```bash
cd kidk-backend
npm install
cp .env.example .env
npm run start
```

Backend default URL:

- `http://localhost:4000`

---

## Run mobile app

```bash
cd kidk-mobile
npm install
npm start
```

Set backend URL in login screen:

- Android Emulator: `http://10.0.2.2:4000`
- iOS Simulator: `http://localhost:4000`
- Real phone (same Wi-Fi as laptop): `http://<LAPTOP_IP>:4000`

Then run on:

- Android: `npm run android`
- iOS (macOS required): `npm run ios`
- Web: `npm run web`

## Notes

- OTP in demo backend is fixed: `123456`
- Jaundice AI and BLE sensor feed are still simulated in app-side MVP logic
- Data is persisted on backend (`kidk-backend/data/db.json`) and synced from app
