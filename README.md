# Deathmatch Online

**방향키와 여덟 개의 스킬로 겨루는 웹 기반 2D 1:1 연승 데스매치 게임입니다.**

탑다운 경기장에서 상대를 쓰러뜨리고, 승리할 때마다 다음 상대에게 도전해 최고 연승 기록을 갱신하는 게임을 만들고 있습니다. 두 플레이어는 같은 능력치와 스킬로 싸우며 이동·회피·스킬 조합이 승부를 결정합니다. 1인 개발 프로젝트입니다.

제품 방향은 [PRD](docs/PRD.md), 실제 진행 상태는 [개발 목록](docs/ROADMAP.md), 전체 문서는 [docs/](docs/README.md)를 확인하세요.

현재는 **1인 개발을 위한 실행 가능한 로컬 기반**입니다. 두 창 매칭과 서버 판정 전투를 테스트할 수 있습니다. 전적은 메모리에 저장되므로 서버를 재시작하면 사라집니다. 공개 서비스용 랭킹 서버가 완성된 상태는 아닙니다.

## 어떤 게임인가요?

- **온라인 1 대 1:** 서로 다른 브라우저에서 접속해 한 경기장에서 대전합니다.
- **키보드 전투:** 방향키로 이동하고 마지막 이동 방향을 향해 스킬을 사용합니다.
- **연승 도전:** 승리하면 다음 상대를 찾고 패배하면 현재 연승이 종료됩니다. 최고 기록은 별도로 관리합니다.
- **자유로운 휴식:** 경기 사이에는 연승을 보존하고 쉽니다. 진행 중 기권은 패배로 처리합니다.
- **짧은 단판:** 체력 100, 제한 시간 120초. 상대를 처치하거나 종료 시 더 많은 체력을 남기면 승리합니다. 동점은 무승부이며 현재 연승을 종료합니다.

```text
대전 찾기 → 상대 배정 → 3초 카운트다운 → 1:1 전투 → 결과 확인
                                                    ├─ 다음 상대에게 도전
                                                    └─ 연승을 보존하고 쉬기
```

## 빠른 시작

Node.js **24.x**와 npm, Git이 필요합니다. `.nvmrc`를 사용하는 경우 먼저 `nvm use`를 실행하세요.

```sh
git clone https://github.com/UngsikJo/deathmatchonline.git
cd deathmatchonline
npm ci
npm run dev
```

- 웹: <http://127.0.0.1:5173>
- 게임 서버 상태: <http://127.0.0.1:2567/health>
- 종료: 실행한 터미널에서 `Ctrl+C`

최초 설치 시에는 lockfile이 포함되어 있으므로 `npm ci`를 사용합니다. 새 패키지를 추가할 때만 해당 workspace에 `npm install`을 실행합니다. 외부 서비스 연결 없이도 기본 게스트 모드로 동작합니다.

### 두 사용자로 테스트하기

1. 첫 번째 창에서 닉네임을 입력하고 **대전 찾기**를 누릅니다.
2. 다른 브라우저 또는 별도 창에서 같은 주소를 열어 다른 이름으로 참가합니다.
3. 3초 카운트다운 후 경기장을 클릭합니다. 방향키로 이동하고 8개 스킬을 사용합니다.
4. **경기 메뉴 → 기권하기 → 기권 확정**으로 승패와 연승 갱신을 확인할 수 있습니다.
5. 승자는 **다음 상대 찾기**로 이어 하거나 **연승을 보존하고 쉬기**를 선택합니다.

탭 복제 시 브라우저가 sessionStorage를 복사하면 같은 개발 사용자로 인식할 수 있습니다. 로비에서 **새 테스트 사용자로 전환**한 뒤 참가하세요. 테스트 ID는 탭의 sessionStorage에 저장되므로 같은 탭에서 쉬었다 이어 하는 것은 가능하지만, 탭을 닫아 ID를 잃으면 같은 게스트 기록으로 돌아갈 수 없습니다.

포커스가 경기장에 있을 때만 게임 키를 받습니다. `Esc`는 경기장 포커스를 해제합니다. 메뉴나 다른 창으로 이동해도 온라인 전투는 멈추지 않습니다.

### 조작법

| 키      | 동작           | 키  | 동작                   |
| ------- | -------------- | --- | ---------------------- |
| ↑ ↓ ← → | 이동·방향 조준 | Esc | 경기장 포커스 해제     |
| A       | 베기           | Q   | 주변 폭발              |
| S       | 마력탄         | W   | 둔화 투사체            |
| D       | 돌진           | E   | 충격파·밀치기          |
| F       | 보호막         | R   | 예고 후 강한 직선 공격 |

## 기술 구성

| 영역         | 도구                                           | 역할                                  |
| ------------ | ---------------------------------------------- | ------------------------------------- |
| 게임 화면    | Phaser 4                                       | 렌더링, 입력, 이펙트                  |
| 웹 UI        | React, Vite, TypeScript                        | 로비·계정·결과 화면                   |
| 실시간 서버  | Node.js, Colyseus                              | 대전 방, 상태 전송, 재접속, 서버 판정 |
| 인증·DB 기반 | Supabase Auth, PostgreSQL                      | 선택적 인증 연동, 초기 스키마 초안    |
| 검증         | Vitest, SDK 통합 테스트, GitHub Actions 템플릿 | 전투 규칙·매칭·연승 회귀 검사         |

클라이언트는 조작 입력을 보내고 서버가 이동·명중·피해·승패를 계산합니다. 공통 전투 규칙은 하나의 TypeScript 패키지에서 관리합니다. 자세한 흐름과 현재 제한은 [구조 문서](docs/ARCHITECTURE.md)를 확인하세요.

## 현재 동작하는 것

- npm workspaces: React·Vite·Phaser 웹 / Node.js·Colyseus 서버 / 공통 TypeScript 규칙.
- 게스트 닉네임 참가, 2명 방 배정, 준비·카운트다운·120초 전투.
- 서버가 계산하는 이동·벽 충돌·체력·쿨다운·8개 스킬·승패.
- 기권, 누적 최대 10초 재접속 유예, 새로고침 후 복귀 시도.
- 같은 개발 사용자·인증 계정의 동시 방 참가 방지.
- 테스트용 현재·최고 연승, 승패 수, 경기 ID별 한 번만 정산.
- 로비·체력·시간·쿨다운·결과 UI. 외부 캐릭터 파일 없이 코드로 그리는 임시 캐릭터.
- Supabase 설정 시 회원가입·로그인·로그아웃·비밀번호 재설정 화면과 서버 토큰 검증.
- Supabase 초기 스키마·RLS migration 초안, 핵심 규칙 테스트, 실제 서버 통합 검사, CI 설정 템플릿.

## 아직 구현하지 않은 것

- DB를 통한 경기·연승 영구 정산 및 장애 복구. 인증 계정도 현재 전적은 메모리에만 저장됩니다.
- 공식 순위표, 닉네임 DB 연동·전역 중복 검사, 탈퇴 UI.
- 완전한 입력 이력 재실행 방식의 이동 예측, 과거 시점 명중 보정, 다중 서버 매칭.
- 공개 서비스용 요청 제한·운영·모니터링·신고·부하 검증.
- 최종 캐릭터 아트·사운드·Tiled 파일 반입, 모바일 조작.

공개 배포를 실수로 진행하지 않도록 이 단계의 서버는 `NODE_ENV=production` 시작을 거절합니다. 이를 해제하는 것만으로 공개 준비가 완료되지는 않습니다. 다음 개발 단계는 `docs/ROADMAP.md`에 정리했습니다.

## 프로젝트 구조

```text
apps/web/src/
  components/          # Canvas 수명 관리, 선택적 인증 화면
  game/                # Colyseus 연결, 입력, Phaser 화면
  lib/                 # Supabase 클라이언트
apps/game-server/src/
  rooms/               # 1:1 방·재접속·판정 실행
  services.ts          # 개발용 전적 저장소, 인증
packages/shared/src/   # 스킬·규칙·프로토콜·순수 전투 계산
scripts/smoke.ts       # 실제 두 클라이언트 통합 검증
supabase/migrations/   # 아직 적용하지 않은 DB 초기 migration
docs/                  # PRD, 개발 명세, 구조, 설정, 에셋 기록
```

공통 규칙을 수정하면 watch 빌드가 갱신되고 게임 서버가 재시작됩니다. 이때 진행 중인 개발 경기는 종료되고 메모리 전적이 초기화됩니다. 세 프로세스는 루트의 `npm run dev`로 함께 관리합니다.

## 환경 변수와 Supabase 연결

`.env.example`을 복사하는 명령은 프로젝트 루트에서 실행합니다. 기본 게스트 실행에는 복사하지 않아도 됩니다.

```sh
cp apps/web/.env.example apps/web/.env
cp apps/game-server/.env.example apps/game-server/.env
```

| 파일                    | 주요 설정                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/.env`         | `VITE_GAME_SERVER_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                      |
| `apps/game-server/.env` | `HOST`, `PORT`, `ALLOWED_ORIGINS`, `ALLOW_DEV_GUESTS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |

1. Supabase 프로젝트의 URL과 **publishable key**를 웹·서버 양쪽 파일에 설정합니다.
2. Supabase Auth에서 이메일 인증을 활성화하고 Site URL·허용 Redirect URL에 로컬 웹 주소를 등록합니다.
3. 외부 이메일 주소로 가입을 테스트할 때는 사용자 소유 SMTP를 설정합니다.
4. 서버를 재시작하면 웹에 로그인·회원가입 버튼이 표시됩니다. 서버는 `getUser(token)`으로 인증된 사용자를 확인합니다.
5. 인증 사용자만 참가하도록 테스트하려면 서버의 `ALLOW_DEV_GUESTS=false`로 변경합니다.

서버용 secret/service-role 키는 현재 필요하지 않습니다. `VITE_`로 시작하는 값은 브라우저에 포함되므로 비밀 키를 절대 넣지 마세요. migration을 준비했지만 외부 DB에는 적용하지 않았으며 게임 정산과도 아직 연결하지 않았습니다. [Supabase 설정 안내](docs/SUPABASE.md)를 확인하세요.

현재 서버는 기본적으로 `127.0.0.1`에만 바인딩합니다. 다른 PC에서 LAN 테스트를 하려면 웹 실행에 `--host 0.0.0.0`, 서버의 `HOST`, 웹의 게임 서버 주소와 서버의 허용 출처를 일치시켜야 합니다. 공개 인터넷에 노출하기 전에는 영구 저장과 운영 요건을 먼저 구현하세요.

## 개발 명령

| 명령                                  | 설명                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                         | 공통 규칙 watch + 게임 서버 + 웹 동시 실행             |
| `npm run check`                       | 타입 검사 → 단위 테스트 → 공유·서버·웹 빌드            |
| `npm run test:integration`            | 별도 임시 포트에서 실제 서버와 SDK 클라이언트 2개 검증 |
| `npm run test:db`                     | 폐기용 PostgreSQL에서 migration·관계 제약·RLS 검증     |
| `npm run test:watch`                  | 규칙 테스트 watch                                      |
| `npm run format`                      | 코드·문서 포맷 정리, PRD는 제외                        |
| `npm run format:check`                | 포맷 확인                                              |
| `npm run start -w @deathmatch/server` | 빌드된 서버 실행, 사전에 루트 build 필요               |
| `npm run preview -w @deathmatch/web`  | 빌드된 웹 미리보기                                     |

검증은 `npm run check`와 `npm run test:integration`을 기준으로 합니다. 개발 기반 작성 시 타입 검사·단위 테스트 19개·웹/서버 빌드와 매칭·재접속·기권·연승 보존 통합 검증을 통과했습니다. 브라우저 자동화 연결을 사용할 수 없어 시각 검증은 수행하지 못했습니다. 실제 Supabase 가입·메일 흐름 및 migration 실행 검증도 계정 설정 후 별도로 수행해야 합니다. Phaser는 별도 지연 로딩 청크로 분리했으며 엔진 크기로 인한 번들 용량 경고는 현재 남아 있습니다.

GitHub 자동 CI는 아직 활성화하지 않았습니다. 현재 Git 인증에 워크플로 파일 수정 권한이 없어 설정을 [`docs/ci.yml.example`](docs/ci.yml.example)에 보관했습니다. 권한을 설정한 뒤 [CI 활성화 안내](docs/CI.md)에 따라 적용할 수 있습니다. 로컬 검증 명령은 그대로 사용할 수 있습니다.

## 참고 자료

- [Phaser 공식 문서](https://phaser.io/oss/docs/phaser)
- [Colyseus 서버 문서](https://docs.colyseus.io/getting-started/server)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [PRD와 에셋 조사](docs/PRD.md)

ERD 기반 DB 준비에서는 타입 검사·단위 테스트 30개·웹/서버 빌드와 PostgreSQL 16.14의 스키마·권한·이관 중단 검사를 통과했습니다. `test:db`에는 `initdb`, `pg_ctl`, `psql`이 필요합니다. 실제 Supabase 적용·정산 RPC·게임의 영구 저장 연결은 [백엔드 준비서](docs/BACKEND_IMPLEMENTATION_PLAN.md)의 후속 작업입니다.

## 개발 문서와 다음 단계

상세 문서와 프로젝트 작업 명세는 [`docs/`](docs/README.md)에 모아 관리합니다.

기능별 개발은 [12개 기능 브랜치와 명세서 목록](docs/features/README.md)에서 확인할 수 있습니다. 각 기능 브랜치는 현재 기반 위에 해당 기능의 명세서를 추가한 상태입니다.

- [제품 요구사항과 프레임워크·에셋 조사](docs/PRD.md)
- [1인 개발 진행 현황과 다음 작업](docs/ROADMAP.md)
- [시스템 구조와 영구 저장 도입 계획](docs/ARCHITECTURE.md)
- [개발 환경·작업 규칙](docs/DEVELOPMENT.md)
- [한국어 커밋 메시지 작성 규칙](docs/COMMIT_CONVENTION.md)
- [Supabase 설정과 DB 스키마 적용 안내](docs/SUPABASE.md)
- [ERD 기반 DB 테이블·관계 명세](docs/DATABASE.md)
- [백엔드 구현 준비와 후속 작업](docs/BACKEND_IMPLEMENTATION_PLAN.md)
- [에셋 출처와 라이선스 기록](docs/ASSET_LICENSES.md)
- [자동 CI 설정 템플릿과 활성화 방법](docs/CI.md)

다음 핵심 작업은 **실제 플레이 테스트 → 전투 규칙 확정 → 경기·연승 영구 정산 → 순위표와 비공개 베타**입니다.
