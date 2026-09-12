# Bluetooth synchronization

EncryptMe 1.5 uses a local Capacitor plugin backed by CoreBluetooth on iOS and BLE Scanner/GATT client/server APIs on Android.

## User flow

1. Open the same real or decoy vault on both phones.
2. On one phone choose **Allow nearby connection**.
3. On the other choose **Find nearby phone**. A single result connects automatically; multiple results show anonymous temporary numbers and signal strength.
4. Keep both apps in the foreground until completion.

The host accepts one connection for at most five minutes. Locking, cancellation or backgrounding stops advertising and disconnects the peer. Initial transfer time depends on ciphertext size; the UI reports fragment progress.

## Protocol

- fixed service and characteristic UUIDs identify EncryptMe, while the advertisement contains only a random five-digit alias;
- the active split-vault container is wrapped in an authenticated AES-GCM envelope using the already-derived active-vault key;
- GATT frames carry sequence and total counts and use acknowledged writes or notification flow control;
- the envelope includes SHA-256 integrity data in addition to GCM authentication;
- the receiver rejects a different KDF, salt, key, malformed frame set or checksum;
- entry conflicts and encrypted tombstones use the same deterministic merge module as Wi-Fi.

BLE transport metadata can reveal that EncryptMe devices are nearby and the approximate transfer volume. It never advertises the profile name, dates, titles, entry IDs or plaintext. Background continuation is intentionally unsupported.

## Release acceptance

Real hardware tests are mandatory for iPhone ↔ iPhone, Android ↔ Android and iPhone ↔ Android. Cover denied permission, Bluetooth off, cancellation, locking/backgrounding, two different vaults, packet loss/disconnect and a large diary. Simulators are sufficient only for the shared protocol tests.
