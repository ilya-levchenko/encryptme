# Changelog

Все заметные изменения проекта документируются здесь. Формат следует Keep a Changelog, версии — Semantic Versioning.

## [1.1.0] - 2026-09-08

### Added

- нативный проект iOS на Capacitor 8;
- совместимая реализация AES-256-GCM/scrypt на Web Crypto;
- iOS-хранилище, импорт, экспорт и блокировка при уходе в фон;
- защита снимка приложения и `NSFileProtectionComplete` для каталога сейфа;
- GitHub Actions для CI, unsigned/signed IPA и опционального TestFlight upload;
- публичная документация и файлы участия в проекте.

### Changed

- репозиторий приведён к структуре публичного open-source проекта;
- mobile layout учитывает safe area и динамическую высоту viewport;
- desktop-пакет исключает исходные `node_modules` из устанавливаемого приложения.
