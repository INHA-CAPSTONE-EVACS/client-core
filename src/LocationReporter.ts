import type { LocationUpdateDto, VehicleLocation } from './contracts.js';

export class LocationReporter {
  private latest?: VehicleLocation;
  private timer?: ReturnType<typeof setInterval>;
  private sequence = 0;
  private busy = false;
  private version = 0;
  private sentVersion = 0;

  constructor(private readonly vehicleId: string, private readonly send: (dto: LocationUpdateDto) => Promise<unknown>, private readonly onError: (error: unknown) => void = () => {}) {}

  start(intervalMs = 1000): void {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('intervalMs must be positive');
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
  }

  handleLocation(location: VehicleLocation): void {
    this.latest = location;
    this.version++;
  }

  nextSequence(): number { return ++this.sequence; }

  async tick(): Promise<void> {
    if (this.busy || !this.latest || this.version === this.sentVersion) return;
    this.busy = true;
    const version = this.version;
    const dto: LocationUpdateDto = { ...this.latest, vehicleId: this.vehicleId, sequence: this.nextSequence() };
    try {
      await this.send(dto);
      this.sentVersion = version;
    } catch (error) {
      this.onError(error);
      // The next tick sends the newest available position with a fresh sequence.
    } finally {
      this.busy = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
