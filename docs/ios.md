# Сборка и установка на iOS без собственного Mac

Проект использует Capacitor 8 и требует iOS 15+ и Xcode 26+. Xcode запускается на GitHub-hosted runner `macos-26`, поэтому локальный Mac для сборки не нужен.

## Что потребуется от Apple

Для устанавливаемой `.ipa` нужны активное членство Apple Developer Program, зарегистрированный App ID `com.encryptme.diary`, сертификат **Apple Distribution** и App Store provisioning profile. Unsigned-артефакт из CI служит проверкой компиляции и на iPhone не устанавливается.

## Настройка GitHub Secrets

В репозитории откройте **Settings → Secrets and variables → Actions** и добавьте:

| Secret | Содержимое |
|---|---|
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | `.p12` с Apple Distribution certificate, закодированный Base64 |
| `IOS_CERTIFICATE_PASSWORD` | пароль от `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store `.mobileprovision`, закодированный Base64 |

Base64 в PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\certificate.p12')) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\profile.mobileprovision')) | Set-Clipboard
```

Base64 — только представление бинарного файла. Секретом его делает защищённое хранилище GitHub Actions; не добавляйте результат в Git.

## Получение IPA

1. Откройте **Actions → iOS IPA → Run workflow**.
2. Оставьте `Upload a signed build to TestFlight` выключенным для первой проверки.
3. После завершения скачайте artifact `EncryptMe-iOS-signed`.

Workflow выполняет тест совместимости шифрования, web build, Capacitor sync, Xcode archive и export. Номер сборки равен `github.run_number`, поэтому повторные загрузки не конфликтуют.

## Автоматическая загрузка в TestFlight

Создайте API key в App Store Connect и дополнительно добавьте:

| Secret | Содержимое |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | содержимое файла `AuthKey_….p8` в Base64 |

Повторно запустите workflow с включённым `Upload a signed build to TestFlight`. Сначала создайте приложение с bundle ID `com.encryptme.diary` в App Store Connect. После обработки сборки добавьте Apple ID вашего iPhone в список внутренних или внешних тестировщиков и установите приложение через TestFlight.

Приложение использует шифрование. Перед распространением ответьте на вопросы export compliance в App Store Connect; проект намеренно не подставляет юридический ответ автоматически.

## Локальный Xcode workflow

Если Mac появится позже:

```bash
npm ci
npm run build:ios
npm run open:ios
```

Перед коммитом после обновления зависимостей выполните `npm run build:ios`, чтобы проверить синхронизацию Swift Package Manager.

## Локальные уведомления

Системный запрос разрешения показывается при первом видимом запуске и не повторяется после отказа. Напоминание о дневнике остаётся добровольным. Донат-уведомления по умолчанию выключены и планируются только после отдельной галочки явного согласия в EncryptMe. Напоминания создаются через локальный `UNUserNotificationCenter`; APNs, сервер и push-токены не используются. Текст дневника никогда не помещается в уведомление.

Ежемесячное сообщение о поддержке проекта является рекламным по смыслу, поэтому имеет отдельный явный переключатель и может быть отключено независимо. Нажатие открывает обычный экран приложения, требует штатной разблокировки и затем показывает раздел пожертвований — внешняя страница или кошелёк автоматически не запускаются.

Если разрешение было отклонено, откройте **Настройки iOS → Уведомления → EncryptMe**, разрешите уведомления и снова запустите приложение.
