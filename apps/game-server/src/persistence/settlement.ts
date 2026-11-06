import type { MatchResult, PlayerStats } from '@deathmatch/shared';
import {
  CHARACTER_KEYS,
  type ParticipantIdentity,
  type PlayerStatsRow,
  type SettlementCommand,
  type SettlementParticipant,
} from './contracts.js';

export class PersistenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceContractError';
  }
}
export function isDatabaseUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
export function normalizeNickname(value: string): { nickname: string; normalized: string } {
  const nickname = value.normalize('NFC').trim();
  if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(nickname))
    throw new PersistenceContractError('닉네임은 한글 완성형·영문·숫자·밑줄 2~12자입니다.');
  return { nickname, normalized: nickname.toLowerCase() };
}

/** 게스트·방 ID를 DB UUID로 오인하지 않고, 서버의 세션 승자를 계정 승자로 변환합니다. */
export function makeSettlementCommand(
  matchId: string,
  participants: readonly [ParticipantIdentity, ParticipantIdentity],
  result: MatchResult,
  voidReason?: 'server_failure' | 'disconnect',
): SettlementCommand {
  if (!isDatabaseUuid(matchId)) throw new PersistenceContractError('DB 경기 UUID가 필요합니다.');
  const [a, b] = participants;
  if (a.sessionId === b.sessionId || !a.sessionId || !b.sessionId || a.userId === b.userId)
    throw new PersistenceContractError('서로 다른 두 세션·계정이 필요합니다.');
  for (const participant of participants) {
    if (!isDatabaseUuid(participant.userId))
      throw new PersistenceContractError('게스트가 아닌 인증 계정 UUID가 필요합니다.');
    if (!CHARACTER_KEYS.includes(participant.characterKey))
      throw new PersistenceContractError('알 수 없는 캐릭터 키입니다.');
    if (
      !Number.isInteger(participant.finalHp) ||
      participant.finalHp < 0 ||
      participant.finalHp > 100
    )
      throw new PersistenceContractError('최종 체력은 0~100 정수입니다.');
  }
  if (a.userId.toLowerCase() === b.userId.toLowerCase())
    throw new PersistenceContractError('서로 다른 두 계정 UUID가 필요합니다.');
  if (!['ko', 'timeout', 'draw', 'surrender', 'disconnect', 'void'].includes(result.reason))
    throw new PersistenceContractError('알 수 없는 경기 종료 사유입니다.');
  const winner = participants.find((participant) => participant.sessionId === result.winnerId);
  if (result.winnerId !== null && !winner)
    throw new PersistenceContractError('승자는 이 경기의 참가자여야 합니다.');
  if (['draw', 'void'].includes(result.reason) && result.winnerId !== null)
    throw new PersistenceContractError('무승부·무효 경기에 승자를 기록할 수 없습니다.');
  if (['surrender', 'disconnect'].includes(result.reason) && !winner)
    throw new PersistenceContractError('기권·단독 이탈 결과에는 승자가 필요합니다.');
  const opponent = winner?.sessionId === a.sessionId ? b : a;
  if (
    result.reason === 'ko' &&
    (winner ? winner.finalHp === 0 || opponent.finalHp !== 0 : a.finalHp !== 0 || b.finalHp !== 0)
  )
    throw new PersistenceContractError('KO 결과와 양쪽 최종 체력이 일치하지 않습니다.');
  if (
    result.reason === 'timeout' &&
    (winner ? winner.finalHp <= opponent.finalHp : a.finalHp !== b.finalHp)
  )
    throw new PersistenceContractError('시간 종료 결과와 양쪽 최종 체력이 일치하지 않습니다.');
  if (result.reason === 'draw' && a.finalHp !== b.finalHp)
    throw new PersistenceContractError('무승부의 양쪽 최종 체력이 일치하지 않습니다.');
  const isVoid = result.reason === 'void';
  let reason: SettlementCommand['reason'];
  if (result.reason === 'void') {
    if (voidReason !== 'server_failure' && voidReason !== 'disconnect')
      throw new PersistenceContractError('무효 원인을 서버 장애 또는 양쪽 연결 종료로 명시하세요.');
    reason = voidReason;
  } else {
    if (voidReason !== undefined)
      throw new PersistenceContractError('유효 경기 결과에는 무효 원인을 덧붙일 수 없습니다.');
    reason = result.reason;
  }
  const mapParticipant = (p: ParticipantIdentity): SettlementParticipant => ({
    userId: p.userId.toLowerCase(),
    characterKey: p.characterKey,
    finalHp: p.finalHp,
    outcome: isVoid ? null : !winner ? 'draw' : p.sessionId === winner.sessionId ? 'win' : 'loss',
  });
  return {
    matchId: matchId.toLowerCase(),
    winnerUserId: winner?.userId.toLowerCase() ?? null,
    status: isVoid ? 'void' : 'completed',
    reason,
    participants: [mapParticipant(a), mapParticipant(b)],
  };
}

/** DB의 snake_case 통계를 기존 공개 프로토콜로 바꿉니다. 달성 시각은 DB 조회 계약에 남습니다. */
export function toPlayerStats(row: PlayerStatsRow): PlayerStats {
  const values = [row.current_streak, row.best_streak, row.wins, row.losses, row.draws];
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    row.best_streak < row.current_streak
  )
    throw new PersistenceContractError('DB 통계 값이 유효하지 않습니다.');
  return {
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
  };
}
