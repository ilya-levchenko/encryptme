# Data storage

All diary content is local unless the user explicitly exports or synchronizes it.

- Windows: `%APPDATA%/EncryptMe/vault` through Electron's `userData` path.
- macOS desktop: `~/Library/Application Support/EncryptMe/vault`.
- Linux: Electron's `userData/vault`, normally under `$XDG_CONFIG_HOME/EncryptMe`.
- iOS: the application sandbox under `Library/vault`, protected with `NSFileProtectionComplete`.
- Android: the application-private Filesystem data directory; Android cloud backup is disabled.

The language preference is deliberately stored outside the vault in local WebView storage. It contains no diary data and is not synchronized. Vaults, backups and recovery copies remain encrypted. Uninstalling a mobile app can remove its sandbox, so keep a tested encrypted backup in a separate location.
