# `examples/mobile-web-hybrid` — Expo Router 4 (SDK 52) universal app

A minimal Expo Router 4.x universal app used as a TestAtlas reference example
for **mobile + web** mappable concerns. The companion `_testatlas/` workspace
inside this directory is the durable quality intelligence layer produced by
mapping this codebase end-to-end.

## ⚠ Structure-only example

> **This example demonstrates STRUCTURE only.** Full native build requires
> macOS + iOS / Android SDKs and is **NOT** exercised in CI. CI runs ONLY:
>
> - `node scripts/regenerate-example.js examples/mobile-web-hybrid --check`
> - `node scripts/validate-workspace.js --workspace examples/mobile-web-hybrid/_testatlas`
>
> CI never invokes `expo run:ios`, `expo run:android`, `npx expo prebuild`,
> or installs `node_modules`. See **Pitfall 4** in
> `.planning/phases/08-examples-ga-release/08-RESEARCH.md` for the rationale
> (TestAtlas's value here is the workspace + fixture, not a green native
> build).

If you want to actually run this app on a device or in a web browser, that's
a developer-machine activity that requires installing the dependencies
yourself:

```sh
cd examples/mobile-web-hybrid
npm install
npx expo start
```

## What this is

- Plain ESM JavaScript, Node 20.11+, no TypeScript
- Expo SDK ~52 + Expo Router ~4 (file-system routing for React Native)
- React 18.3.1 + React Native 0.76.x (Expo SDK 52 ships React 18, not 19 —
  Expo lags one React major)
- Universal: same component graph renders on iOS, Android, and web via
  `react-native-web`
- ~200 LOC across `app/`, `components/`, `lib/`

## Source surface

| Path                         | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `app/_layout.js`             | Root Stack navigator                          |
| `app/index.js`               | Home screen with universal CTAs               |
| `app/login.js`               | Mock login (modal route)                      |
| `app/(tabs)/_layout.js`      | Bottom tab navigator                          |
| `app/(tabs)/feed.js`         | FlatList of mock posts                        |
| `app/(tabs)/profile.js`     | Profile + sign out                            |
| `components/shared-button.js`| Universal `<Pressable>` wrapper               |
| `lib/api-client.js`          | Universal fetch-based client (no native deps) |

## TestAtlas workspace

The `_testatlas/` directory next to this README is regenerable from
`_testatlas-fixture/example-script.json` via:

```sh
node ../../scripts/regenerate-example.js examples/mobile-web-hybrid
```

`--check` mode runs the regeneration against a tempdir and exits non-zero if
the checked-in tree drifts — see [`examples/framework/README.md`](../framework/README.md).

## Realistic seeded findings

1. **LOGIN-NO-OFFLINE-HANDLING** (medium, mobile-screens) — the login screen
   surfaces network errors as opaque strings; no offline detection or retry.
2. **PRESSABLE-NO-HAPTICS** (enhancement, navigation) — the universal
   `SharedButton` does not trigger haptic feedback on iOS or Android.
