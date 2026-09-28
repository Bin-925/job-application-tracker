# PostgreSQL 마이그레이션 실행 가이드

2026-09-28: 코드와 테스트 작업 추가. 실제 운영 DB 이관·백업·복원은 실행하지 않았다. 로컬 Docker 엔진 오류로 아래 PostgreSQL 테스트는 아직 통과 확인 전이다.

## 파일 구조

```text
backend/src/main/resources/db/migration/postgresql/
  V1__legacy_member_and_application.sql
  V2__versioned_schedules_and_auth_revision.sql
  V3__jdbc_sessions.sql
```

V1은 빈 DB에서 기존 회원·지원 테이블을 만든다. V2는 auth_version과 version의 NULL을 0으로 채우고 복수 일정 및 조회 인덱스를 준비한다. 이미 존재하는 버전 값은 유지한다. V3는 PostgreSQL BYTEA 기반의 Spring Session 테이블을 만든다.

SQL 적용 이후의 수정은 이미 적용한 파일을 고치지 말고 새로운 V4, V5 등으로 추가한다. 체크섬 불일치를 무작정 repair로 덮지 않는다.

## 별도의 새 로컬 DB로 시작

Docker가 실행 가능하고 5433 포트가 비어 있는 환경에서 프로젝트 루트 기준으로 실행한다. 운영 비밀번호를 재사용하지 않는다.

```powershell
$env:POSTGRES_PASSWORD = '로컬 전용으로 정한 비밀번호'
docker compose up -d db
$env:DB_PASSWORD = $env:POSTGRES_PASSWORD
Set-Location backend
./gradlew.bat bootRun --args='--spring.profiles.active=postgres --server.port=8093'
```

기본 접속값은 `127.0.0.1:5433/jobtracker`, 계정 `jobtracker`다. 접속 주소는 DATABASE_URL, 계정은 DB_USERNAME으로 바꿀 수 있다. 별도 postgres 프로필은 루프백으로만 바인딩한다. 최초 비밀번호는 볼륨 초기화 시에만 적용되므로 환경변수만 바꿔 기존 DB 비밀번호가 바뀐다고 기대하지 않는다.

일반 종료는 `docker compose stop db`다. 데이터를 보관하는 볼륨을 삭제할 이유는 없다. 실행 중인 기존 MySQL 서버와 같은 포트를 사용하지 않는다.

## 자동 검증

Java 21 및 실행 가능한 Docker 엔진이 필요하다.

```powershell
# backend 폴더
./gradlew.bat test
./gradlew.bat postgresTest
```

test는 H2와 단위 테스트, postgresTest는 새 임시 PostgreSQL 17 컨테이너를 사용하는 별도 작업이다. 현재 운영 URL이나 로컬 사용자 DB는 받지 않는다. 테스트가 끝나면 Testcontainers가 자신의 컨테이너를 정리한다.

| 검사 | 기대 결과 |
|---|---|
| 빈 DB → 최신 | V1~V3 적용 후 재실행 시 새 적용 없음 |
| V1 데이터 → 최신 | 지원 메모·날짜 보존, 버전 0 백필 |
| 비어 있지 않은 이력 없는 DB | 자동 적용 거절, 검토 후 명시적 baseline 필요 |
| 기존 auth_version/version | 값 9/7 등을 그대로 보존 |
| 적용 이력 체크섬 불일치 | validate 실패 |
| pg_dump → 별도 새 DB 복원 | 메모와 Flyway 이력 보존 |
| 실제 세션 프로토콜 11개 | PostgreSQL에서 로그인·CSRF·폐기·만료 등 재검증 |

GitHub Actions에도 postgresTest를 추가했다. 파일을 추가했다는 사실만으로 원격 CI 성공을 의미하지 않는다.

## 기존 운영 DB 전환

이 절차는 자동 실행 스크립트가 아니다. 실제 운영 DB의 종류·스키마·데이터를 확인한 뒤 진행한다.

1. 기존 DB가 PostgreSQL인지 MySQL인지 확인한다. MySQL → PostgreSQL 데이터 이관은 이 SQL 세 개만으로 해결되지 않는다.
2. DB 덤프와 스키마 정의를 보관하고 별도 PostgreSQL에 복원한다. 백업을 원래 DB에 덮어쓰지 않는다.
3. 복원한 구조를 V1 기준 및 현재 엔티티와 비교한다. 타입·제약·시퀀스·기존 일정 테이블·세션 테이블을 포함한다.
4. V1과 동등한 기존 구조임을 검토한 경우에만 Flyway CLI 등에서 baseline version 1을 명시적으로 기록한다. 현재 작업에는 CLI 설치나 실제 baseline 실행이 포함되지 않는다.
5. 복원본에 V2/V3 적용 후 Hibernate validate, API, 계정 분리, 일정·메모 보존, 로그인/폐기를 검증한다.
6. MySQL 이관 또는 구조 불일치가 있다면 실제 스키마에 맞는 별도 이관을 먼저 작성하고 복원본에서 반복 검증한다.
7. 운영 전환 창·새 백업·재로그인 안내·프론트와 백엔드 동시 전환·문제 발생 시 복구 순서를 정한 뒤 적용한다.

기존 DB에 prod를 실행했을 때 Flyway 이력이 없어 중단될 수 있다. 이는 baseline-on-migrate=false의 의도된 동작이다. 해당 옵션을 true로 바꿔 우회하지 않는다.

## 출시 전 남은 것

실제 운영 데이터 복원 리허설, MySQL/PostgreSQL 선택 확정, 동일 HTTPS origin, 신뢰 프록시의 IP 처리와 Secure 쿠키, 여러 서버의 세션·요청 제한 검증이 남아 있다. 이번 코드가 운영 이관 완료를 의미하지 않는다.
