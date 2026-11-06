import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@deathmatch/shared';
import type { ParticipantIdentity } from './contracts.js';
import { makeSettlementCommand, normalizeNickname, toPlayerStats } from './settlement.js';

const matchId = '10000000-0000-0000-0000-000000000001';
const players: [ParticipantIdentity, ParticipantIdentity] = [
  {
    sessionId: 'session-a',
    userId: '20000000-0000-0000-0000-000000000001',
    characterKey: 'sword',
    finalHp: 60,
  },
  {
    sessionId: 'session-b',
    userId: '20000000-0000-0000-0000-000000000002',
    characterKey: 'mage',
    finalHp: 0,
  },
];

describe('영구 정산 경계 계약', () => {
  it('방 세션 승자를 인증 계정 UUID로 변환하고 양쪽 결과를 정한다', () => {
    const command = makeSettlementCommand(matchId, players, {
      winnerId: 'session-a',
      reason: 'ko',
    });
    expect(command.winnerUserId).toBe(players[0].userId);
    expect(command.participants.map((p) => p.outcome)).toEqual(['win', 'loss']);
    expect(command.participants.map((p) => p.characterKey)).toEqual(['sword', 'mage']);
  });
  it('무승부와 서버 장애 무효를 구분한다', () => {
    expect(
      makeSettlementCommand(matchId, players, { winnerId: null, reason: 'draw' }).participants.map(
        (p) => p.outcome,
      ),
    ).toEqual(['draw', 'draw']);
    const command = makeSettlementCommand(
      matchId,
      players,
      { winnerId: null, reason: 'void' },
      'server_failure',
    );
    expect(command).toMatchObject({ status: 'void', reason: 'server_failure', winnerUserId: null });
    expect(command.participants.map((p) => p.outcome)).toEqual([null, null]);
  });
  it('양쪽 연결 종료를 서버 장애로 잘못 기록하지 않고 무효 원인을 요구한다', () => {
    expect(() =>
      makeSettlementCommand(matchId, players, { winnerId: null, reason: 'void' }),
    ).toThrow(/무효 원인/);
    expect(
      makeSettlementCommand(matchId, players, { winnerId: null, reason: 'void' }, 'disconnect'),
    ).toMatchObject({ status: 'void', reason: 'disconnect', winnerUserId: null });
  });
  it('방 ID·게스트·다른 경기의 승자를 DB에 전달하지 않는다', () => {
    expect(() =>
      makeSettlementCommand('colyseus-room', players, { winnerId: 'session-a', reason: 'ko' }),
    ).toThrow(/UUID/);
    expect(() =>
      makeSettlementCommand(matchId, [{ ...players[0], userId: 'guest:abc' }, players[1]], {
        winnerId: 'session-a',
        reason: 'ko',
      }),
    ).toThrow(/인증 계정/);
    expect(() =>
      makeSettlementCommand(matchId, players, { winnerId: 'other-session', reason: 'ko' }),
    ).toThrow(/참가자/);
  });
  it('중복 계정·세션과 범위 밖 HP를 거절한다', () => {
    expect(() =>
      makeSettlementCommand(matchId, [players[0], { ...players[1], userId: players[0].userId }], {
        winnerId: null,
        reason: 'draw',
      }),
    ).toThrow(/서로 다른/);
    expect(() =>
      makeSettlementCommand(matchId, [players[0], { ...players[1], finalHp: 101 }], {
        winnerId: null,
        reason: 'draw',
      }),
    ).toThrow(/체력/);
  });
  it.each<MatchResult>([
    { winnerId: 'session-a', reason: 'draw' },
    { winnerId: 'session-a', reason: 'void' },
    { winnerId: null, reason: 'surrender' },
    { winnerId: null, reason: 'disconnect' },
  ])('모순된 종료 결과를 거절한다: %j', (result) => {
    expect(() => makeSettlementCommand(matchId, players, result)).toThrow();
  });
  it('닉네임의 NFC·공백·대소문자를 DB 규칙과 맞춘다', () => {
    expect(normalizeNickname('  Player_1  ')).toEqual({
      nickname: 'Player_1',
      normalized: 'player_1',
    });
    expect(normalizeNickname('한글'.normalize('NFD')).nickname).toBe('한글');
    expect(() => normalizeNickname('ㄱㄴ')).toThrow();
    expect(() => normalizeNickname('a'.repeat(13))).toThrow();
  });
  it('잘못된 DB 통계는 공개 통계로 보내지 않는다', () => {
    const row = {
      user_id: players[0].userId,
      current_streak: 3,
      best_streak: 5,
      best_streak_achieved_at: null,
      wins: 8,
      losses: 2,
      draws: 1,
    };
    expect(toPlayerStats(row)).toEqual({
      currentStreak: 3,
      bestStreak: 5,
      wins: 8,
      losses: 2,
      draws: 1,
    });
    expect(() => toPlayerStats({ ...row, best_streak: 2 })).toThrow();
    expect(() => toPlayerStats({ ...row, wins: -1 })).toThrow();
  });
});
