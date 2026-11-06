# 프로젝트 문서

Deathmatch Online의 기획·개발 명세·설정·에셋 기록을 이 폴더에서 관리합니다. 저장소 첫 화면의 소개와 빠른 실행 방법은 [루트 README](../README.md)를 확인하세요.

| 문서                                         | 내용                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| [PRD.md](PRD.md)                             | 게임 목표, 조작·전투·연승 정책, 추천 스택, 에셋 조사, MVP 범위 |
| [CHARACTERS.md](CHARACTERS.md)               | 시작 캐릭터 4종의 인물·역할·32개 입력 항목·선택 정책 검수 초안 |
| [UI_UX_DESIGN.md](UI_UX_DESIGN.md)           | 무한의 계단 참고 조사, 도트 아케이드 목업 5화면·검수 기준      |
| [ROADMAP.md](ROADMAP.md)                     | 완료한 개발 기반과 다음 우선순위                               |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | 웹·서버·공통 규칙, 상태 흐름, 현재 제한, DB 정산 도입 계획     |
| [DEVELOPMENT.md](DEVELOPMENT.md)             | 1인 개발 실행 환경과 프로젝트 작업 규칙                        |
| [SUPABASE.md](SUPABASE.md)                   | 인증 환경 변수, 메일·복귀 주소, 초기 migration 검토·적용 절차  |
| [ASSET_LICENSES.md](ASSET_LICENSES.md)       | 실제 채택한 외부 에셋 출처와 라이선스                          |
| [COMMIT_CONVENTION.md](COMMIT_CONVENTION.md) | 한국어 커밋 메시지 형식·유형·예시·병합 기준                    |

PRD는 제품의 목표이며 구현 완료 목록이 아닙니다. 실제 동작 범위는 루트 README와 ROADMAP을 기준으로 확인합니다. 새로운 기획서·작업 명세·개발 기록은 `docs/`에 추가하고 이 목록을 갱신합니다.

4종 캐릭터·조작의 세부 기획과 관련 README·PRD는 UI 목업의 참고 초안입니다. 사용자가 UI/UX 브랜치 공유를 승인했으며 실제 게임 구현·밸런스 검증은 후속 작업입니다.

새 A/S/D/F/Q/W/E/R 역할과 피해 기반 궁극기는 [공통 조작·방어·궁극기 게이지 명세](COMBAT_CONTROLS.md)를 확인하세요. A는 유지 입력, R은 100% 게이지 조건으로 구분합니다.

F는 사용자 확인으로 쓰러진 상대 추가 공격입니다. 같은 명세에 다운 유발·지속·기상·면역과 한 회차의 F 판정 초안을 포함했습니다.

UI/UX는 [도트 아케이드 디자인 검수안](UI_UX_DESIGN.md)에 레퍼런스와 화면별 의도를 정리했습니다. 목업 원본은 `docs/design/deathmatch-arcade-mockup.html`이며, 초기 목업은 사용자 요청에 따라 `feature/lobby-ui`에 공유하며 게임 적용·배포는 후속 작업입니다.

자동 검사 설정은 [CI 활성화 안내](CI.md)와 [워크플로 템플릿](ci.yml.example)을 확인하세요. 현재 GitHub 자동 실행은 비활성 상태입니다.

기능별 작업은 [기능 브랜치·명세서 목록](features/README.md)에서 확인합니다. 각 명세서는 해당 기능 브랜치의 `docs/features/`에 있으며, 목록에 개발 순서와 의존성을 정리했습니다.

완료한 작업·검증 결과·관련 커밋·보류 사항은 [날짜별 작업 일지](worklogs/README.md)에 기록합니다.
