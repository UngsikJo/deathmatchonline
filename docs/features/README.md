# 기능별 브랜치와 명세서

현재 로컬 프로토타입을 정식 MVP로 발전시키기 위한 기능 구분입니다. **이번 브랜치들은 기능 명세 작성용이며, 명세서 생성이 기능 구현 완료를 뜻하지 않습니다.** 기준 코드와 실제 구현 상태는 [루트 README](../../README.md)와 [개발 목록](../ROADMAP.md)을 함께 확인하세요.

> 캐릭터 범위 변경 검수 중: 시작 캐릭터를 주먹·검·화살·마법 4종으로 확장합니다. [캐릭터 설정·스킬 초안](../CHARACTERS.md)이 최신 검수안이며 기존 기능 브랜치의 단일 캐릭터·공통 스킬 가정은 승인 후 동기화할 대상입니다. 사용자 요청에 따라 UI 목업과 참고 명세를 `feature/lobby-ui`에 공유합니다. 다른 기능 브랜치의 명세 동기화는 후속 작업입니다.

> 조작·궁극기 변경: [공통 명세](../COMBAT_CONTROLS.md)의 A 유지 방어·S 대시·D 기본·F 다운 추가 공격·Q/W/E 기본 스킬·R 100% 게이지를 적용하는 안으로 변경합니다. 기존 명세의 A 기본 공격·D 대시·R 고정 쿨다운은 승인 후 교체할 대상입니다.

## 기능 목록

각 명세서 링크는 해당 원격 기능 브랜치를 가리킵니다. `main`에는 이 목록을 두고, 각 브랜치에는 자기 기능의 명세서 한 개를 추가합니다.

| ID  | 기능                      | 브랜치                        | 명세서                                                                                                                                               | 선행 기능               |
| --- | ------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| F01 | 회원가입·로그인·계정 관리 | `feature/auth`                | [F01-auth.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/auth/docs/features/F01-auth.md)                                              | 없음                    |
| F02 | 닉네임·프로필             | `feature/profile`             | [F02-profile.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/profile/docs/features/F02-profile.md)                                     | F01                     |
| F03 | 방향키 이동·방향 조준     | `feature/movement`            | [F03-movement.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/movement/docs/features/F03-movement.md)                                  | 없음                    |
| F04 | 8개 스킬·전투 판정        | `feature/combat-skills`       | [F04-combat-skills.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/combat-skills/docs/features/F04-combat-skills.md)                   | F03                     |
| F05 | 공개 매칭·경기 준비       | `feature/matchmaking`         | [F05-matchmaking.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/matchmaking/docs/features/F05-matchmaking.md)                         | F01, F02                |
| F06 | 승패·연승 영구 정산       | `feature/streak-persistence`  | [F06-streak-persistence.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/streak-persistence/docs/features/F06-streak-persistence.md)    | F01, F02, F04, F05      |
| F07 | 재접속·장애 복구          | `feature/reconnection`        | [F07-reconnection.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/reconnection/docs/features/F07-reconnection.md)                      | F05, F06                |
| F08 | 로비·결과·휴식 UI         | `feature/lobby-ui`            | [F08-lobby-ui.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/lobby-ui/docs/features/F08-lobby-ui.md)                                  | F02, F04, F05, F06, F07 |
| F09 | 최고 연승 순위표          | `feature/leaderboard`         | [F09-leaderboard.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/leaderboard/docs/features/F09-leaderboard.md)                         | F06                     |
| F10 | 캐릭터·맵·효과음          | `feature/game-assets`         | [F10-game-assets.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/game-assets/docs/features/F10-game-assets.md)                         | F03, F04                |
| F11 | 요청 검증·운영 보호       | `feature/security-operations` | [F11-security-operations.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/security-operations/docs/features/F11-security-operations.md) | F01, F05, F06, F07      |
| F12 | 환경 분리·배포·CI         | `feature/deployment`          | [F12-deployment.md](https://github.com/UngsikJo/deathmatchonline/blob/feature/deployment/docs/features/F12-deployment.md)                            | F01, F06~F11            |

모든 기능은 최초 공개 MVP를 위한 P0 범위입니다. 문서에서 P1으로 표시한 키 재지정·소셜 로그인·친선전·다중 지역 등은 이 브랜치의 필수 완료 범위에서 제외합니다. 시작 캐릭터 4종은 초기 범위이며 F10에서 4종의 시각적 구분과 실제 에셋을 검증합니다.

## 1인 개발 권장 순서

1. F03 → F04: 실제 두 PC 플레이로 이동·전투 규칙을 먼저 검증합니다.
2. F01 → F02 → F05: 실제 계정·프로필과 공개 매칭을 연결합니다.
3. F06 → F07: 경기·연승을 영구 저장하고 이탈·장애를 복구합니다.
4. F08 → F09 → F10: 경기 흐름·순위표·게임 표현을 완성합니다.
5. F11 → F12: 공개 베타 운영 검증과 배포를 마칩니다.

기본 인증·입력 검증·접근 권한은 각 기능에서 구현합니다. F11은 그 작업을 미루는 단계가 아니라 전체를 묶어 공격·운영 시나리오로 확인하는 단계입니다. 외부 계정 설정을 기다리는 동안에는 독립 기능의 작업을 진행할 수 있습니다.

## 브랜치 사용 방법

```sh
git fetch origin
git switch feature/auth
# 로컬 브랜치가 없다면: git switch --track origin/feature/auth
```

각 브랜치는 같은 `main`의 문서 목록 커밋에서 독립적으로 분기했습니다. 다른 기능 브랜치의 구현이 자동으로 포함되지 않습니다. 선행 기능을 먼저 `main`에 병합한 뒤, 작업할 브랜치에서 최신 `origin/main`을 병합하고 구현을 시작합니다.

```sh
git fetch origin
git merge origin/main
npm run check
```

구현할 때는 명세서의 체크리스트와 실제 검증 결과를 함께 갱신합니다. 이번 작업에서는 PR 생성·병합·외부 서비스 설정·게임 기능 구현을 수행하지 않습니다.

새 커밋은 [한국어 커밋 메시지 작성 규칙](../COMMIT_CONVENTION.md)을 따릅니다. 예: `feat(F06): 경기 결과와 연승 영구 정산 추가`. 기능 브랜치가 `main`에 병합되면 해당 명세서도 함께 반영됩니다.

## 공통 명세 원칙

- 각 문서는 목표, 현재 상태, 범위, 규칙·예외, 데이터·메시지 계약, 작업 항목, 수용 기준, 영향 파일, 의존성을 포함합니다.
- 문서의 추가 API·메시지·DB 필드는 **구현 제안**입니다. 현재 실행 가능한 인터페이스로 오해하지 않습니다.
- 기존 네트워크의 camelCase와 DB의 snake_case 사이 변환은 서버에서 명시합니다. 오류는 화면에 전달할 식별 코드와 사용자 안내를 구분하고 토큰·비밀 키를 포함하지 않습니다.
- 전투 판정은 F04, 매칭 배정은 F05, 결과·연승의 영구 정산은 F06이 소유합니다. 다른 기능은 같은 판정을 다시 작성하지 않습니다.
- 접속 복구는 F07, 결과 화면의 표시·자동 매칭은 F08이 담당합니다. F08은 F06의 저장 완료 전 다음 경기를 시작하지 않습니다.
- 같은 파일을 여러 기능이 수정하더라도 선행 기능을 `main`에 반영한 뒤 순차적으로 작업합니다. DB 변경은 새 migration으로 추가하며 기존 적용 이력을 수정하지 않습니다.
- PRD의 초안 정책을 현재 기본안으로 사용합니다. 정책을 바꾸면 [PRD](../PRD.md), 기능 명세, 테스트 기준을 함께 수정합니다.
- 공통 완료 조건: 해당 수용 기준 충족, `npm run check`, 관련 접속·서버 기능의 `npm run test:integration`, 문서 갱신. 실계정·브라우저·DB 검증은 실제 수행 증거를 남겨야 완료로 표시합니다.
- 자동 CI 활성화에는 별도 워크플로 수정 권한이 필요합니다. 이번 명세 브랜치들은 `.github/workflows/`를 추가하거나 해당 권한 문제를 변경하지 않습니다.
