import { ServerError } from '@colyseus/core';
import { createClient } from '@supabase/supabase-js';
import { applyOutcome, emptyStats, type MatchResult, type PlayerStats } from '@deathmatch/shared';
import type { Config } from './config.js';

export interface Identity {
  userId: string;
  nickname: string;
  mode: 'guest' | 'supabase';
}

/** Local prototype store. Explicitly not durable and not suitable for public ranked play. */
export class DevStore {
  private stats = new Map<string, PlayerStats>();
  private participation = new Map<string, string>();
  private settled = new Set<string>();

  claim(userId: string, roomId: string): boolean {
    if (this.participation.has(userId)) return false;
    this.participation.set(userId, roomId);
    return true;
  }
  release(userId: string, roomId: string): void {
    if (this.participation.get(userId) === roomId) this.participation.delete(userId);
  }
  get(userId: string): PlayerStats {
    return { ...(this.stats.get(userId) ?? emptyStats()) };
  }
  settle(
    matchId: string,
    participants: { sessionId: string; userId: string }[],
    result: MatchResult,
  ): void {
    if (this.settled.has(matchId)) return;
    this.settled.add(matchId);
    if (result.reason === 'void') return;
    for (const p of participants) {
      this.stats.set(
        p.userId,
        applyOutcome(
          this.get(p.userId),
          result.winnerId === null ? 'draw' : result.winnerId === p.sessionId ? 'win' : 'loss',
        ),
      );
    }
  }
}

export function makeAuthenticate(config: Config) {
  const supabase =
    config.supabaseUrl && config.supabaseKey
      ? createClient(config.supabaseUrl, config.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return async (options: unknown): Promise<Identity> => {
    if (!options || typeof options !== 'object')
      throw new ServerError(400, '잘못된 참가 요청입니다.');
    const { token, guestId, nickname: rawNickname } = options as Record<string, unknown>;
    const nickname = typeof rawNickname === 'string' ? rawNickname.trim() : '';
    if (!/^[\p{Script=Hangul}A-Za-z0-9_]{2,12}$/u.test(nickname)) {
      throw new ServerError(400, '닉네임은 한글·영문·숫자·밑줄 2~12자로 입력하세요.');
    }
    if (typeof token === 'string' && token.length > 0) {
      if (!supabase) throw new ServerError(503, '서버의 Supabase 인증 설정이 필요합니다.');
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user?.email_confirmed_at)
        throw new ServerError(401, '로그인과 이메일 인증을 확인하세요.');
      return { userId: data.user.id, nickname, mode: 'supabase' };
    }
    if (!config.allowGuests) throw new ServerError(401, '로그인이 필요합니다.');
    if (typeof guestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(guestId)) {
      throw new ServerError(400, '개발용 참가 ID가 올바르지 않습니다.');
    }
    return { userId: `guest:${guestId}`, nickname, mode: 'guest' };
  };
}
