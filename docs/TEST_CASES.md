# 테스트 케이스

총 **19개** 테스트로 인증·인가·핵심 로직을 검증합니다.
`./gradlew test`로 전체 실행되며, GitHub Actions(CI)에서 push마다 자동 실행됩니다.

## 단위 테스트 (Service 계층)

### MemberServiceTest (5)
| 테스트 | 검증 내용 |
|---|---|
| join_success | 회원가입 성공 (중복 체크 + 비밀번호 암호화 + 저장) |
| join_duplicate | 중복 username이면 예외 |
| login_success | 로그인 성공 |
| login_wrong_password | 비밀번호 불일치 시 예외 |
| login_not_found | 존재하지 않는 회원 예외 |

### ApplicationServiceTest (8)
| 테스트 | 검증 내용 |
|---|---|
| create_success | 지원 생성 성공 |
| create_memberNotFound | 회원 없으면 예외, 저장 안 함 |
| getMyApplication_success | 본인 지원 조회 |
| getMyApplication_notFound | 없는 지원 → 404 |
| getMyApplication_forbidden | ★ 타인 지원 접근 → 403 |
| delete_forbidden | ★ 타인 지원 삭제 차단 (delete 미호출) |
| changeStatus_success | 상태 변경 |
| getStats_fillsAllStatuses | ★ 0개 상태 포함 통계 집계 |

## 통합 테스트 (HTTP + Security)

### ApiIntegrationTest (5)
| 테스트 | 검증 내용 |
|---|---|
| join_returns201 | 회원가입 API → 201 |
| accessWithoutToken_returns401 | ★ 토큰 없이 요청 → 401 |
| fullFlow_success | ★ 가입→로그인→생성→조회 전체 흐름 |
| accessOthersApplication_returns403 | ★ 남의 지원 접근 → 403 |
| getNonExistent_returns404 | 없는 지원 → 404 |

### JobtrackerApplicationTests (1)
| 테스트 | 검증 내용 |
|---|---|
| contextLoads | 애플리케이션 컨텍스트 정상 로딩 |

> ★ = 인증·인가 핵심 검증