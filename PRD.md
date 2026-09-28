# 📒 PRD — 취준노트 (Job Application Tracker)

> **작성자**: Bin (GitHub: [Bin-925](https://github.com/Bin-925))
> **기준**: 2026-09-28 `dev` 개발 버전. 현재 기능과 검증 범위의 최종 기준은 [README](README.md)입니다.
> **관련 문서**: [README](README.md) · [문서 안내](docs/README.md) · [협업 규칙](CONTRIBUTING.md) · [AI 협업 기록](AI_COLLABORATION.md)

<br/>

## 0. 버전 이력

| 버전 | 시기 | 핵심 |
|---|---|---|
| 1차 | 2026-06 ~ 07 | JWT/localStorage 인증, Tailwind UI, Vercel + Railway 배포 |
| 2차 (현재 개발) | 2026-09 ~ | JDBC 세션 인증, 복수 일정, PWA, Flyway, 요청 제한, CI·AI 리뷰. 운영 배포 전 |

1차의 설계 이유는 과거 기록으로 남기고, 이 문서는 **현재 개발 버전**을 설명합니다.

<br/>

## 1. 개요

**취준노트**는 구직자가 지원 기록, 진행 상태, 면접·마감 일정을 한곳에서 관리하는 모바일 우선 웹/PWA 서비스입니다. 본인의 실제 구직 활동에 쓸 도구가 필요했던 것이 출발점이며, 백엔드 중심 풀사이클 개발 역량을 보여주는 포트폴리오이기도 합니다.

<br/>

## 2. 문제 정의

- 지원 현황이 스프레드시트·메모에 흩어져 **진행 상태를 한눈에 보기 어려움**
- 서류 마감·면접이 여러 회사에 걸쳐 있어 **일정을 놓치기 쉬움**
- 한 회사에 면접이 여러 번 있어 **날짜 하나로는 기록이 부족함**

**해결 방향**: 지원을 상태로 관리하고, 일정은 지원별로 여러 개 등록해 오늘 화면과 월간 캘린더로 보여줍니다.

<br/>

## 3. 목표 사용자

- **1차 사용자**: 본인 (실제 구직 활동에 사용)
- **2차 사용자(가정)**: 여러 회사에 동시 지원하는 취업 준비생

<br/>

## 4. 목표

| 목표 | 설명 |
|---|---|
| 지원 현황 가시성 | 진행 중·면접 예정 지원을 오늘 화면에서 바로 확인 |
| 일정 누락 방지 | 지원별 복수 일정과 월간 캘린더 |
| 실사용 완성도 | 휴대폰에서 반복해서 여는 흐름을 PWA로 검증 |
| 기술 역량 증명 | 인증·인가, 동시 수정, DB 변경 관리, 테스트·CI를 설명 가능하게 구현 |

<br/>

## 5. 핵심 기능 (현재 개발 버전)

| # | 기능 | 설명 |
|:-:|------|------|
| 1 | **회원 인증** | JDBC 세션 + HttpOnly 쿠키, CSRF 검사, BCrypt, 아이디 중복 확인 |
| 2 | **지원 관리** | 회사·직무·지원일·메모·공고 주소 등록/수정/삭제 |
| 3 | **상태 관리** | 지원 예정 → 지원 완료 → 서류 합격 → 면접 → 최종 합격/불합격. 강제 상태 머신은 아님 |
| 4 | **복수 일정** | 지원별 여러 면접·마감, 예정·완료·취소 상태 |
| 5 | **소유권 기반 인가** | 서버가 로그인 회원과 기록 소유자를 비교 |
| 6 | **동시 수정 보호** | 지원·일정 편집에 `version` 비교, 충돌 시 409 |
| 7 | **오늘 화면·검색·필터** | 진행 중·면접 예정 카드, URL 기반 검색·필터·정렬 |
| 8 | **월간 캘린더** | 날짜별 일정, 지원일·면접·마감 표시 선택 |
| 9 | **계정 관리** | 닉네임·비밀번호 변경, 현재/전체 로그아웃, 비밀번호 재확인 후 탈퇴 |
| 10 | **PWA·입력 보호** | 설치·정적 캐시·업데이트 안내, 작성 중 업데이트 보류 |
| 11 | **요청 방어** | 인증 요청 빈도 제한(429), API 본문 32KiB 제한 |
| 12 | **다크 모드** | 라이트/다크 테마 전환 |

<br/>

## 6. 비범위 (Out of Scope)

| 항목 | 제외 사유 |
|---|---|
| 채용정보 API 연동 | 1차 때 사람인·워크넷 연동을 계획했으나 코드로 구현하지 않음. 현재 범위에서 제외. 엔티티의 `source`·`externalJobId` 필드와 `ApplicationSource` enum만 남아 있음 |
| 인앱 알림 목록 | 새 UI로 이식하지 않음. 일정 알림은 Web Push로 별도 설계 예정 |
| 아바타 편집 UI | API는 유지, 새 UI에는 미포함 |
| 오프라인 쓰기 | 중복·충돌·계정 분리 문제로 제외. 저장 실패 시 입력만 유지 |
| 상태 변경 이력 저장 | 현재 상태만 관리 |
| 팀 협업 기능 | 개인용 도구로 범위를 한정 |

<br/>

## 7. 데이터 모델

```
MEMBER 1 ── N APPLICATION 1 ── N SCHEDULE_EVENT
```

| 엔티티 | 핵심 필드 |
|---|---|
| MEMBER | id, username, password(BCrypt), nickname, avatar, role, authVersion |
| APPLICATION | id, member, company, position, status, appliedDate, link, memo, version |
| SCHEDULE_EVENT | id, application, type(INTERVIEW/DEADLINE), title, date, time, state, version |

- `version`: 오래된 편집 거부 (낙관적 잠금)
- `authVersion`: 전체 로그아웃·비밀번호 변경 후 오래된 세션 거부
- APPLICATION의 `deadline`·`interviewDate`는 이전 단일 날짜 호환용으로 남아 있음
- 정확한 칼럼과 제약은 Entity와 `db/migration`의 Flyway SQL이 기준

<br/>

## 8. 기술 스택 및 선정 이유

| 영역 | 선택 | 이유 · 대가 |
|---|---|---|
| 백엔드 | Java 21, Spring Boot 3.5 | 기존 기반 유지, 검증·트랜잭션·보안을 일관되게 처리 |
| 인증 | Spring Security + Spring Session JDBC | 웹·PWA가 주 클라이언트이고 서버에서 로그인을 폐기해야 해서 세션 선택. 대가는 세션 DB 조회 비용. [ADR 0002](docs/adr/0002-jdbc-session-auth.md) |
| DB | PostgreSQL + Flyway | 운영 데이터·세션 저장, SQL 변경 이력 관리. MySQL은 기존 로컬 설정, H2는 테스트·demo용 |
| 요청 제한 | Bucket4j + Caffeine | 로그인 추측 방어. 단일 서버 기준이라 다중 서버에선 재설계 필요 |
| 프론트 | React 19, JavaScript, React Router, Axios | 기존 코드 활용. TypeScript는 필요한 영역부터 점진 검토 |
| UI | CSS custom properties, Lucide, date-fns | 테마·아이콘·날짜 계산 통일. 1차의 Tailwind는 새 UI에서 사용하지 않음 |
| PWA | Vite, vite-plugin-pwa, Workbox | 별도 앱 개발 전 설치·재사용 경험 검증. 개인정보 API는 캐시하지 않음 |
| 테스트·CI | JUnit, MockMvc, Testcontainers, Playwright, GitHub Actions | 로직·HTTP·실제 DB·브라우저를 나눠 검증 |
| AI 리뷰 | Gemini API (GitHub Actions) | PR 보조 리뷰. 승인·병합은 결정하지 않음 |

<br/>

## 9. 배포 상태

| 구분 | 상태 |
|---|---|
| 1차 배포 (Vercel + Railway) | 과거 버전 기준. 현재 개발 코드와 인증·API가 다름 |
| 2차 운영 배포 | **보류**. 예산 결정 전 |
| 검토 방향 | Railway 통합 운영을 우선 고려, 이후 EC2에서 AWS 운영 학습 |

상세 비교: [배포 방식 비교](docs/DEPLOYMENT_COMPARISON.md)

<br/>

## 10. 로드맵

| 상태 | 항목 |
|:-:|---|
| ✅ | 세션 인증·CSRF·계정 관리 |
| ✅ | 지원·복수 일정·월간 캘린더·오늘 화면 |
| ✅ | 요청 제한·본문 크기 제한 |
| ✅ | Flyway 마이그레이션, PostgreSQL CI 검증 |
| ✅ | PWA 설치 기반·업데이트 보호 |
| ✅ | 필수 CI 4개, Gemini PR 리뷰 |
| ⏳ | 예산·배포 방식 결정 → HTTPS 스테이징 ([#20](https://github.com/Bin-925/job-application-tracker/issues/20)) |
| ⏳ | Web Push ([#21](https://github.com/Bin-925/job-application-tracker/issues/21)) |
| ⏳ | Galaxy S25 Ultra 실기기 검증, 원스토어 준비 ([#22](https://github.com/Bin-925/job-application-tracker/issues/22)) |

<br/>

## 11. 참고 문서

- [README](README.md) — 현재 기능·보안·API·실행 방법의 기준
- [문서 안내](docs/README.md) — 어떤 문서가 최신이고 어떤 문서가 시점 기록인지
- [ADR](docs/adr) — 주요 기술 결정과 대안
- [트러블슈팅](TROUBLESHOOTING.md) — 1차 개발·배포 중 겪은 문제
- [AI 협업 기록](AI_COLLABORATION.md) — AI 도구 활용 범위
