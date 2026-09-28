# ADR 0003: 요청 제한과 명시적 PostgreSQL 마이그레이션

날짜: 2026-09-28. 상태: 코드 구현, H2 회귀 및 GitHub PostgreSQL 검증 완료. 실제 운영 데이터 이전과 배포는 미완료.

## 문제

세션·CSRF·소유권 검사는 로그인 비밀번호를 반복해서 추측하는 요청의 빈도를 제어하지 않는다. 또한 운영의 Hibernate validate는 스키마 변경을 수행하지 않으므로, 지원/일정/세션 테이블을 버전이 있는 SQL로 준비해야 한다.

## 선택과 이유

| 선택 | 이유 | 비용과 한계 |
|---|---|---|
| Bucket4j 8.18.0 | 토큰 버킷의 동시성·보충·대기 시간 계산을 라이브러리에 맡김 | 설정값의 제품 적합성은 직접 검증해야 함 |
| Caffeine | 계정/IP별 버킷에 보관 개수와 만료 시간을 둠 | 로컬 메모리라 재시작·퇴출 시 제한 이력이 사라짐 |
| IP + 계정별 제한 | 한 IP의 여러 계정 시도와 여러 IP의 같은 계정 시도를 각각 제한 | 공유 IP 오탐, 계정을 겨냥한 일시적 접근 방해 가능 |
| 서버 전체 인증 예산 | 무작위 계정/IP 키 생성으로 생기는 비용을 제한 | 공격 시 정상 로그인도 지연될 수 있음 |
| Flyway | SQL 파일과 체크섬으로 변경 순서·적용 이력을 검증 | 기존 운영 스키마 비교와 baseline 결정은 별도 필요 |
| Testcontainers PostgreSQL | H2가 감추는 PostgreSQL 타입·DDL·세션 차이를 검증 | Docker 엔진 필요, 로컬 엔진 장애는 남아 있으나 GitHub 실행은 통과 |

Redis나 별도 제한 서비스를 추가하지 않은 이유는 현재 단일 서버를 전제로 운영 요소를 줄이기 위해서다. **이번 제한을 다중 서버·분산 공격 방어의 완성으로 해석하면 안 된다.** 다중 인스턴스 배포 전 공통 저장소 또는 신뢰할 수 있는 프록시의 공유 제한을 추가하고 재검증한다.

## 현재 제한값

토큰 버킷은 최초 용량만큼 짧은 연속 요청을 허용하고 시간이 흐르면서 보충한다. 고정된 시간 창이 끝날 때 일괄 해제하는 계정 잠금이 아니다. 허용·실패 여부와 관계없이 시도를 소비하며 로그인 성공으로 제한을 초기화하지 않는다.

| 범위 | 초기 용량 / 보충 기간 | 설정 키: app.rate-limit 아래 |
|---|---|---|
| 보호 대상 전체 | 300 / 60초 | global-requests-per-minute |
| IP별 인증 관련 요청 묶음 | 30 / 60초 | requests-per-ip-per-minute |
| IP별 CSRF 조회 | 120 / 60초 | csrf-requests-per-ip-per-minute |
| IP별 회원가입 | 5 / 900초 | registrations-per-ip, account-window-seconds |
| 아이디별 로그인 | 10 / 900초 | attempts-per-account, account-window-seconds |
| 회원별 비밀번호 변경·탈퇴 묶음 | 10 / 900초 | attempts-per-account, account-window-seconds |

기본 enabled=true, max-entries=10000이다. 버킷 키는 식별값을 SHA-256으로 해시하여 보관하고 1시간 접근이 없으면 제거한다. 해시는 익명화를 보장하는 암호화가 아니며, 값을 로그로 남기지 않는다. 메모리 상한 퇴출로 개별 제한이 초기화될 수 있고 전체 예산은 유지된다.

로그아웃·내 정보 조회·일반 지원 조회는 위 인증 요청 제한의 대상이 아니다. HTTP 429에 `Retry-After`와 안내 메시지를 제공한다. API 변경 요청 본문은 기본 32768바이트로 제한하고 길이 없는 전송도 읽은 바이트 수로 검사한다. 이 제한은 웹 서버/프록시의 연결 수·전송 시간·헤더 크기 제한을 대신하지 않는다.

## 프록시 경계

애플리케이션이 `X-Forwarded-For`를 직접 신뢰하지 않고 `request.getRemoteAddr()`를 사용한다. 운영 프록시에서 실제 IP를 전달하려면 컨테이너의 신뢰 프록시 범위를 제한하고 외부 직접 접속을 차단해야 한다. 이 배포 조건이 없으면 공유 프록시 주소에 요청이 합쳐질 수 있다. 운영 HTTPS 검증에 반드시 포함한다.

## DB 전환 경계

기본 MySQL/demo H2는 기존 개발 경로를 유지하고 Flyway를 비활성화한다. 새 postgres 및 prod 프로필은 Flyway 후 Hibernate validate를 수행한다. baseline-on-migrate=false, clean-disabled=true이다. 기존 DB에 조용히 baseline을 생성하거나 자동 삭제하지 않는다.

V1은 기존 회원/지원 모델, V2는 버전·인증 세대·복수 일정·인덱스, V3는 PostgreSQL용 JDBC 세션이다. 기존 단일 면접일/마감일은 유지한다. 기존 운영 DB가 V1과 동등한지는 아직 확인하지 않았다. V2의 IF NOT EXISTS는 임의의 스키마 차이를 해결해 주지 않는다.

## 검증

2026-09-28: H2/단위 테스트 55개, bootJar 빌드 통과. 새 테스트는 계정/IP 제한, 동시 요청, 시간 경과 보충, 위조 전달 헤더, CSRF 유지, 본문 크기, 비밀번호 길이, 잘못된 JSON을 검사한다.

테스트 설정마다 H2 메모리 DB 이름을 분리했다. 이전 공통 DB 이름에서는 Hibernate가 회원 테이블을 다시 만들 때 JDBC 세션 테이블의 이전 행이 남아 다른 테스트와 충돌했다.

PostgreSQL 전용 작업은 마이그레이션 6개와 기존 실제 세션 흐름 11개를 포함한다. Docker 런타임 소켓 오류로 로컬 실행을 마치지 못했지만, GitHub CI에서 17개 모두 실행되어 실패·오류·건너뜀 0개를 확인했다. [실행 보고서](https://github.com/Bin-925/job-application-tracker/actions/runs/36384189961).

## 참고

- [Bucket4j 공식 문서](https://bucket4j.com/8.18.0/toc.html)
- [Spring Boot 3.5 DB 초기화](https://docs.spring.io/spring-boot/3.5/how-to/data-initialization.html)
- [Flyway 마이그레이션 개념](https://documentation.red-gate.com/flyway/flyway-concepts/migrations)
