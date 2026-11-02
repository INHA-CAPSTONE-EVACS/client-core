import type { ClientStatus, EmergencyRouteUpdated, LocationSource, Unsubscribe, VehicleProfile, WsTransport, YieldAlertIssued } from './contracts.js';
export interface ClientRuntimeOptions {
    profile: VehicleProfile;
    locationSource: LocationSource;
    transport: WsTransport;
    intervalMs?: number;
    onError?: (error: unknown) => void;
    now?: () => number;
}
export declare class ClientRuntime {
    private readonly options;
    private readonly ws;
    private readonly reporter;
    private readonly alerts;
    private readonly internal;
    private locationSubscription?;
    private expiryTimer?;
    private running;
    constructor(options: ClientRuntimeOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    onAlert(callback: (alert: YieldAlertIssued | null, alertId: string) => void): Unsubscribe;
    onRoute(callback: (route: EmergencyRouteUpdated) => void): Unsubscribe;
    onStatusChange(callback: (status: ClientStatus) => void): Unsubscribe;
    getStatus(): ClientStatus;
    dispose(): Promise<void>;
}
