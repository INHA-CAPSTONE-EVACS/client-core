import type { EmergencyRouteUpdated, Unsubscribe, YieldAlertCleared, YieldAlertIssued } from './contracts.js';
export declare class AlertHandler {
    private readonly acknowledge;
    private readonly onError;
    private readonly now;
    private readonly active;
    private readonly highestVersion;
    private routeVersion;
    private readonly pendingAcks;
    private readonly sendingAcks;
    private readonly alertListeners;
    private readonly routeListeners;
    constructor(acknowledge: (alert: YieldAlertIssued) => Promise<void>, onError?: (error: unknown) => void, now?: () => number);
    onAlert(callback: (alert: YieldAlertIssued | null, alertId: string) => void): Unsubscribe;
    onRoute(callback: (route: EmergencyRouteUpdated) => void): Unsubscribe;
    handleAlert(alert: YieldAlertIssued): void;
    handleCleared(event: YieldAlertCleared): void;
    handleRouteUpdated(route: EmergencyRouteUpdated): void;
    expireStale(now?: number): void;
    flushAcknowledgements(): void;
    private remove;
    clear(): void;
}
