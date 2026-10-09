# 동일 출처 배포 준비

관련 이슈: #90, 상위 #20. 유료 환경 생성이나 실제 HTTPS 배포는 포함하지 않습니다.

## 선택 이유

React 빌드 결과를 Spring JAR에 포함합니다. 화면과 API를 같은 origin에서 제공하면 쿠키·Google 복귀 경로·CORS의 운영 설정을 줄일 수 있습니다. 별도 프론트 배포의 독립 배포 장점 대신 단일 산출물의 운영 단순함을 선택했습니다. Vite 개발 서버는 그대로 사용합니다.

```text
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
cd backend
./gradlew bootJar -PfrontendDist=../frontend/dist
```

Windows PowerShell에서는 `'-PfrontendDist=../frontend/dist'`처럼 인자를 인용합니다. `frontendDist`를 지정했는데 index.html이 없으면 빌드는 실패합니다. dist를 소스 디렉터리에 복사하거나 커밋하지 않습니다. Dockerfile은 같은 과정을 여러 단계에서 실행하고 Java 21 JRE와 비루트 사용자로 실행합니다. 의존성 lock과 보안 override 설정도 빌드에 포함합니다.

컨테이너 기본 이미지는 Node 24 / Temurin 21 계열 태그입니다. 패키지 lock만으로 비트 단위 재현을 보장하지 않습니다. 실제 배포 릴리스 때 검증된 이미지 digest와 최종 이미지 ID를 기록하고 고정해야 합니다.

## 경로와 캐시

- 실제 React 화면 경로만 index.html을 반환합니다. 지원 상세/수정은 숫자 ID 경로만 처리합니다.
- `/api/**`와 Google callback을 HTML로 바꾸지 않습니다. 없는 자산과 `/.well-known/assetlinks.json`은 404입니다. Asset Links는 실제 서명 설정 시 별도 생성합니다.
- HTML·서비스워커·manifest·API·상태 응답은 `private, no-store`입니다. 성공한 해시 자산만 1년 immutable 캐시입니다.
- 서비스워커의 탐색 fallback도 API, well-known, 상태 경로와 파일 경로를 제외합니다. API는 NetworkOnly를 유지합니다.
- 공개 화면은 껍데기일 뿐 개인 데이터가 없습니다. 실제 데이터 API는 기존 세션·CSRF·소유권 검사를 그대로 적용합니다.

## 상태 확인

Spring Boot Actuator의 표준 상태 그룹을 사용하되 `/livez`, `/readyz`만 공개합니다. 다른 `/actuator/**` 경로는 인증 사용자에게도 공개하지 않습니다.

| 경로 | 의미 | 의존 대상 |
|---|---|---|
| `/livez` | 프로세스가 살아 있음 | 애플리케이션 생명주기 |
| `/readyz` | 트래픽을 받을 준비가 됨 | 생명주기 + DB 연결 |

Flyway/스키마 검증 실패 시 서버 시작이 실패하고 준비 상태로 진입하지 않습니다. Google/SMTP의 장애는 이 상태 그룹에 포함하지 않습니다. 응답은 UP/DOWN 같은 상태만 포함하며 DB 주소·세부 구성은 공개하지 않습니다. 공개 경로 전용 stateless 보안 체인으로 오래된 쿠키 때문에 상태 검사가 세션 DB에 의존하지 않게 합니다.

## 실제 배포 전

- `postgres,release` 프로파일을 함께 사용하고 PostgreSQL 접속 정보와 `APP_PUBLIC_ORIGIN`을 비공개 환경 설정으로 제공합니다.
- release는 Secure 쿠키, Open-in-view 비활성, Swagger 비활성을 기본으로 합니다. 실제 HTTPS origin을 설정해야 합니다.
- 전달된 프록시 헤더는 기본 신뢰하지 않습니다. 플랫폼 프록시 경계를 확인한 후 별도 설정·검증해야 하며, 임의 클라이언트의 X-Forwarded-* 값을 신뢰하도록 바꾸지 않습니다.
- 이 문서와 Dockerfile만으로 HTTPS·운영 백업·도메인·메일·Google 설정이 완료되지는 않습니다.
- Boot 3에서 전환한다면 기존 JDBC 세션 정리와 재로그인은 BOOT4_MIGRATION.md를 따릅니다.

## 검증

`tests/release/run.cjs`는 전용 tmpfs PostgreSQL과 포트 15593/18593을 사용합니다. 실제 배포 JAR의 화면·자산·API 경계, 360/1440px 브라우저, 전용 k6, DB 일시 정지 후 live/ready 차이와 회복을 검사합니다. HTTP 격리 검사에서만 Secure 쿠키를 명시적으로 끄며 실제 HTTPS 검증을 대신하지 않습니다.

CI에서도 프론트 포함 JAR을 빌드하고 같은 검사를 실행합니다. 일반 회귀와 기존 k6 13개 프로필은 구현 작업마다 별도 실행합니다. Gemini 실패는 분석 없이 미완료로 기록하고, 필수 테스트 실패와 구분합니다.

공식 근거: [Spring Boot 상태 그룹·프로브](https://docs.spring.io/spring-boot/4.0/reference/actuator/endpoints.html), [Grafana k6 CI 설치](https://github.com/grafana/setup-k6-action).
