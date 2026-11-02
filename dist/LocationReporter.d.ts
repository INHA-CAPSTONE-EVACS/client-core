import type { LocationUpdateDto, VehicleLocation } from './contracts.js';
export declare class LocationReporter {
    private readonly vehicleId;
    private readonly send;
    private readonly onError;
    private latest?;
    private timer?;
    private sequence;
    private busy;
    private version;
    private sentVersion;
    constructor(vehicleId: string, send: (dto: LocationUpdateDto) => Promise<unknown>, onError?: (error: unknown) => void);
    start(intervalMs?: number): void;
    handleLocation(location: VehicleLocation): void;
    nextSequence(): number;
    tick(): Promise<void>;
    stop(): void;
}
