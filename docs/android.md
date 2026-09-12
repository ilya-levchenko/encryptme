# Android build and signing

## Local debug APK

Install Node.js 22+, JDK 21 and Android SDK 36, set `JAVA_HOME` and `ANDROID_HOME`, then run. The minimum supported device version is Android 8.0 (API 26), required by the native QR scanner.

```bash
npm ci
npm run build:android
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Open the native project with `npm run open:android`.

## Release upload key

Create a dedicated upload key and keep an offline backup:

```bash
keytool -genkeypair -v -keystore encryptme-upload.jks -alias encryptme-upload -keyalg RSA -keysize 4096 -validity 10000
```

Never commit the JKS file. Base64-encode it and create these GitHub repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The Android workflow always builds a debug APK. When all signing secrets are present, it also builds a signed release APK and AAB. Google Play accepts the AAB; the configured key is the upload key, while Play App Signing may manage the distribution key.

## Security settings

Android cloud backup is disabled, vault files use the private application directory, and `FLAG_SECURE` prevents diary contents from appearing in screenshots and Recent Apps. Android 12+ requests Nearby Devices scan, advertise and connect permissions; Android 11 and older use location only for BLE discovery.

## Local notifications

The journal and monthly support reminders are opt-in and use Capacitor Local Notifications. EncryptMe requests `POST_NOTIFICATIONS` on Android 13+ only after the user enables a reminder. Schedules are deliberately inexact and do not request exact-alarm privileges. If permission was denied, enable notifications under **Settings → Apps → EncryptMe → Notifications**, then reopen EncryptMe.

All text and scheduling metadata stay on the device. No Firebase service, push token, account identifier or diary content is transmitted.
