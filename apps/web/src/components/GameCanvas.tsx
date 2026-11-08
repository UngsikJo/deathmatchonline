import { useEffect, useRef, useState } from 'react';
import { RULES } from '@deathmatch/shared';

export function GameCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let game: import('phaser').Game | undefined;
    void Promise.all([import('phaser'), import('../game/ArenaScene')])
      .then(([{ default: Phaser }, { ArenaScene }]) => {
        if (disposed || !container.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: container.current,
          width: RULES.width,
          height: RULES.height,
          backgroundColor: '#1b1838',
          pixelArt: true,
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          scene: [ArenaScene],
          audio: { noAudio: true },
        });
      })
      .catch(() =>
        setError('경기장을 불러오지 못했습니다. 브라우저의 그래픽 가속 설정을 확인하세요.'),
      );
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);
  return (
    <div className="canvas-wrap" ref={container}>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
