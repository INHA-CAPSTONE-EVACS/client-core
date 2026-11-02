import type { EmergencyRouteUpdated, Unsubscribe, YieldAlertCleared, YieldAlertIssued } from './contracts.js';

export class AlertHandler {
  private readonly active = new Map<string, YieldAlertIssued>();
  private readonly highestVersion = new Map<string, number>();
  private routeVersion = -Infinity;
  private readonly pendingAcks = new Map<string, YieldAlertIssued>();
  private readonly sendingAcks = new Set<string>();
  private readonly alertListeners = new Set<(alert: YieldAlertIssued | null, alertId: string) => void>();
  private readonly routeListeners = new Set<(route: EmergencyRouteUpdated) => void>();

  constructor(private readonly acknowledge: (alert: YieldAlertIssued) => Promise<void>, private readonly onError: (error: unknown) => void = () => {}, private readonly now: () => number = Date.now) {}

  onAlert(callback: (alert: YieldAlertIssued | null, alertId: string) => void): Unsubscribe {
    this.alertListeners.add(callback);
    return () => { this.alertListeners.delete(callback); };
  }

  onRoute(callback: (route: EmergencyRouteUpdated) => void): Unsubscribe {
    this.routeListeners.add(callback);
    return () => { this.routeListeners.delete(callback); };
  }

  handleAlert(alert: YieldAlertIssued): void {
    // A receipt is acknowledged even for duplicate deliveries.
    this.pendingAcks.set(`${alert.alertId}:${alert.alertVersion}`, alert);
    this.flushAcknowledgements();
    if (!Number.isFinite(alert.alertVersion) || !Number.isFinite(Date.parse(alert.expiresAt))) return;
    if (alert.alertVersion <= (this.highestVersion.get(alert.alertId) ?? -Infinity)) return;
    this.highestVersion.set(alert.alertId, alert.alertVersion);
    if (Date.parse(alert.expiresAt) <= this.now()) { this.remove(alert.alertId); return; }
    this.active.set(alert.alertId, alert);
    for (const listener of this.alertListeners) listener(alert, alert.alertId);
  }

  handleCleared(event: YieldAlertCleared): void { this.remove(event.alertId); }

  handleRouteUpdated(route: EmergencyRouteUpdated): void {
    if (!Number.isFinite(route.routeVersion) || route.routeVersion <= this.routeVersion) return;
    this.routeVersion = route.routeVersion;
    for (const listener of this.routeListeners) listener(route);
  }

  expireStale(now = this.now()): void {
    for (const [id, alert] of this.active) if (Date.parse(alert.expiresAt) <= now) this.remove(id);
  }

  flushAcknowledgements(): void {
    for (const [key, alert] of this.pendingAcks) {
      if (this.sendingAcks.has(key)) continue;
      this.sendingAcks.add(key);
      void this.acknowledge(alert).then(() => {
        if (this.pendingAcks.get(key) === alert) this.pendingAcks.delete(key);
      }).catch(this.onError).finally(() => {
        this.sendingAcks.delete(key);
        if (this.pendingAcks.has(key) && this.pendingAcks.get(key) !== alert) this.flushAcknowledgements();
      });
    }
  }

  private remove(id: string): void {
    if (!this.active.delete(id)) return;
    for (const listener of this.alertListeners) listener(null, id);
  }

  clear(): void {
    this.active.clear();
    this.highestVersion.clear();
    this.pendingAcks.clear();
    this.routeVersion = -Infinity;
  }
}
