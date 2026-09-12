# EncryptMe

[![CI](https://github.com/ilya-levchenko/encryptme/actions/workflows/ci.yml/badge.svg)](https://github.com/ilya-levchenko/encryptme/actions/workflows/ci.yml)
[![Android](https://github.com/ilya-levchenko/encryptme/actions/workflows/android.yml/badge.svg)](https://github.com/ilya-levchenko/encryptme/actions/workflows/android.yml)
[![iOS IPA](https://github.com/ilya-levchenko/encryptme/actions/workflows/ios.yml/badge.svg)](https://github.com/ilya-levchenko/encryptme/actions/workflows/ios.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-67a9ff.svg)](LICENSE)

Private, local-first encrypted diary for Windows, macOS, Linux, iOS and Android. One password opens the real vault; another opens an independent, believable decoy vault. There is no cloud account and no telemetry.

[Русская версия](README.ru.md)

## Features

- AES-256-GCM encryption with an independently encrypted index and entries;
- real and decoy vaults with indistinguishable storage formats;
- calendar, multiple entries per day, rich text, animated spoilers and auto-lock;
- English and Russian UI with system-language detection and instant switching;
- encrypted backup import/export compatible across desktop, iOS and Android;
- Windows-to-phone synchronization over local Wi-Fi and QR;
- phone-to-phone synchronization over Bluetooth Low Energy;
- optional local reminders after three days away and monthly project-support reminders;
- private mobile storage, iOS Data Protection and Android `FLAG_SECURE`.

## Quick start

Node.js 22+ is required. Android builds also require JDK 21 and Android SDK 36; Android 8.0 (API 26) is the minimum supported device version.

```bash
git clone https://github.com/ilya-levchenko/encryptme.git
cd encryptme
npm ci
npm run dev
```

Run all shared tests and the production web build with `npm run check`.

## Build targets

| Platform | Command | Output |
|---|---|---|
| Windows | `npm run dist:win` | NSIS installer and portable package in `release/` |
| Current desktop OS | `npm run dist` | Platform package in `release/` |
| iOS | `npm run build:ios` | Synchronized Xcode project in `ios/` |
| Android | `npm run build:android` | Debug APK under `android/app/build/outputs/apk/debug/` |

GitHub Actions produces an unsigned diagnostic IPA and an installable debug APK without secrets. Signing instructions are in [docs/ios.md](docs/ios.md) and [docs/android.md](docs/android.md).

## Synchronization

Windows hosts a five-minute local Wi-Fi session. In the phone app, scan its QR code; manual address and one-time-code entry remain available.

For phone-to-phone BLE, open the same vault on both phones. Tap **Allow nearby connection** on one and **Find nearby phone** on the other. The service advertisement contains no profile name, diary metadata or entry identifiers. The vault payload is already encrypted and wrapped in another authenticated AES-GCM envelope for the session.

Independently created profiles are intentionally rejected. For the first shared copy, export one encrypted backup and import it on the other device.

Physical-device testing is required before relying on BLE; simulator Bluetooth stacks do not represent real iPhone/Android interoperability. See [docs/bluetooth.md](docs/bluetooth.md).

## Local reminders

The mobile app asks for operating-system notification permission on its first visible launch. The three-day journal reminder remains optional. The monthly support reminder is enabled by default on Windows and Android and has no separate switch there; on iOS it remains off until the user explicitly checks the consent control and can be disabled there at any time. Messages are scheduled entirely on the device in Russian or English; no diary text, push token, analytics event or network service is involved.

Opening EncryptMe resets the inactivity schedule. Windows enables hidden start-at-login while at least one reminder is active so notifications remain reliable. If permission was denied, enable notifications for EncryptMe in the operating-system settings and reopen the app.

## Security and storage

EncryptMe cannot recover a forgotten password. It does not protect an unlocked diary from a compromised operating system, keylogger or someone looking at the screen. The project has not undergone an independent cryptographic audit. Read the [security model](docs/security.md) before using it for high-risk material.

The exact platform storage locations and backup behavior are documented in [docs/storage.md](docs/storage.md). Architecture details are in [docs/architecture.md](docs/architecture.md).

## Project structure

```text
src/                    shared React UI, encryption and sync protocol
electron/               isolated desktop process, filesystem and Wi-Fi host
native/bluetooth-sync/  local Capacitor BLE plugin for CoreBluetooth and Android GATT
ios/                    Capacitor/Xcode project
android/                Capacitor/Gradle project
scripts/                icons and signing helpers
docs/                   architecture, security and build guides
.github/workflows/      desktop, iOS and Android CI
```

## Author and support

Developed by **Ilya Levchenko** · [ilya_encryptme@proton.me](mailto:ilya_encryptme@proton.me)

Support development with USDT on TRON (TRC20): `TL7QuKcQWFcHKM9U98y9e4h9CpducJQTjg`. Send only USDT using the TRC20 network. [View the address in TRONSCAN](https://tronscan.org/#/address/TL7QuKcQWFcHKM9U98y9e4h9CpducJQTjg).

## License

[MIT](LICENSE) © 2026 Ilya Levchenko. MIT permits use, modification, redistribution and commercial forks while requiring preservation of the license notice.
