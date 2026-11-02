import type { Ack, ClientStatus, LocationUpdateDto, ServerEvent, Unsubscribe, VehicleProfile, WsTransport, YieldAlertAcknowledged } from './contracts.js';

export class EvacsWsClient {
  private profile?: VehicleProfile;
  private status: ClientStatus = 'stopped';
  private active = false;
  private generation = 0;
  private retryCount = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private readonly eventListeners = new Set<(event: ServerEvent) => void>();
  private readonly statusListeners = new Set<(status: ClientStatus) => void>();
  private readonly cleanup: Unsubscribe[];

  constructor(private readonly transport: WsTransport, private readonly onError: (error: unknown) => void = () => {}) {
    this.cleanup = [
      transport.onMessage(event => { if (this.active) for (const listener of this.eventListeners) listener(event); }),
      transport.onClose(() => { if (this.active) { this.setStatus('reconnecting'); this.scheduleRetry(); } }),
    ];
  }

  getStatus(): ClientStatus { return this.status; }

  onEvent(callback: (event: ServerEvent) => void): Unsubscribe {
    this.eventListeners.add(callback);
    return () => { this.eventListeners.delete(callback); };
  }

  onStatusChange(callback: (status: ClientStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => { this.statusListeners.delete(callback); };
  }

  async connect(profile: VehicleProfile): Promise<void> {
    if (this.active) return;
    this.profile = profile;
    this.active = true;
    this.retryCount = 0;
    await this.attemptConnect(this.generation);
  }

  private setStatus(status: ClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private attemptConnect(generation: number): Promise<void> {
    if (!this.active || !this.profile || generation !== this.generation) return Promise.resolve();
    if (this.pending) return this.pending;
    this.setStatus(this.retryCount === 0 ? 'connecting' : 'reconnecting');
    const attempt = this.transport.connect(this.profile).then(async () => {
      if (!this.active || generation !== this.generation) { await this.transport.close(); return; }
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      this.retryCount = 0;
      this.setStatus('connected');
    }).catch(error => {
      if (!this.active || generation !== this.generation) return;
      this.onError(error);
      this.setStatus('reconnecting');
      this.scheduleRetry();
    }).finally(() => { if (this.pending === attempt) this.pending = undefined; });
    this.pending = attempt;
    return attempt;
  }

  private scheduleRetry(): void {
    if (!this.active || this.retryTimer) return;
    const delay = Math.min(1000 * 2 ** Math.min(this.retryCount++, 4), 10000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.attemptConnect(this.generation);
    }, delay);
  }

  async reconnect(): Promise<void> {
    if (!this.active) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.setStatus('reconnecting');
    await this.attemptConnect(this.generation);
  }

  async sendLocation(dto: LocationUpdateDto): Promise<Ack> {
    if (this.status !== 'connected') throw new Error('WebSocket is not connected');
    const ack = await this.transport.send('VEHICLE_LOCATION_UPDATED', dto);
    if (!ack.accepted) throw new Error('Location update was rejected');
    return ack;
  }

  async sendAck(dto: YieldAlertAcknowledged): Promise<void> {
    if (this.status !== 'connected') throw new Error('WebSocket is not connected');
    const ack = await this.transport.send('YIELD_ALERT_ACKNOWLEDGED', dto);
    if (!ack.accepted) throw new Error('Alert receipt ACK was rejected');
  }

  async disconnect(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.setStatus('stopped');
    await this.transport.close();
  }

  async dispose(): Promise<void> {
    await this.disconnect();
    for (const unsubscribe of this.cleanup) unsubscribe();
    this.eventListeners.clear();
    this.statusListeners.clear();
  }
}
