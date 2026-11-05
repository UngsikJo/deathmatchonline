import { createServer } from 'node:http';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Config } from './config.js';
import { makeDuelRoom } from './rooms/DuelRoom.js';
import { DevStore, makeAuthenticate } from './services.js';

export function createGameServer(config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !config.origins.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.get('/health', (_req, res) =>
    res.json({ ok: true, version: '0.1.0', persistence: 'memory', productionReady: false }),
  );
  const server = new Server({
    greet: false,
    transport: new WebSocketTransport({
      server: createServer(app),
      maxPayload: 4096,
      verifyClient: ({ origin }: { origin: string }) => !origin || config.origins.has(origin),
    }),
  });
  server.define('duel', makeDuelRoom(new DevStore(), makeAuthenticate(config)));
  return server;
}
