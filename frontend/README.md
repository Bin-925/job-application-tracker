# 취준노트 Frontend

React + Vite 기반의 실제 API 연결 UI. 현재 구현 범위와 출시 제한은
[개발 현황](../docs/IMPLEMENTATION_STATUS.md)과 [기술 선택 기록](../docs/adr/0001-workflow-and-pwa.md)을 따른다.

## 실행

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm check:pwa
pnpm preview --port 4173
```

- 개발 API는 기본적으로 /api/v1이며 Vite가 로컬 8080 포트로 프록시한다.
- 다른 로컬 포트는 API_PROXY_TARGET으로 지정한다.
- 배포에서는 동일 출처 API 프록시 또는 VITE_API_URL을 명시한다.
- .env.production에 운영 서버 URL을 고정하지 않는다. 로컬 build/preview가 운영 데이터를 건드리지 않게 한다.
- PWA 서비스 워커는 production build에서 생성된다. pnpm dev 자체는 설치 수명주기 검증용이 아니다.
- 설치 프롬프트는 브라우저가 지원하고 설치 조건을 만족할 때만 표시된다.
- 아이콘 재생성은 pnpm icons. 생성된 PNG는 저장소에 포함되어 있다.

## 구조

- src/domain: 화면 간에 공유하는 지원 상태/날짜/집계 규칙과 Node 단위 테스트
- src/workspace: 실제 라우트 화면, 공통 편집 모달, 앱 셸, PWA UI
- src/api: 인증 헤더와 401 처리를 포함하는 API 클라이언트
- src/store: 기존 JWT 저장 방식. 운영 인증 개선은 다음 출시 게이트
- workspace.css: 반응형 레이아웃과 라이트/다크 CSS 변수

현재 API 캐싱/오프라인 쓰기/푸시 알림은 구현 범위에 포함하지 않는다.
