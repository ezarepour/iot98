# Kidk Mobile (MVP)

Operational Expo/React Native mobile app for the Kidk platform.

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

## Run locally

```bash
cd kidk-mobile
npm install
npm start
```

Then run on:

- Android: `npm run android`
- iOS (macOS required): `npm run ios`
- Web: `npm run web`

## Notes

- This version is fully usable as an MVP with local persistence.
- OTP and AI analysis are simulated for offline demo purposes.
- API contract for production backend exists at:
  - `static_files/projects/kidk/kidk_openapi.yaml`
