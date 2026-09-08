# EncryptMe

[![CI](https://github.com/ilya-levchenko/encryptme/actions/workflows/ci.yml/badge.svg)](https://github.com/ilya-levchenko/encryptme/actions/workflows/ci.yml)
[![iOS IPA](https://github.com/ilya-levchenko/encryptme/actions/workflows/ios.yml/badge.svg)](https://github.com/ilya-levchenko/encryptme/actions/workflows/ios.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-67a9ff.svg)](LICENSE)

Локальный зашифрованный дневник для Windows, macOS, Linux и iOS. Один пароль открывает настоящий сейф, второй — независимый правдоподобный сейф. Приложение не использует облако и не отправляет записи в сеть.

## Возможности

- два неразличимых зашифрованных сейфа: основной и запасной;
- календарь и несколько записей на каждый день;
- современный форматированный редактор и анимированные скрытые фрагменты;
- автоблокировка через 30 секунд, 1, 2 или 5 минут;
- ручная блокировка, блокировка при закрытии окна и сворачивание в трей на desktop;
- мгновенная блокировка и закрытие содержимого в переключателе приложений на iOS;
- совместимый между платформами зашифрованный импорт и экспорт;
- полностью локальное хранение.

## Быстрый старт

Требуются Node.js 22+ и npm.

```bash
git clone https://github.com/ilya-levchenko/encryptme.git
cd encryptme
npm ci
npm run dev
```

Проверка проекта: `npm run check`.

## Сборка

| Платформа | Команда | Результат |
|---|---|---|
| Windows | `npm run dist:win` | NSIS-установщик и portable в `release/` |
| Текущая desktop ОС | `npm run dist` | Пакет в `release/` |
| iOS | `npm run build:ios` | Обновлённый Xcode-проект в `ios/` |

Полноценная `.ipa` собирается на macOS runner через workflow **iOS IPA**. Без секретов подписи workflow создаёт диагностическую unsigned `.ipa`; с сертификатом и provisioning profile — подписанную `.ipa`, которую опционально можно отправить в TestFlight. Настройка описана в [docs/ios.md](docs/ios.md).

## Безопасность

- AES-256-GCM с отдельными salt и IV;
- scrypt с параметрами `N=32768`, `r=8`, `p=1`;
- пароль не сохраняется на диске;
- имя профиля хранится только как SHA-256 digest;
- сейфы и резервная копия имеют версионированный формат;
- на iOS каталог сейфа получает `NSFileProtectionComplete`;
- перед импортом создаётся локальная аварийная копия текущего сейфа.

EncryptMe не может восстановить забытый пароль. Подробности и модель угроз: [docs/security.md](docs/security.md). Инструкции для исследователей: [SECURITY.md](SECURITY.md).

## Структура

```text
src/                 React-интерфейс и общий mobile/web runtime
electron/            изолированный desktop main process и криптооперации
ios/                 нативный проект Capacitor/Xcode
scripts/             сборочные утилиты и автоматизация подписи
docs/                архитектура, безопасность и iOS-инструкции
.github/workflows/   CI и сборка IPA
```

Архитектурные решения описаны в [docs/architecture.md](docs/architecture.md). Участие в разработке — в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE) © 2026 Ilya Levchenko.
