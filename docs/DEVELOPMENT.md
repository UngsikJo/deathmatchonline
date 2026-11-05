# 프로젝트 작업 지침

이 프로젝트는 1인 개발 중인 로컬 프로토타입입니다. 현재 범위와 미구현 항목은 [루트 README](../README.md)와 [ROADMAP](ROADMAP.md)을 먼저 확인합니다.

## 실행 환경

- Node.js 24.x와 npm을 사용합니다. `.nvmrc` 사용자는 루트에서 `nvm use`를 실행합니다.
- 처음 내려받으면 `npm ci`, 웹·게임 서버 동시 실행은 `npm run dev`입니다.
- 검증은 `npm run check`, 실제 두 클라이언트 검증은 `npm run test:integration`입니다.
- 일반 개발은 외부 서비스 없이 게스트 모드로 진행합니다. 인증이 필요한 작업은 [Supabase 안내](SUPABASE.md)를 따릅니다.
- 현재 브랜치는 `main`, 원격은 `origin`의 `UngsikJo/deathmatchonline` 저장소를 사용합니다.

## 작업 규칙

- Node.js 24, npm workspaces를 사용합니다. 패키지 추가 시 해당 workspace에 추가하고 루트 lockfile을 갱신합니다.
- 제품 요구사항은 `docs/PRD.md`에 있습니다. 이미 구현됐다는 뜻은 아니므로 실제 코드를 함께 확인합니다.
- 전투 규칙·수치는 packages/shared에 두고 웹과 서버에서 중복 작성하지 않습니다.
- 체력·피해·승패·연승은 서버가 결정합니다. 브라우저가 제출한 결과를 신뢰하지 않습니다.
- 인증과 공개 API에는 런타임 입력 검증을 적용합니다. 서버 비밀 키를 VITE_ 환경 변수에 넣지 않습니다.
- 외부 에셋을 추가하면 `docs/ASSET_LICENSES.md`에 출처·라이선스를 기록합니다.
- 서버의 메모리 전적과 production 시작 제한은 영구 정산·장애 복구 구현 전에 임의로 제거하지 않습니다.
- 주요 로직 변경 후 `npm run check`를 실행합니다. 방·인증·접속 흐름 변경 시 `npm run test:integration`도 실행합니다.
- 의미 있는 판정·권한·결과 전이 테스트를 작성하고, 시각 변경을 구현 그대로 복제하는 테스트는 피합니다.
- 작업 범위·현재 제한·검증 결과가 바뀌면 README와 ROADMAP을 함께 갱신합니다.
- 저장소 소개용 루트 `README.md`를 제외한 기획·개발 명세 문서는 `docs/`에 저장하고 `docs/README.md`에 연결합니다.
- 저장소·배포·Supabase 프로젝트에 연결하거나 외부 DB를 변경할 때는 요청 범위와 대상 환경을 확인합니다.
