# @truckbeez/mobile: driver app

Expo SDK 54, React Native 0.81, React 19.1, New Architecture on (ADR-0003, owner decision 1).

**E1 scope (this step):** the parked driver routing core.
- The truck details editor (BR-29): ft/in + lb or m/kg, stored values rounded up, validation, hazmat classes, tunnel category.
- The map and route planner with the route line, ETA and safety assumptions.
- The route error sheet (BR-31), for no safe route (422), routing down (502) and no connection, with auto-retry.

Not in E1: community reports (needs step C), Fleet screens (step D), in-motion banners and the moving lock (location), hazmat divisions and PIH (PR #28), voice. See [`TESTIDS.md`](TESTIDS.md).

## Run
```bash
npm ci --ignore-scripts          # at the repo root: one lockfile for every workspace
npm test -w @truckbeez/mobile    # Jest (jest-expo) + React Native Testing Library
npm run typecheck -w @truckbeez/mobile
cd apps/mobile && npx expo start # dev server; EXPO_PUBLIC_API_URL=http://<host>:3000
```

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | dev shell / EAS env | API base URL. The Android emulator reaches the host at `http://10.0.2.2:3000`. Not a secret. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | EAS secret (build time) | Android map tiles. Read by `app.config.ts`, never committed (non-negotiable #3). iOS uses Apple Maps. |

The app never holds a routing key. HERE stays on the server.

## Monorepo notes
- `@truckbeez/shared` is consumed as TypeScript source through its `react-native` export condition. Its NodeNext-style `./x.js` imports are resolved to `.ts` by `metro.config.js` and by Jest's `moduleNameMapper`.
- The root `package.json` **overrides** pin a single `react`, `react-native`, `react-test-renderer` and `expo-font` across the repo. Two copies of React or of a native module break the app at runtime. Change these versions only with `npx expo install` in this folder, then update the overrides to match.
