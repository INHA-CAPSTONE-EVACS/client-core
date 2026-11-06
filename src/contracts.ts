export type Unsubscribe = () => void;

export interface VehicleProfile {
  vehicleId: string;
  vehicleType: string;
}

export interface VehicleLocation {
  latitude: number;
  longitude: number;
  speedMps: number;
  headingDegrees: number;
  measuredAt: string;
  /** 주행 중인 차선. 진행방향 기준 가장 오른쪽 차선이 0. 판별 불가한 소스(실제 GPS)에서는 생략한다. */
  laneIndex?: number;
  /** 현재 도로의 편도 전체 차선 수. laneIndex는 0 이상 laneCount 미만. */
  laneCount?: number;
}

export interface LocationUpdateDto extends VehicleLocation {
  vehicleId: string;
  sequence: number;
}

export interface YieldAlertIssued {
  type: 'YIELD_ALERT_ISSUED';
  alertId: string;
  alertVersion: number;
  expiresAt: string;
  /** Gateway-specific details remain opaque until the server contract is defined. */
  details?: unknown;
}

export interface YieldAlertCleared {
  type: 'YIELD_ALERT_CLEARED';
  alertId: string;
}

export interface EmergencyRouteUpdated {
  type: 'EMERGENCY_ROUTE_UPDATED';
  routeVersion: number;
  /** Route geometry and congested segments await the Gateway contract. */
  details?: unknown;
}

export interface YieldAlertAcknowledged {
  alertId: string;
  alertVersion: number;
  receivedAt: string;
}

export type ServerEvent = YieldAlertIssued | YieldAlertCleared | EmergencyRouteUpdated;
export type OutboundEvent = 'VEHICLE_LOCATION_UPDATED' | 'YIELD_ALERT_ACKNOWLEDGED';

/** A normalized ACK. The transport adapter must correlate wire replies to send calls. */
export interface Ack {
  accepted: boolean;
  /** Original server reply, for diagnostics; its wire schema is not defined here. */
  raw?: unknown;
}

export interface LocationSource {
  start(): Promise<void>;
  subscribe(callback: (location: VehicleLocation) => void): Unsubscribe;
  stop(): void;
}

/** Implementations own socket framing, authentication, and ACK correlation. */
export interface WsTransport {
  connect(profile: VehicleProfile): Promise<void>;
  send(event: OutboundEvent, payload: LocationUpdateDto | YieldAlertAcknowledged): Promise<Ack>;
  onMessage(callback: (event: ServerEvent) => void): Unsubscribe;
  onClose(callback: () => void): Unsubscribe;
  close(): Promise<void>;
}

/** SUMO adapters implement this outside core, then apply commands on their TraCI thread. */
export interface DriverBehavior {
  onYieldAlert(alert: YieldAlertIssued): void | Promise<void>;
  onYieldCleared(alertId: string): void | Promise<void>;
}

export type ClientStatus = 'stopped' | 'connecting' | 'connected' | 'reconnecting';
