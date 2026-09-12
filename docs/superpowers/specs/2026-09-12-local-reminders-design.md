# EncryptMe Local Reminders Design

## Purpose and scope

EncryptMe 1.6.0 adds opt-in local notifications on Windows, iOS, and Android without a notification server, cloud account, advertising SDK, or diary-content access. Electron builds on macOS and Linux use the same desktop implementation on a best-effort basis, but the release acceptance targets are Windows, iOS, and Android.

Two independent reminders are available:

1. A journal reminder after 72 hours without bringing EncryptMe to the foreground. It repeats every 72 hours until the app is opened, at which point the interval restarts.
2. A monthly support reminder inviting the user to open the existing USDT TRC20 donation section.

Both reminders are disabled by default. Enabling the support reminder is explicit consent for promotional notifications and it always remains independently removable in settings.

## Privacy and data model

Reminder preferences are installation settings, not vault content. They are stored outside the encrypted real and decoy vaults because the operating system must deliver reminders while the vault is locked. They are not exported, imported, synchronized, or associated with a profile or vault slot.

The stored state is:

```ts
type ReminderSettings = {
  journalEnabled: boolean;
  donationEnabled: boolean;
  lastForegroundAt: string;
  donationNextAt: string | null;
  locale: 'ru' | 'en';
};
```

Notifications contain only the product name, a generic localized message, and a route identifier. They never contain usernames, vault type, entry titles, entry dates, diary excerpts, passwords, keys, encrypted identifiers, or usage counts.

## User experience

The Settings sheet receives a `Notifications` section between Protection and Backups. It contains:

- a master explanation that reminders are created only on the device;
- `Remind me to write after 3 days` and `Monthly project support reminder` switches;
- concise disclosure under the donation switch that this is a monthly promotional reminder for voluntary USDT TRC20 support;
- a localized permission/error message when the operating system blocks notifications.

The first attempt to enable either switch asks for the operating-system notification permission. If permission is denied, the switch remains off. The other reminder remains unchanged. Disabling a switch cancels its pending notification immediately.

The interface uses the existing blue glass styling, button animation, and haptic feedback. Settings remain usable if the platform does not support notifications, but both switches are disabled and the explanation says so.

Tapping a journal reminder opens or focuses EncryptMe at its normal setup/login/locked screen. It never bypasses authentication. Tapping a support reminder opens or focuses the application, opens Settings, and scrolls to the existing donation block. It does not open TRONSCAN automatically.

## Localized content

English and Russian each contain one neutral title and at least six bodies for each reminder category. Journal text encourages a short reflection without revealing that the user has diary content. Donation text clearly identifies voluntary project support and the TRC20 network without including the full wallet address on the lock screen.

One body is selected when a reminder is scheduled. Reopening the app selects a new journal variant when the 72-hour timer restarts. A language change cancels and recreates pending notifications immediately in the newly selected language while preserving the monthly due date.

## Shared renderer contract

`window.encryptMe` gains:

```ts
type ReminderRoute = 'journal' | 'donation';
type ReminderPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';
type ReminderContent = {
  title: string;
  journalBodies: string[];
  donationBodies: string[];
};

getReminderSettings(): Promise<ReminderSettings & { permission: ReminderPermission }>;
setReminderSettings(input: {
  journalEnabled: boolean;
  donationEnabled: boolean;
  locale: 'ru' | 'en';
  content: ReminderContent;
}): Promise<ReminderSettings & { permission: ReminderPermission }>;
markAppForeground(input: {
  locale: 'ru' | 'en';
  content: ReminderContent;
}): Promise<ReminderSettings & { permission: ReminderPermission }>;
onReminderAction(callback: (route: ReminderRoute) => void): () => void;
```

Inputs are validated at the platform boundary: locale must be `ru` or `en`, every content list must contain 1–12 non-empty strings, and individual strings are capped at 240 characters.

The React layer owns localized content and settings UI. Platform bridges own permission checks, persistence, OS scheduling, and activation events.

## Mobile implementation

iOS and Android use `@capacitor/local-notifications` version 8, matching the existing Capacitor 8 stack.

- Android 13+ requests `POST_NOTIFICATIONS` only after the user enables a reminder.
- Android uses an `encryptme_reminders` notification channel with normal importance and private lock-screen visibility.
- Schedules are inexact (`isExactNotification: false`); a journal prompt does not justify Android exact-alarm permission.
- iOS uses the standard local-notification authorization prompt and the operating system delivers scheduled notifications even when EncryptMe is not running.
- The journal notification uses a repeating 72-hour schedule anchored to `lastForegroundAt`.
- The donation notification uses a repeating monthly schedule anchored to `donationNextAt`.
- App foreground events cancel any delivered reminder banners, update `lastForegroundAt`, and restart only the journal schedule.
- Notification action listeners queue an activation route until React registers its callback.

No background fetch, background runner, APNs, Firebase Cloud Messaging, network permission, tracking identifier, or exact-alarm permission is introduced.

## Desktop implementation

Electron persists reminder settings in `app.getPath('userData')/reminders.json` using atomic writes. A dedicated `electron/reminders.mjs` module owns validation, due-date calculation, timer lifecycle, notification creation, and click routing.

Electron notifications are created in the main process. When at least one reminder is enabled in a packaged build, `app.setLoginItemSettings` enables hidden start at login. When both are disabled it removes the login item. A hidden startup creates the tray and renderer without showing the main window, so settings and localized content can initialize while timers remain active.

Desktop timers are recalculated after launch, settings changes, language changes, foregrounding, sleep/resume, and system-clock changes observable through Electron power-monitor events. Long delays are chunked below the JavaScript timer maximum. If the computer was asleep or the application was stopped at the due time, one notification is shown after the next launch/resume and the following due time advances without emitting a burst of missed notifications.

The NSIS installer already creates the Start Menu shortcut needed for Windows notifications. The main process sets the packaged AppUserModelID explicitly. Clicking a notification shows and focuses the window, then sends the route to the renderer.

## Scheduling rules

- `lastForegroundAt` is updated when the application starts visibly or returns to the foreground, even if the vault stays locked.
- The first journal reminder is due exactly 72 hours after `lastForegroundAt`; subsequent due dates advance in 72-hour increments.
- The first donation reminder is one calendar month after it is enabled. Subsequent due dates advance by calendar month while preserving the local day and time, clamping to the last valid day when necessary.
- Enabling an already-enabled reminder does not reset its due date.
- Changing locale does not reset either due date.
- Disabling and later re-enabling a reminder starts a new interval.
- System delivery time is best effort; the UI does not promise an exact minute.

## Failure handling

- Permission denied: keep the requested switch off and return `denied`.
- Notifications unsupported: keep both switches off and return `unsupported`.
- Scheduling failure: roll back only the affected switch, cancel its OS identifier, and return a localized generic error state.
- Corrupt settings: replace them with disabled defaults; never block vault startup.
- Duplicate pending identifiers: cancel the owned IDs before scheduling replacements.
- Notification click while the window is not ready: retain the latest route and deliver it after renderer registration.

EncryptMe owns a fixed, documented identifier range so it never calls a blanket API that cancels another plugin's notifications.

## Testing and acceptance

Automated tests cover:

- RU/EN message-set completeness and non-empty variants;
- 72-hour journal calculation and reset on foreground;
- monthly date arithmetic including month-end and leap-year clamping;
- enable, disable, locale-change, permission-denied, corrupt-state and missed-deadline behavior;
- platform-boundary content validation;
- routing `journal` and `donation` actions without unlocking a vault;
- Electron timer chunking and no notification burst after resume;
- TypeScript build, shared tests, Capacitor sync, Android build, iOS archive compile, and Windows installer build.

Manual acceptance on physical devices verifies permission prompts, three-day and monthly schedules using temporary short test delays in development builds, notification text in both languages, lock-screen privacy, tapping each route, reboot persistence, Android permission denial, iOS permission denial, and Windows hidden startup/tray behavior.

The release is versioned as 1.6.0 across package metadata, About, Android, iOS, documentation, and artifact names.
