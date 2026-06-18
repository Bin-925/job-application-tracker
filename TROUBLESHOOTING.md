# 트러블슈팅 기록

개발 중 마주친 문제와 해결 과정입니다.

## 1. Gradle 테스트가 ClassNotFoundException으로 전부 실패
- **증상**: `./gradlew test` 시 컴파일은 되는데(`5 executed`) 모든 테스트 클래스가 `ClassNotFoundException`. `clean` 후에도 동일.
- **원인**: 프로젝트 경로에 한글(`C:\프로그래머스\...`)이 포함됨. Gradle은 테스트를 **별도 JVM(워커)**으로 실행하는데, Windows에서 한글 경로가 워커로 전달될 때 깨져 클래스패스를 인식하지 못함. (앱 실행은 IntelliJ가 처리해 정상이었기에 원인 파악이 어려웠음)
- **해결**: 프로젝트를 영문 경로(`C:\dev\...`)로 이동하여 즉시 해결.

## 2. JWT 시크릿이 공개 저장소에 노출
- **증상**: `application.yaml`에 하드코딩한 JWT secret이 public repo 커밋 히스토리에 그대로 남음.
- **해결**:
    1. **키 교체(rotate)** — 새 secret 발급으로 유출된 키 무력화 (최우선 조치)
    2. secret을 `application-secret.yml`로 분리 + `.gitignore` 등록
    3. `application.yaml`은 `spring.config.import: optional:application-secret.yml`로 참조만
    4. **BFG Repo-Cleaner**로 과거 히스토리의 secret을 `***REMOVED***`로 치환 후 force push

## 3. .gitignore가 이미 추적 중인 파일을 막지 못함
- **증상**: `application-secret.yml`이 `.gitignore`에 있어도 staged 상태로 커밋 직전까지 포함됨.
- **원인**: `.gitignore`는 **untracked 파일만** 무시함. 한 번 `git add`된 파일은 무시 규칙을 우회.
- **해결**: `git reset`으로 staged 해제하여 untracked로 되돌린 뒤, `git check-ignore`로 무시 적용 확인.

## 4. 본인 인가 실패 시 403이 아닌 401 응답
- **증상**: 타인 데이터 접근 시 의도한 403(Forbidden) 대신 401(Unauthorized) 반환.
- **원인**: `ResponseStatusException`이 `/error`로 포워딩되며 Spring Security가 해당 요청을 미인증으로 재차단.
- **해결**: 커스텀 예외(`ForbiddenException`, `NotFoundException`) + `@RestControllerAdvice`로 응답을 직접 작성(포워딩 제거). SecurityConfig에 `authenticationEntryPoint`를 지정해 미인증은 명확히 401로 분리.

## 5. GitHub Actions YAML 파싱 오류
- **증상**: `ci.yml`의 `run:` 한 줄에 `secret: ...`처럼 콜론+공백이 들어가자 "Invalid child element" 에러.
- **원인**: YAML이 평문 스칼라 내부의 `: `를 새 키 매핑으로 오인.
- **해결**: `run: |` (literal block scalar)로 변경하여 내부를 전부 텍스트로 처리.

## 6. Railway 배포 시 jar 실행 실패 (Java가 help 메시지 출력)
- **증상**: Railway에서 빌드는 성공하나 실행 시 크래시. 로그에 `should always be passed as the argument to the -splash option`과 함께 java 사용법(help)이 출력됨.
- **원인**: Railway(Nixpacks)가 Gradle 프로젝트의 실행 jar를 자동 감지하지 못해, 잘못된 인자로 `java`를 호출. 실제 에러는 JVM의 `-splash` 관련 잡로그에 가려져 파악이 어려웠음.
- **해결**: `backend/Procfile`에 실행 명령을 명시 — `web: java -jar build/libs/jobtracker-0.0.1-SNAPSHOT.jar`. 이때 라이브러리가 포함된 실행 jar를 써야 하므로 `-plain.jar`가 아닌 일반 jar를 지정.

## 7. Vercel 환경변수가 빌드 결과물에 반영되지 않음
- **증상**: Vercel에 `VITE_API_URL`을 정확히 설정했는데도 배포된 앱이 계속 `localhost:8080`으로 요청. 빌드된 JS 파일 해시(`index-CC7EUTDw.js`)가 재배포·빈 커밋·프로젝트 재생성에도 변하지 않음.
- **원인**: Vite 환경변수는 **빌드 시점에 번들로 인라인**됨. 그런데 Vercel이 `Restored build cache from previous deployment`로 캐시된 결과물을 재사용하면서, 소스 코드가 안 바뀌면 빌드를 실질적으로 건너뜀 → 환경변수 변경이 반영 안 됨. (로컬에서 `VITE_API_URL=... pnpm build` 시 해시가 바뀌고 URL이 정상 포함되는 것으로 코드 정상 확인)
- **해결**:
  1. `frontend/.env.production`을 커밋해 Vercel 환경변수 설정과 무관하게 빌드 시 항상 올바른 URL을 읽도록 함 (공개 API URL이라 노출 무방)
  2. 그래도 캐시가 빌드를 스킵 → `VERCEL_FORCE_NO_BUILD_CACHE=1` 환경변수로 캐시 비활성화
  3. 최종적으로 **Vercel CLI 직배포**로 캐시를 완전히 우회: 로컬에서 빌드한 결과물을 `vercel deploy --prebuilt --prod`로 프로덕션에 직접 업로드.

## 8. 배포 후 CORS 정책으로 API 차단
- **증상**: 프론트(Vercel)에서 백엔드(Railway) 호출 시 `blocked by CORS policy: No 'Access-Control-Allow-Origin' header`. 요청은 railway 주소로 정상 전송됨(이전 localhost 문제는 해결된 상태).
- **원인**: 백엔드 CORS가 `setAllowedOrigins(List.of("http://localhost:5173"))`로 로컬만 허용. 게다가 CORS 설정 변경이 커밋되지 않아 Railway에 옛 버전이 배포돼 있었음.
- **해결**: `setAllowedOrigins` → `setAllowedOriginPatterns`로 변경(와일드카드 사용 + `allowCredentials(true)`와 함께 쓰려면 Patterns 필요), `https://*.vercel.app` 허용 후 커밋·재배포.

## 9. SPA 새로고침 시 404 NOT_FOUND
- **증상**: 배포된 앱에서 첫 진입은 정상이나, `/login` 등에서 새로고침하면 404.
- **원인**: React Router는 클라이언트 측 라우팅인데, 새로고침 시 해당 경로를 서버에 직접 요청 → Vercel에 그 경로의 파일이 없어 404.
- **해결**: `frontend/vercel.json`에 rewrites 추가 — 모든 경로(`/(.*)`)를 `/index.html`로 보내 라우팅을 클라이언트가 처리하도록 함.

## 10. H2 → MySQL 전환 후 테스트 실패
- **증상**: 로컬 DB를 MySQL로 바꾸자 테스트가 MySQL에 접속하려다 실패.
- **원인**: 테스트도 메인 `application.yaml`(MySQL)을 그대로 사용.
- **해결**: `src/test/resources/application.yml`을 별도로 두어 테스트는 H2(in-memory)로 분리. 빌드 의존성도 `runtimeOnly`(MySQL/PostgreSQL)와 `testRuntimeOnly`(H2)로 구분.