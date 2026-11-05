import { loadConfig } from './config.js';
import { createGameServer } from './server.js';

const config = loadConfig();
await createGameServer(config).listen(config.port, config.host);
console.log(`Deathmatch development server: http://${config.host}:${config.port}`);
console.log('전적은 메모리에만 보관됩니다. 공개 서비스 배포 전 영구 정산을 구현하세요.');
