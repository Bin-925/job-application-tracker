# 가입 시작 조건 재현 검사

## 목적과 현재 판정

#87은 2026-10-08 로컬 서버 재시작 직후 가입 검사 한 번이 실패한 사건이다. 당시 상세 단계가 없어서 원인을 단정할 수 없다. 이후 성공이나 이번 반복 검사도 최초 원인 규명을 대신하지 않는다.

2026-10-09, dev `4a1d45c`의 앱 JAR와 프론트 코드로 아래 39회를 실행했다. 앱 코드에는 수정하지 않았다. 초기 검사 도구의 CORS 출처 누락과 탈퇴 요청 필드 오류는 각각 설정/도구 오류로 수정했으며 제품 버그 재현으로 계산하지 않는다.

| 조건 | 실행 | 결과 | 조작 |
|---|---:|---|---|
| warm | 10회 | 통과 | 동일 앱·Vite 프로세스에서 독립 브라우저 컨텍스트 |
| cold-backend | 10회 | 통과 | 매회 새 JVM, DB와 Vite는 유지 |
| cold-vite | 10회 | 통과 | 매회 별도 Vite cacheDir와 새 프로세스, 백엔드는 유지 |
| delayed-api | 3회 | 통과 | 프론트 선실행 → 오류/다시 확인 → API 시작 → 사용자 재시도 |
| delayed-mail | 3회 | 통과 | SMTP 연결 중계 1초 지연, 접수 후 실제 메일 조회 |
| restart-mail | 3회 | 통과 | SMTP 연결 차단 중 202 접수 → JVM 종료 → 재시작 → 사용자가 다시 요청 |

가입 메일 조회, 링크 fragment 제거, 가입 완료 201, 자동 로그인되지 않음, 직접 로그인, 탈퇴, 해당 수신자의 메일 제거를 검사한다. restart-mail은 메모리 작업 큐가 발송을 보장하지 않는다는 경계를 확인하는 검사이며, 영속 큐를 구현했다는 뜻이 아니다.

**최초 실패는 미재현이고 #87은 열린 상태로 유지한다.** 원인을 추정해서 제품 코드를 고치거나 이슈를 닫지 않는다. Boot 전환은 이 기준선과 진단 기록을 유지한 격리 실험으로 이어갈 수 있다.

## 실행

필수: Java 21, Node, Docker 엔진, frontend의 설치된 Playwright 의존성. 먼저 backend에서 `gradlew.bat bootJar`(Linux는 `./gradlew bootJar`)를 실행한다. 이번 검사는 Vite 개발 서버를 사용하므로 frontend dist 빌드로 대체하지 않는다.

저장소 루트에서 실행한다. JAVA_HOME을 설정하고 Docker가 PATH에 있어야 한다. 설치된 Chrome을 사용할 때만 PLAYWRIGHT_CHROME_PATH에 실행 파일을 지정한다. 그렇지 않으면 Playwright Chromium을 미리 설치한다.

```powershell
node --test tests/registration/safety.test.cjs
node tests/registration/run.cjs warm 10
node tests/registration/run.cjs cold-backend 10
node tests/registration/run.cjs cold-vite 10
node tests/registration/run.cjs delayed-api 3
node tests/registration/run.cjs delayed-mail 3
node tests/registration/run.cjs restart-mail 3
```

모드별 횟수는 1~10으로 제한한다. Docker 실행 경로가 필요하면 REGISTRATION_DOCKER를 지정한다. 사용자 제공 URL이나 DB 접속 문자열은 받지 않는다. CLI 포트 변경도 지원하지 않는다.

## 격리와 정리

- 앱 18587, Vite 18588, PostgreSQL 15587, SMTP 15588, Mailpit HTTP 15589, SMTP 중계 15590을 loopback에서만 사용한다.
- 어느 포트라도 사용 중이면 시작하지 않는다. 기존 프로세스를 자동 종료하지 않는다.
- 실행별 `jobtracker-registration-<run ID>` Compose 프로젝트와 tmpfs DB를 생성한다. 기존 jobtracker DB나 볼륨을 연결하지 않는다.
- 자신이 만든 자식 프로세스와 정확한 Compose 프로젝트만 종료한다. 다른 앱이나 Docker 엔진 전체를 중지하지 않는다.
- 테스트 계정은 API로 탈퇴하고 메일은 정확한 수신자/메시지 ID로 정리한다. 실패하여 정리가 안 된 경우도 표시하며 격리 컨테이너 종료와 구분한다.
- 프론트 캐시는 `.local/registration-cache/` 아래 실행별 경로다. 기존 node_modules의 Vite 캐시를 삭제하지 않는다.
- 단일 테스트 IP의 반복 요청을 위해 요청 예산만 확장한다. CSRF, CORS, 암호 해싱은 유지한다. 기본 rate limit 검증은 기존 k6 limits 프로필의 역할이다.

## 진단

`.local/registration-results/<run ID>/`에 다음을 저장한다.

| 파일 | 내용 |
|---|---|
| environment.json | 코드 기준, 변경 여부, JAR 해시, Node 버전, 격리 조건 |
| results.json | 실패 단계, 경로/상태 코드, 단계별 시간, 준비 확인, 계정·메일 정리 결과 |
| cleanup.json | 브라우저·자식 프로세스·SMTP 중계·컨테이너 종료 여부 |
| backend/vite 로그 | 생성한 비밀값과 토큰 형태 문자열·이메일을 마스킹한 로컬 진단 |

수신 링크, 비밀번호, 쿠키, CSRF 값은 결과 JSON에 넣지 않는다. Playwright 오류 문자열에는 폼 값이나 URL이 들어갈 수 있어 원문 대신 오류 분류와 단계만 저장한다. 이 검사는 HAR·trace·스크린샷을 생성하지 않는다.

CI는 각 조건을 1회 실행한다. 로컬 39회와 CI 6회를 혼동하지 않는다. 진단 JSON만 제한된 보존 기간으로 업로드하고 원문 메일/로그는 업로드하지 않는다.

## 다음 실패가 발생하면

1. 최초 실패 단계와 환경·JAR 해시를 확인한다. 검사 실행 자체가 실패했는지 앱 응답이 실패했는지 구분한다.
2. CORS·포트·메일 도구 설정 문제를 제품 문제로 분류하지 않는다.
3. 동일 조건에서 최소 재현을 만들고 가설을 비교한다. 전체 요청을 자동 재전송해서 실패를 숨기지 않는다.
4. 재현 테스트가 수정 전 실패, 수정 후 성공하는지 확인하고 원인·변경 범위를 PR에 기록한다.
5. 민감정보를 제외한 결과만 이슈에 첨부한다. 보안 문제의 상세 공격 경로는 공개 이슈에 무분별하게 게시하지 않는다.

실제 외부 SMTP, Google 클라이언트, HTTPS, Galaxy S25 Ultra 검증과 k6 성능 검사는 이 재현 도구의 범위가 아니다.
