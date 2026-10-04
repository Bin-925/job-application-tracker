# 문서 안내

문서가 많아서 어떤 것이 최신인지 한눈에 보도록 정리했습니다. 기준일: 2026-10-04.

## 1. 현재 기준 문서 (최신 유지)

| 문서 | 내용 |
|---|---|
| [README](../README.md) | 현재 기능·보안·API·실행 방법. **가장 먼저 보는 기준** |
| [PRD](../PRD.md) | 문제 정의, 목표, 범위, 로드맵 |
| [CONTRIBUTING](../CONTRIBUTING.md) | 브랜치·이슈·커밋·PR 규칙 |
| [AGENTS](../AGENTS.md) | AI 코딩 도구용 작업 규칙 |
| [ADR](adr) | 주요 기술 결정과 대안 (0001 흐름·PWA, 0002 세션 인증, 0003 요청 제한·마이그레이션) |
| [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) | 개발 현황과 출시 전 게이트 |
| [CI_AND_AI_REVIEW](CI_AND_AI_REVIEW.md) | CI와 Gemini 리뷰 설정 |
| [LOCAL_POSTGRESQL](LOCAL_POSTGRESQL.md) | 영구 개발 DB의 실행·중지·권한·보존·백업 |
| [POSTGRES_BACKUP](POSTGRES_BACKUP.md) | 세션 제외 백업과 격리 복원 검증, 보관 한계 |
| [LOAD_TESTING](LOAD_TESTING.md) | 별도 테스트 DB로 실행하는 k6 시나리오와 한계 |
| [AI_COLLABORATION](../AI_COLLABORATION.md) | AI 도구 활용 범위 |

## 2. 작업 기록 (작성 시점 기준, 수정하지 않음)

| 문서 | 시점 | 내용 |
|---|---|---|
| [SESSION_AUTH_MIGRATION](SESSION_AUTH_MIGRATION.md) | 2026-09-24 | JWT → 세션 전환과 배포 전 확인 |
| [POSTGRES_MIGRATION](POSTGRES_MIGRATION.md) | 2026-09-28 | PostgreSQL 이전·복원 절차 |
| [LOAD_TEST_RESULTS_2026-10-03](LOAD_TEST_RESULTS_2026-10-03.md) | 2026-10-03 | k6 부하 테스트 결과 |
| [PWA_UPDATE_PROTECTION](PWA_UPDATE_PROTECTION.md) | #19 | 업데이트와 입력 보호 |
| [PWA_CI_REGRESSION](PWA_CI_REGRESSION.md) | #25 | 브라우저 테스트 대기 안정화 |
| [DEPLOYMENT_COMPARISON](DEPLOYMENT_COMPARISON.md) | #20 | 배포 방식 비교 (선택 전) |
| [DEV_INTEGRATION_2026-09-28](DEV_INTEGRATION_2026-09-28.md) | 2026-09-28 | dev 통합과 브랜치 보호 |
| [design-qa](../design-qa.md) | 2026-09-23 | 화면 QA 기록 |

## 3. 학습 자료

| 문서 | 내용 |
|---|---|
| [study](study/README.md) | 통합 학습 노트 |
| [LEARNING_2026-09-28](LEARNING_2026-09-28.md) | 요청 제한·DB 변경 이력 보충 |

## 4. 과거 자료 (현재 사실로 쓰지 않음)

| 문서 | 이유 |
|---|---|
| [planning](planning) | 2026-09-23 구현 전 제안 설계 |
| [TEST_CASES](TEST_CASES.md) | 1차 버전의 테스트 19개 기준. 현재 수치는 README 참고 |
| [TROUBLESHOOTING](../TROUBLESHOOTING.md) | 1차 개발·배포 문제 기록 (JWT·Railway·CORS) |

## 새 문서를 만들 때

- 현재 사실을 바꾸는 내용이면 새 문서 대신 README·ADR을 고친다.
- 작업 기록은 날짜나 이슈 번호를 적고 이 표의 2번에 추가한다.
