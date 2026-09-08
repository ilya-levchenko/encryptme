# Архитектура

EncryptMe использует общий React/Vite-интерфейс и две платформенные реализации одного контракта `window.encryptMe`.

```text
React UI
   │
   ├── Electron preload/IPC ── Electron main ── локальные файлы desktop
   │
   └── Capacitor bridge ────── Web Crypto ───── Library/vault на iOS
```

## Границы платформ

- `src/App.tsx` отвечает только за состояние интерфейса и вызывает платформенный контракт.
- `electron/preload.cjs` предоставляет минимальный IPC API без доступа UI к Node.js.
- `electron/main.mjs` владеет desktop-сессией и файловой системой.
- `src/platform/` реализует тот же API для iOS и browser development.
- `ios/` содержит тонкий нативный shell, защиту app-switcher snapshot и настройки Data Protection.

## Форматы данных

Контейнер сейфа имеет версию `1` и поля `salt`, `iv`, `tag`, `ciphertext`. Ключ длиной 256 бит выводится через scrypt; содержимое шифруется AES-256-GCM. Реализации Node.js и Web Crypto покрыты двунаправленным тестом совместимости.

Резервная копия содержит профиль и оба уже зашифрованных сейфа, после чего целиком дополнительно шифруется активным паролем. Это позволяет переносить один файл между desktop и iOS без конвертации.

Browser fallback предназначен только для разработки интерфейса и хранит зашифрованные контейнеры в `localStorage`; production desktop использует Electron, а iOS — Capacitor Filesystem.
