import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './i18n';

const root = new URL('../', import.meta.url);

describe('release version metadata', () => {
  it('uses version 1.6.1 on every platform', () => {
    const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
    const android = readFileSync(new URL('android/app/build.gradle', root), 'utf8');
    const ios = readFileSync(new URL('ios/App/App.xcodeproj/project.pbxproj', root), 'utf8');

    expect(packageJson.version).toBe('1.6.1');
    expect(APP_VERSION).toBe('1.6.1');
    expect(android).toMatch(/versionName\s+"1\.6\.1"/);
    expect(ios.match(/MARKETING_VERSION = 1\.6\.1;/g)).toHaveLength(2);
  });
});
