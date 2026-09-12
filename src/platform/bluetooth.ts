import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type BluetoothPeer = { id: string; alias: string; rssi: number };
export type BluetoothProgress = { phase: 'waiting' | 'connecting' | 'sending' | 'receiving' | 'complete' | 'error'; completed: number; total: number; error?: string };

type BluetoothSyncPlugin = {
  startHost(options: { payload: string; alias: string }): Promise<{ alias: string; expiresAt: string }>;
  scan(): Promise<{ peers: BluetoothPeer[] }>;
  connect(options: { deviceId: string; payload: string }): Promise<{ payload: string }>;
  stop(): Promise<void>;
  requestPermissions(): Promise<Record<string, string>>;
  addListener(eventName: 'hostExchange', callback: (event: { payload: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'progress', callback: (event: BluetoothProgress) => void): Promise<PluginListenerHandle>;
};

export const BluetoothSync = registerPlugin<BluetoothSyncPlugin>('BluetoothSync');
