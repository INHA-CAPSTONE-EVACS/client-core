export class EvacsWsClient {
    transport;
    onError;
    profile;
    status = 'stopped';
    active = false;
    generation = 0;
    retryCount = 0;
    retryTimer;
    pending;
    eventListeners = new Set();
    statusListeners = new Set();
    cleanup;
    constructor(transport, onError = () => { }) {
        this.transport = transport;
        this.onError = onError;
        this.cleanup = [
            transport.onMessage(event => { if (this.active)
                for (const listener of this.eventListeners)
                    listener(event); }),
            transport.onClose(() => { if (this.active) {
                this.setStatus('reconnecting');
                this.scheduleRetry();
            } }),
        ];
    }
    getStatus() { return this.status; }
    onEvent(callback) {
        this.eventListeners.add(callback);
        return () => { this.eventListeners.delete(callback); };
    }
    onStatusChange(callback) {
        this.statusListeners.add(callback);
        return () => { this.statusListeners.delete(callback); };
    }
    async connect(profile) {
        if (this.active)
            return;
        this.profile = profile;
        this.active = true;
        this.retryCount = 0;
        await this.attemptConnect(this.generation);
    }
    setStatus(status) {
        if (this.status === status)
            return;
        this.status = status;
        for (const listener of this.statusListeners)
            listener(status);
    }
    attemptConnect(generation) {
        if (!this.active || !this.profile || generation !== this.generation)
            return Promise.resolve();
        if (this.pending)
            return this.pending;
        this.setStatus(this.retryCount === 0 ? 'connecting' : 'reconnecting');
        const attempt = this.transport.connect(this.profile).then(async () => {
            if (!this.active || generation !== this.generation) {
                await this.transport.close();
                return;
            }
            if (this.retryTimer)
                clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
            this.retryCount = 0;
            this.setStatus('connected');
        }).catch(error => {
            if (!this.active || generation !== this.generation)
                return;
            this.onError(error);
            this.setStatus('reconnecting');
            this.scheduleRetry();
        }).finally(() => { if (this.pending === attempt)
            this.pending = undefined; });
        this.pending = attempt;
        return attempt;
    }
    scheduleRetry() {
        if (!this.active || this.retryTimer)
            return;
        const delay = Math.min(1000 * 2 ** Math.min(this.retryCount++, 4), 10000);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            void this.attemptConnect(this.generation);
        }, delay);
    }
    async reconnect() {
        if (!this.active)
            return;
        if (this.retryTimer)
            clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.setStatus('reconnecting');
        await this.attemptConnect(this.generation);
    }
    async sendLocation(dto) {
        if (this.status !== 'connected')
            throw new Error('WebSocket is not connected');
        const ack = await this.transport.send('VEHICLE_LOCATION_UPDATED', dto);
        if (!ack.accepted)
            throw new Error('Location update was rejected');
        return ack;
    }
    async sendAck(dto) {
        if (this.status !== 'connected')
            throw new Error('WebSocket is not connected');
        const ack = await this.transport.send('YIELD_ALERT_ACKNOWLEDGED', dto);
        if (!ack.accepted)
            throw new Error('Alert receipt ACK was rejected');
    }
    async disconnect() {
        if (!this.active)
            return;
        this.active = false;
        this.generation++;
        if (this.retryTimer)
            clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.setStatus('stopped');
        await this.transport.close();
    }
    async dispose() {
        await this.disconnect();
        for (const unsubscribe of this.cleanup)
            unsubscribe();
        this.eventListeners.clear();
        this.statusListeners.clear();
    }
}
