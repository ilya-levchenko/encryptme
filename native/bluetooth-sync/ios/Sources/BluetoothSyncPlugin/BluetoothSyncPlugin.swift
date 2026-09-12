import Foundation
import CoreBluetooth
import Capacitor

private let serviceUUID = CBUUID(string: "65F00001-5F96-4C2B-A1AA-7D5B9E178501")
private let characteristicUUID = CBUUID(string: "65F00002-5F96-4C2B-A1AA-7D5B9E178501")

@objc(BluetoothSyncPlugin)
public final class BluetoothSyncPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate, CBPeripheralManagerDelegate {
    public let identifier = "BluetoothSyncPlugin"
    public let jsName = "BluetoothSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private var discovered: [UUID: (CBPeripheral, Int, String)] = [:]
    private var characteristic: CBMutableCharacteristic?
    private var connectedPeripheral: CBPeripheral?
    private var remoteCharacteristic: CBCharacteristic?
    private var connectCall: CAPPluginCall?
    private var hostPayload = Data()
    private var clientPayload = Data()
    private var hostAlias = ""
    private var incoming: [UInt32: Data] = [:]
    private var incomingTotal: UInt32 = 0
    private var outgoing: [Data] = []
    private var outgoingIndex = 0
    private var timeoutTimer: Timer?
    private var acceptedCentral: CBCentral?

    @objc func startHost(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), let alias = call.getString("alias") else {
            call.reject("BLE_INVALID_PAYLOAD"); return
        }
        stopEverything(rejectPending: false)
        hostPayload = Data(payload.utf8)
        hostAlias = String(alias.prefix(8))
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
        timeoutTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: false) { [weak self] _ in self?.stopEverything(rejectPending: true) }
        call.resolve(["alias": hostAlias, "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(300))])
    }

    @objc func scan(_ call: CAPPluginCall) {
        discovered.removeAll()
        centralManager = CBCentralManager(delegate: self, queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self, weak call] in
            guard let self, let call else { return }
            self.centralManager?.stopScan()
            let peers: [[String: Any]] = self.discovered.map { id, value in
                ["id": id.uuidString, "rssi": value.1, "alias": value.2]
            }.sorted { ($0["rssi"] as? Int ?? -999) > ($1["rssi"] as? Int ?? -999) }
            call.resolve(["peers": peers])
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let rawId = call.getString("deviceId"), let id = UUID(uuidString: rawId), let payload = call.getString("payload"), let peer = discovered[id]?.0 else {
            call.reject("BLE_PEER_NOT_FOUND"); return
        }
        clientPayload = Data(payload.utf8)
        connectCall = call
        connectedPeripheral = peer
        peer.delegate = self
        centralManager?.connect(peer)
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopEverything(rejectPending: true)
        call.resolve()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard central.state == .poweredOn else {
            if central.state == .unauthorized { connectCall?.reject("BLE_PERMISSION_DENIED"); connectCall = nil }
            return
        }
        central.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let manufacturer = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
        let alias = manufacturer.flatMap { value in value.count > 2 ? String(data: Data(value.dropFirst(2)), encoding: .utf8) : nil } ?? "Nearby"
        discovered[peripheral.identifier] = (peripheral, RSSI.intValue, alias)
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        notifyProgress("connecting", 0, 1)
        peripheral.discoverServices([serviceUUID])
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectCall?.reject(error?.localizedDescription ?? "BLE_CONNECTION_FAILED")
        connectCall = nil
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if let call = connectCall { call.reject(error?.localizedDescription ?? "BLE_DISCONNECTED"); connectCall = nil }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else { connectCall?.reject("BLE_SERVICE_NOT_FOUND"); connectCall = nil; return }
        peripheral.discoverCharacteristics([characteristicUUID], for: service)
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let remote = service.characteristics?.first(where: { $0.uuid == characteristicUUID }) else { connectCall?.reject("BLE_CHARACTERISTIC_NOT_FOUND"); connectCall = nil; return }
        remoteCharacteristic = remote
        peripheral.setNotifyValue(true, for: remote)
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.isNotifying else { connectCall?.reject("BLE_SUBSCRIBE_FAILED"); connectCall = nil; return }
        let mtu = max(20, peripheral.maximumWriteValueLength(for: .withResponse))
        outgoing = makeFrames(clientPayload, maximumLength: mtu)
        outgoingIndex = 0
        incoming.removeAll(); incomingTotal = 0
        sendNextClientFrame()
    }

    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error { connectCall?.reject(error.localizedDescription); connectCall = nil; return }
        outgoingIndex += 1
        notifyProgress("sending", outgoingIndex, outgoing.count)
        sendNextClientFrame()
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let value = characteristic.value else { return }
        if let complete = acceptFrame(value) {
            guard let string = String(data: complete, encoding: .utf8) else { connectCall?.reject("BLE_INVALID_PAYLOAD"); connectCall = nil; return }
            connectCall?.resolve(["payload": string])
            connectCall = nil
            notifyProgress("complete", 1, 1)
            stopEverything(rejectPending: false)
        }
    }

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral.state == .poweredOn else { return }
        let value = CBMutableCharacteristic(type: characteristicUUID, properties: [.write, .notify], value: nil, permissions: [.writeable])
        characteristic = value
        peripheral.add(CBMutableService(type: serviceUUID, primary: true).configured(with: value))
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        guard error == nil else { return }
        var manufacturer = Data([0xFF, 0xFF]); manufacturer.append(Data(hostAlias.prefix(5).utf8))
        peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [serviceUUID], CBAdvertisementDataManufacturerDataKey: manufacturer])
        notifyProgress("waiting", 0, 1)
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        guard acceptedCentral == nil || acceptedCentral?.identifier == central.identifier else { return }
        acceptedCentral = central
        incoming.removeAll(); incomingTotal = 0
        notifyProgress("receiving", 0, 1)
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            guard request.characteristic.uuid == characteristicUUID, let value = request.value else { peripheral.respond(to: request, withResult: .requestNotSupported); continue }
            peripheral.respond(to: request, withResult: .success)
            if let complete = acceptFrame(value) {
                guard let string = String(data: complete, encoding: .utf8), let central = acceptedCentral else { continue }
                notifyListeners("hostExchange", data: ["payload": string])
                outgoing = makeFrames(hostPayload, maximumLength: max(20, central.maximumUpdateValueLength))
                outgoingIndex = 0
                sendHostFrames()
            }
        }
    }

    public func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) { sendHostFrames() }

    private func sendNextClientFrame() {
        guard outgoingIndex < outgoing.count, let peripheral = connectedPeripheral, let characteristic = remoteCharacteristic else { return }
        peripheral.writeValue(outgoing[outgoingIndex], for: characteristic, type: .withResponse)
    }

    private func sendHostFrames() {
        guard let manager = peripheralManager, let characteristic else { return }
        while outgoingIndex < outgoing.count {
            if !manager.updateValue(outgoing[outgoingIndex], for: characteristic, onSubscribedCentrals: acceptedCentral.map { [$0] }) { return }
            outgoingIndex += 1
            notifyProgress("sending", outgoingIndex, outgoing.count)
        }
        notifyProgress("complete", 1, 1)
        manager.stopAdvertising()
    }

    private func makeFrames(_ data: Data, maximumLength: Int) -> [Data] {
        let payloadSize = max(1, maximumLength - 8)
        let count = max(1, Int(ceil(Double(data.count) / Double(payloadSize))))
        return (0..<count).map { index in
            var frame = Data()
            frame.appendUInt32(UInt32(index)); frame.appendUInt32(UInt32(count))
            let start = min(index * payloadSize, data.count), end = min(start + payloadSize, data.count)
            if start < end { frame.append(data.subdata(in: start..<end)) }
            return frame
        }
    }

    private func acceptFrame(_ frame: Data) -> Data? {
        guard frame.count >= 8, let sequence = frame.uint32(at: 0), let total = frame.uint32(at: 4), total > 0, sequence < total else { return nil }
        if incomingTotal != 0 && incomingTotal != total { incoming.removeAll() }
        incomingTotal = total
        incoming[sequence] = frame.subdata(in: 8..<frame.count)
        notifyProgress("receiving", incoming.count, Int(total))
        guard incoming.count == Int(total) else { return nil }
        var complete = Data()
        for index in 0..<total { guard let chunk = incoming[index] else { return nil }; complete.append(chunk) }
        incoming.removeAll(); incomingTotal = 0
        return complete
    }

    private func notifyProgress(_ phase: String, _ completed: Int, _ total: Int) {
        notifyListeners("progress", data: ["phase": phase, "completed": completed, "total": total])
    }

    private func stopEverything(rejectPending: Bool) {
        timeoutTimer?.invalidate(); timeoutTimer = nil
        centralManager?.stopScan()
        if let peer = connectedPeripheral { centralManager?.cancelPeripheralConnection(peer) }
        peripheralManager?.stopAdvertising(); peripheralManager?.removeAllServices()
        if rejectPending { connectCall?.reject("BLE_CANCELLED") }
        connectCall = nil; connectedPeripheral = nil; remoteCharacteristic = nil; acceptedCentral = nil
        incoming.removeAll(); outgoing.removeAll(); outgoingIndex = 0
    }
}

private extension CBMutableService {
    func configured(with characteristic: CBMutableCharacteristic) -> CBMutableService { characteristics = [characteristic]; return self }
}

private extension Data {
    mutating func appendUInt32(_ value: UInt32) {
        var big = value.bigEndian
        append(Data(bytes: &big, count: MemoryLayout<UInt32>.size))
    }
    func uint32(at offset: Int) -> UInt32? {
        guard count >= offset + 4 else { return nil }
        return subdata(in: offset..<(offset + 4)).withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return nil }
            return UInt32(bigEndian: base.loadUnaligned(as: UInt32.self))
        }
    }
}
