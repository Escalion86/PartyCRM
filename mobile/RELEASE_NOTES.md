# Release Notes — v0.1.0 (Beta)

## What's New
Initial beta build for iOS (TestFlight) — ArtistCRM mobile app (Expo SDK 55, React Native 0.84.1).

## Features

| ID | Feature | Status |
|----|---------|--------|
| M1 | App launch and navigation | ✅ |
| M2 | Authentication (phone/password) | ✅ |
| M3 | Tasks screen (overdue/today/tomorrow) | ✅ |
| M4 | Push notification registration | ✅ |
| M5 | Events screen (upcoming events list) | ✅ |
| M6 | Finance screen (stub) | 🚧 |
| M7 | Profile screen (push prefs + logout) | ✅ |
| M8 | Beta release | ✅ (this build) |

## Known Issues
- Finance screen is a stub — no real data yet
- Events screen shows list but no detail view yet
- Push notifications require a physical device (won't work on emulators)
- API server must be accessible from the device (configure EXPO_PUBLIC_API_BASE_URL)
- Some features require the web CRM to create data first (events, tasks)
- Deep links from notifications not yet implemented (M1-T5)
- Home screen widgets not yet implemented (M1-T6)
- Call intents not yet implemented (M1-T7)

## Testing Instructions

### iOS (TestFlight)
1. Accept the TestFlight invitation email on your iOS device
2. Open the TestFlight app and install ArtistCRM
3. Launch the app
4. Log in with your phone number and password
5. Verify the tasks screen loads and displays tasks from the API
6. Test pull-to-refresh on the tasks screen
7. Check the Events tab for upcoming events
8. Verify push notification permission prompt appears
9. Test logout from Profile screen
10. Report any crashes or unexpected behavior via TestFlight feedback

### Android (Internal Testing)
1. Install the AAB on your Android device
2. Launch the app
3. Log in with your phone number and password
4. Verify the tasks screen loads and displays tasks from the API
5. Test pull-to-refresh on the tasks screen
6. Check the Events tab for upcoming events
7. Verify push notification permission prompt appears
8. Test logout from Profile screen
9. Report any crashes or unexpected behavior

## Build Info
- Expo SDK: 55
- React Native: 0.84.1
- iOS Bundle ID: ru.escalion.artistcrm
- Android Package: ru.escalion.artistcrm
- Version: 0.1.0 (build 1)
- Build Type: IPA (iOS) / App Bundle (Android)
- Track: TestFlight (iOS) / Internal Testing (Android)
- CI/CD: GitHub Actions + EAS Build
