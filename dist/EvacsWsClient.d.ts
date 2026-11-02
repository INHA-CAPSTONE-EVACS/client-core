import type { Ack, ClientStatus, LocationUpdateDto, ServerEvent, Unsubscribe, VehicleProfile, WsTransport, YieldAlertAcknowledged } from './contracts.js';
export declare class EvacsWsClient {
    private readonly transport;
    private readonly onError;
    private profile?;
    private status;
    private active;
    private generation;
    private retryCount;
    private retryTimer?;
    private pending?;
    private readonly eventListeners;
    private readonly statusListeners;
    private readonly cleanup;
    constructor(transport: WsTransport, onError?: (error: unknown) => void);
    getStatus(): ClientStatus;
    onEvent(callback: (event: ServerEvent) => void): Unsubscribe;
    onStatusChange(callback: (status: ClientStatus) => void): Unsubscribe;
    connect(profile: VehicleProfile): Promise<void>;
    private setStatus;
    private attemptConnect;
    private scheduleRetry;
    reconnect(): Promise<void>;
    sendLocation(dto: LocationUpdateDto): Promise<Ack>;
    sendAck(dto: YieldAlertAcknowledged): Promise<void>;
    disconnect(): Promise<void>;
    dispose(): Promise<void>;
}
