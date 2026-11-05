# 프로젝트 문서

Deathmatch Online의 기획·개발 명세·설정·에셋 기록을 이 폴더에서 관리합니다. 저장소 첫 화면의 소개와 빠른 실행 방법은 [루트 README](../README.md)를 확인하세요.

| 문서                                   | 내용                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| [PRD.md](PRD.md)                       | 게임 목표, 조작·전투·연승 정책, 추천 스택, 에셋 조사, MVP 범위 |
| [ROADMAP.md](ROADMAP.md)               | 완료한 개발 기반과 다음 우선순위                               |
| [ARCHITECTURE.md](ARCHITECTURE.md)     | 웹·서버·공통 규칙, 상태 흐름, 현재 제한, DB 정산 도입 계획     |
| [DEVELOPMENT.md](DEVELOPMENT.md)       | 1인 개발 실행 환경과 프로젝트 작업 규칙                        |
| [SUPABASE.md](SUPABASE.md)             | 인증 환경 변수, 메일·복귀 주소, 초기 migration 검토·적용 절차  |
| [ASSET_LICENSES.md](ASSET_LICENSES.md) | 실제 채택한 외부 에셋 출처와 라이선스                          |

PRD는 제품의 목표이며 구현 완료 목록이 아닙니다. 실제 동작 범위는 루트 README와 ROADMAP을 기준으로 확인합니다. 새로운 기획서·작업 명세·개발 기록은 `docs/`에 추가하고 이 목록을 갱신합니다.

자동 검사 설정은 [CI 활성화 안내](CI.md)와 [워크플로 템플릿](ci.yml.example)을 확인하세요. 현재 GitHub 자동 실행은 비활성 상태입니다.

기능별 작업은 [기능 브랜치·명세서 목록](features/README.md)에서 확인합니다. 각 명세서는 해당 기능 브랜치의 `docs/features/`에 있으며, 목록에 개발 순서와 의존성을 정리했습니다.
