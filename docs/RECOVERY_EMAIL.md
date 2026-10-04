# 복구 이메일 등록과 인증

기존 회원용 A2 기능이다. 비밀번호 재설정, 신규 가입 이메일 인증, Google 로그인은 후속 범위다. 이메일 미등록 회원의 기존 로그인과 지원 기록 이용은 유지한다.

## 흐름

1. 내 정보에서 새 이메일과 현재 비밀번호를 제출한다. 서버는 세션의 회원 ID와 인증 버전으로 소유자를 결정한다.
2. 메일 전송이 SMTP 서버에 수락되면 204를 반환한다. 실제 수신함 도착을 보장하지 않는다. 비활성/전송 실패/동시 발송 포화는 503이다.
3. 링크를 연 것만으로 인증하지 않는다. URL fragment의 토큰을 메모리로 옮기고 주소에서 지운 뒤 명시적인 POST 확인으로 소비한다.
4. 확인 전까지 기존 인증 주소를 유지한다. 확인 성공 시 주소 저장과 토큰 삭제, authVersion 증가를 같은 트랜잭션에서 수행한다. 모든 기존 세션은 거절되며 새로 로그인해야 한다.

| API (`/api/v1/members`) | 조건 |
| --- | --- |
| GET `/me/recovery-email` | 로그인 필요. 기능 사용 가능 여부, 인증 주소, 유효한 대기 주소/기한 |
| POST `/me/recovery-email/requests` | 로그인 + CSRF + 현재 비밀번호. `{email, currentPassword}` |
| POST `/recovery-email/confirm` | 익명 가능하지만 CSRF 필요. `{token}`. GET 소비 없음 |

잘못된 현재 비밀번호는 403이며 세션을 종료하지 않는다. 잘못되거나 만료·소비·교체된 토큰은 동일한 400 메시지로 거절한다. 토큰은 API 응답이나 로그에 반환하지 않는다.

## 저장과 동시성

- V4는 nullable `member.recovery_email`과 회원당 최대 1행인 `recovery_email_verification`을 추가한다. 기존 SQL은 수정하지 않는다.
- SecureRandom 32바이트를 URL-safe Base64로 표현하고 DB에는 SHA-256 해시만 저장한다. 이메일 인증 전용 테이블이므로 다른 목적의 토큰으로 사용할 수 없다.
- 만료는 30분이며 DB 정밀도에 맞춰 발급 시각을 마이크로초로 절삭한다. 재발송은 이전 링크를 교체한다. 소비/탈퇴 시 삭제하며, 만료 행은 사용할 수 없고 다음 발급 시 대체한다. 정기 삭제 작업은 아직 없다.
- 요청·확인은 회원 행 잠금을 공유한다. 확인 시 해시로 회원 ID만 찾고, 잠금 획득 후 토큰을 처음 로드해 동시 소비·교체를 다시 검사한다.
- 발급 당시 authVersion과 현재 버전이 달라지면 무효다. 비밀번호 변경과 전체 로그아웃도 이전 링크를 무효화한다.
- 주소는 앞뒤 공백 제거·도메인 소문자화한다. 로컬 부분 대소문자/점/플러스는 보존하며 ASCII 주소를 지원한다. 전송량 제한에서는 대소문자를 통합한다. 동일 이메일의 다른 회원을 합치지 않는다.
- 세션 삭제 후처리가 실패해도 이미 커밋된 authVersion 검사가 접근을 막는다.

## 전송 제어와 한계

기존 IP/전체 요청 제한을 신규 요청·확인 경로에도 적용한다. 현재 비밀번호 시도 제한 외에 회원/수신 주소별 토큰 버킷 용량 3, 시간당 3회 보충을 적용한다. 고정 시간창의 엄격한 3회가 아니라 연속 요청 예산이다. DB에 발급 시각을 저장해 같은 회원 재발송은 최소 60초 간격을 지킨다.

동시 SMTP 전송은 서버당 최대 4개이며 대기 큐 없이 포화 시 503이다. SMTP 연결·읽기·쓰기 타임아웃은 기본 각각 3초다. 전체 처리 시간 3초 보장은 아니다.

인증된 회원만 쓰는 소규모 흐름에 맞춰 SMTP를 동기 호출한다. 요청 전송 실패 시 토큰 교체를 롤백해 기존 링크를 유지한다. 기존 주소 변경 시에는 이전 주소에 변경 인증 안내를 먼저 전달한다. 안내 실패 시 변경도 롤백한다. SMTP와 DB는 원자적이지 않으므로 SMTP 수락 후 DB 커밋 실패 시 사용할 수 없는 링크나 완료되지 않은 변경 안내가 도착할 수 있다. 그래서 이전 주소 안내는 변경 완료를 단정하지 않는다. 재시도는 사용자 동작으로만 한다.

SMTP 처리 동안 회원 잠금을 유지하는 비용, 메모리 요청 제한의 재시작/다중 서버 한계가 있다. 공개 비밀번호 복구(A3)는 존재 여부와 전송 시간을 분리할 별도의 제한된 비동기 처리 설계가 필요하다. 현재 방식을 공개 복구 API에 그대로 복사하지 않는다.

## 로컬 메일함

Docker Desktop, JDK 21, 빌드된 backend JAR와 프론트 의존성이 필요하다.

```powershell
./scripts/Stop-Local.ps1
./scripts/Start-Local.ps1 -LocalMail
```

- 앱: http://127.0.0.1:5173
- Mailpit: http://127.0.0.1:8025, SMTP: 127.0.0.1:1025
- `compose.mail.yaml`은 Mailpit v1.31.4를 사용하고 두 포트 모두 loopback에만 공개한다. 외부로 메일을 전달하지 않고 로컬에서 포착한다. 인증 링크가 보이는 개발 도구이므로 외부 공개 금지.
- `mail-local` 프로필은 명시적으로 선택한 로컬 실행에만 사용한다. 일반 시작은 기본 비활성이다.
- 로컬 메일함 종료: `docker compose -f compose.mail.yaml stop`. 앱 종료와 별개이며 PostgreSQL 볼륨을 삭제하지 않는다.

## 실제 SMTP 활성화 전

배포 Secret/비공개 환경 설정으로 `APP_RECOVERY_EMAIL_ENABLED=true`, `APP_RECOVERY_EMAIL_FROM`, `APP_RECOVERY_EMAIL_PUBLIC_BASE_URL`(신뢰하는 HTTPS origin, 경로/쿼리/끝 슬래시 없음), `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`를 지정한다. 공급자 지침에 맞춰 SMTP 인증과 STARTTLS 또는 SMTPS를 설정하고 평문 외부 SMTP를 허용하지 않는다. SMTP debug 로깅을 켜지 않는다. `allow-local-http`는 배포에 사용하지 않는다.

수신함 도착, SPF/DKIM/DMARC, 스팸 분류, 실제 HTTPS와 Galaxy S25 Ultra/PWA 링크 복귀는 별도 검증해야 한다. 메일 발송 Secret을 대화나 Git에 넣지 않는다.

## 백업

인증된 이메일은 회원 데이터로 백업한다. 대기 토큰 데이터는 세션처럼 덤프에서 제외하고 복원 검증도 빈 토큰 테이블을 검사한다. V4 이전 백업은 해당 테이블이 없어도 기존 검증을 유지한다. 이전 도구로 만든 덤프를 복원할 때는 대기 토큰을 반드시 폐기해야 한다.

## 근거

[OWASP 일회용 복구 토큰 지침](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Spring Boot SMTP 설정과 타임아웃](https://docs.spring.io/spring-boot/3.5/reference/io/email.html), [GreenMail 격리 SMTP 테스트](https://greenmail-mail-test.github.io/greenmail/), [Mailpit 릴리스](https://github.com/axllent/mailpit/releases/tag/v1.31.4).
