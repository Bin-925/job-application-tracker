# 취준노트 개발 현황

기준일: 2026-09-28. `issue-번호`별 PR을 `dev`에 통합하는 개발 현황이며 운영 배포 여부와 구분한다.
현재 상태는 **실제 API 연결, 브라우저 동작, PostgreSQL 및 GitHub CI 검증을 마친 개발 버전**이다.
운영 서비스에 배포하거나 원스토어에 제출한 상태는 아니다.

검증 근거와 브랜치 흐름은 [dev 통합 보고서](DEV_INTEGRATION_2026-09-28.md), 협업 규칙은 [CONTRIBUTING](../CONTRIBUTING.md)을 참고한다.

## 이번 구현

- PWA 입력 보호: 편집 창·계정 입력·저장 중에는 업데이트를 미룬다. 다른 탭에서 서비스 워커가 활성화되어도 작성 중인 화면은 자동 새로고침하지 않는다. 취소 확인, 브라우저 종료 경고, 오프라인 실패 후 입력 유지와 재연결 조회를 추가했다. [학습 노트](PWA_UPDATE_PROTECTION.md).

- 2026-09-28 CI/리뷰 자동화: 프론트·백엔드·PostgreSQL·워크플로 테스트를 분리했다. 모의 리뷰 테스트 13개와 CI 네 작업이 통과했다. Gemini API 키는 미등록이므로 실제 AI 리뷰는 수행하지 못했고 이슈 #8은 열려 있다.
- [CI 사용법, Gemini 키 설정, 남은 설계 순서](CI_AND_AI_REVIEW.md).

- 2026-09-28: Bucket4j/Caffeine 기반 IP·계정별 인증 요청 제한, 429/Retry-After, 32KiB API 본문 한도와 로그인/현재 비밀번호 길이 검증 추가. 단일 서버 메모리 제한이며 다중 서버 공유 제한은 아직 없다.
- PostgreSQL V1~V3 Flyway SQL, 명시적 postgres 프로필, 로컬 compose, PostgreSQL 전용 테스트 및 CI 단계 추가. 운영 DB에는 적용하지 않았다.
- H2/단위 테스트 55개 및 bootJar 통과. 테스트별 H2 DB 격리도 수정했다. 로컬 Docker 장애와 별개로 GitHub의 실제 PostgreSQL 환경에서 마이그레이션·복원 6개와 세션 11개, 합계 17개가 통과했고 건너뛴 테스트는 없다.
- [DB 전환 절차](POSTGRES_MIGRATION.md), [기술 선택 ADR](adr/0003-release-foundation.md), [학습 보충](LEARNING_2026-09-28.md).

- 2026-09-24: JWT/localStorage에서 JDBC 세션+HttpOnly 쿠키로 전환. 로그인 ID 교체, CSRF, 서버 로그아웃, 전체 로그아웃, 비밀번호 변경 시 모든 세션 폐기, 탈퇴 비밀번호 재확인 구현.
- [인증 전환 가이드](SESSION_AUTH_MIGRATION.md), [선택 이유 ADR](adr/0002-jdbc-session-auth.md). 운영 전환과 실제 DB 마이그레이션은 아직 미실행.

- 오늘 / 지원 / 일정 / 내 정보의 네 화면. 모바일 하단 탐색과 데스크톱 좌측 탐색.
- 진행 중 카드: APPLIED, DOC_PASSED, INTERVIEW 상태의 지원 건수.
- 면접 예정 카드: 진행 중인 지원 가운데 미래의 예정 면접이 하나 이상 있는 지원 건수. 여러 면접도 한 건으로 집계.
- 홈 요약과 지원 목록은 동일한 도메인 함수 사용. 홈 링크에는 다른 검색/상태 필터를 붙이지 않는다.
- 검색, 상태, 보기, 정렬을 URL query에 보관.
- 월간 캘린더, 이전/다음/오늘 이동, 날짜별 일정. 지원일은 기본 숨김, 표시 선택은 이 브라우저에 저장.
- 지원 추가/수정/삭제. 지원일은 캘린더 표시 여부와 독립적으로 보존.
- 목록과 상세의 상태 변경. 지원일이 없는 지원을 진행 상태로 바꿀 때 지원일 입력. 기존 지원일 유지.
- 면접 상태 변경 시 면접 일정 등록을 선택할 수 있고, 날짜 없는 면접 일정을 자동 생성하지 않는다.
- 지원별 면접/마감 일정을 여러 개 추가/수정/완료/취소/삭제.
- 이전 interviewDate/deadline은 계속 표시. 수정 시 단일 트랜잭션으로 ScheduleEvent로 변환하며 이전 필드를 비운다.
- 사용자 소유권 검사, 일정 버전 충돌 409, 지원 편집 버전 충돌 409, 회원 탈퇴 시 종속 데이터 삭제.
- 로그인 만료 리다이렉트, 실패 메시지, 저장 중 중복 클릭 차단, 다크 모드, 닉네임/비밀번호 변경.
- PWA manifest, 일반/마스커블 PNG 아이콘, 서비스 워커, 업데이트 배너, 지원 브라우저의 설치 프롬프트.
- 서비스 워커는 정적 앱 파일만 캐시한다. API는 NetworkOnly. 오프라인 쓰기 큐나 개인 기록 오프라인 저장은 없다.

## 실행

필요: JDK 21, Node.js 24, pnpm 11.19.0.
실제 프로젝트 디렉터리는 이 문서의 부모 디렉터리이다. reference 사본은 수정하지 않았다.

```powershell
# frontend 디렉터리
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm check:pwa

# backend 디렉터리
./gradlew.bat test bootJar

# 프로젝트 루트
./scripts/Start-Local.ps1 -JavaHome 'C:/Users/dogok/.jdks/ms-21.0.11'
```

- 개발 화면: http://127.0.0.1:5173
- PWA 빌드 확인: frontend에서 pnpm preview --port 4173, http://127.0.0.1:4173
- API: http://127.0.0.1:8080/api/v1
- 포트가 사용 중이면 Start-Local.ps1의 BackendPort/FrontendPort를 변경한다.
- 로컬 demo 프로파일은 루프백에만 바인딩하고 backend/data의 파일 H2를 사용한다. 운영 PostgreSQL과 분리된다.
- 로그와 실행 PID는 .local에 저장한다. 종료할 때는 해당 PID의 프로세스가 이번 서버인지 확인하고 종료한다.
- 동일 H2 파일을 유지하면 서버 재시작 후에도 DB 세션을 조회할 수 있다. 세션/쿠키가 만료되면 다시 로그인한다.
- scripts/Seed-Demo.ps1은 선택 실행이며 루프백에만 샘플 데이터를 만든다. 중복 실행은 계정 중복 오류로 멈춘다.
- 현재 로컬 체험 계정: localdemo925 / Demo1234. 이 계정은 개발 데이터이며 외부에 공개하면 안 된다.
- H2 데이터와 로그, 비밀키는 Git 추적 대상이 아니다.
- 실제 배포에서는 VITE_API_URL 또는 동일 출처 /api 프록시 설정이 필요하다. Vite 개발 프록시는 배포되지 않는다.
- 운영 프론트도 /api/v1을 사용한다. Vercel 등 실제 배포에는 동일 origin API 프록시가 필요하며 쿠키/CSRF 전달을 별도 검증한다. Railway 직접 URL과 제3자 쿠키에 의존하지 않는다.

## 검증

- Java 테스트 55개: 기존 45개 + 요청 제한/입력 방어 10개. 2026-09-28 통과했으며 H2/단위 검증이다.
- 별도 PostgreSQL 테스트는 GitHub Docker 환경에서 마이그레이션/복원 6개와 세션 11개, 총 17개가 통과했다. 로컬 Docker 장애와 운영 데이터 리허설은 별개다.
- 프론트 Node 테스트 16개: 기존 10개 + 입력 보호/업데이트 상태 전이 6개. PWA 브라우저 테스트는 API fixture를 사용하며 실제 서비스 워커와 Chrome에서 실행한다.
- 프론트 lint 및 production/PWA build.
- PWA manifest/PNG 크기/생성된 캐시 정책 smoke check. 프로덕션 빌드에서도 로컬 로그인과 지원 수정 저장 확인.
- 브라우저: 로그인, 홈 -> 면접 예정 목록, 지원일을 지정한 상태 변경, 캘린더에서 날짜 선택 후 일정 추가,
  새로고침 후 일정 유지, 지원일 필터 유지, 일정 완료 후 집계 제외, 지원 신규 등록.
- 412x915, 320x740, 1440x1000에서 화면 확인. 다크 모드 캘린더 확인.
- 이 검증은 데스크톱 내장 브라우저 기준이다. Galaxy S25 Ultra 실기기 설치/알림/키보드 검증을 대신하지 않는다.
- 운영 PostgreSQL 데이터, 다중 서버 동시성, 실기기 앱 종료·재실행은 별도 출시 검증 대상이다.
- GitHub Actions 네 필수 작업은 dev 통합 CI에서 실행·성공을 확인했다. PWA 입력 보호 PR부터 프론트 작업에 Playwright 회귀 테스트도 포함한다.

## API 변경

- ApplicationResponse에 version, schedules 추가.
- PUT /applications/{id}는 최신 version 필수. 오래된 버전은 409. 프론트/백엔드를 함께 배포해야 한다.
- PATCH /applications/{id}/status는 appliedDate를 선택적으로 받는다. 기존 날짜가 없고 진행 상태로 바뀌면 필수.
- POST /applications/{id}/schedules
- PUT, DELETE /applications/{id}/schedules/{scheduleId}
- PUT, DELETE /applications/{id}/legacy-schedules/{INTERVIEW|DEADLINE}
- 일정 필드: type, title, date, time(선택), state, version(수정 시).
- 현재 일정 시간은 시간대 없는 현지 날짜/시간이다. 한국 사용을 기준으로 검증했으며 해외 시간대 자동 변환은 지원하지 않는다.

## 출시 전 필수 게이트

1. PostgreSQL Flyway V1~V3와 백필 코드 및 실제 PostgreSQL CI 검증을 완료했다. 운영 스키마 대조와 운영 데이터 백업/복구 리허설은 필요하다.
   기본 MySQL/demo는 로컬 개발 편의를 유지하며 Flyway를 사용하지 않는다. postgres/prod는 Flyway 후 validate를 수행한다.
   기존 DB는 자동 baseline하지 않으므로 구조를 검토하고 명시적 기준점을 준비해야 한다.
2. 인증 후속: 단일 서버 로그인 시도 제한을 추가했다. 실제 DB/HTTPS 환경의 세션 검증과 신뢰 프록시 IP, 다중 서버 공유 제한은 남았다.
   HttpOnly 세션, CSRF, 전체 로그아웃, 비밀번호 변경/탈퇴 시 폐기는 로컬 구현했다.
3. CORS wildcard는 제거했다. 실제 운영 origin 지정과 쿠키 프록시 검증이 남았다.
4. HTTPS 스테이징에서 로그인/캐시 분리/업데이트/오프라인 실패 경로/보안 헤더 검사.
5. 알림: 권한 안내, 구독 수명주기, 서버 예약 작업, 중복 발송 방지, 실패 기록.
   지금의 일정 표시를 푸시 알림 구현으로 간주하지 않는다.
6. Galaxy S25 Ultra에서 키보드, 뒤로가기, 설치, 재실행, 로그아웃, 계정 변경을 직접 확인.
7. 원스토어: 개발자 계정, 패키지명/서명키, 개인정보처리방침/탈퇴 정책,
   TWA 적합성 및 assetlinks 검증 후 패키징과 심사 준비. 현재 Android 패키지는 만들지 않았다.
8. 운영 비용을 실제 배포 구성으로 비교한 뒤 EC2 전환 여부 결정. 이번 개발 때문에 EC2를 도입하지 않았다.

## 다음 개발 단위

사용자 요청에 따라 스테이징을 생성하기 전에 [배포 방식 비교](DEPLOYMENT_COMPARISON.md)를 작성했다. Vercel·Railway 유지, Railway 통합, Lightsail, EC2를 비교하며 실제 환경 선택·요금 결제·배포는 수행하지 않았다.

남은 작업은 #20 HTTPS 스테이징·운영 복제 DB 검증 → #21 Web Push → #22 원스토어 준비 순서다. #19는 입력 중 PWA 업데이트 보호이며, #8 Gemini 실제 리뷰는 API 키 등록 대기다.
S25 Ultra 실기기 검증, 운영 데이터 이전 및 복구 리허설은 자동 테스트와 구분한다. 입력 중 업데이트 보호는 구현했지만 브라우저 프로세스 강제 종료 후 초안 복구는 제공하지 않는다.
아바타 편집과 기존 별도 알림 목록 화면은 새 UI에 이식하지 않았으며, 개인정보/알림 흐름을 설계할 때 다시 결정한다.
