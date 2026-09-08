import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticKind = 'selection' | 'warning' | 'light';

async function pulse(kind: HapticKind) {
  if (Capacitor.isNativePlatform()) {
    if (kind === 'selection') await Haptics.selectionChanged();
    else if (kind === 'warning') await Haptics.notification({ type: NotificationType.Warning });
    else await Haptics.impact({ style: ImpactStyle.Light });
    return;
  }
  navigator.vibrate?.(kind === 'warning' ? 18 : 7);
}

export function installInteractionFeedback() {
  document.addEventListener('click', event => {
    const control = (event.target as Element | null)?.closest<HTMLElement>('button, a, [role="button"]');
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    const kind = (control.dataset.haptic as HapticKind | undefined) || 'light';
    void pulse(kind).catch(() => {});
  }, { capture: true });
}
