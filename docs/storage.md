# Data storage

All diary content is local unless the user explicitly exports or synchronizes it.

- Windows: `%APPDATA%/EncryptMe/vault` through Electron's `userData` path.
- macOS desktop: `~/Library/Application Support/EncryptMe/vault`.
- Linux: Electron's `userData/vault`, normally under `$XDG_CONFIG_HOME/EncryptMe`.
- iOS: the application sandbox under `Library/vault`, protected with `NSFileProtectionComplete`.
- Android: the application-private Filesystem data directory; Android cloud backup is disabled.

The language preference and local-reminder settings are deliberately stored outside the vault: WebView local storage on mobile and the Electron `userData` directory on desktop. Reminder state contains only enable flags, locale, generic message variants and due timestamps. It contains no diary data and is never exported or synchronized.

Local reminders use the operating system scheduler directly. EncryptMe does not operate a notification server, register a cloud push token or send reminder analytics. On Windows, enabling any reminder also enables hidden start-at-login; disabling both removes that login item.

Vaults, backups and recovery copies remain encrypted. Uninstalling a mobile app can remove its sandbox, so keep a tested encrypted backup in a separate location.
