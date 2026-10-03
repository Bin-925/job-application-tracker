# AGENTS.md

취준노트: 지원 기록·진행 상태·면접/마감 일정을 관리하는 웹/PWA. Spring Boot 백엔드 + React 프론트.

## 어떤 문서를 믿을까

| 우선순위 | 문서 | 용도 |
|---|---|---|
| 1 | 코드, `db/migration` | 실제 동작 |
| 2 | `README.md`, `docs/adr/` | 현재 기능과 기술 결정 |
| 3 | `CONTRIBUTING.md` | 브랜치·이슈·커밋·PR 규칙 (작업 전 반드시 읽기) |
| 참고 | `docs/README.md` | 문서 목록과 최신 여부 |

`docs/planning/`은 구현 전 제안, 날짜가 붙은 보고서는 작성 시점 기록이다. 현재 사실로 쓰지 않는다.

## 명령어

```bash
# backend
./gradlew test bootJar        # Windows: .\gradlew.bat test bootJar
./gradlew postgresTest        # Docker 필요

# frontend
pnpm install --frozen-lockfile
pnpm lint && pnpm test && pnpm build && pnpm check:pwa
pnpm test:e2e                 # build 후 실행

# 로컬 실행 (영구 PostgreSQL, Docker 필요; H2는 -Database demo)
./scripts/Start-Local.ps1
```

## 반드시 지킬 것

- 작업은 `issue-번호` 브랜치에서 하고 dev 대상 PR로 합친다. main·dev에 직접 push하지 않는다.
- main 배포는 별도 지시가 있을 때만 한다.
- 인증은 JDBC 세션 + CSRF다. JWT/localStorage 방식으로 되돌리지 않는다.
- 이미 적용된 Flyway SQL은 수정하지 않고 새 버전 파일을 만든다.
- 서버에서 소유권을 검사한다. 요청 본문의 memberId로 소유자를 정하지 않는다.

## 하지 말 것

- `application-secret.yml`, `.env*`, API 키를 읽어서 출력하거나 커밋하지 않는다.
- 테스트를 삭제·skip하거나 CSRF·보안 설정을 꺼서 통과시키지 않는다.
- 운영 DB나 운영 배포 환경에 접속·변경하지 않는다.

## 완료 보고

실행한 검증과 실행하지 않은 검증을 구분해서 적는다. CI 통과, 배포, 출시는 서로 다른 상태다.
