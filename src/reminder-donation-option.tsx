import { Check } from 'lucide-react';

type Props = {
  platform: Window['encryptMe']['platform'];
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  title: string;
  description: string;
  alwaysOn: string;
  onToggle(): void;
};

export function ReminderDonationOption({ platform, checked, disabled, busy, title, description, alwaysOn, onToggle }: Props) {
  if (platform !== 'ios') return <div className="reminder-fixed" data-reminder-fixed="true"><span><strong>{title}</strong><small>{description}</small></span><em>{alwaysOn}</em></div>;
  return <button className="reminder-consent" type="button" role="checkbox" aria-checked={checked} disabled={busy || disabled} data-haptic="selection" onClick={onToggle}>
    <span><strong>{title}</strong><small>{description}</small></span><i className={checked ? 'on' : ''}><Check size={13}/></i>
  </button>;
}
