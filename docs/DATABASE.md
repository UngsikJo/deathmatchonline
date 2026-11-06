# DB 테이블·관계 명세

- 기준일: 2026-11-06
- 브랜치: `feature/streak-persistence` (F06)
- 원본: [사용자가 제공한 ERD HTML](<Deathmatch Online ERD.html>)
- 상태: **ERD 기반 스키마·서버 계약 준비. 로컬 폐기용 PostgreSQL 검증과 실제 Supabase 적용은 구분합니다.**
- SQL: [기존 001](../supabase/migrations/202611060001_initial_schema.sql) → [ERD 반영 002](../supabase/migrations/202611060002_align_erd.sql)
- 재검수: [003 보완 migration](../supabase/migrations/202611060003_review_integrity.sql)과 코드 수정은 2026-11-07 사용자 승인에 따라 기능 브랜치에 반영합니다. [검수 보고서](reviews/2026-11-06-backend-review.md)를 확인하세요.
- 다음 구현: [백엔드 구현 준비서](BACKEND_IMPLEMENTATION_PLAN.md)

## 1. 원본과 이미지 보관

HTML 원본은 수정하지 않았습니다. 원본 SHA-256은 `9dca3b0babf33d3714b61bea0725d8154fc5691e12724bcd845c44037cd60b88`입니다. 외부 글꼴·원문 포맷을 보존하기 위해 원본만 포맷 검사에서 제외합니다.

[관계도 PNG](database/assets/deathmatch-online-erd-from-html.png)와 [관계도 SVG](database/assets/deathmatch-online-erd-from-html.svg)는 HTML의 관계도 부분을 내보낸 파일입니다. **첨부 사진 원본을 저장한 파일은 아닙니다.** 첨부 원본 파일 경로가 제공되면 별도 원본으로 보관할 수 있습니다. PNG는 전체 관계도가 잘리지 않는 것을 시각 확인했습니다. 생성 과정은 [이미지 보관 안내](database/assets/README.md)를 따릅니다.

## 2. 테이블 구성과 소유권

Supabase 관리 테이블 1개와 서비스 테이블 6개입니다. 서비스 테이블 컬럼은 총 39개입니다. `auth.users`는 Supabase가 소유하며 앱 migration으로 생성·변경하지 않습니다. 테스트의 `auth.users`는 최소 모형입니다.

| 테이블                  | 책임                                    | 관계·카디널리티                                      |
| ----------------------- | --------------------------------------- | ---------------------------------------------------- |
| `auth.users`            | 인증 계정·이메일·인증 시각              | 나머지 테이블의 계정 FK는 이 테이블의 PK `id` 참조   |
| `profiles`              | 공개 닉네임                             | 계정당 0~1행, 가입 트리거 성공 시 1행                |
| `player_stats`          | 계정 전체 현재·최고 연승과 승패         | 계정당 0~1행. 캐릭터를 바꿔도 같은 계정 기록         |
| `active_participations` | 대기·경기 중복 참가 잠금                | 계정당 최대 1행. 종료·취소·만료 복구 후 해제         |
| `matches`               | 경기 식별·두 참가자·상태·규칙·확정 결과 | 계정별 여러 경기. Colyseus `roomId`와 별도의 DB UUID |
| `match_participants`    | 경기별 캐릭터·개인 결과·연승 변화       | 경기당 지정 계정의 행을 정확히 2개 저장              |
| `match_events`          | 제한된 운영·접속·정산 이벤트            | 경기당 0개 이상, 계정 주체가 없는 서버 이벤트 허용   |

실시간 좌표·현재 HP·쿨다운·궁극기·다운·기상, 대기열 전체, 캐릭터·스킬 수치 테이블은 추가하지 않습니다. `final_hp`는 종료 시점의 값입니다.

## 3. 데이터 사전

`?`는 NULL 허용입니다. 모든 시각은 `timestamptz`, API 경계에서는 UTC ISO 문자열입니다. 숫자 통계는 PostgreSQL `integer`, 캐릭터·상태 값은 `text`와 CHECK로 제한합니다.

### profiles — 4개 컬럼

| 컬럼                  | 타입        | 기본값·제약                                         |
| --------------------- | ----------- | --------------------------------------------------- |
| `user_id`             | uuid        | PK, FK → `auth.users.id`, 계정 삭제 시 CASCADE      |
| `nickname`            | text        | NOT NULL, 완성형 한글·영문·숫자·밑줄 2~12자         |
| `nickname_normalized` | text        | `lower(nickname)` 생성 컬럼, UNIQUE, 직접 수정 불가 |
| `created_at`          | timestamptz | NOT NULL, `now()`                                   |

쓰기 전 서버에서 앞뒤 공백 제거와 NFC 정규화를 적용합니다. DB는 정규화가 끝난 형식을 검사합니다. 중복은 DB UNIQUE가 최종 판정합니다. 가입 트리거의 임시 닉네임은 유지하고 실제 닉네임 변경·가입 메타데이터 연결은 F02에서 구현합니다.

### player_stats — 7개 컬럼

| 컬럼                      | 타입         | 기본값·제약                                              |
| ------------------------- | ------------ | -------------------------------------------------------- |
| `user_id`                 | uuid         | PK, FK → `auth.users.id`, CASCADE                        |
| `current_streak`          | integer      | NOT NULL, 0, 0 이상                                      |
| `best_streak`             | integer      | NOT NULL, 0, 현재 연승 이상                              |
| `best_streak_achieved_at` | timestamptz? | 최고 기록을 처음 달성한 시각. 동일 최고값 재달성 때 보존 |
| `wins`                    | integer      | NOT NULL, 0, 0 이상                                      |
| `losses`                  | integer      | NOT NULL, 0, 0 이상                                      |
| `draws`                   | integer      | NOT NULL, 0, 0 이상                                      |

순위 인덱스는 `(best_streak DESC, best_streak_achieved_at ASC NULLS LAST, user_id)`입니다. 통계 수정·달성 시각 결정은 후속 서버 전용 정산 트랜잭션이 담당합니다. 이번 migration만으로 통계가 자동 정산되지는 않습니다.

### matches — 11개 컬럼

| 컬럼                 | 타입         | 기본값·제약                                               |
| -------------------- | ------------ | --------------------------------------------------------- |
| `id`                 | uuid         | PK, `gen_random_uuid()`. 서버가 재시도에도 같은 UUID 사용 |
| `player1_id`         | uuid         | NOT NULL, FK → `auth.users.id`                            |
| `player2_id`         | uuid         | NOT NULL, FK → `auth.users.id`, 첫 참가자와 달라야 함     |
| `status`             | text         | NOT NULL, `preparing`, 아래 상태 목록                     |
| `winner_id`          | uuid?        | FK → `auth.users.id`, 두 참가자 중 한 명 또는 NULL        |
| `reason`             | text?        | 종료 원인. 확정 전·시작 전 취소는 NULL                    |
| `created_at`         | timestamptz  | NOT NULL, `now()`, 준비 경기의 기준 시각                  |
| `started_at`         | timestamptz? | 전투 실제 시작 시각, 생성 시각 이상                       |
| `ended_at`           | timestamptz? | 종료 시각, 시작 또는 생성 시각 이상                       |
| `rules_version`      | text         | NOT NULL, 공백 제거 후 1~80자                             |
| `server_instance_id` | text         | NOT NULL, 공백 제거 후 1~128자. 비밀 값 저장 금지         |

상태는 `preparing`, `active`, `finalizing`, `completed`, `cancelled`, `void`입니다. 사유는 `ko`, `timeout`, `surrender`, `disconnect`, `draw`, `server_failure`입니다.

| 상태                | 시각·결과 계약                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| preparing           | 시작·종료·승자·사유 NULL                                                                           |
| active / finalizing | 시작 시각 있음, 종료·승자·사유 NULL                                                                |
| completed           | 시작·종료·사유 있음. 서버 장애 사유 불가. 기권·단독 이탈은 승자 필수                               |
| cancelled           | 시작 전 취소. 종료 시각만 있고 승자·사유 NULL                                                      |
| void                | 종료 시각 있음, 승자 NULL, `server_failure` 또는 양쪽 연결 종료 `disconnect`, 시작 전/후 모두 가능 |

현재 전투 프로토콜의 `draw`는 동시 KO와 시간 동점을 구분하지 않습니다. 원본 ERD처럼 `draw`를 호환 값으로 유지합니다. 현재 프로토콜의 `void`에는 양쪽 연결 종료도 포함되므로 변환 함수는 무효 원인을 명시적으로 요구하며 모두 서버 장애로 바꾸지 않습니다. 이후 프로토콜을 확장할 때 실제 원인은 `ko`/`timeout`, 무승부는 승자 NULL·양쪽 outcome `draw`로 표현할 수 있습니다.

### match_participants — 7개 컬럼

| 컬럼            | 타입     | 기본값·제약                                      |
| --------------- | -------- | ------------------------------------------------ |
| `match_id`      | uuid     | 복합 PK, FK → `matches.id`, 경기 삭제 시 CASCADE |
| `user_id`       | uuid     | 복합 PK, FK → `auth.users.id`                    |
| `character_key` | text     | NOT NULL, `brawler`, `sword`, `archer`, `mage`   |
| `outcome`       | text?    | `win`, `loss`, `draw`. 준비·취소·무효에는 NULL   |
| `streak_before` | integer? | 0 이상, 정산 전 NULL 허용                        |
| `streak_after`  | integer? | 0 이상, 승리면 이전+1, 패배·무승부면 0           |
| `final_hp`      | integer? | 0~100 정수. 확정 경기에는 필수                   |

경기 헤더와 개인 행의 이중 저장은 유지하되 지연 제약 트리거가 **같은 트랜잭션의 최종 상태**에서 검사합니다. 부모와 같은 두 계정의 행이 정확히 2개여야 하고, 확정 승자·개인 결과·연승 변화가 일치해야 합니다. 따라서 경기 행만 먼저 커밋한 뒤 참가자를 별도 API로 넣을 수 없습니다. 캐릭터의 경기 중 교체 차단·규칙 버전 검증은 후속 서버 저장 경로에서 수행합니다.

### active_participations — 4개 컬럼

| 컬럼                | 타입        | 기본값·제약                                             |
| ------------------- | ----------- | ------------------------------------------------------- |
| `user_id`           | uuid        | PK, FK → `auth.users.id`, CASCADE                       |
| `queue_or_match_id` | text        | NOT NULL, 공백 제거 후 1~128자                          |
| `state`             | text        | NOT NULL, `queued`, `preparing`, `active`, `finalizing` |
| `lease_expires_at`  | timestamptz | NOT NULL, DB 시각 기준으로 후속 서버 함수가 결정        |

원본 ERD의 FK 없는 다형 참조를 유지합니다. 대기 중에는 대기표 ID, 경기 단계에서는 DB 경기 UUID 문자열입니다. `match_id`와 대기표를 분리하는 개선안은 아직 적용하지 않았습니다. PK만으로 만료 회수·경쟁 처리가 완성되는 것은 아닙니다. 조건부 claim·renew·release·복구 작업은 다음 단계입니다.

### match_events — 6개 컬럼

| 컬럼          | 타입        | 기본값·제약                                       |
| ------------- | ----------- | ------------------------------------------------- |
| `id`          | bigint      | PK, GENERATED ALWAYS AS IDENTITY                  |
| `match_id`    | uuid        | NOT NULL, FK → `matches.id`, CASCADE              |
| `user_id`     | uuid?       | FK → `auth.users.id`, NULL이면 서버/시스템 이벤트 |
| `event_type`  | text        | NOT NULL, 소문자 시작·소문자/숫자/밑줄 최대 48자  |
| `payload`     | jsonb?      | NULL 또는 JSON 객체. 배열·스칼라 제외             |
| `occurred_at` | timestamptz | NOT NULL, `now()`                                 |

초기 이벤트 예시는 `surrender`, `disconnect`, `reconnect`, `ready_abandon`, `settle_conflict`입니다. 토큰·비밀번호·이메일·원문 입력·매 프레임 상태를 기록하지 않습니다. bigint ID는 API에서 텍스트로 캐스팅해 전달하도록 어댑터를 작성해야 합니다. 수기 TypeScript 계약도 문자열로 정의했습니다. 보관 기간과 정기 삭제 작업은 미정이며 자동 삭제는 아직 없습니다.

## 4. 읽기·쓰기 권한

| 데이터                | 익명      | 인증 사용자                       | 서버 전용 경로                    |
| --------------------- | --------- | --------------------------------- | --------------------------------- |
| profiles              | 공개 조회 | 공개 조회, 본인 `nickname`만 수정 | 관리 가능                         |
| player_stats          | 공개 조회 | 공개 조회, 쓰기 금지              | 정산 함수로 수정 예정             |
| matches               | 접근 금지 | 자신이 참가한 경기만 조회         | 생성·전이·정산 예정               |
| match_participants    | 접근 금지 | 자기 참가 행만 조회               | 두 행을 한 트랜잭션으로 관리 예정 |
| active_participations | 접근 금지 | 접근 금지                         | 참가 잠금 관리 예정               |
| match_events          | 접근 금지 | 접근 금지                         | 필요한 이벤트만 기록 예정         |

모든 public 테이블에 RLS를 적용합니다. 공개 프로필·통계에서 이메일을 조합해 노출하지 않습니다. 서버 역할은 브라우저에 배포하지 않습니다. 인증 모형으로 DB 역할·정책을 검증했으며 실제 Supabase JWT·REST API·Auth 동작 검증은 별도입니다. [Supabase RLS 공식 안내](https://supabase.com/docs/guides/database/postgres/row-level-security), [사용자 데이터 공식 안내](https://supabase.com/docs/guides/auth/managing-user-data).

## 5. 미정 사항의 개발 기본안

1. **탈퇴:** 원본 HTML은 익명화와 삭제 제한 중 선택을 요구합니다. 개발 migration은 과거 경기·참가자·이벤트의 계정 FK에 `RESTRICT`를 적용해 기록 손실을 방지합니다. 이는 최종 탈퇴 정책이 아닙니다. F01/F06의 익명화 목표는 별도 설계·migration·권한 검증 후 구현합니다. 현재 경기 기록이 있는 계정의 직접 삭제는 실패합니다.
2. **대기열 참조:** 원본대로 FK 없는 문자열을 유지합니다. 분리할 경우 별도 migration과 소유권 검증을 추가합니다.
3. **이중 참가자 저장:** 경기 헤더·참가자 2행을 지연 제약으로 함께 검증합니다. 상태 전이의 허용 순서·중복 정산·통계 증감까지 구현한 것은 아닙니다.
4. **연승:** 계정 단위입니다. 캐릭터별 누적 기록 테이블을 추가하지 않습니다.
5. **보관:** 이벤트 보관 기간·계정 삭제 시 익명화 방식은 운영 적용 전에 확정해야 합니다.

## 6. 기존 SQL과 이관

| 001과 차이                        | 002의 반영                                                        |
| --------------------------------- | ----------------------------------------------------------------- |
| `player_a`, `player_b`            | `player1_id`, `player2_id`로 변경·NOT NULL, 관련 인덱스 이름 변경 |
| 프로필을 경유한 계정 FK           | ERD대로 `auth.users.id` 직접 참조                                 |
| 참가자에 캐릭터 없음              | `character_key` 추가                                              |
| `streak_before` 기본 0·NOT NULL   | 기본값 제거·NULL 허용                                             |
| 참가 outcome에 `void` 존재        | `win/loss/draw`만 사용, 무효 개인 결과는 NULL                     |
| 이벤트 테이블 없음                | `match_events`, FK·형식·조회/보관용 인덱스 추가                   |
| 참가자 중복 정보의 일치 보장 없음 | 정확한 두 계정·확정 결과를 지연 제약으로 확인                     |
| `created_at`                      | 001에 이미 있으므로 유지. HTML의 주황 표시는 PRD와의 차이         |

001 파일은 변경하지 않았습니다. 002는 기존 경기·참가 기록이 있으면 중단합니다. 캐릭터를 임의로 채우거나 과거 경기를 지우지 않습니다. 실제 이관은 캐릭터 백필·NULL 계정·상태를 확인한 별도 계획이 필요합니다.

검증 명령은 `npm run test:db`입니다. PostgreSQL 16 이상 실행 파일이 필요하며 새 폐기용 클러스터와 Unix 소켓만 사용하고 종료 후 정리합니다. 기존 `DATABASE_URL`, PostgreSQL 접속 환경, 실행 중인 5432 포트의 DB는 사용하지 않습니다. 지연 제약은 [PostgreSQL의 제약 검사 시점](https://www.postgresql.org/docs/16/sql-set-constraints.html)을 따릅니다.

## 7. 재검수 보완안 — 공유 승인

001·002와 사용자 ERD 원본은 변경하지 않았습니다. 다음 변경은 003과 서버 코드에 준비했으며 2026-11-07 사용자가 커밋·푸시를 승인했습니다. 실제 Supabase에는 적용하지 않았습니다. 테이블 6개·컬럼 39개는 그대로입니다.

- UUID는 입력 형태를 검사한 뒤 소문자 기준으로 동일 계정을 판별하고 DB 경기·계정 ID도 소문자로 반환합니다. 입력 객체를 변경하지 않습니다.
- KO 승리는 승자 HP > 0·패자 HP = 0, 승자 없는 KO는 양쪽 HP = 0이어야 합니다. 시간 종료 승리는 더 높은 HP, 시간 종료 무승부·기존 `draw`는 같은 HP여야 합니다. 현재 0~100·동일 최대 HP 규칙을 전제로 서버와 DB 양쪽에서 검사합니다. 캐릭터별 최대 HP 정책을 바꾸면 이 검증도 규칙 버전과 함께 변경해야 합니다.
- `void` 사유 NULL을 별도 CHECK로 거절합니다. SQL CHECK가 NULL을 통과시키는 동작을 고려한 보완입니다.
- 서버 테이블 권한은 SELECT·INSERT·UPDATE·DELETE, 이벤트 시퀀스는 USAGE·SELECT로 제한합니다. TRUNCATE·TRIGGER·REFERENCES·시퀀스 재설정 권한은 주지 않습니다. DB 소유자의 유지보수 권한은 별도입니다.
- 003은 기존 경기 전체의 참가자·결과 정합성도 검사합니다. 잘못된 기록이 있으면 데이터·권한·DDL 변경을 함께 롤백하며 임의로 과거 승패를 고치지 않습니다.

공식 근거: [PostgreSQL UUID](https://www.postgresql.org/docs/16/datatype-uuid.html), [CHECK의 NULL 처리](https://www.postgresql.org/docs/16/ddl-constraints.html), [권한별 의미](https://www.postgresql.org/docs/16/ddl-priv.html).
