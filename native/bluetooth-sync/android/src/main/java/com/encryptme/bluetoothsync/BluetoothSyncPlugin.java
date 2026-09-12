package com.encryptme.bluetoothsync;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "BluetoothSync", permissions = {
    @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth"),
    @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
})
@SuppressLint("MissingPermission") // Every public operation gates on Capacitor's runtime permission state.
public class BluetoothSyncPlugin extends Plugin {
    private static final UUID SERVICE_UUID = UUID.fromString("65f00001-5f96-4c2b-a1aa-7d5b9e178501");
    private static final UUID CHARACTERISTIC_UUID = UUID.fromString("65f00002-5f96-4c2b-a1aa-7d5b9e178501");
    private static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final ParcelUuid SERVICE_PARCEL = new ParcelUuid(SERVICE_UUID);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<Integer, byte[]> incoming = new HashMap<>();
    private int incomingTotal;
    private BluetoothManager manager;
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattServer server;
    private BluetoothGattCharacteristic serverCharacteristic;
    private BluetoothDevice acceptedDevice;
    private BluetoothGatt clientGatt;
    private BluetoothGattCharacteristic remoteCharacteristic;
    private PluginCall connectCall;
    private byte[] hostPayload = new byte[0];
    private byte[] clientPayload = new byte[0];
    private List<byte[]> outgoing = List.of();
    private int outgoingIndex;
    private int clientWriteLength = 20;

    @Override public void load() {
        manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
    }

    @PluginMethod public void startHost(PluginCall call) {
        if (!permissionsReady(call)) return;
        String payload = call.getString("payload"), alias = call.getString("alias");
        if (payload == null || alias == null || adapter == null || !adapter.isEnabled()) { call.reject("BLE_UNAVAILABLE"); return; }
        stopInternal(false);
        hostPayload = payload.getBytes(StandardCharsets.UTF_8);
        server = manager.openGattServer(getContext(), serverCallback);
        serverCharacteristic = new BluetoothGattCharacteristic(CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_WRITE);
        BluetoothGattDescriptor descriptor = new BluetoothGattDescriptor(CCCD_UUID, BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE);
        serverCharacteristic.addDescriptor(descriptor);
        BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        service.addCharacteristic(serverCharacteristic);
        server.addService(service);
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) { call.reject("BLE_ADVERTISE_UNAVAILABLE"); stopInternal(false); return; }
        AdvertiseSettings settings = new AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY).setConnectable(true).setTimeout(300_000).build();
        AdvertiseData data = new AdvertiseData.Builder().addServiceUuid(SERVICE_PARCEL).addManufacturerData(0xFFFF, alias.substring(0, Math.min(5, alias.length())).getBytes(StandardCharsets.UTF_8)).setIncludeDeviceName(false).build();
        advertiser.startAdvertising(settings, data, advertiseCallback);
        handler.postDelayed(() -> stopInternal(true), 300_000);
        JSObject result = new JSObject(); result.put("alias", alias); result.put("expiresAt", Instant.now().plusSeconds(300).toString()); call.resolve(result);
        notifyProgress("waiting", 0, 1);
    }

    @PluginMethod public void scan(PluginCall call) {
        if (!permissionsReady(call)) return;
        if (adapter == null || !adapter.isEnabled()) { call.reject("BLE_UNAVAILABLE"); return; }
        peers.clear(); scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { call.reject("BLE_SCAN_UNAVAILABLE"); return; }
        scanner.startScan(List.of(new ScanFilter.Builder().setServiceUuid(SERVICE_PARCEL).build()), new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback);
        handler.postDelayed(() -> {
            try { scanner.stopScan(scanCallback); } catch (SecurityException ignored) {}
            List<Peer> ordered = new ArrayList<>(peers.values()); ordered.sort(Comparator.comparingInt((Peer peer) -> peer.rssi).reversed());
            JSArray list = new JSArray();
            for (Peer peer : ordered) { JSObject item = new JSObject(); item.put("id", peer.device.getAddress()); item.put("alias", peer.alias); item.put("rssi", peer.rssi); list.put(item); }
            JSObject result = new JSObject(); result.put("peers", list); call.resolve(result);
        }, 4000);
    }

    @PluginMethod public void connect(PluginCall call) {
        if (!permissionsReady(call)) return;
        String id = call.getString("deviceId"), payload = call.getString("payload");
        Peer peer = id == null ? null : peers.get(id);
        if (peer == null || payload == null) { call.reject("BLE_PEER_NOT_FOUND"); return; }
        clientPayload = payload.getBytes(StandardCharsets.UTF_8); connectCall = call;
        clientGatt = peer.device.connectGatt(getContext(), false, clientCallback, BluetoothDevice.TRANSPORT_LE);
    }

    @PluginMethod public void stop(PluginCall call) { stopInternal(true); call.resolve(); }

    private boolean permissionsReady(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("BLE_PERMISSION_DENIED"); return false;
        }
        if (android.os.Build.VERSION.SDK_INT <= 30 && getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("BLE_PERMISSION_DENIED"); return false;
        }
        return true;
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override public void onStartFailure(int errorCode) { notifyError("BLE_ADVERTISE_FAILED_" + errorCode); }
    };

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            byte[] serviceData = result.getScanRecord() == null ? null : result.getScanRecord().getManufacturerSpecificData(0xFFFF);
            String alias = serviceData == null ? "Nearby" : new String(serviceData, StandardCharsets.UTF_8);
            peers.put(result.getDevice().getAddress(), new Peer(result.getDevice(), result.getRssi(), alias));
        }
    };

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED && (acceptedDevice == null || acceptedDevice.equals(device))) acceptedDevice = device;
            if (newState == BluetoothProfile.STATE_DISCONNECTED && device.equals(acceptedDevice)) acceptedDevice = null;
        }
        @Override public void onDescriptorWriteRequest(BluetoothDevice device, int requestId, BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, value);
        }
        @Override public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            if (acceptedDevice != null && !acceptedDevice.equals(device)) { if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null); return; }
            acceptedDevice = device;
            if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, value);
            byte[] complete = acceptFrame(value);
            if (complete != null) {
                JSObject event = new JSObject(); event.put("payload", new String(complete, StandardCharsets.UTF_8)); notifyListeners("hostExchange", event);
                outgoing = makeFrames(hostPayload, 180); outgoingIndex = 0; sendNextServerFrame();
            }
        }
        @Override public void onNotificationSent(BluetoothDevice device, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) { notifyError("BLE_SEND_FAILED"); return; }
            outgoingIndex++; notifyProgress("sending", outgoingIndex, outgoing.size()); sendNextServerFrame();
        }
    };

    private final BluetoothGattCallback clientCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) { rejectConnect("BLE_CONNECTION_FAILED"); return; }
            if (newState == BluetoothProfile.STATE_CONNECTED) { notifyProgress("connecting", 0, 1); gatt.requestMtu(247); gatt.discoverServices(); }
        }
        @Override public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) { if (status == BluetoothGatt.GATT_SUCCESS) clientWriteLength = Math.max(20, mtu - 3); }
        @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            BluetoothGattService service = gatt.getService(SERVICE_UUID); remoteCharacteristic = service == null ? null : service.getCharacteristic(CHARACTERISTIC_UUID);
            if (remoteCharacteristic == null) { rejectConnect("BLE_SERVICE_NOT_FOUND"); return; }
            gatt.setCharacteristicNotification(remoteCharacteristic, true);
            BluetoothGattDescriptor descriptor = remoteCharacteristic.getDescriptor(CCCD_UUID);
            if (descriptor == null) { rejectConnect("BLE_SUBSCRIBE_FAILED"); return; }
            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); gatt.writeDescriptor(descriptor);
        }
        @Override public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) { rejectConnect("BLE_SUBSCRIBE_FAILED"); return; }
            outgoing = makeFrames(clientPayload, clientWriteLength); outgoingIndex = 0; clearIncoming(); sendNextClientFrame();
        }
        @Override public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) { rejectConnect("BLE_SEND_FAILED"); return; }
            outgoingIndex++; notifyProgress("sending", outgoingIndex, outgoing.size()); sendNextClientFrame();
        }
        @Override public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) { receiveClient(value); }
        @Override public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) { receiveClient(characteristic.getValue()); }
    };

    private void receiveClient(byte[] value) {
        byte[] complete = acceptFrame(value);
        if (complete != null && connectCall != null) {
            JSObject result = new JSObject(); result.put("payload", new String(complete, StandardCharsets.UTF_8)); connectCall.resolve(result); connectCall = null;
            notifyProgress("complete", 1, 1); stopInternal(false);
        }
    }

    private void sendNextClientFrame() {
        if (clientGatt == null || remoteCharacteristic == null || outgoingIndex >= outgoing.size()) return;
        remoteCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT); remoteCharacteristic.setValue(outgoing.get(outgoingIndex)); clientGatt.writeCharacteristic(remoteCharacteristic);
    }

    private void sendNextServerFrame() {
        if (server == null || serverCharacteristic == null || acceptedDevice == null || outgoingIndex >= outgoing.size()) { if (outgoingIndex >= outgoing.size()) notifyProgress("complete", 1, 1); return; }
        serverCharacteristic.setValue(outgoing.get(outgoingIndex)); server.notifyCharacteristicChanged(acceptedDevice, serverCharacteristic, false);
    }

    private List<byte[]> makeFrames(byte[] data, int maximum) {
        int chunk = Math.max(1, maximum - 8), count = Math.max(1, (int) Math.ceil((double) data.length / chunk));
        List<byte[]> frames = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            int start = Math.min(i * chunk, data.length), end = Math.min(start + chunk, data.length);
            ByteBuffer frame = ByteBuffer.allocate(8 + end - start).order(ByteOrder.BIG_ENDIAN); frame.putInt(i).putInt(count).put(data, start, end - start); frames.add(frame.array());
        }
        return frames;
    }

    private synchronized byte[] acceptFrame(byte[] frame) {
        if (frame == null || frame.length < 8) return null;
        ByteBuffer buffer = ByteBuffer.wrap(frame).order(ByteOrder.BIG_ENDIAN); int sequence = buffer.getInt(), total = buffer.getInt();
        if (total <= 0 || sequence < 0 || sequence >= total) return null;
        if (incomingTotal != 0 && incomingTotal != total) clearIncoming(); incomingTotal = total;
        byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); incoming.put(sequence, chunk); notifyProgress("receiving", incoming.size(), total);
        if (incoming.size() != total) return null;
        ByteArrayOutputStream complete = new ByteArrayOutputStream();
        for (int i = 0; i < total; i++) { byte[] part = incoming.get(i); if (part == null) return null; complete.write(part, 0, part.length); }
        clearIncoming(); return complete.toByteArray();
    }

    private void clearIncoming() { incoming.clear(); incomingTotal = 0; }
    private void notifyProgress(String phase, int completed, int total) { JSObject event = new JSObject(); event.put("phase", phase); event.put("completed", completed); event.put("total", total); notifyListeners("progress", event); }
    private void notifyError(String code) { JSObject event = new JSObject(); event.put("phase", "error"); event.put("error", code); notifyListeners("progress", event); }
    private void rejectConnect(String code) { if (connectCall != null) { connectCall.reject(code); connectCall = null; } stopInternal(false); }

    private void stopInternal(boolean reject) {
        handler.removeCallbacksAndMessages(null);
        try { if (scanner != null) scanner.stopScan(scanCallback); } catch (Exception ignored) {}
        try { if (advertiser != null) advertiser.stopAdvertising(advertiseCallback); } catch (Exception ignored) {}
        try { if (clientGatt != null) clientGatt.close(); } catch (Exception ignored) {}
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        if (reject && connectCall != null) connectCall.reject("BLE_CANCELLED");
        connectCall = null; scanner = null; advertiser = null; clientGatt = null; server = null; acceptedDevice = null; remoteCharacteristic = null; clearIncoming(); outgoing = List.of(); outgoingIndex = 0; clientWriteLength = 20;
    }

    private record Peer(BluetoothDevice device, int rssi, String alias) {}
}
