/** 사용자 ERD를 위한 수기 계약입니다. Supabase에서 생성한 Database 타입이 아닙니다. */
export const CHARACTER_KEYS = ['brawler', 'sword', 'archer', 'mage'] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];
export type MatchStatus =
  'preparing' | 'active' | 'finalizing' | 'completed' | 'cancelled' | 'void';
export type MatchReason = 'ko' | 'timeout' | 'surrender' | 'disconnect' | 'draw' | 'server_failure';
export type Outcome = 'win' | 'loss' | 'draw';
export type ParticipationState = 'queued' | 'preparing' | 'active' | 'finalizing';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ProfileRow {
  user_id: string;
  nickname: string;
  nickname_normalized: string;
  created_at: string;
}
export interface PlayerStatsRow {
  user_id: string;
  current_streak: number;
  best_streak: number;
  best_streak_achieved_at: string | null;
  wins: number;
  losses: number;
  draws: number;
}
export interface MatchRow {
  id: string;
  player1_id: string;
  player2_id: string;
  status: MatchStatus;
  winner_id: string | null;
  reason: MatchReason | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  rules_version: string;
  server_instance_id: string;
}
export interface MatchParticipantRow {
  match_id: string;
  user_id: string;
  character_key: CharacterKey;
  outcome: Outcome | null;
  streak_before: number | null;
  streak_after: number | null;
  final_hp: number | null;
}
export interface ActiveParticipationRow {
  user_id: string;
  queue_or_match_id: string;
  state: ParticipationState;
  lease_expires_at: string;
}
export interface MatchEventRow {
  /** PostgreSQL bigint는 Number의 안전 범위를 넘을 수 있어 경계에서는 문자열로 취급합니다. */
  id: string;
  match_id: string;
  user_id: string | null;
  event_type: string;
  payload: { [key: string]: JsonValue } | null;
  occurred_at: string;
}

export interface ParticipantIdentity {
  sessionId: string;
  userId: string;
  characterKey: CharacterKey;
  finalHp: number;
}
export interface SettlementParticipant {
  userId: string;
  characterKey: CharacterKey;
  finalHp: number;
  outcome: Outcome | null;
}
export interface SettlementCommand {
  matchId: string;
  winnerUserId: string | null;
  status: 'completed' | 'void';
  reason: MatchReason;
  participants: readonly [SettlementParticipant, SettlementParticipant];
}
export interface SettlementReceipt {
  matchId: string;
  status: 'completed' | 'void';
  winnerUserId: string | null;
  reason: MatchReason;
  endedAt: string;
  participants: readonly [MatchParticipantRow, MatchParticipantRow];
}

/** 서버 측 비동기 저장소 계약. 구현·RPC·DuelRoom 연결은 후속 단계입니다. */
export interface MatchRepository {
  createMatch(input: {
    matchId: string;
    participants: readonly [
      Pick<ParticipantIdentity, 'userId' | 'characterKey'>,
      Pick<ParticipantIdentity, 'userId' | 'characterKey'>,
    ];
    rulesVersion: string;
    serverInstanceId: string;
  }): Promise<MatchRow>;
  startMatch(matchId: string, serverInstanceId: string): Promise<MatchRow>;
  settleMatch(command: SettlementCommand): Promise<SettlementReceipt>;
  getOwnMatch(matchId: string, userId: string): Promise<SettlementReceipt | null>;
}

/** 갱신·해제는 이전 소유권과 일치할 때만 수행하는 조건부 계약입니다. */
export interface ParticipationRepository {
  claim(input: {
    userId: string;
    queueOrMatchId: string;
    state: ParticipationState;
  }): Promise<ActiveParticipationRow | null>;
  renew(expected: ActiveParticipationRow): Promise<ActiveParticipationRow | null>;
  release(expected: ActiveParticipationRow): Promise<boolean>;
}
