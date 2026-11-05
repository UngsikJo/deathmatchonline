# Supabase 초기 스키마 초안

[초기 migration](../supabase/migrations/202611060001_initial_schema.sql)은 회원 프로필·통계·경기 테이블과 기본 RLS 정책의 출발점입니다. 아직 실제 Supabase에 적용하거나 실행 검증하지 않았습니다. 개발용 빈 프로젝트에서 먼저 검증하세요.

현재 게임 서버는 이 테이블에 쓰지 않습니다. Supabase를 연결해도 인증만 활성화되며 경기·연승 기록은 메모리에 남습니다.

## 인증 연결

프로젝트 루트에서 환경 변수 예시를 복사합니다.

```sh
cp apps/web/.env.example apps/web/.env
cp apps/game-server/.env.example apps/game-server/.env
```

| 파일                    | 필요한 설정                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/.env`         | `VITE_GAME_SERVER_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                      |
| `apps/game-server/.env` | `HOST`, `PORT`, `ALLOWED_ORIGINS`, `ALLOW_DEV_GUESTS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |

1. 사용자 소유 Supabase 프로젝트의 URL과 publishable key를 웹·서버 양쪽에 설정합니다.
2. Supabase Auth에서 이메일 인증을 활성화하고 Site URL·허용 Redirect URL에 `http://127.0.0.1:5173`을 등록합니다.
3. 외부 주소로 인증·비밀번호 재설정 메일을 보내려면 SMTP 발송 서비스와 발신 주소를 설정합니다.
4. 개발 서버를 재시작하면 웹에서 로그인·회원가입을 사용할 수 있습니다. 서버는 `getUser(token)`으로 사용자를 검증합니다.
5. 인증 계정만 참가하게 하려면 서버의 `ALLOW_DEV_GUESTS=false`로 설정합니다.

현재는 secret/service-role 키가 필요하지 않습니다. `VITE_` 변수는 브라우저에 포함됩니다. 비밀 키를 넣지 말고 `.env`는 Git에 커밋하지 않습니다.

## 적용 전 확인

1. 운영 프로젝트와 분리한 Supabase 개발 프로젝트를 선택합니다.
2. SQL 내용을 검토한 뒤 Supabase SQL Editor 또는 소유자의 Supabase CLI 연결을 통해 적용합니다.
3. 새 인증 사용자가 생성되면 기본 프로필·통계가 생기는지 확인합니다. 기존 인증 계정은 자동 소급 생성되지 않으므로 별도 backfill이 필요합니다.
4. 일반 사용자 둘로 프로필 조회, 자기 닉네임 수정, 다른 사람 수정 거절, 통계 쓰기 거절, 자기 경기만 조회가 되는지 검증합니다.
5. 서버 전용 정산 함수를 별도 migration으로 추가한 뒤 실제 전적 저장을 연결합니다.

정산 함수는 아직 없습니다. 브라우저에 통계 쓰기 권한을 주거나 service-role 키를 배포하여 우회하지 않습니다. 운영 DB에 적용하는 작업은 이 프로젝트 기초 생성 단계에 포함하지 않았습니다.
