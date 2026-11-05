import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { RULES, SKILLS, type EndReason, type SkillKey } from '@deathmatch/shared';
import { gameSession } from './game/session';
import { GameCanvas } from './components/GameCanvas';
import { AuthPanel } from './components/AuthPanel';
import { supabase } from './lib/supabase';

const DISPLAY_KEYS: SkillKey[] = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'];
const REASONS: Record<EndReason, string> = {
  ko: '상대 처치',
  timeout: '제한 시간 종료',
  draw: '무승부',
  surrender: '기권',
  disconnect: '접속 종료',
  void: '경기 무효',
};

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
  const [now, setNow] = useState(0);
  const snapshot = view.snapshot;
  const mine = snapshot?.players.find((p) => p.id === view.sessionId);
  const opponent = snapshot?.players.find((p) => p.id !== view.sessionId);
  const active = snapshot?.phase === 'active';
  const finished = snapshot?.phase === 'finished';
  const busy = view.status === 'connecting' || view.status === 'reconnecting';
  const participating = view.status === 'connected' || busy;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(gameSession.renderTime()), 50);
    return () => window.clearInterval(timer);
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
  const seconds = snapshot ? Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000)) : 120;
  const resultTitle =
    snapshot?.result?.reason === 'void'
      ? '경기 무효'
      : snapshot?.result?.winnerId === null
        ? '무승부'
        : snapshot?.result?.winnerId === view.sessionId
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Deathmatch 홈">
          <span className="brand-symbol">
            D<span>/</span>M
          </span>
          <span>
            DEATHMATCH<small>ONE MORE WIN.</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className="build-badge">
            LOCAL ALPHA <span>0.1</span>
          </span>
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

      <main>
        <section className="page-heading">
          <div>
            <p className="eyebrow">1 VS 1 · SKILL ARENA</p>
            <h1>
              한 판 더. <span>연승을 이어가세요.</span>
            </h1>
            <p className="intro">
              같은 조건, 여덟 개의 스킬. 다음 승리는 당신의 선택에 달려 있습니다.
            </p>
          </div>
          <div className="mode-chip">
            <span />
            개발 대전
          </div>
        </section>
        <div className="game-layout">
          <aside className="lobby-panel">
            <p className="eyebrow muted">YOUR RECORD</p>
            <div className="streak">
              <strong>{view.stats.currentStreak.toString().padStart(2, '0')}</strong>
              <span>현재 연승</span>
            </div>
            <div className="record-row">
              <span>최고 연승</span>
              <strong>
                {view.stats.bestStreak}
                <small> WINS</small>
              </strong>
            </div>
            <div className="record-row">
              <span>승 / 패 / 무</span>
              <strong>
                {view.stats.wins} / {view.stats.losses} / {view.stats.draws}
              </strong>
            </div>
            <div className="panel-divider" />
            <form onSubmit={(e) => void join(e)}>
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
                  <span>↗</span>
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
            <div className="local-note">
              <span>DEV NOTE</span>
              <p>
                다른 브라우저 창에서도 접속해 대전할 수 있습니다. 전적은 서버 재시작 시
                초기화됩니다.
              </p>
              <button
                className="text-button"
                disabled={participating || !!email}
                onClick={() => gameSession.newGuest()}
              >
                새 테스트 사용자로 전환 ↗
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

          <section className="arena-panel" aria-label="대전">
            <div className="arena-top">
              <span>
                <i className={`status-dot ${active ? 'live' : ''}`} />
                {statusLabel}
              </span>
              <span className="arena-label">TRAINING GROUND / 01</span>
              <button
                className="icon-button"
                aria-label="조작 안내와 메뉴"
                onClick={() => setMenu(!menu)}
              >
                ☰
              </button>
            </div>
            <div className="combat-hud">
              <div className="fighter">
                <div>
                  <strong>{mine?.nickname || '나의 캐릭터'}</strong>
                  <span>YOU</span>
                </div>
                <div className="hp-track">
                  <div style={{ width: `${mine?.hp ?? RULES.maxHp}%` }} />
                </div>
              </div>
              <div className="match-clock">
                <strong>
                  {Math.floor(seconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(seconds % 60).toString().padStart(2, '0')}
                </strong>
                <span>DEATHMATCH</span>
              </div>
              <div className="fighter opponent">
                <div>
                  <strong>{opponent?.nickname || '상대를 기다립니다'}</strong>
                  <span>RIVAL</span>
                </div>
                <div className="hp-track">
                  <div style={{ width: `${opponent?.hp ?? RULES.maxHp}%` }} />
                </div>
              </div>
            </div>
            <div className="arena-stage">
              <GameCanvas />
              {!snapshot && (
                <div className="arena-overlay">
                  <div className="overlay-emblem">VS</div>
                  <p className="eyebrow">READY WHEN YOU ARE</p>
                  <h2>당신의 첫 연승을 기다립니다</h2>
                  <p>왼쪽에서 대전을 찾고, 상대와 실력을 겨뤄보세요.</p>
                </div>
              )}
              {snapshot?.phase === 'waiting' && (
                <div className="arena-overlay">
                  <span className="search-ring" />
                  <h2>다음 도전자를 찾고 있습니다</h2>
                  <p>다른 창에서 대전에 참가하면 경기가 시작됩니다.</p>
                </div>
              )}
              {snapshot?.phase === 'countdown' && (
                <div className="arena-overlay countdown">
                  <p>경기장을 클릭해 준비하세요</p>
                  <strong>{Math.max(1, Math.ceil((snapshot.startsAt - now) / 1000))}</strong>
                  <span>체력 100 · 120초 · 1 대 1</span>
                </div>
              )}
              {finished && (
                <div className="arena-overlay result">
                  <p className="eyebrow">MATCH COMPLETE</p>
                  <h2>{resultTitle}</h2>
                  <p>{snapshot.result ? REASONS[snapshot.result.reason] : ''}</p>
                  <div className="result-streak">
                    <strong>{view.stats.currentStreak}</strong>연승 · 최고 {view.stats.bestStreak}
                    연승
                  </div>
                  <button className="button primary" onClick={() => void join()}>
                    다음 상대 찾기 <span>↗</span>
                  </button>
                </div>
              )}
              {view.status === 'reconnecting' && (
                <div className="arena-overlay">
                  <h2>연결을 복구하고 있습니다</h2>
                  <p>전투는 계속됩니다. 잠시 기다려 주세요.</p>
                </div>
              )}
              {menu && (
                <div className="arena-overlay menu">
                  <h2>경기 메뉴</h2>
                  <p>방향키 이동 · A S D F Q W E R 스킬</p>
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
              )}
            </div>
            <div className="skill-dock">
              <div className="movement-guide">
                <span className="arrow-keys">
                  ↑<br />← ↓ →
                </span>
                <span>이동 / 방향 조준</span>
              </div>
              <div className="skill-grid">
                {DISPLAY_KEYS.map((key) => {
                  const remaining = Math.max(0, (mine?.cooldowns[key] ?? 0) - now);
                  return (
                    <div
                      className={`skill ${remaining > 0 ? 'cooling' : ''} ${key === 'R' ? 'ultimate' : ''}`}
                      key={key}
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
                  마지막 이동 방향으로 공격
                  <br />
                  경기장을 클릭하면 조작 시작
                </p>
              </div>
            </div>
          </section>
        </div>
        <footer>
          <span>동일한 캐릭터 · 동일한 능력치 · 오직 실력으로</span>
          <span>PROTOTYPE — 전적은 테스트용입니다.</span>
        </footer>
      </main>
    </div>
  );
}
