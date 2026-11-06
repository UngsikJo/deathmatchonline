# 자동 CI 활성화

현재 로컬 검증은 사용할 수 있지만 GitHub Actions 자동 실행은 활성화되지 않았습니다. 첫 업로드 당시 Git 인증 토큰에 `workflow` 권한이 없어 `.github/workflows/ci.yml` 업로드가 GitHub에서 거절됐습니다. 연결된 GitHub 앱도 해당 파일의 생성 권한을 제공하지 않았습니다.

설정 내용은 [ci.yml.example](ci.yml.example)에 그대로 보관했습니다. 이는 `push`와 `pull_request`마다 Node.js 24 환경에서 아래 명령을 실행하는 템플릿입니다.

```sh
npm ci
npm run format:check
npm run check
npm run test:integration
```

## 권한 설정 후 적용

워크플로 파일 수정이 허용된 GitHub 인증 수단으로 로그인한 다음 프로젝트 루트에서 실행합니다. 비밀 토큰을 저장소 파일이나 채팅에 넣지 않습니다.

```sh
mkdir -p .github/workflows
mv docs/ci.yml.example .github/workflows/ci.yml
git add .github/workflows/ci.yml docs/ci.yml.example
git commit -m "ci: 프로젝트 자동 검사 활성화"
git push
```

활성화한 뒤 README·문서 목록의 비활성 안내와 템플릿 링크를 새 경로로 갱신하고, 저장소 Actions 화면에서 첫 실행 결과를 확인합니다.
