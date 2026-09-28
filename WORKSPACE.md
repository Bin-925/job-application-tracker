# Primary Workspace

현재 개발 기준 폴더는 `C:/dev.project/personal.project/job-application-tracker`입니다.

- 대화 작업 폴더에서 만든 첫 개발 버전을 기존 저장소와 병합했습니다.
- 기존 Git 저장소, 비밀 설정, 로컬 데이터와 IDE 설정을 유지했습니다.
- 병합 전 변경 대상 파일은 `../.codex-merge-backup/`에 보관했습니다.
- 구현 현황: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
- 기술 선택: [docs/adr/0001-workflow-and-pwa.md](docs/adr/0001-workflow-and-pwa.md)
- 이전 설계 자료: [docs/planning](docs/planning)
- 향후 개발은 이 폴더를 기준으로 진행합니다. 대화 폴더의 사본을 동시에 수정하지 않습니다.
- 서버 실행 명령은 프로젝트 루트에서 `./scripts/Start-Local.ps1`입니다.
- 개발 통합 브랜치는 `dev`, 배포용 브랜치는 `main`입니다. 작업은 `issue-번호`에서 수행하고 PR로 dev에 합칩니다.
- 기존 미커밋 변경은 이슈별 커밋·PR로 분리하여 dev에 통합했습니다. 앞으로 새 변경을 만들면 해당 이슈 브랜치에서 기록합니다.
- 협업 규칙: [CONTRIBUTING.md](CONTRIBUTING.md). 검증 결과: [dev 통합 보고서](docs/DEV_INTEGRATION_2026-09-28.md).
