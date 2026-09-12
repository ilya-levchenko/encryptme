# EncryptMe Local Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, localized, device-only journal and monthly support reminders to Windows, iOS, and Android and produce version 1.6.0 builds.

**Architecture:** React owns localized copy and reminder controls; the existing `window.encryptMe` bridge presents one stable interface. Capacitor Local Notifications owns mobile permission and OS schedules, while a dependency-injected Electron scheduler owns desktop persistence, timers, login startup, and notification clicks.

**Tech Stack:** React 19, TypeScript 7, Vitest 4, Electron 43, Capacitor 8, `@capacitor/local-notifications` 8.

**Spec:** `docs/superpowers/specs/2026-09-12-local-reminders-design.md`

## Global Constraints

- Reminder settings remain outside encrypted vaults and are never synchronized or exported.
- Both reminder switches default to off.
- Notification content never includes a username, vault type, entry metadata, diary text, passwords, keys, or wallet address.
- The donation reminder requires explicit opt-in and can be disabled independently.
- Mobile schedules are inexact and require no exact-alarm permission.
- Notification activation never unlocks a vault or opens an external URL automatically.
- Release version is 1.6.0 on package, iOS, Android, About, docs, and artifacts.

---

### Task 1: Pure reminder model and localized content

**Files:**
- Create: `src/reminders.ts`
- Create: `src/reminders.test.ts`
- Modify: `src/i18n.tsx`
- Modify: `src/i18n.test.ts`

**Interfaces:**
- Produces `ReminderRoute`, `ReminderPermission`, `ReminderSettings`, `ReminderContent`, `defaultReminderSettings`, `validateReminderContent`, `addCalendarMonth`, `nextJournalDue`, `advanceMissedDue`, and `reminderContent(language)`.
- Consumed by renderer UI, mobile bridge, and Electron-equivalent tests.

- [ ] **Step 1: Write failing schedule and content tests**

```ts
import { describe, expect, test } from 'vitest';
import { addCalendarMonth, advanceMissedDue, nextJournalDue, reminderContent, validateReminderContent } from './reminders';

describe('local reminders', () => {
  test('journal reminder is due 72 hours after foreground', () => {
    expect(nextJournalDue(new Date('2026-09-12T10:00:00Z')).toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });
  test('calendar month clamps to the last valid day', () => {
    expect(addCalendarMonth(new Date('2028-01-31T19:00:00Z')).toISOString()).toBe('2028-02-29T19:00:00.000Z');
  });
  test('missed intervals advance without a burst', () => {
    expect(advanceMissedDue(new Date('2026-09-01T10:00:00Z'), new Date('2026-09-12T10:01:00Z'), 72 * 60 * 60 * 1000).toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });
  test.each(['ru', 'en'] as const)('%s has private message variants', language => {
    const content = reminderContent(language);
    expect(content.journalBodies.length).toBeGreaterThanOrEqual(6);
    expect(content.donationBodies.length).toBeGreaterThanOrEqual(6);
    expect(validateReminderContent(content)).toEqual(content);
    expect(JSON.stringify(content)).not.toMatch(/TL7Qu|password|парол|запис[ьи]:/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/reminders.test.ts`

Expected: FAIL because `src/reminders.ts` does not exist.

- [ ] **Step 3: Implement the pure model and message sets**

Define 72-hour and month calculations using local calendar fields for monthly reminders. Validate the title and each 1–12-item message list, rejecting blank or over-240-character values. Export six journal and six donation bodies per language. Add RU/EN settings labels, consent copy, permission errors, and accessibility labels to `i18n.tsx`.

- [ ] **Step 4: Extend dictionary parity tests and verify GREEN**

Run: `npm test -- src/reminders.test.ts src/i18n.test.ts`

Expected: PASS with both dictionaries exposing identical keys.

- [ ] **Step 5: Commit**

```bash
git add src/reminders.ts src/reminders.test.ts src/i18n.tsx src/i18n.test.ts
git commit -m "feat: define localized reminder schedules"
```

### Task 2: Mobile scheduling bridge

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `capacitor.config.json`
- Create: `src/platform/mobile-reminders.ts`
- Create: `src/platform/mobile-reminders.test.ts`
- Modify: `src/platform/mobile.ts`
- Modify: `src/vite-env.d.ts`
- Modify generated native dependency files through `npx cap sync ios android`

**Interfaces:**
- Consumes shared types and schedule helpers from `src/reminders.ts`.
- Produces `createMobileReminderController(dependencies)` and implements all four reminder bridge methods.

- [ ] **Step 1: Write failing controller tests with injected notification and storage adapters**

Cover disabled defaults, permission denial leaving the switch off, enabling each schedule, disabling owned IDs only, foreground resetting journal only, locale rescheduling without changing due dates, corrupt storage fallback, and queued click delivery. Assert journal scheduling uses `isExactNotification: false`, repeats after 72 hours, and carries only `{ route: 'journal' }`; assert donation carries only `{ route: 'donation' }`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/platform/mobile-reminders.test.ts`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Install and implement**

Run: `npm install @capacitor/local-notifications@^8.3.0`

Implement an injected controller over `LocalNotifications`, local storage, clock, and random selection. Use fixed IDs `16001` for journal and `16002` for donation, channel `encryptme_reminders`, private visibility, normal importance, `autoCancel: true`, and no badge. Register the native action listener once and queue one pending route.

- [ ] **Step 4: Wire the mobile bridge and Capacitor configuration**

Add the typed bridge methods to `src/vite-env.d.ts`; create the controller once in `createMobileBridge`; call its foreground handler from Capacitor `appStateChange`; configure Android icon color `#67A9FF` and iOS presentation options `sound`, `banner`, and `list`.

- [ ] **Step 5: Run tests, build, and sync native projects**

Run: `npm test -- src/platform/mobile-reminders.test.ts src/reminders.test.ts`

Run: `npm run build`

Run: `npx cap sync ios android`

Expected: all commands exit 0 and native package manifests include Capacitor Local Notifications.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json capacitor.config.json src/platform/mobile-reminders.ts src/platform/mobile-reminders.test.ts src/platform/mobile.ts src/vite-env.d.ts ios android
git commit -m "feat: schedule local reminders on mobile"
```

### Task 3: Electron reminder service and bridge

**Files:**
- Create: `electron/reminders.mjs`
- Create: `electron/reminders.test.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`

**Interfaces:**
- Consumes renderer-supplied validated `ReminderContent`.
- Produces `createReminderService({ readState, writeState, notify, setLoginStartup, clock, setTimer, clearTimer })` plus IPC handlers matching `window.encryptMe`.

- [ ] **Step 1: Write failing service tests**

Use temporary directories and fake clock/timers. Cover disabled defaults, atomic persistence, enable/disable, 72-hour reset, month-end clamping, permission unsupported, timer chunking to at most `2_147_000_000` milliseconds, one catch-up notification after resume, no missed-notification burst, language updates preserving due dates, and journal/donation click routes.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- electron/reminders.test.mjs`

Expected: FAIL because `electron/reminders.mjs` does not exist.

- [ ] **Step 3: Implement the service**

Keep filesystem and Electron dependencies behind injected functions. Persist `reminders.json` in `app.getPath('userData')`, use fixed logical notification IDs, retain active `Notification` objects until close/click, and advance recurring due dates before persisting. Validate all renderer input before storage.

- [ ] **Step 4: Integrate Electron runtime**

Import `Notification` and `powerMonitor`; call `app.setAppUserModelId('com.encryptme.diary')`; add `--hidden` startup behavior; update login startup only in packaged builds; refresh timers on `resume`; focus the window and send `app:reminder-action` on click. Add IPC handlers `reminders:get`, `reminders:set`, and `reminders:foreground`, and preload callback cleanup.

- [ ] **Step 5: Run Electron tests and full shared tests**

Run: `npm test -- electron/reminders.test.mjs`

Run: `npm test`

Expected: PASS with no unhandled timer handles.

- [ ] **Step 6: Commit**

```bash
git add electron/reminders.mjs electron/reminders.test.mjs electron/main.mjs electron/preload.cjs
git commit -m "feat: add persistent desktop reminders"
```

### Task 4: React reminder settings and activation routing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/reminder-settings.test.ts`

**Interfaces:**
- Consumes the typed `window.encryptMe` reminder bridge and `reminderContent(language)`.
- Produces the settings controls and notification activation routing.

- [ ] **Step 1: Write failing UI-state helper tests**

Extract a pure `applyReminderPreferenceResult` helper and test that denial rolls back only the requested switch, successful changes preserve the other switch, and unsupported platforms disable both controls.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/reminder-settings.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement reminder settings UI**

Load settings once, register `onReminderAction`, and call `markAppForeground` on visible startup. Add two animated accessible switch buttons. On toggle, send the full desired state and localized content; render returned state instead of optimistic state. Show denial/unsupported/scheduling errors without affecting vault saves.

- [ ] **Step 4: Implement activation routes**

For `journal`, focus normal authentication/diary flow without changing session state. For `donation`, set a pending route; once the diary is unlocked, open Settings and scroll the donation block using a ref. Never call `openExternal` from notification activation.

- [ ] **Step 5: Style and verify**

Add compact blue glass switch rows, a native-looking toggle, denied state, reduced-motion compatibility, and mobile wrapping. Run:

`npm test -- src/reminder-settings.test.ts src/reminders.test.ts src/i18n.test.ts`

`npm run build`

Expected: tests and production TypeScript/Vite build pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/styles.css src/reminder-settings.test.ts
git commit -m "feat: add reminder controls and routes"
```

### Task 5: Version, documentation, and release verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/i18n.tsx`
- Modify: `android/app/build.gradle`
- Modify: `ios/App/App.xcodeproj/project.pbxproj`
- Modify: `README.md`
- Modify: `README.ru.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/android.md`
- Modify: `docs/ios.md`
- Modify: `docs/storage.md`

**Interfaces:**
- Produces consistent 1.6.0 metadata and documented behavior.

- [ ] **Step 1: Add a failing version-consistency test**

Extend the existing test suite with `src/version.test.ts` that reads package, Android, iOS and `APP_VERSION` sources and expects `1.6.0` everywhere.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/version.test.ts`

Expected: FAIL because current metadata is 1.5.0.

- [ ] **Step 3: Update metadata and documentation**

Set version/name fields to 1.6.0, document opt-in behavior, local storage, Windows start-at-login behavior, platform permission recovery, no-server architecture, and App Store promotional-consent rationale. Add a dated changelog entry.

- [ ] **Step 4: Run complete verification**

Run: `npm run check`

Run: `npm run build:android`

Run: `npm run dist:win`

Run: `git diff --check`

Expected: all exit 0; Android debug APK and Windows NSIS installer are produced with 1.6.0 artifact names. iOS compile remains covered by GitHub Actions on macOS; locally confirm `npx cap sync ios` exits 0 and the Xcode project references Local Notifications.

- [ ] **Step 5: Copy user-facing artifacts**

Copy the Windows installer to `W:\Endiar\EncryptMe Setup 1.6.0.exe` and the Android debug APK to `W:\Endiar\release\EncryptMe-Android-1.6.0-debug.apk`, preserving electron-builder's release outputs.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/i18n.tsx android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj README.md README.ru.md CHANGELOG.md docs/android.md docs/ios.md docs/storage.md src/version.test.ts
git commit -m "release: prepare EncryptMe 1.6.0"
```
