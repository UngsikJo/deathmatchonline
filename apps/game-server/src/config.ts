export interface Config {
  host: string;
  port: number;
  origins: Set<string>;
  allowGuests: boolean;
  supabaseUrl: string;
  supabaseKey: string;
}

export function loadConfig(env = process.env): Config {
  // Persistent settlement and deployment hardening are a separate milestone.
  // Refuse production instead of accidentally publishing the in-memory prototype.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      '개발 기반 서버입니다. 영구 정산 구현 전에는 production 실행을 허용하지 않습니다.',
    );
  }
  const port = Number(env.PORT || 2567);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const allowGuests = env.ALLOW_DEV_GUESTS !== 'false';
  if (!allowGuests && (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('게스트 모드를 끄려면 Supabase 인증 설정이 필요합니다.');
  }
  return {
    host: env.HOST || '127.0.0.1',
    port,
    origins: new Set(
      (env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
        .split(',')
        .map((s) => s.trim()),
    ),
    allowGuests,
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || '',
  };
}
