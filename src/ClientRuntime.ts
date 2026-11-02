import { AlertHandler } from './AlertHandler.js';
import { EvacsWsClient } from './EvacsWsClient.js';
import { LocationReporter } from './LocationReporter.js';
import type { ClientStatus, EmergencyRouteUpdated, LocationSource, Unsubscribe, VehicleProfile, WsTransport, YieldAlertIssued } from './contracts.js';

export interface ClientRuntimeOptions {
  profile: VehicleProfile;
  locationSource: LocationSource;
  transport: WsTransport;
  intervalMs?: number;
  onError?: (error: unknown) => void;
  now?: () => number;
}

export class ClientRuntime {
  private readonly ws: EvacsWsClient;
  private readonly reporter: LocationReporter;
  private readonly alerts: AlertHandler;
  private readonly internal: Unsubscribe[] = [];
  private locationSubscription?: Unsubscribe;
  private expiryTimer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly options: ClientRuntimeOptions) {
    const onError = options.onError ?? (() => {});
    this.ws = new EvacsWsClient(options.transport, onError);
    this.reporter = new LocationReporter(options.profile.vehicleId, dto => this.ws.sendLocation(dto), onError);
    this.alerts = new AlertHandler(alert => this.ws.sendAck({ alertId: alert.alertId, alertVersion: alert.alertVersion, receivedAt: new Date(options.now?.() ?? Date.now()).toISOString() }), onError, options.now);
    this.internal.push(this.ws.onEvent(event => {
      switch (event.type) {
        case 'YIELD_ALERT_ISSUED': this.alerts.handleAlert(event); break;
        case 'YIELD_ALERT_CLEARED': this.alerts.handleCleared(event); break;
        case 'EMERGENCY_ROUTE_UPDATED': this.alerts.handleRouteUpdated(event); break;
      }
    }));
    this.internal.push(this.ws.onStatusChange(status => {
      if (status === 'connected') this.alerts.flushAcknowledgements();
    }));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ws.connect(this.options.profile);
      this.locationSubscription = this.options.locationSource.subscribe(location => this.reporter.handleLocation(location));
      await this.options.locationSource.start();
      this.reporter.start(this.options.intervalMs ?? 1000);
      this.expiryTimer = setInterval(() => this.alerts.expireStale(), 1000);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.reporter.stop();
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = undefined;
    this.locationSubscription?.();
    this.locationSubscription = undefined;
    this.options.locationSource.stop();
    await this.ws.disconnect();
    this.alerts.clear();
  }

  onAlert(callback: (alert: YieldAlertIssued | null, alertId: string) => void): Unsubscribe { return this.alerts.onAlert(callback); }
  onRoute(callback: (route: EmergencyRouteUpdated) => void): Unsubscribe { return this.alerts.onRoute(callback); }
  onStatusChange(callback: (status: ClientStatus) => void): Unsubscribe { return this.ws.onStatusChange(callback); }
  getStatus(): ClientStatus { return this.ws.getStatus(); }

  async dispose(): Promise<void> {
    await this.stop();
    for (const unsubscribe of this.internal) unsubscribe();
    await this.ws.dispose();
  }
}
