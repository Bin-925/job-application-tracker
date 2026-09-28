# 세션 인증 전환 및 실행 가이드

기준일: 2026-09-24. 코드 구현과 운영 배포는 별개다. **이 작업은 운영 DB를 수정하거나 실행 중인 IntelliJ 서버를 재시작하지 않았다.**

## 달라진 사용 흐름

- 이전 localStorage JWT로는 로그인할 수 없다. 새 프론트의 최초 실행 시 이전 토큰만 제거하고 다시 로그인한다.
- 로그인 상태는 서버의 `/api/v1/members/me`로 확인한다. 쿠키/비밀번호를 JavaScript 저장소에 보관하지 않는다.
- 내 정보에서 현재 로그아웃 또는 모든 기기에서 로그아웃을 선택한다.
- 비밀번호 변경에 성공하면 현재 기기와 다른 기기의 세션이 모두 폐기된다.
- 회원 탈퇴에는 현재 비밀번호가 필요하다. 지원과 일정 삭제 흐름은 기존 트랜잭션을 유지한다.
- 오프라인에서는 새 로그인이나 개인 기록 조회/변경을 보장하지 않는다. 개인 API는 캐시하지 않는다.
- 세션 쿠키는 포트로 구분되지 않는다. 같은 호스트의 여러 개발 서버에 동시에 로그인하면 충돌할 수 있다. 로컬 확인 시 하나의 앱만 사용하거나 브라우저 프로필을 분리한다.

## 로컬 개발

1. 기존 backend/frontend를 중지하기 전에 열려 있는 작업을 저장한다.
2. 백엔드에서 `./gradlew.bat test bootJar`, 프론트에서 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:pwa`를 실행한다.
3. MySQL 기본 프로파일은 기존 비밀 설정을 유지한다. 다음 실행 시 `member.auth_version` 기본값 0 열과 `SPRING_SESSION`, `SPRING_SESSION_ATTRIBUTES` 테이블이 필요하다. 개발 설정은 이를 초기화하므로 중요한 로컬 DB라면 먼저 백업한다.
4. 실제 DB를 사용하지 않는 확인은 `scripts/Start-Local.ps1`의 `demo` 프로파일을 사용한다. 별도 H2 파일에 저장한다. 테스트는 메모리 H2다.
5. 프론트는 `/api/v1` 상대 주소를 사용한다. 개발/preview 프록시 대상은 `API_PROXY_TARGET`으로 변경할 수 있다.
   기본 포트가 아닌 경우 백엔드의 `APP_CORS_ALLOWED_ORIGINS`에도 프론트 origin을 넣는다. `Start-Local.ps1`은 이를 설정한다. 서버를 수동 재시작할 때 이 환경변수를 빠뜨리면 조회는 되더라도 변경 요청이 403으로 차단될 수 있다.
6. `JWT_SECRET`은 더 이상 사용하지 않는다. 기존 비밀 설정 파일은 이 작업에서 삭제하지 않았다.

## 운영 배포 전 필수 조건

**프론트와 백엔드는 함께 전환해야 한다. 이 문서만으로 전체 운영 스키마 마이그레이션이 완료되는 것은 아니다.**

1. 운영 DB 백업과 복원 연습을 수행한다. 기존 지원/일정 스키마 차이를 확인하고 Flyway baseline과 migration을 먼저 확정한다.
2. 세션 관련 변경: `member.auth_version BIGINT NOT NULL DEFAULT 0` 추가, 아래 두 Spring Session 테이블과 세션 ID/만료/회원 인덱스 추가.
3. PostgreSQL 세션 테이블의 기준 DDL은 의존성 `spring-session-jdbc-3.5.7.jar` 안의 `org/springframework/session/jdbc/schema-postgresql.sql`이다. 이 DDL을 검토한 migration으로 편입한다. MySQL/H2용 개발 초기화 SQL을 PostgreSQL에 실행하지 않는다.
4. `prod`는 `ddl-auto: validate`, `spring.session.jdbc.initialize-schema: never`이다. 스키마가 없거나 맞지 않으면 시작 실패가 정상이다. 실패를 피하려고 운영에서 `update`로 되돌리지 않는다.
5. HTTPS 동일 origin에서 정적 파일과 `/api`를 제공한다. `VITE_API_URL=/api/v1`. 기존 Railway 직접 URL을 브라우저 API 주소로 사용하지 않는다.
6. 실제 프록시/rewrite에서 `Set-Cookie`, 요청 `Cookie`, CSRF 헤더, DELETE 본문 전달과 `/api` 캐시 비활성을 검증한다. 기존 Vercel rewrite의 쿠키 전달은 아직 검증하지 않았다.
7. `APP_CORS_ALLOWED_ORIGINS`를 실제 HTTPS 프론트 origin으로 지정한다. 와일드카드는 없다. 운영 쿠키는 Secure=true, HttpOnly=true, SameSite=Lax다.
8. 기존 JWT 사용자를 다시 로그인시킨다. 오래된 PWA가 계속 기존 토큰 API를 호출하지 않도록 업데이트 동작과 활성 사용자 전환을 확인한다.
9. 로그인 시도 제한, 서버 오류 관측, 세션 정리/DB 용량, S25 Ultra 재실행·로그아웃·다중 기기 검증을 수행한다.

## API 계약

| API | 인증/행동 |
|---|---|
| GET `/members/csrf` | 익명 가능, `{headerName, token}` 반환 및 세션 쿠키 발급 |
| POST `/members/join` | CSRF 필요. 기존 입력 규칙 유지 |
| POST `/members/login` | CSRF 필요. 성공 시 공개 회원 정보와 새 쿠키. accessToken 필드 제거 |
| GET `/members/me` | 세션 확인. 미인증 401 |
| POST `/members/logout` | CSRF 필요. 현재 세션 폐기 및 쿠키 삭제 |
| POST `/members/logout-all` | 로그인+CSRF. 회원 인증 버전 증가와 모든 세션 폐기 |
| PATCH `/members/me/password` | 현재/새 비밀번호 검증, 비밀번호 저장 후 모든 세션 폐기 |
| DELETE `/members/me` | `{currentPassword}` 본문 필요. 회원/지원/일정 삭제 및 세션 폐기 |

경로 앞에는 `/api/v1`을 붙인다. 모든 상태 변경 요청은 새 CSRF 조회 후 받은 헤더를 전송한다. CSRF 오류가 나도 POST/PATCH/DELETE를 자동 재전송하지 않는다.

## 검증 범위

- 백엔드: 기존 33개 회귀 테스트와 세션 보안 12개 테스트. 실제 CSRF 엔드포인트와 쿠키로 세션 ID 변경, CSRF 갱신, 로그인 실패, 현재/전체 로그아웃, 비밀번호 변경, 탈퇴, 만료, 인증 버전, CORS, Secure/HttpOnly, API no-store 검사.
- 프론트: 기존 도메인 6개와 세션 API 전송 4개 테스트. 쿠키 포함, 변경 전 CSRF 재조회, 실패 시 쓰기 중단, 변경 요청 자동 재시도 금지, 인증 만료 이벤트 검사.
- 로컬 브라우저: 로그인, 새로고침 후 유지, 두 탭 간 전체 로그아웃 반영, 별도 H2 파일 DB를 사용하는 서버 재시작 후 로그인 유지, 현재 기기 로그아웃 확인. 320px 계정 화면에서 새 버튼의 줄맞춤과 가로 넘침을 확인하고 계정 화면의 불필요한 지원 추가 버튼을 숨겼다.
- 프론트 lint/build 및 PWA 정적 캐시 정책 검사 통과. 검증용 서버는 실제 사용자 MySQL 서버와 분리했다.
- MySQL/PostgreSQL 실서버, 다중 서버 부하/경합, 운영 HTTPS 프록시, 원격 CI, Galaxy S25 Ultra는 이 자동 테스트에 포함되지 않는다.

## 롤백 주의

소스 백업은 DB 백업이 아니다. 코드만 JWT로 되돌리면 예전 인증 정책도 함께 되돌아간다. 운영 전환 시에는 새로 생성된 개인정보를 보존하는 DB 복원 계획과 프론트/백엔드 동시 롤백 계획을 별도로 준비해야 한다.
