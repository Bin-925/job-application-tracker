# 추가 기능 검증 매트릭스

기준: 2026-10-08. 시험 성공은 명시한 환경과 시나리오의 결과이며 모든 버그/취약점 부재를 의미하지 않는다. 운영·실사용 DB와 외부 인증/메일 서비스에는 부하를 보내지 않는다.

| 영역 | 정상 / 실패 / 동시성 | 검증 도구 | 완료 기준 |
|---|---|---|---|
| 기존 지원·일정 | 조회/CRUD, 다른 회원, CSRF, 긴 본문, 오래된 버전, 중복 일정/상태 | 기존 k6 8종 + 통합/브라우저 | 예기치 않은 응답 0, 데이터 격리, 기존 시간 임계값 유지 |
| 로그인·세션 | 세션 회전, 잘못된 CSRF, 로그인 반복, 전체 로그아웃, 재로그인 | auth / arrival / endurance k6 | 권한 혼선 0, 폐기된 세션 401, p95<2.5s/p99<5s |
| 도착률 | 서버 지연과 독립적인 초당 2회 인증 여정, 최대 30 VU | arrival k6 60초 | dropped_iterations=0, 인증 여정 검증 전부 통과 |
| 메일 수명주기 | 이메일 선인증 가입, 자동 로그인 없음, 재설정, 이전 비밀번호/토큰 거절, 탈퇴 | 격리 Mailpit + mail k6 4 VU/20회 | 실제 로컬 SMTP와 HTTP 상태/토큰 일회성 확인 |
| Google | state/nonce/서명/issuer/audience/만료, 계정 연결 충돌, 동시 로그인 격리, 일회성 재확인 | 모의 OIDC + H2/PostgreSQL | 거절 조건 충족, 다른 계정 혼입·재사용 0 |
| 요청 제한 | 계정/IP/CSRF 기본 제한, 새 인증 경로와 위조 프록시 헤더 | 기본 limits + 통합 테스트 | 429/Retry-After, 위조 헤더로 우회 불가 |
| DB·서버 장애 | DB pause/resume, 앱 강제 종료/재시작, JDBC 세션·업무 데이터 복원 | faults k6 80초 | 익명 2xx 없음, 기존 회원 혼선 없음, 복구 후 세션/데이터 확인 |
| 기기 초안 | 기본 미저장, 복원/삭제, 만료/손상, 용량 부족, 다른 탭 삭제, 계정/세션 전환 | Node + Playwright | 민감 인증 입력 영구 저장 0, 잘못된 복원 0 |
| 아바타 | 키보드·미리보기·취소·재시도, 다른 회원 ID, 긴 값, 외부 URL | 통합 + Playwright + auth k6 | 본인 데이터만 변경, 외부 이미지 로드 0 |
| 공급망 | 프론트 잠금파일·백엔드 실제 runtime 구성요소 | pnpm audit / OSV | 발견 목록과 수정/영향/미확인 명시 |
| 회귀/복원 | 전체 H2/PostgreSQL/브라우저/빌드/워크플로, 토큰 제외 백업 | 로컬 + CI | 실패·skip을 숨기지 않음 |

## 부하 예산과 해석

기존 기본 8종에 auth(4 VU/45초), arrival(2회/s/60초, 최대 30 VU), mail(4 VU/20회), endurance(4 VU/300초), faults(1 VU/80초)를 추가한다. 앱 최대 heap 512MiB, PostgreSQL 1 CPU/768MiB, 임시 tmpfs DB를 사용한다. 메일도 별도 로컬 캡처 서버이며 외부 발송은 하지 않는다.

같은 부하 발생기 IP의 정상 계정 여정을 측정하는 프로필은 인증 예산을 확대한다. `limits`와 별도 제한 통합 테스트는 기본 설정으로 실행한다. 시간 임계값을 통과시키기 위해 BCrypt 강도를 낮추거나 인증/CSRF를 끄지 않는다. 장애 구간의 0(연결 실패)/500/503은 정상 상태의 오류율과 분리하고, 익명 인증 성공이나 데이터 유실은 허용하지 않는다.

기존 k6는 닫힌 부하 모델이므로 응답이 느려지면 요청률도 감소한다. `arrival`은 시작률을 고정해 이 영향을 보완하고 dropped iterations를 검사한다. [k6 부하 모델 설명](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/).

## 별도 대기

실제 Google OAuth 클라이언트/동의 화면, 외부 SMTP 수신·스팸함, HTTPS·프록시·Secure 쿠키, Galaxy S25 Ultra 실기기, 다중 서버, 수시간/수일 지속 부하는 별도다. 이 시험의 CPU/RAM/시간 범위로 운영 수용량이나 장기 메모리 누수 부재를 보장하지 않는다. 인증 제어의 참고 기준은 [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)다.
