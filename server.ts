import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { Chess } from 'chess.js';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { arenaStore, toPublicPlayer } from './server/store';
import {
  ActiveGameSnapshot,
  ChatMessage,
  ClientWsMessage,
  EndReason,
  LobbySnapshot,
  OpenChallenge,
  PublicPlayer,
  RatingChangeSummary,
  RecordedMove,
  RoomPlayerInfo,
  ServerWsMessage,
  TIME_CONTROLS,
  TimeControlId,
} from './src/shared/chessTypes';

interface ClientConn {
  ws: WebSocket;
  playerId: string | null;
  subscribedLobby: boolean;
  roomId: string | null;
}

interface QueueEntry {
  playerId: string;
  timeControl: TimeControlId;
  elo: number;
  joinedAt: number;
}

interface ServerRoom {
  roomId: string;
  timeControl: TimeControlId;
  rated: boolean;
  chess: Chess;
  moves: RecordedMove[];
  whiteId: string | null;
  blackId: string | null;
  status: 'waiting' | 'active' | 'finished';
  winner: 'w' | 'b' | 'draw' | null;
  endReason: EndReason | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  drawOfferFrom: 'w' | 'b' | null;
  rematchVotes: Set<string>;
  ratingChange: RatingChangeSummary | null;
  chat: ChatMessage[];
  startedAt: number;
  finishedAt: number | null;
}

const PORT = Number(process.env.PORT ?? 3000);

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function startServer() {
  await arenaStore.init();

  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const clients = new Map<WebSocket, ClientConn>();
  const playerSockets = new Map<string, Set<WebSocket>>();
  const queue: QueueEntry[] = [];
  const challenges = new Map<string, OpenChallenge>();
  const rooms = new Map<string, ServerRoom>();

  function sendTo(ws: WebSocket, msg: ServerWsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function sendToPlayer(playerId: string, msg: ServerWsMessage) {
    const sockets = playerSockets.get(playerId);
    if (!sockets) return;
    for (const ws of sockets) {
      sendTo(ws, msg);
    }
  }

  function isPlayerConnected(playerId: string): boolean {
    const sockets = playerSockets.get(playerId);
    if (!sockets) return false;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  function buildPlayerInfo(playerId: string | null): RoomPlayerInfo | null {
    if (!playerId) return null;
    const p = arenaStore.getPlayerById(playerId);
    if (!p) return null;
    return {
      id: p.id,
      handle: p.handle,
      elo: p.elo,
      gamesPlayed: p.gamesPlayed,
      connected: isPlayerConnected(p.id),
    };
  }

  function computeClocks(room: ServerRoom, now = Date.now()): { whiteTimeMs: number; blackTimeMs: number } {
    let whiteTimeMs = room.whiteTimeMs;
    let blackTimeMs = room.blackTimeMs;
    if (room.status === 'active' && room.moves.length >= 1 && room.lastMoveAt !== null) {
      const elapsed = Math.max(0, now - room.lastMoveAt);
      if (room.chess.turn() === 'w') {
        whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
      } else {
        blackTimeMs = Math.max(0, blackTimeMs - elapsed);
      }
    }
    return { whiteTimeMs, blackTimeMs };
  }

  function buildGameSnapshot(room: ServerRoom): ActiveGameSnapshot {
    const clocks = computeClocks(room);
    return {
      roomId: room.roomId,
      timeControl: room.timeControl,
      rated: room.rated,
      whitePlayer: buildPlayerInfo(room.whiteId),
      blackPlayer: buildPlayerInfo(room.blackId),
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
      moves: room.moves,
      turn: room.chess.turn(),
      status: room.status,
      winner: room.winner,
      endReason: room.endReason,
      whiteTimeMs: clocks.whiteTimeMs,
      blackTimeMs: clocks.blackTimeMs,
      lastMoveAt: room.lastMoveAt,
      drawOfferFrom: room.drawOfferFrom,
      rematchVotes: Array.from(room.rematchVotes),
      ratingChange: room.ratingChange,
      chat: room.chat,
      startedAt: room.startedAt,
    };
  }

  function broadcastRoom(room: ServerRoom) {
    const snapshot = buildGameSnapshot(room);
    const payload: ServerWsMessage = { type: 'game:state', game: snapshot };
    for (const conn of clients.values()) {
      if (conn.roomId === room.roomId) {
        sendTo(conn.ws, payload);
      }
    }
  }

  function buildLobbySnapshot(): LobbySnapshot {
    const queueCounts: Record<TimeControlId, number> = {
      bullet_1_0: 0,
      blitz_3_2: 0,
      rapid_10_0: 0,
    };
    for (const entry of queue) {
      queueCounts[entry.timeControl] += 1;
    }

    let activeGamesCount = 0;
    for (const room of rooms.values()) {
      if (room.status === 'active') activeGamesCount += 1;
    }

    const publicChallenges = Array.from(challenges.values())
      .filter((c) => !c.isPrivate)
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      onlineCount: playerSockets.size,
      activeGamesCount,
      queueCounts,
      openChallenges: publicChallenges,
      leaderboardTop: arenaStore.getLeaderboard(25),
    };
  }

  function broadcastLobby() {
    const lobby = buildLobbySnapshot();
    const payload: ServerWsMessage = { type: 'lobby:state', lobby };
    for (const conn of clients.values()) {
      if (conn.subscribedLobby) {
        sendTo(conn.ws, payload);
      }
    }
  }

  function findActiveRoomForPlayer(playerId: string): ServerRoom | null {
    for (const room of rooms.values()) {
      if (room.status !== 'finished' && (room.whiteId === playerId || room.blackId === playerId)) {
        return room;
      }
    }
    return null;
  }

  function createActiveRoom(params: {
    roomId?: string;
    timeControl: TimeControlId;
    rated: boolean;
    whiteId: string;
    blackId: string;
  }): ServerRoom {
    const cfg = TIME_CONTROLS[params.timeControl];
    let roomId = params.roomId ?? generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const room: ServerRoom = {
      roomId,
      timeControl: params.timeControl,
      rated: params.rated,
      chess: new Chess(),
      moves: [],
      whiteId: params.whiteId,
      blackId: params.blackId,
      status: 'active',
      winner: null,
      endReason: null,
      whiteTimeMs: cfg.initialMs,
      blackTimeMs: cfg.initialMs,
      lastMoveAt: null,
      drawOfferFrom: null,
      rematchVotes: new Set(),
      ratingChange: null,
      chat: [],
      startedAt: Date.now(),
      finishedAt: null,
    };

    rooms.set(roomId, room);
    attachPlayerToRoom(params.whiteId, roomId);
    attachPlayerToRoom(params.blackId, roomId);
    broadcastRoom(room);
    broadcastLobby();
    return room;
  }

  function attachPlayerToRoom(playerId: string, roomId: string) {
    const sockets = playerSockets.get(playerId);
    if (!sockets) return;
    for (const ws of sockets) {
      const conn = clients.get(ws);
      if (conn) {
        conn.roomId = roomId;
      }
    }
  }

  function removeFromQueue(playerId: string) {
    const idx = queue.findIndex((q) => q.playerId === playerId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      sendToPlayer(playerId, { type: 'queue:status', inQueue: false, timeControl: null });
    }
  }

  function removePlayerChallenges(playerId: string) {
    for (const [id, ch] of challenges.entries()) {
      if (ch.hostId === playerId) {
        challenges.delete(id);
      }
    }
  }

  async function finalizeRoom(room: ServerRoom, winner: 'w' | 'b' | 'draw', endReason: EndReason) {
    if (room.status === 'finished') return;
    const now = Date.now();
    const clocks = computeClocks(room, now);
    room.whiteTimeMs = clocks.whiteTimeMs;
    room.blackTimeMs = clocks.blackTimeMs;
    room.status = 'finished';
    room.winner = winner;
    room.endReason = endReason;
    room.drawOfferFrom = null;
    room.finishedAt = now;

    if (room.whiteId && room.blackId) {
      const recorded = await arenaStore.recordCompletedMatch({
        roomId: room.roomId,
        timeControl: room.timeControl,
        rated: room.rated && room.moves.length >= 2,
        whiteId: room.whiteId,
        blackId: room.blackId,
        winner,
        endReason,
        moves: room.moves,
        pgn: room.chess.pgn(),
        finalFen: room.chess.fen(),
        startedAt: room.startedAt,
        endedAt: now,
      });

      if (recorded) {
        room.ratingChange = {
          whiteDelta: recorded.whiteDelta,
          blackDelta: recorded.blackDelta,
          whiteNewElo: recorded.whitePlayer.elo,
          blackNewElo: recorded.blackPlayer.elo,
        };
        sendToPlayer(room.whiteId, { type: 'player:updated', player: recorded.whitePlayer });
        sendToPlayer(room.blackId, { type: 'player:updated', player: recorded.blackPlayer });
      }
    }

    broadcastRoom(room);
    broadcastLobby();
  }

  function tryMatchmaking() {
    const now = Date.now();
    const byControl: Record<TimeControlId, QueueEntry[]> = {
      bullet_1_0: [],
      blitz_3_2: [],
      rapid_10_0: [],
    };
    for (const entry of queue) {
      byControl[entry.timeControl].push(entry);
    }

    for (const tc of Object.keys(byControl) as TimeControlId[]) {
      const list = byControl[tc].sort((a, b) => a.joinedAt - b.joinedAt);
      const matchedIds = new Set<string>();

      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (matchedIds.has(a.playerId)) continue;
        const waitSecA = (now - a.joinedAt) / 1000;
        const maxDiffA = 150 + waitSecA * 40;

        let bestIdx = -1;
        let bestDiff = Infinity;

        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (matchedIds.has(b.playerId) || b.playerId === a.playerId) continue;
          const diff = Math.abs(a.elo - b.elo);
          const waitSecB = (now - b.joinedAt) / 1000;
          const maxDiffB = 150 + waitSecB * 40;
          if (diff <= Math.max(maxDiffA, maxDiffB) && diff < bestDiff) {
            bestDiff = diff;
            bestIdx = j;
          }
        }

        if (bestIdx !== -1) {
          const b = list[bestIdx];
          matchedIds.add(a.playerId);
          matchedIds.add(b.playerId);
          removeFromQueue(a.playerId);
          removeFromQueue(b.playerId);
          removePlayerChallenges(a.playerId);
          removePlayerChallenges(b.playerId);

          const aWhite = Math.random() < 0.5;
          createActiveRoom({
            timeControl: tc,
            rated: true,
            whiteId: aWhite ? a.playerId : b.playerId,
            blackId: aWhite ? b.playerId : a.playerId,
          });
        }
      }
    }
  }

  // Server-authoritative clock & matchmaking loop
  setInterval(() => {
    tryMatchmaking();
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.status === 'active' && room.moves.length >= 1) {
        const clocks = computeClocks(room, now);
        if (clocks.whiteTimeMs <= 0) {
          void finalizeRoom(room, 'b', 'timeout');
        } else if (clocks.blackTimeMs <= 0) {
          void finalizeRoom(room, 'w', 'timeout');
        }
      }
    }
    // Prune stale finished rooms older than 30 minutes
    for (const [roomId, room] of rooms.entries()) {
      if (room.status === 'finished' && room.finishedAt && now - room.finishedAt > 30 * 60_000) {
        rooms.delete(roomId);
      }
    }
  }, 500);

  wss.on('connection', (ws) => {
    const conn: ClientConn = {
      ws,
      playerId: null,
      subscribedLobby: false,
      roomId: null,
    };
    clients.set(ws, conn);

    ws.on('message', async (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth:hello') {
        await arenaStore.init();
        const found = arenaStore.findBySessionToken(msg.sessionToken);
        if (!found) {
          sendTo(ws, { type: 'auth:error', message: 'Session expired or invalid.' });
          return;
        }
        conn.playerId = found.id;
        let set = playerSockets.get(found.id);
        if (!set) {
          set = new Set();
          playerSockets.set(found.id, set);
        }
        set.add(ws);

        const activeRoom = findActiveRoomForPlayer(found.id);
        if (activeRoom) {
          conn.roomId = activeRoom.roomId;
          sendTo(ws, { type: 'auth:ok', player: toPublicPlayer(found), activeRoomId: activeRoom.roomId });
          broadcastRoom(activeRoom);
        } else {
          sendTo(ws, { type: 'auth:ok', player: toPublicPlayer(found), activeRoomId: null });
        }
        broadcastLobby();
        return;
      }

      if (msg.type === 'lobby:subscribe') {
        conn.subscribedLobby = true;
        sendTo(ws, { type: 'lobby:state', lobby: buildLobbySnapshot() });
        return;
      }

      if (!conn.playerId) {
        sendTo(ws, { type: 'game:error', message: 'Sign in with a handle before playing online.' });
        return;
      }

      const player = arenaStore.getPlayerById(conn.playerId);
      if (!player) return;

      if (msg.type === 'queue:join') {
        if (!TIME_CONTROLS[msg.timeControl]) return;
        removeFromQueue(player.id);
        queue.push({
          playerId: player.id,
          timeControl: msg.timeControl,
          elo: player.elo,
          joinedAt: Date.now(),
        });
        sendToPlayer(player.id, { type: 'queue:status', inQueue: true, timeControl: msg.timeControl });
        tryMatchmaking();
        broadcastLobby();
        return;
      }

      if (msg.type === 'queue:leave') {
        removeFromQueue(player.id);
        broadcastLobby();
        return;
      }

      if (msg.type === 'challenge:create') {
        if (!TIME_CONTROLS[msg.timeControl]) return;
        removeFromQueue(player.id);
        removePlayerChallenges(player.id);

        let roomId = generateRoomCode();
        while (rooms.has(roomId) || Array.from(challenges.values()).some((c) => c.roomId === roomId)) {
          roomId = generateRoomCode();
        }

        const challenge: OpenChallenge = {
          id: `chg_${crypto.randomBytes(4).toString('hex')}`,
          roomId,
          hostId: player.id,
          hostHandle: player.handle,
          hostElo: player.elo,
          timeControl: msg.timeControl,
          rated: msg.rated,
          hostColor: msg.hostColor,
          isPrivate: msg.isPrivate,
          createdAt: Date.now(),
        };

        challenges.set(challenge.id, challenge);
        sendTo(ws, { type: 'challenge:created', challenge });
        broadcastLobby();
        return;
      }

      if (msg.type === 'challenge:cancel') {
        const ch = challenges.get(msg.challengeId);
        if (ch && ch.hostId === player.id) {
          challenges.delete(msg.challengeId);
          broadcastLobby();
        }
        return;
      }

      if (msg.type === 'challenge:accept') {
        const ch = challenges.get(msg.challengeId);
        if (!ch) {
          sendTo(ws, { type: 'game:error', message: 'This challenge is no longer available.' });
          return;
        }
        if (ch.hostId === player.id) {
          sendTo(ws, { type: 'game:error', message: 'You cannot accept your own challenge.' });
          return;
        }
        challenges.delete(ch.id);
        removeFromQueue(player.id);
        removeFromQueue(ch.hostId);
        removePlayerChallenges(player.id);

        const hostWhite =
          ch.hostColor === 'w' ? true : ch.hostColor === 'b' ? false : Math.random() < 0.5;

        createActiveRoom({
          roomId: ch.roomId,
          timeControl: ch.timeControl,
          rated: ch.rated,
          whiteId: hostWhite ? ch.hostId : player.id,
          blackId: hostWhite ? player.id : ch.hostId,
        });
        return;
      }

      if (msg.type === 'room:join') {
        const code = msg.roomId.trim().toUpperCase();
        const existingRoom = rooms.get(code);
        if (existingRoom) {
          conn.roomId = existingRoom.roomId;
          broadcastRoom(existingRoom);
          return;
        }

        const pendingChallenge = Array.from(challenges.values()).find((c) => c.roomId === code);
        if (pendingChallenge) {
          if (pendingChallenge.hostId === player.id) {
            sendTo(ws, { type: 'challenge:created', challenge: pendingChallenge });
            return;
          }
          challenges.delete(pendingChallenge.id);
          removeFromQueue(player.id);
          removeFromQueue(pendingChallenge.hostId);
          const hostWhite =
            pendingChallenge.hostColor === 'w'
              ? true
              : pendingChallenge.hostColor === 'b'
                ? false
                : Math.random() < 0.5;

          createActiveRoom({
            roomId: pendingChallenge.roomId,
            timeControl: pendingChallenge.timeControl,
            rated: pendingChallenge.rated,
            whiteId: hostWhite ? pendingChallenge.hostId : player.id,
            blackId: hostWhite ? player.id : pendingChallenge.hostId,
          });
          return;
        }

        sendTo(ws, { type: 'game:error', message: `Room "${code}" was not found or has already closed.` });
        return;
      }

      if (msg.type === 'game:move') {
        const room = rooms.get(msg.roomId);
        if (!room || room.status !== 'active') return;

        const turn = room.chess.turn();
        const expectedPlayerId = turn === 'w' ? room.whiteId : room.blackId;
        if (player.id !== expectedPlayerId) {
          sendTo(ws, { type: 'game:error', message: 'Not your turn.' });
          return;
        }

        const now = Date.now();
        const clocks = computeClocks(room, now);
        if (room.moves.length >= 1) {
          if (turn === 'w' && clocks.whiteTimeMs <= 0) {
            await finalizeRoom(room, 'b', 'timeout');
            return;
          }
          if (turn === 'b' && clocks.blackTimeMs <= 0) {
            await finalizeRoom(room, 'w', 'timeout');
            return;
          }
        }

        let moveResult;
        try {
          moveResult = room.chess.move({
            from: msg.from,
            to: msg.to,
            promotion: msg.promotion ?? 'q',
          });
        } catch {
          moveResult = null;
        }

        if (!moveResult) {
          sendTo(ws, { type: 'game:error', message: 'Illegal move.' });
          sendTo(ws, { type: 'game:state', game: buildGameSnapshot(room) });
          return;
        }

        const cfg = TIME_CONTROLS[room.timeControl];
        if (turn === 'w') {
          room.whiteTimeMs = clocks.whiteTimeMs + (room.moves.length >= 1 ? cfg.incrementMs : 0);
          room.blackTimeMs = clocks.blackTimeMs;
        } else {
          room.blackTimeMs = clocks.blackTimeMs + (room.moves.length >= 1 ? cfg.incrementMs : 0);
          room.whiteTimeMs = clocks.whiteTimeMs;
        }
        room.lastMoveAt = now;
        room.drawOfferFrom = null;

        room.moves.push({
          san: moveResult.san,
          from: moveResult.from,
          to: moveResult.to,
          color: moveResult.color,
          fenAfter: room.chess.fen(),
          timestamp: now,
          captured: moveResult.captured,
          promotion: moveResult.promotion,
          isCheck: room.chess.inCheck(),
          isCheckmate: room.chess.isCheckmate(),
        });

        if (room.chess.isCheckmate()) {
          await finalizeRoom(room, turn, 'checkmate');
          return;
        }
        if (room.chess.isStalemate()) {
          await finalizeRoom(room, 'draw', 'stalemate');
          return;
        }
        if (room.chess.isThreefoldRepetition()) {
          await finalizeRoom(room, 'draw', 'threefold_repetition');
          return;
        }
        if (room.chess.isInsufficientMaterial()) {
          await finalizeRoom(room, 'draw', 'insufficient_material');
          return;
        }
        if (room.chess.isDraw()) {
          await finalizeRoom(room, 'draw', 'fifty_move_rule');
          return;
        }

        broadcastRoom(room);
        return;
      }

      if (msg.type === 'game:resign') {
        const room = rooms.get(msg.roomId);
        if (!room || room.status !== 'active') return;
        if (player.id !== room.whiteId && player.id !== room.blackId) return;
        const winner: 'w' | 'b' = player.id === room.whiteId ? 'b' : 'w';
        await finalizeRoom(room, winner, 'resignation');
        return;
      }

      if (msg.type === 'game:offer_draw') {
        const room = rooms.get(msg.roomId);
        if (!room || room.status !== 'active') return;
        if (player.id === room.whiteId) {
          room.drawOfferFrom = 'w';
        } else if (player.id === room.blackId) {
          room.drawOfferFrom = 'b';
        } else {
          return;
        }
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'game:respond_draw') {
        const room = rooms.get(msg.roomId);
        if (!room || room.status !== 'active' || !room.drawOfferFrom) return;
        const responderColor: 'w' | 'b' | null =
          player.id === room.whiteId ? 'w' : player.id === room.blackId ? 'b' : null;
        if (!responderColor || responderColor === room.drawOfferFrom) return;

        if (msg.accept) {
          await finalizeRoom(room, 'draw', 'agreement');
        } else {
          room.drawOfferFrom = null;
          broadcastRoom(room);
        }
        return;
      }

      if (msg.type === 'game:rematch') {
        const room = rooms.get(msg.roomId);
        if (!room || room.status !== 'finished') return;
        if (player.id !== room.whiteId && player.id !== room.blackId) return;
        room.rematchVotes.add(player.id);

        if (room.whiteId && room.blackId && room.rematchVotes.has(room.whiteId) && room.rematchVotes.has(room.blackId)) {
          // Swap colors for the rematch
          createActiveRoom({
            timeControl: room.timeControl,
            rated: room.rated,
            whiteId: room.blackId,
            blackId: room.whiteId,
          });
        } else {
          broadcastRoom(room);
        }
        return;
      }

      if (msg.type === 'game:chat') {
        const room = rooms.get(msg.roomId);
        if (!room) return;
        if (player.id !== room.whiteId && player.id !== room.blackId) return;
        const text = msg.text.trim().slice(0, 200);
        if (!text) return;
        room.chat.push({
          id: crypto.randomBytes(4).toString('hex'),
          senderId: player.id,
          senderHandle: player.handle,
          text,
          timestamp: Date.now(),
        });
        if (room.chat.length > 60) {
          room.chat = room.chat.slice(-60);
        }
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'game:leave') {
        if (conn.roomId === msg.roomId) {
          conn.roomId = null;
        }
        return;
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      clients.delete(ws);
      if (info?.playerId) {
        const set = playerSockets.get(info.playerId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            playerSockets.delete(info.playerId);
            removeFromQueue(info.playerId);
            removePlayerChallenges(info.playerId);
          }
        }
        if (info.roomId) {
          const room = rooms.get(info.roomId);
          if (room) broadcastRoom(room);
        }
        broadcastLobby();
      }
    });
  });

  // REST API Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, onlinePlayers: playerSockets.size });
  });

  app.post('/api/auth/session', async (req, res) => {
    await arenaStore.init();
    const { handle, passcode, sessionToken, mode } = req.body as {
      handle?: string;
      passcode?: string;
      sessionToken?: string;
      mode?: 'auto' | 'register' | 'login';
    };

    if (sessionToken && !handle) {
      const existing = arenaStore.findBySessionToken(sessionToken);
      if (!existing) {
        res.status(401).json({ error: 'Session invalid or expired.' });
        return;
      }
      res.json({ player: toPublicPlayer(existing), sessionToken });
      return;
    }

    const result = await arenaStore.registerOrAuthenticate({
      handle: handle ?? '',
      passcode,
      currentToken: sessionToken,
      mode: mode ?? 'auto',
    });

    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    broadcastLobby();
    res.json(result);
  });

  app.post('/api/auth/passcode', async (req, res) => {
    const { sessionToken, passcode } = req.body as { sessionToken?: string; passcode?: string };
    const result = await arenaStore.setPasscode(sessionToken ?? '', passcode ?? '');
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.get('/api/leaderboard', async (req, res) => {
    await arenaStore.init();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    res.json({
      players: arenaStore.getLeaderboard(limit),
      recentMatches: arenaStore.getRecentMatches(12),
    });
  });

  app.get('/api/players/:id/matches', async (req, res) => {
    await arenaStore.init();
    const player = arenaStore.getPlayerById(req.params.id);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }
    res.json({
      player,
      matches: arenaStore.getMatchesForPlayer(player.id, 30),
    });
  });

  app.get('/api/matches/:matchId', async (req, res) => {
    await arenaStore.init();
    const match = arenaStore.getMatchById(req.params.matchId);
    if (!match) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }
    res.json({ match });
  });

  // Vite dev middleware vs static dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kingsgate Chess server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
