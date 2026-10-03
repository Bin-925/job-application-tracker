# 실제 기록을 보관하는 로컬 PostgreSQL

## 무엇이 달라졌나

이전 부하 테스트 DB는 중지하면 데이터가 사라지는 tmpfs였다. 이번 DB는 Docker named volume에 저장하므로 앱·컨테이너·PC를 다시 시작해도 데이터가 남는다. **로컬 개발용 영구 DB이지 인터넷에 배포한 운영 DB는 아니다.**

| 구분 | 영구 개발 DB | 부하 테스트 DB |
|---|---|---|
| Docker 그룹 | jobtracker-dev | jobtracker-load |
| 컨테이너 | jobtracker-postgres | jobtracker-load-postgres |
| 호스트 연결 | 127.0.0.1:5433 | 127.0.0.1:15434 |
| DB | jobtracker | 실행별 임시 DB |
| 데이터 | jobtracker-postgres-data 볼륨 | tmpfs, 중지하면 삭제 |
| 목적 | 실제 가입·지원 기록 개발 | 가상 데이터 부하 실험 |

## 실행과 중지

JDK 21, Node.js 24, pnpm 11.19.0, Docker Desktop Linux 엔진이 필요하다. 처음에는 `backend/gradlew.bat bootJar`와 `frontend`의 `pnpm install --frozen-lockfile`을 실행한다.

저장소 루트에서:

```powershell
./scripts/Start-Local.ps1 -JavaHome 'JDK 21 설치 경로'
# 기본: 화면 http://127.0.0.1:5173, API http://127.0.0.1:8080/api/v1

# 화면과 API만 종료, DB 데이터 유지
./scripts/Stop-Local.ps1

# PostgreSQL도 잠시 종료할 때
docker stop jobtracker-postgres

# DB만 켜고 싶을 때
./scripts/Start-Postgres.ps1
```

이미 점유된 포트는 기존 프로그램을 종료하지 않고 오류를 낸다. `-BackendPort 8190 -FrontendPort 5190` 등으로 다른 포트를 지정할 수 있다. 오래된 파일 H2 demo가 필요할 때만 `-Database demo`를 명시한다. 데이터가 합쳐지는 것은 아니며, MySQL/H2의 기존 기록도 자동 이관하지 않는다.

개발 실행기는 PostgreSQL 컨테이너 준비 → Flyway V1~V3/엔티티 검증 → API 준비 확인 → Vite 시작 순서로 진행한다. DB 준비가 실패하면 화면만 실행해 성공처럼 표시하지 않는다. Docker가 재시작되면 DB는 `unless-stopped` 정책에 따라 올라올 수 있지만, Java/Vite 앱은 다시 실행해야 한다.

## 비밀번호와 권한

- 첫 실행에서 서로 다른 256비트 난수 비밀번호 두 개를 생성한다. Git에 제외된 `.local/postgres/admin-password`, `.local/postgres/app-password`에 보관하고 Windows 폴더 ACL을 현재 사용자와 SYSTEM으로 제한한다.
- Docker Compose secret 파일을 사용하며 YAML/README에 실제 비밀번호를 넣지 않는다. 로컬 파일은 암호화된 비밀 저장소가 아니므로 PC 계정과 디스크도 보호해야 한다.
- `jobtracker_admin`은 DB 초기화/관리 계정이다. **앱은 `jobtracker`로 연결**하며 superuser, DB 생성, 역할 생성, 복제 권한이 없다.
- 앱 계정은 `jobtracker` DB의 소유자로 Flyway DDL을 수행한다. 운영 환경에서는 migration 계정과 CRUD 전용 실행 계정을 추가로 분리하는 방식을 검토한다.
- 비밀번호는 백엔드 자식 프로세스의 환경변수로만 전달하고 프론트에는 전달하지 않는다. `application-secret.yml`을 자동 읽어 다른 DB에 연결하는 것도 막는다.
- 데이터 볼륨이 이미 있는데 비밀번호 파일이 사라졌으면 자동 재발급하지 않고 중단한다. 원래 파일을 복구하거나 명시적인 비밀번호 변경 절차를 밟아야 한다. 파일의 내용만 바꿔서는 기존 DB 비밀번호가 바뀌지 않는다.
- 포트는 loopback에만 열어 외부 기기에서 바로 접속할 수 없게 한다. 이는 HTTPS 운영 배포를 대신하지 않는다.

IntelliJ에서 직접 Java를 실행하면 PowerShell 실행기의 환경변수가 자동 전파되지 않는다. `postgres` 프로필과 `DATABASE_URL=jdbc:postgresql://127.0.0.1:5433/jobtracker`, `DB_USERNAME=jobtracker`, `DB_PASSWORD`를 해당 실행 구성에 별도로 연결해야 한다. 비밀번호가 들어간 실행 구성을 Git에 공유하지 않는다. 가장 간단한 검증 경로는 위 실행 스크립트다.

## 보존과 백업

`docker stop`, 재시작, 컨테이너 재생성은 named volume을 유지한다. **`docker compose down -v`, `docker volume rm`, Docker 데이터 초기화는 사용하지 않는다.** 영구 볼륨은 백업이 아니다. 중요한 기록을 저장하기 시작하면 `pg_dump` 백업을 별도 디스크에도 보관하고 복원 검증을 해야 한다.

백업 예시(실행 전 저장소 루트에서 `.local/backups` 생성):

```powershell
New-Item -ItemType Directory -Force .local/backups
docker exec jobtracker-postgres pg_dump -U jobtracker_admin -d jobtracker -Fc -f /tmp/jobtracker.dump
docker cp jobtracker-postgres:/tmp/jobtracker.dump .local/backups/jobtracker.dump
```

예시 파일명은 재실행하면 덮어쓰므로 실제 보관 시 날짜를 붙인다. 비밀번호 파일도 안전하게 별도 보관한다. 운영 DB 이전과 복원 게이트는 [기존 절차](POSTGRES_MIGRATION.md)를 따른다.

## 이번 검증

2026-10-03 PostgreSQL 17에서 새 DB의 Flyway V1/V2/V3 성공, 프론트 프록시를 통한 회원가입·로그인·지원 등록·일정 추가를 확인했다. Java/Vite를 종료하고 **컨테이너 ID가 바뀌도록 재생성한 뒤**, 같은 지원/일정과 JDBC 로그인 세션이 유지됨을 API로 확인했다. 검증 계정은 비밀번호 확인을 거쳐 탈퇴시켜 정리했다. 기존 MySQL/H2나 타 프로젝트 데이터는 읽거나 변경하지 않았다.

이 확인은 기존 데이터 이관, 원격 운영 배포, 재해 복구 성공을 의미하지 않는다. 실제 데이터에 k6 가상 계정을 쌓지 않도록 부하 테스트는 계속 별도 컨테이너에서 실행한다.
