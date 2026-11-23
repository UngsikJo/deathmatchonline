import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  RULES,
  SKILLS,
  type EndReason,
  type PlayerSnapshot,
  type SkillKey,
} from '@deathmatch/shared';
import { gameSession } from './game/session';
import { GameCanvas } from './components/GameCanvas';
import { AuthPanel } from './components/AuthPanel';
import { supabase } from './lib/supabase';

const SKILL_ROWS: SkillKey[][] = [
  ['Q', 'W', 'E', 'R'],
  ['A', 'S', 'D', 'F'],
];
/** Same hues as the in-game effects, so a key and its effect read as one thing. */
const SKILL_COLORS: Record<SkillKey, string> = {
  A: '#e6f2ff',
  S: '#f3dfa3',
  D: '#bcd7ff',
  F: '#aed9ff',
  Q: '#ff9a4d',
  W: '#ba9aff',
  E: '#e9c98e',
  R: '#ff5a5a',
};
const REASONS: Record<EndReason, string> = {
  ko: '상대 처치',
  timeout: '제한 시간 종료',
  draw: '무승부',
  surrender: '기권',
  disconnect: '접속 종료',
  void: '경기 무효',
};
const BANNERS: Record<EndReason, string> = {
  ko: 'K.O.',
  timeout: 'TIME UP',
  draw: 'DRAW',
  surrender: 'GIVE UP',
  disconnect: 'DISCONNECT',
  void: 'NO CONTEST',
};
const FIGHT_BANNER_MS = 900;
const MATCH_SECONDS = RULES.matchMs / 1000;

export default function App() {
  const view = useSyncExternalStore(gameSession.subscribe, gameSession.getSnapshot);
  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem('deathmatch.nickname') || '도전자',
  );
  const [email, setEmail] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [now, setNow] = useState(0);
  const snapshot = view.snapshot;
  const mine = snapshot?.players.find((p) => p.id === view.sessionId);
  // HUD bars sit on the side each fighter starts on, so the screen and the bars agree.
  const leftFighter = snapshot?.players.find((p) => p.slot === 0);
  const rightFighter = snapshot?.players.find((p) => p.slot === 1);
  const active = snapshot?.phase === 'active';
  const finished = snapshot?.phase === 'finished';
  const busy = view.status === 'connecting' || view.status === 'reconnecting';
  const participating = view.status === 'connected' || busy;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(gameSession.renderTime()), 50);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    // focusout fires before the next element receives focus, so read the result a tick later.
    let pending = 0;
    const track = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() =>
        setCanvasFocused(document.activeElement?.tagName === 'CANVAS'),
      );
    };
    document.addEventListener('focusin', track);
    document.addEventListener('focusout', track);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener('focusin', track);
      document.removeEventListener('focusout', track);
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || ''));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user.email || '');
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setShowAuth(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (sessionStorage.getItem('deathmatch.reconnect')) void gameSession.connect(nickname, true);
    // Restore once on page load; later nickname edits must not create connections.
  }, []);
  async function join(event?: FormEvent) {
    event?.preventDefault();
    sessionStorage.setItem('deathmatch.nickname', nickname);
    setMenu(false);
    setConfirmSurrender(false);
    if (finished) await gameSession.leave();
    await gameSession.connect(nickname);
  }
  const seconds = snapshot
    ? Math.min(MATCH_SECONDS, Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000)))
    : MATCH_SECONDS;
  const won = !!snapshot?.result?.winnerId && snapshot.result.winnerId === view.sessionId;
  const resultTitle =
    snapshot?.result?.reason === 'void'
      ? '경기 무효'
      : snapshot?.result?.winnerId === null
        ? '무승부'
        : won
          ? '승리했습니다'
          : '다음 도전을 향해';
  const statusLabel =
    view.status === 'reconnecting'
      ? '재접속 중'
      : active
        ? '전투 중'
        : snapshot?.phase === 'countdown'
          ? '시작 준비'
          : snapshot?.phase === 'waiting'
            ? '상대 찾는 중'
            : finished
              ? '경기 종료'
              : '대전 준비';
  const showFight = active && now - snapshot.startsAt < FIGHT_BANNER_MS;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Deathmatch 홈">
          <span className="brand-mark" aria-hidden="true">
            DM
          </span>
          <span className="brand-text">
            DEATHMATCH
            <small>ONE MORE WIN.</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className="chip">
            <i className="chip-dot" />
            개발 대전
          </span>
          <span className="chip build">ALPHA 0.1</span>
          {supabase && (
            <button
              className="text-button"
              disabled={participating}
              onClick={() => {
                if (email) void supabase?.auth.signOut();
                else setShowAuth(!showAuth);
              }}
            >
              {email ? '로그아웃' : '로그인 / 회원가입'}
            </button>
          )}
        </div>
      </header>

      <main className="game-layout">
        <aside className="lobby-panel panel">
          <p className="panel-label">YOUR RECORD</p>
          <div className="streak-card">
            <span className="streak-ribbon">WIN STREAK</span>
            <strong>{view.stats.currentStreak.toString().padStart(2, '0')}</strong>
            <span className="streak-caption">현재 연승</span>
          </div>
          <div className="best-row">
            <span>최고 연승</span>
            <strong>
              {view.stats.bestStreak}
              <small>WINS</small>
            </strong>
          </div>
          <div className="record-tiles">
            <div>
              <strong>{view.stats.wins}</strong>
              <span>승</span>
            </div>
            <div>
              <strong>{view.stats.losses}</strong>
              <span>패</span>
            </div>
            <div>
              <strong>{view.stats.draws}</strong>
              <span>무</span>
            </div>
          </div>

          <form className="join-form" onSubmit={(e) => void join(e)}>
            <label className="field-label" htmlFor="nickname">
              도전자 이름
            </label>
            <input
              id="nickname"
              value={nickname}
              disabled={participating && !finished}
              required
              minLength={2}
              maxLength={12}
              pattern="[가-힣A-Za-z0-9_]{2,12}"
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="off"
            />
            <p className="field-help">한글·영문·숫자·밑줄 2~12자</p>
            {!participating || finished ? (
              <button className="button primary" type="submit" disabled={busy}>
                {finished ? '다음 상대 찾기' : '대전 찾기'}
                <span aria-hidden="true">▶</span>
              </button>
            ) : (
              <button
                className="button secondary"
                type="button"
                onClick={() => (active ? setMenu(!menu) : void gameSession.leave())}
              >
                {active ? '경기 메뉴' : busy ? '연결 취소' : '매칭 취소'}
              </button>
            )}
          </form>
          {finished && (
            <button className="button subtle" onClick={() => void gameSession.leave()}>
              연승을 보존하고 쉬기
            </button>
          )}
          {view.error && (
            <p className="error-message" role="alert">
              {view.error}
            </p>
          )}
          {showAuth && !participating && <AuthPanel key={String(recovery)} recovery={recovery} />}
          <div className="dev-note">
            <span>DEV NOTE</span>
            <p>
              다른 브라우저 창에서도 접속해 대전할 수 있습니다. 전적은 서버 재시작 시 초기화됩니다.
            </p>
            <button
              className="text-button"
              disabled={participating || !!email}
              onClick={() => gameSession.newGuest()}
            >
              새 테스트 사용자로 전환
            </button>
          </div>
          <div className="account-status">
            {email
              ? `인증 계정 · ${email}`
              : supabase
                ? '게스트로 테스트 중'
                : '로컬 게스트 · 계정 설정 전'}
          </div>
        </aside>

        <section className="arena-panel panel" aria-label="대전">
          <div className="arena-top">
            <span className={`status ${active ? 'live' : ''}`}>
              <i />
              {statusLabel}
            </span>
            <span className="arena-label">TRAINING GROUND · 01</span>
            <button
              className="icon-button"
              aria-label="조작 안내와 메뉴"
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
          </div>

          <div className={`arena-stage ${canvasFocused ? 'focused' : ''}`}>
            <GameCanvas />
            <div className="hud">
              <HealthBar fighter={leftFighter} slot={0} sessionId={view.sessionId} />
              <div className="timer" aria-label={`남은 시간 ${seconds}초`}>
                <strong>{seconds}</strong>
                <span>TIME</span>
              </div>
              <HealthBar fighter={rightFighter} slot={1} sessionId={view.sessionId} />
            </div>

            {!snapshot && (
              <div className="arena-overlay">
                <div className="overlay-card">
                  <div className="vs-emblem">VS</div>
                  <p className="panel-label">READY WHEN YOU ARE</p>
                  <h2>당신의 첫 연승을 기다립니다</h2>
                  <p>왼쪽에서 대전을 찾고, 상대와 실력을 겨뤄보세요.</p>
                </div>
              </div>
            )}
            {snapshot?.phase === 'waiting' && (
              <div className="arena-overlay">
                <div className="overlay-card">
                  <span className="search-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <h2>다음 도전자를 찾고 있습니다</h2>
                  <p>다른 창에서 대전에 참가하면 경기가 시작됩니다.</p>
                </div>
              </div>
            )}
            {snapshot?.phase === 'countdown' && (
              <div className="arena-overlay countdown">
                <span className="banner-sub">READY</span>
                <strong className="banner">
                  {Math.max(1, Math.ceil((snapshot.startsAt - now) / 1000))}
                </strong>
                <p>경기장을 클릭해 준비하세요 · 체력 100 · 120초</p>
              </div>
            )}
            {showFight && (
              <div className="arena-overlay flash" aria-hidden="true">
                <strong className="banner">FIGHT!</strong>
              </div>
            )}
            {active && !canvasFocused && !menu && view.status === 'connected' && (
              <button
                className="focus-hint"
                onClick={() => document.querySelector('canvas')?.focus()}
              >
                경기장을 클릭하면 조작할 수 있습니다
              </button>
            )}
            {finished && snapshot.result && (
              <div className={`arena-overlay result ${won ? 'won' : ''}`}>
                <strong className="banner">{BANNERS[snapshot.result.reason]}</strong>
                <div className="overlay-card">
                  <h2>{resultTitle}</h2>
                  <p>{REASONS[snapshot.result.reason]}</p>
                  <div className="result-streak">
                    <strong>{view.stats.currentStreak}</strong>
                    <span>연승 · 최고 {view.stats.bestStreak}연승</span>
                  </div>
                  <button className="button primary" onClick={() => void join()}>
                    다음 상대 찾기 <span aria-hidden="true">▶</span>
                  </button>
                </div>
              </div>
            )}
            {view.status === 'reconnecting' && (
              <div className="arena-overlay">
                <div className="overlay-card">
                  <h2>연결을 복구하고 있습니다</h2>
                  <p>전투는 계속됩니다. 잠시 기다려 주세요.</p>
                </div>
              </div>
            )}
            {menu && (
              <div className="arena-overlay">
                <div className="overlay-card menu">
                  <h2>경기 메뉴</h2>
                  <p>← → 이동 · ↑ 점프 · ↓ 앉기 · A S D F Q W E R 스킬</p>
                  {active && <p className="warning">메뉴를 열어도 전투는 계속됩니다.</p>}
                  <button
                    className="button secondary"
                    onClick={() => {
                      setMenu(false);
                      document.querySelector('canvas')?.focus();
                    }}
                  >
                    경기로 돌아가기
                  </button>
                  {active && (
                    <button className="button danger" onClick={() => setConfirmSurrender(true)}>
                      기권하기
                    </button>
                  )}
                  {confirmSurrender && active && (
                    <>
                      <p>기권하면 패배하며 현재 연승이 종료됩니다.</p>
                      <button
                        className="button danger"
                        onClick={() => {
                          gameSession.surrender();
                          setMenu(false);
                          setConfirmSurrender(false);
                        }}
                      >
                        기권 확정
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="skill-dock">
            <div className="move-keys" aria-label="이동 조작">
              <span className="keycap small up">
                <kbd>↑</kbd>
                <small>점프</small>
              </span>
              <span className="keycap small">
                <kbd>←</kbd>
                <small>이동</small>
              </span>
              <span className="keycap small">
                <kbd>↓</kbd>
                <small>앉기</small>
              </span>
              <span className="keycap small">
                <kbd>→</kbd>
                <small>이동</small>
              </span>
            </div>
            <div className="skill-grid">
              {SKILL_ROWS.flat().map((key) => {
                const remaining = Math.max(0, (mine?.cooldowns[key] ?? 0) - now);
                const style = {
                  '--skill': SKILL_COLORS[key],
                  '--cooldown': `${Math.min(100, (remaining / SKILLS[key].cooldownMs) * 100)}%`,
                } as CSSProperties;
                return (
                  <div
                    className={`keycap skill ${remaining > 0 ? 'cooling' : ''} ${key === 'R' ? 'ultimate' : ''}`}
                    key={key}
                    style={style}
                    title={`${SKILLS[key].description} · 쿨다운 ${SKILLS[key].cooldownMs / 1000}초`}
                  >
                    <kbd>{key}</kbd>
                    <span>{SKILLS[key].name}</span>
                    {remaining > 0 && (
                      <strong className="cooldown">{(remaining / 1000).toFixed(1)}</strong>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="skill-hint">
              <span>8 SKILLS</span>
              <p>
                항상 상대를 향해 공격
                <br />
                앉기로 상단, 점프로 하단 회피
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>동일한 캐릭터 · 동일한 능력치 · 오직 실력으로</span>
        <span>PROTOTYPE · 전적은 테스트용입니다</span>
      </footer>
    </div>
  );
}

function HealthBar({
  fighter,
  slot,
  sessionId,
}: {
  fighter: PlayerSnapshot | undefined;
  slot: number;
  sessionId: string | null;
}) {
  const hp = fighter?.hp ?? RULES.maxHp;
  const percent = `${(hp / RULES.maxHp) * 100}%`;
  const mine = !!fighter && fighter.id === sessionId;
  const name = fighter?.nickname ?? (slot === 0 ? '도전자 대기' : '상대 대기');
  return (
    <div className={`fighter-hud p${slot + 1} ${hp <= RULES.maxHp * 0.3 ? 'low' : ''}`}>
      <div
        className="hp-frame"
        role="meter"
        aria-label={`${name} 체력`}
        aria-valuemin={0}
        aria-valuemax={RULES.maxHp}
        aria-valuenow={hp}
      >
        <div className="hp-trail" style={{ width: percent }} />
        <div className="hp-fill" style={{ width: percent }} />
      </div>
      <div className="nameplate">
        {fighter && <span className={`tag ${mine ? 'mine' : ''}`}>{mine ? '나' : '상대'}</span>}
        <strong>{name}</strong>
        <span className="hp-number">{hp}</span>
      </div>
    </div>
  );
}
