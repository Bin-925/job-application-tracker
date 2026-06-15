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