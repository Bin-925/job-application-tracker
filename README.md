<!-- HEADER -->
<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1e3a8a,100:38bdf8&height=200&section=header&text=Job%20Application%20Tracker&fontSize=50&fontColor=ffffff&fontAlignY=35&desc=구직%20지원%20현황%20관리%20·%20Full-Stack&descSize=20&descAlignY=58&animation=fadeIn" width="100%" />
🗂️ 구직 지원 현황 트래커

지원한 채용공고를 등록하고 **진행 상태(지원 → 서류 → 면접 → 합격/탈락)**를 관리하는 풀스택 서비스입니다.
사람인 채용정보 API로 실제 공고를 검색해 바로 트래커에 등록할 수 있습니다.

<br/>
<!-- TODO: 배포 후 아래 링크 교체 -->
이미지 표시
이미지 표시

</div>
<br/>
🛠️ Tech Stack

<div align="center">
이미지 표시
이미지 표시
이미지 표시
이미지 표시

이미지 표시
이미지 표시
이미지 표시
이미지 표시
이미지 표시

</div>
<br/>
분류기술LanguageJava 21FrameworkSpring Boot 3.5인증/인가Spring Security · JWTORMSpring Data JPA (Hibernate)DatabaseH2 <!-- (운영 전환 시 MySQL) -->외부 API사람인 채용정보 APIAPI 문서Swagger (springdoc-openapi)CIGitHub Actions빌드 도구GradleFrontendReact

<br/>
🏗️ 시스템 아키텍처

<!-- TODO: docs/images/architecture.png 추가 -->
<div align="center">
  <img src="docs/images/architecture.png" width="750" alt="시스템 아키텍처" />
</div>

React 프론트엔드 ↔ Spring Boot REST API 서버가 HTTP(JSON)로 통신
외부 사람인 API는 프론트가 직접 호출하지 않고, 백엔드를 경유해 호출 (API 키 보호 + 응답 정규화)
공고 검색은 JobSearchProvider 인터페이스로 추상화 → 공급자(사람인 등) 교체 가능


<br/>
🗂️ ERD

<!-- TODO: docs/images/erd.png 추가 -->
<div align="center">
  <img src="docs/images/erd.png" width="750" alt="ERD" />
</div>

Member — 회원 (로그인 계정)
Application — 지원 현황 (회사·직무·진행상태·일정·출처)


진행 상태 (ApplicationStatus)

값설명TO_APPLY지원예정APPLIED지원완료DOC_PASSED서류합격INTERVIEW면접ACCEPTED최종합격REJECTED불합격

<br/>
📌 API 목록


<!-- TODO: 구현하면서 엔드포인트·요청/응답 예시 채우기 -->


<details open>
<summary><b>🔐 인증 (Member)</b></summary>
<br/>
MethodURL설명인증POST/api/v1/members/join회원가입❌POST/api/v1/members/login로그인 (JWT 발급)❌

</details>
<details>
<summary><b>📋 지원 현황 (Application)</b></summary>
<br/>

모두 JWT 필요 · 본인 지원만 접근 가능



MethodURL설명GET/api/v1/applications내 지원 목록 (필터·정렬·페이징)GET/api/v1/applications/{id}단건 조회POST/api/v1/applications지원 등록PUT/api/v1/applications/{id}수정PATCH/api/v1/applications/{id}/status상태 변경DELETE/api/v1/applications/{id}삭제GET/api/v1/applications/stats상태별 통계

</details>
<details>
<summary><b>🔎 공고 검색 (Job)</b></summary>
<br/>
MethodURL설명GET/api/v1/jobs/search사람인 API로 공고 검색 (백엔드 경유)

</details>
<br/>
✨ 주요 기능

#기능설명1️⃣JWT 인증액세스 토큰 기반 로그인 / 비밀번호 암호화(BCrypt)2️⃣지원 현황 관리등록·조회·수정·삭제 + 상태(지원→서류→면접→합격/탈락) 변경3️⃣소유권 기반 인가본인의 지원만 조회·수정·삭제 가능4️⃣사람인 API 연동실제 공고 검색 후 원클릭 등록 · 공급자 교체 가능한 인터페이스 설계5️⃣통계 대시보드상태별 지원 개수 집계

<!-- 확장 예정: 면접 D-day 표시 · 결과 예정일 확인 알림 · 이메일 리마인더 -->
<br/>
📁 프로젝트 구조

src/main/java/com/bin/jobtracker/
├── global/          # 공통 (BaseEntity, 예외, 설정)
├── member/          # 회원 (엔티티 · 인증/인가)
├── application/     # 지원 현황 (CRUD · 상태 관리)
└── job/             # 외부 채용공고 검색 (사람인 API 연동)

<!-- 진행하면서 controller/service/repository/dto 등으로 세분화 -->
<br/>
⚙️ 로컬 개발 환경 설정

<details>
<summary><b>1. 실행</b></summary>
<br/>
bash./gradlew bootRun

</details>
<details>
<summary><b>2. H2 콘솔 & Swagger 확인</b></summary>
<br/>
H2 콘솔   : http://localhost:8080/h2-console   (JDBC URL: jdbc:h2:mem:jobtracker)
Swagger   : http://localhost:8080/swagger-ui/index.html

</details>
<details>
<summary><b>3. 사람인 API 키 설정</b></summary>
<br/>
<!-- TODO: 발급받은 키 적용 방법 작성 -->
application-secret.yml(또는 환경변수)에 사람인 access-key를 설정합니다. (키 파일은 .gitignore 처리)

</details>
<br/>
✅ 테스트 & CI


단위 · 통합 테스트 (JUnit · MockMvc)
GitHub Actions: push/PR 시 테스트 자동 실행
버그는 GitHub Issues로 트래킹


<!-- TODO: 테스트 커버리지 / CI 배지 추가 -->
<br/>
🌿 브랜치 전략

feat/*  ─►  main

브랜치설명main배포 가능한 안정 브랜치feat/*기능 개발 브랜치 (작업 후 PR로 머지)

<br/>
<!-- FOOTER -->
<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:38bdf8,100:1e3a8a&height=120&section=footer" width="100%" />
</div>