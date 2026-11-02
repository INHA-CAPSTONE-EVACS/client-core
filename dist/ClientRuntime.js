import { AlertHandler } from './AlertHandler.js';
import { EvacsWsClient } from './EvacsWsClient.js';
import { LocationReporter } from './LocationReporter.js';
export class ClientRuntime {
    options;
    ws;
    reporter;
    alerts;
    internal = [];
    locationSubscription;
    expiryTimer;
    running = false;
    constructor(options) {
        this.options = options;
        const onError = options.onError ?? (() => { });
        this.ws = new EvacsWsClient(options.transport, onError);
        this.reporter = new LocationReporter(options.profile.vehicleId, dto => this.ws.sendLocation(dto), onError);
        this.alerts = new AlertHandler(alert => this.ws.sendAck({ alertId: alert.alertId, alertVersion: alert.alertVersion, receivedAt: new Date(options.now?.() ?? Date.now()).toISOString() }), onError, options.now);
        this.internal.push(this.ws.onEvent(event => {
            switch (event.type) {
                case 'YIELD_ALERT_ISSUED':
                    this.alerts.handleAlert(event);
                    break;
                case 'YIELD_ALERT_CLEARED':
                    this.alerts.handleCleared(event);
                    break;
                case 'EMERGENCY_ROUTE_UPDATED':
                    this.alerts.handleRouteUpdated(event);
                    break;
            }
        }));
        this.internal.push(this.ws.onStatusChange(status => {
            if (status === 'connected')
                this.alerts.flushAcknowledgements();
        }));
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        try {
            await this.ws.connect(this.options.profile);
            this.locationSubscription = this.options.locationSource.subscribe(location => this.reporter.handleLocation(location));
            await this.options.locationSource.start();
            this.reporter.start(this.options.intervalMs ?? 1000);
            this.expiryTimer = setInterval(() => this.alerts.expireStale(), 1000);
        }
        catch (error) {
            await this.stop();
            throw error;
        }
    }
    async stop() {
        if (!this.running)
            return;
        this.running = false;
        this.reporter.stop();
        if (this.expiryTimer)
            clearInterval(this.expiryTimer);
        this.expiryTimer = undefined;
        this.locationSubscription?.();
        this.locationSubscription = undefined;
        this.options.locationSource.stop();
        await this.ws.disconnect();
        this.alerts.clear();
    }
    onAlert(callback) { return this.alerts.onAlert(callback); }
    onRoute(callback) { return this.alerts.onRoute(callback); }
    onStatusChange(callback) { return this.ws.onStatusChange(callback); }
    getStatus() { return this.ws.getStatus(); }
    async dispose() {
        await this.stop();
        for (const unsubscribe of this.internal)
            unsubscribe();
        await this.ws.dispose();
    }
}
