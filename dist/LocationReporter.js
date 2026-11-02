export class LocationReporter {
    vehicleId;
    send;
    onError;
    latest;
    timer;
    sequence = 0;
    busy = false;
    version = 0;
    sentVersion = 0;
    constructor(vehicleId, send, onError = () => { }) {
        this.vehicleId = vehicleId;
        this.send = send;
        this.onError = onError;
    }
    start(intervalMs = 1000) {
        if (!Number.isFinite(intervalMs) || intervalMs <= 0)
            throw new RangeError('intervalMs must be positive');
        if (this.timer)
            return;
        this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    }
    handleLocation(location) {
        this.latest = location;
        this.version++;
    }
    nextSequence() { return ++this.sequence; }
    async tick() {
        if (this.busy || !this.latest || this.version === this.sentVersion)
            return;
        this.busy = true;
        const version = this.version;
        const dto = { ...this.latest, vehicleId: this.vehicleId, sequence: this.nextSequence() };
        try {
            await this.send(dto);
            this.sentVersion = version;
        }
        catch (error) {
            this.onError(error);
            // The next tick sends the newest available position with a fresh sequence.
        }
        finally {
            this.busy = false;
        }
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
}
