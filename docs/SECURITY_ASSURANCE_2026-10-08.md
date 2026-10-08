# 추가 기능 보안·회귀 검증 (2026-10-08)

## 결론의 범위

이 보고서는 #84의 로컬 검증 기록이다. 모든 가능한 시나리오, 무결점, 취약점 부재를 보장하지 않는다. 알려진 문제를 찾고 수정한 뒤 정상·실패·동시성·장애·부하를 구분해 반복 검증했다. 실제 계정과 영구 개발 DB에는 부하나 장애를 주지 않았다.

## 기능 회귀

보안 라이브러리 변경 후 로컬에서 다음을 새로 실행했다. skip 0, 실패 0이다.

| 검사 | 결과 | 핵심 범위 |
|---|---:|---|
| H2·단위·통합 | 126개 통과 | CSRF, 세션 수명·회전·전체 폐기, 소유권, 메일·일회 토큰, OIDC, 요청 제한 |
| 실제 PostgreSQL | 76개 통과 | Flyway V1~V7, 복원, JDBC 세션, 동시 가입·일회 토큰, OIDC 15개 |
| 프론트 Node | 20개 통과 | 날짜, 초안 저장 경계, 공통 API 동작 |
| Playwright | 64개 통과 | 입력 보존/삭제, PWA, 아바타, 캘린더, 가입·재설정·Google 화면 |
| 자동화 Node | 16개 통과 | Gemini 입력·권한·오류 처리 14개, 영구 DB 구성 2개 |
| k6 안전 설정 Node | 3개 통과 | 로컬 주소·프로필 허용 목록, VU 상한, 격리 확인 필수 |
| 그 외 | 통과 | lint, 프론트 빌드/PWA 산출물, bootJar, Windows 백업 ACL, 임시 PostgreSQL 복원 |

새로운 회귀에는 Google 8개 브라우저의 동시 인증 후 각 회원 ID/세션 분리, 다른 브라우저 state 교환 거부, 로그아웃 후 완료된 state 재사용 거부, Google 경로 간 IP 제한 공유가 포함된다. 제공자는 로컬 모의 HTTP OIDC 서버이며 실제 Google 계정 검증은 아니다.

비밀번호 재설정 화면은 네트워크 단절과 503에서 입력을 보존하고, 처리 중 중복 제출을 막으며, 온라인 복귀만으로 변경 요청을 재전송하지 않는다. 비밀번호·메일 토큰은 localStorage/sessionStorage에 저장하지 않는지도 확인했다.

## 공급망 점검 및 수정

패키지 이름·해결된 버전만 공개 advisory 서비스에 전송했다. 코드·계정·Secret은 전송하지 않았다.

| 범위 | 수정 전 | 수정 후 |
|---|---:|---:|
| frontend pnpm audit | 40건 (high 20, moderate 19, low 1) | 0건 |
| .github npm audit | 1건 (moderate) | 0건 |
| backend OSV, runtime 106개 | 19개 advisory 일치 | 2개 일치, 아래 참고 |

경고 수는 실제 침해 건수나 서로 독립적인 공격 경로의 수가 아니다. 개발 도구/Node 전용 경로 등 현재 브라우저 제품과 다른 조건의 경고도 포함되며, 가능한 수정은 적용했다.

| 구성요소 | 이전 | 적용 버전 | 선택 이유 |
|---|---|---|---|
| Axios | 1.17.0 | 1.20.0 | 요청 구성·프로토타입 관련 유지보수 패치 |
| React Router | 7.17.0 | 7.18.4 | 리다이렉트·라우팅 관련 같은 주 버전 수정 |
| Sharp | 0.35.4 | 0.35.5 | 이미지 도구 보안 패치 |
| 프론트 간접 의존성 | 취약한 잠금 버전 | 잠금파일 참고 | brace-expansion, postcss, nanoid, source-map-js 패치 |
| serialize-javascript | 7.1.1 | 7.1.2 | Workbox 하위 도구의 고정 버전을 좁은 범위 override로 보완 |
| 자동화 YAML | 2.8.1 | 2.8.3 | 과도하게 중첩된 YAML의 스택 소진 수정 |
| Jackson BOM | 2.21.4 | 2.21.7 | 동일 2.21 계열의 JSON 처리 보안 패치 |
| Tomcat | 10.1.55 | 10.1.60 | 같은 Servlet/Tomcat 계열의 보안 유지보수 |
| PostgreSQL JDBC | 42.7.11 | 42.7.12 | channel binding 처리 수정 |
| Log4j API | 2.24.3 | 2.25.5 | JSON 직렬화 패치, Logback 기반 로깅 구조는 유지 |
| Commons Lang | 3.17.0 | 3.18.0 | 과도한 입력 재귀 처리 수정 |

Spring Boot 3.5의 기본 BOM만으로 위 패치가 모두 해결되지 않아 관련 버전 속성만 명시했다. 향후 Boot 전환 시 BOM에 포함되는 override를 제거해야 한다. 프론트 override도 Workbox 하위 의존성 갱신 후 제거를 검토한다. Tomcat advisory의 10.1.58은 정식 릴리스가 아니므로 실제 배포된 10.1.60을 사용했다. [Tomcat 공식 보안 공지](https://tomcat.apache.org/security-10.html), [Axios 릴리스](https://github.com/axios/axios/releases/tag/v1.20.0).

### 남아 있는 Spring 경고

- `GHSA-j9f9-w8pj-32f8` / CVE-2026-47890: SSE로 서버 화면 조각을 보낼 때의 스트림 문제. [공식 조건·수정 버전](https://spring.io/security/cve-2026-47890/).
- `GHSA-pc63-qcmh-9cmg` / CVE-2026-47884: XsltView와 암시적 화면 이름·범용 경로 매핑 조합의 문제. [공식 조건·수정 버전](https://spring.io/security/cve-2026-47884/).

현재 코드는 JSON REST API이고 해당 렌더링 기능을 사용하지 않는다. `RestOnlySurfaceTest`는 앱 컨트롤러의 REST 구성, SSE 선언/화면 반환 타입 및 XsltViewResolver 부재를 검사한다. 이 검사는 향후 모든 동적 설정 변경까지 증명하는 보안 감사가 아니므로 해당 기능을 도입하면 다시 평가해야 한다.

Framework 6.2.20 수정판은 상용 지원이며 무료 수정판은 7.0.9 이상이다. Spring 7만 Boot 3에 강제로 섞는 대신 [#85 Boot 4 전환 설계](https://github.com/Bin-925/job-application-tracker/issues/85)를 별도 추적한다. 경고를 제외 목록으로 숨기지 않았고 **백엔드 audit 0건이라고 보고하지 않는다.**

재검사 명령(PowerShell 7, JDK 21, pnpm, npm 필요):

```powershell
./scripts/Audit-Dependencies.ps1
```

결과는 Git 제외 `.local/security-audit/시각/`에 저장된다. 현재는 남은 2건 때문에 의도적으로 실패 종료한다. 외부 서비스 장애·불완전 응답도 성공 처리하지 않는다. 이 검사는 JDK/OS/Docker 이미지·전체 테스트 의존성·클라우드 설정·실제 공격 가능성 분석을 대신하지 않는다.

필수 CI의 프론트·자동화 작업에는 각각 `pnpm audit`·`npm audit`를 추가했다. 새 경고나 조회 실패를 성공으로 무시하지 않는다. 백엔드 OSV 감사는 현재 남은 경고를 계속 노출하는 수동 절차이며 자동 CI 게이트로 도입하지 않았다.

## 부하·장애 검증

초기 13종은 모두 통과했다. 이후 의존성 패치로 실행 JAR가 바뀌어 전체를 재실행했다. 아래는 패치된 JAR의 측정이며 초기 결과와 합산하지 않는다. 시나리오와 임계값은 [검증 매트릭스](ADDITIONAL_TEST_MATRIX.md)와 [실행 안내](LOAD_TESTING.md)를 따른다.

| 프로필 | HTTP 요청 수 | 업무 요청 p95 (ms) | p99 (ms) | 결과 |
|---|---:|---:|---:|---|
| smoke | 29 | 22.98 | 23.70 | 통과 |
| contract | 64 | 60.00 | 130.25 | 통과 |
| limits | 194 | 59.67 | 70.00 | 통과 (지연 기준 아닌 제한 동작 검사) |
| load | 7,218 | 10.47 | 19.40 | 통과 |
| spike | 10,672 | 10.12 | 16.27 | 통과 |
| soak | 14,850 | 10.79 | 23.76 | 통과 |
| volume | 4,803 | 19.16 | 46.45 | 통과 |
| conflict | 2,129 | 32.91 | 46.78 | 통과 |
| auth | 14,852 | 53.91 | 58.32 | 통과 |
| arrival | 2,539 | 56.12 | 60.40 | 통과, dropped_iterations=0 |
| endurance | 104,912 | 52.36 | 56.04 | 통과, 5분 인증 여정 5,520회 |
| mail | 660 | 99.22 | 125.44 | 통과, 가입·재설정·탈퇴 20회 |
| faults | 926 | 해당 없음 | 해당 없음 | 통과, 의도한 장애·복구 검사 |

최종 13개 프로필 모두 종료 코드 0. 총 HTTP 요청 163,848건, 검증 체크 238,997회, 예상 밖 응답 0건이다. 장애 프로필은 정상 성능 측정에 섞지 않았다. 보호된 조회에서 의도한 장애 응답 67회를 관측했고, 복구 판정 구간에서 동일 회원·지원의 성공 조회 180회를 확인했다. 익명 요청이 인증 성공으로 바뀌지 않았으며, 앱 재시작 후 기존 JDBC 세션과 지원 기록이 유지됐다. 전용 DB 정지는 실행 시작 약 8.30초, 재개 20.20초, 앱 재시작 40.12초에 수행했다. 시험 종료 후 전용 앱과 부하 컨테이너를 중지했다.

HTTP 요청 수에는 fixture 준비가 포함된다. mail의 HTTP 수에는 Mailpit 조회도 포함한다. 지연은 fixture/Mailpit을 제외한 업무 API 요청의 집계이며 로그인 한 번이나 전체 여정의 시간이 아니다. 401/403/409/429 등 예상된 거부를 성공적인 검증으로 계산하지만 예상 밖의 거부는 실패다.

환경: Windows 11, 논리 CPU 20개, Microsoft JDK 21.0.11, k6 2.2.0, JVM heap 최대 512MiB, Hikari 10개, Tomcat 50개 스레드, PostgreSQL 17 tmpfs/1CPU/768MiB. 로컬 결과 경로는 `.local/load-results/20261008-190108/`다. 기준 커밋 `c204cfb`에 #84 변경을 적용한 작업 트리에서 측정했다.

JAR SHA-256: `73A818F64E091B5C42EF0B31ECEC6FFC16C501BCB09465A0133790A2BD5C0B7C`. 스크립트 해시는 같은 폴더의 `environment.json`에 있다. 500ms 간격 표본에서 서버 Working Set 최대는 load 449MiB, spike 452MiB, volume 499MiB, endurance 459MiB였다. Working Set은 Java heap만의 값이 아니며 5분 결과로 메모리 누수 부재를 결론 내리지 않는다.

## 출시 전 별도 확인

실제 Google 클라이언트/동의 화면, 외부 SMTP 수신·스팸함, HTTPS·신뢰 프록시·Secure 쿠키, Galaxy S25 Ultra, 여러 서버의 공유 제한, 수시간 이상 지속 부하는 미완료다. 로컬 테스트 통과는 운영 전환·원스토어 출시 승인과 다르다. main이나 유료 인프라 설정은 이번 검증에서 변경하지 않는다.
