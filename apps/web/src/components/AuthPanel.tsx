import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function AuthPanel({ recovery = false }: { recovery?: boolean }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'update'>(
    recovery ? 'update' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const redirectTo = window.location.origin;
      const result =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : mode === 'signup'
            ? await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: redirectTo },
              })
            : mode === 'reset'
              ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
              : await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setMessage(
        mode === 'signup'
          ? '인증 이메일을 확인한 뒤 로그인하세요.'
          : mode === 'reset'
            ? '비밀번호 재설정 이메일을 확인하세요.'
            : mode === 'update'
              ? '새 비밀번호를 저장했습니다.'
              : '로그인했습니다.',
      );
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  if (!supabase) return null;
  return (
    <form className="auth-panel" onSubmit={(e) => void submit(e)}>
      <h3>
        {mode === 'update'
          ? '새 비밀번호'
          : mode === 'reset'
            ? '비밀번호 찾기'
            : mode === 'signup'
              ? '회원가입'
              : '로그인'}
      </h3>
      {mode !== 'update' && (
        <label>
          이메일
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      )}
      {mode !== 'reset' && (
        <label>
          비밀번호
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <button className="button secondary" disabled={busy}>
        {busy ? '처리 중…' : '확인'}
      </button>
      <div className="auth-links">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}
        >
          {mode === 'login' ? '회원가입' : '로그인으로'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('reset');
            setMessage('');
          }}
        >
          비밀번호 찾기
        </button>
      </div>
      <p role="status">{message}</p>
    </form>
  );
}
