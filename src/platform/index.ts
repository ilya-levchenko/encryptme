import { createMobileBridge } from './mobile';

export function installPlatformBridge() {
  if (!window.encryptMe) window.encryptMe = createMobileBridge();
}
