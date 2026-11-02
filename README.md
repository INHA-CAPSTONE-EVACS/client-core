# @evacs/client-core

Shared TypeScript runtime for a React Native client and a headless SUMO adapter. No React Native, SUMO, or TraCI dependency is included.

## 설치

### GitHub에서 설치

이 폴더의 내용(`package.json`, `src`, `dist` 등)을 **GitHub 저장소 루트**에 올린 후, 사용하는 앱 폴더에서 실행합니다. `OWNER/REPO`는 실제 GitHub 계정과 저장소 이름으로 바꾸세요.

```sh
npm install github:OWNER/REPO
```

팀이 같은 버전을 재현하도록 릴리스 태그를 만든 뒤 태그를 지정하는 것을 권장합니다.

```sh
npm install github:OWNER/REPO#v0.1.0
```

비공개 저장소라면 설치하는 개발자나 CI에도 GitHub 읽기 권한과 Git 인증이 있어야 합니다. 설치 후에는 `import { ClientRuntime } from '@evacs/client-core'`로 가져옵니다. GitHub 설치는 npm 저장소 발행이 필요 없고, `package.json`의 `"private": true`도 유지할 수 있습니다.

**코드를 변경해 배포할 때:** 이 패키지 폴더에서 `npm install && npm run build && npm test`를 실행하고 변경된 `dist`까지 Git에 커밋하세요. 이 저장소는 설치 시 빌드 스크립트를 실행하지 않으며, Git에 포함된 `dist`를 배포합니다.

### 같은 프로젝트에서 로컬로 사용

RN 앱 또는 TypeScript 기반 SUMO Adapter가 `EVACS-Test` 바로 아래에 있다면, 해당 앱 폴더에서 실행합니다.

```sh
npm install ../packages/client-core
```

다른 위치에 있는 앱에서는 `../packages/client-core` 대신 이 패키지 폴더의 경로를 지정합니다. 설치 후 `import { ClientRuntime } from '@evacs/client-core'`처럼 가져올 수 있습니다. 패키지의 `dist`가 없다면 이 폴더에서 `npm install`과 `npm run build`를 먼저 실행합니다.


## Integration boundary

Implement `LocationSource` and `WsTransport` in each host. A transport converts its actual Gateway wire messages into the typed `ServerEvent` union and resolves each `send()` with the matching normalized `Ack`. It owns authentication, request correlation, timeout, and JSON framing because the Gateway event envelope and ACK schema are not present in `shared.pdf` or this repository. Do not point this transport at the existing `/gps` endpoint: that endpoint only broadcasts SUMO positions to a probe UI.

`ClientRuntime` owns one vehicle. Create one runtime and one location source per SUMO vehicle. A headless adapter can subscribe to `onAlert` and pass issued and cleared alerts to a `DriverBehavior`; its implementation must schedule TraCI actions on the simulation worker thread. The existing Python SUMO application does not yet host a TypeScript adapter or an EVACS Gateway connection.

`VehicleLocation.measuredAt` and alert `expiresAt` use ISO 8601 strings. The exact server fields beyond the core identifiers, version, position, and timestamp are still TODO pending Gateway agreement. `details` preserves route and alert content without asserting a wire shape.

## Lifecycle

Call `start()` once per runtime, register `onAlert`, `onRoute`, and `onStatusChange` listeners, then call `stop()` when the vehicle is removed. `stop()` permits restart. Call `dispose()` for final teardown. Location sequence continues across a stop and restart within the same runtime. A new runtime starts its sequence at 1.

`LocationReporter` sends the latest unsent position at most once per interval and never overlaps sends. A failed send is retried with the latest position and a new sequence. Alert receipts are ACKed even for duplicate deliveries; failed ACKs are retained and retried when the connection returns. Alerts expire on a one second runtime timer. The in-memory version history is reset on `stop()`; persistent deduplication across process restarts is outside this package.
