import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { ReminderDonationOption } from './reminder-donation-option';

const common = {
  checked: false,
  disabled: false,
  busy: false,
  title: 'Monthly support reminder',
  description: 'Once a month.',
  alwaysOn: 'Enabled by default.',
  onToggle: vi.fn()
};

describe('donation reminder platform control', () => {
  test('iOS renders an explicit consent checkbox', () => {
    const html = renderToStaticMarkup(<ReminderDonationOption {...common} platform="ios" />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('type="button"');
  });

  test.each(['android', 'desktop', 'web'] as const)('%s renders a fixed default-on status without a control', platform => {
    const html = renderToStaticMarkup(<ReminderDonationOption {...common} platform={platform} checked />);
    expect(html).toContain('data-reminder-fixed="true"');
    expect(html).toContain('Enabled by default.');
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain('<button');
  });
});
