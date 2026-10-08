# Google OIDC 로그인

## 상태

코드와 모의 제공자 검증을 구현했다. 실제 Google OAuth 클라이언트는 아직 없으므로 기본 비활성이다. 운영 활성화·실제 Google·HTTPS·Galaxy 검증은 완료하지 않았다.

## 설정

서버의 비공개 환경 변수로 설정한다. 프론트 환경 변수나 Git에 비밀을 넣지 않는다.

| 설정 | 의미 |
|---|---|
| `APP_GOOGLE_ENABLED` | 기본 false. 명시적으로 true일 때만 사용 |
| `APP_GOOGLE_CLIENT_ID` | Google 웹 애플리케이션 OAuth 클라이언트 ID |
| `APP_GOOGLE_CLIENT_SECRET` | 같은 클라이언트의 비밀 |
| `APP_GOOGLE_PUBLIC_ORIGIN` | 프론트와 API를 제공하는 고정 HTTPS origin. 경로·마지막 `/` 제외 |
| `APP_GOOGLE_ALLOW_LOCAL_HTTP` | 기본 false. 로컬 점검에만 localhost/127.0.0.1 HTTP 허용 |

Google 콘솔의 redirect URI는 `<PUBLIC_ORIGIN>/api/v1/oauth/callback/google`과 정확히 같아야 한다. 프록시는 이 경로를 백엔드에 전달한다. Google에 요청하는 scope는 `openid`뿐이다. 실제 클라이언트가 없을 때 임의 설정으로 활성화하지 않는다.

## 흐름과 경계

CSRF 보호 POST에서 로그인/연결/재확인 목적과 회원·인증 버전을 세션에 기록한다. 이후 일회성 시작 GET, state·nonce·PKCE, Spring의 ID Token 서명·issuer·audience·만료 검증을 거친다. 콜백은 시작한 계정과 같은 계정인지 확인한다. 로그인 성공 시 기존 JDBC 앱 세션으로 전환하고 제공자의 access/refresh/ID token을 저장하지 않는다.

Google identity는 `issuer + sub`로 유일하다. 신규 회원은 5분 안에 아이디·닉네임을 정한다. 이메일 자동 병합·복구 주소 자동 등록은 하지 않는다. 회원의 비밀번호는 Google 전용 계정에 한해 null이며 기존 비밀번호 로그인은 거절한다.

연결·해제·비밀번호 추가는 `authVersion`을 증가시키고 기존 세션을 폐기한다. Google 전용 계정은 마지막 수단 해제가 불가능하다. 중요 작업용 재확인은 같은 Google identity여야 하고, 5분 유효한 임의 비밀을 세션에만 보관한다. DB에는 해시·회원·인증 버전·만료만 저장한다. 회원 잠금 안에서 한 번 소비하고 작업과 함께 커밋한다. 새 증명은 이전 증명을 대체한다. `prompt=select_account`는 Google 계정 선택이며 비밀번호/MFA 입력 강제를 보장하지 않는다.

V7은 nullable 비밀번호, Google identity, 재확인 테이블을 추가한다. 기존 회원·지원 기록은 유지한다. 백업은 identity를 보존하고 재확인 증명과 로그인 세션을 제외한다.

## API

기본 경로 `/api/v1`. 모든 변경 요청은 CSRF 필수. 회원 ID·증명 비밀·임의 redirect URL을 클라이언트에서 받지 않는다.

| 메서드와 경로 | 용도 |
|---|---|
| GET `/oauth/google/options` | 활성화 여부 |
| POST `/oauth/google/start` | LOGIN / LINK / REAUTH 시작 |
| GET `/oauth/google/enrollment` | 가입 대기 여부 |
| POST `/oauth/google/complete` | 아이디·닉네임으로 가입 완료 |
| GET `/members/me/login-methods` | 로그인 수단과 재확인 유효 여부 |
| DELETE `/members/me/google` | 현재 비밀번호 확인 후 연결 해제 |
| POST `/members/me/google/password` | 일회성 재확인 후 비밀번호 추가 |
| POST `/members/me/google/recovery-email` | 일회성 재확인 후 별도 메일 인증 요청 |
| POST `/members/me/google/delete` | 일회성 재확인 후 탈퇴 |

## 검증

H2/PostgreSQL에서 실제 HTTP 모의 OIDC 코드 교환과 PKCE·서명 검증을 실행한다. 잘못된 state·nonce·issuer·audience·서명·만료, 계정 전환, 연결 충돌, 마지막 수단, 동시 가입 원자성, 재확인 동시 소비·만료·재사용·계정/버전 결합을 포함한다. 브라우저는 API fixture로 비활성 상태·가입 입력·오류·재확인·삭제 동의를 검사한다. 이 테스트는 실제 Google 서비스 연결을 대신하지 않는다.

활성화 전에는 실제 동의 화면/redirect 설정, 취소·계정 선택·모바일 브라우저 복귀, Secure 쿠키와 프록시, 서버 시계 및 외부 Google 장애 동작을 별도 점검한다.
