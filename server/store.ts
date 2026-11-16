import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  calculateEloDelta,
  EndReason,
  MatchRecord,
  PublicPlayer,
  RecordedMove,
  TimeControlId,
} from '../src/shared/chessTypes';

interface StoredPlayer extends PublicPlayer {
  sessionTokens: string[];
  passcodeHash: string | null;
  passcodeSalt: string | null;
}

interface DatabaseSchema {
  players: Record<string, StoredPlayer>;
  matches: MatchRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'kingsgate-db.json');

function hashPasscode(passcode: string, salt: string): string {
  return crypto.scryptSync(passcode, salt, 32).toString('hex');
}

function verifyPasscode(passcode: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPasscode(passcode, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function sanitizeHandle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 20);
}

export function toPublicPlayer(p: StoredPlayer): PublicPlayer {
  return {
    id: p.id,
    handle: p.handle,
    hasPasscode: Boolean(p.passcodeHash),
    elo: p.elo,
    peakElo: p.peakElo,
    gamesPlayed: p.gamesPlayed,
    wins: p.wins,
    losses: p.losses,
    draws: p.draws,
    winStreak: p.winStreak,
    bestStreak: p.bestStreak,
    createdAt: p.createdAt,
    lastActiveAt: p.lastActiveAt,
    ratingHistory: p.ratingHistory,
  };
}

class ArenaStore {
  private db: DatabaseSchema = { players: {}, matches: [] };
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      this.db = {
        players: parsed.players ?? {},
        matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      };
    } catch {
      this.db = { players: {}, matches: [] };
      await this.persist();
    }
    this.loaded = true;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain
      .then(async () => {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const tmpPath = `${DB_PATH}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(this.db, null, 2), 'utf-8');
        await fs.rename(tmpPath, DB_PATH);
      })
      .catch((err) => {
        console.error('Failed to persist Kingsgate DB:', err);
      });
    return this.writeChain;
  }

  findBySessionToken(token: string): StoredPlayer | null {
    if (!token) return null;
    for (const player of Object.values(this.db.players)) {
      if (player.sessionTokens.includes(token)) {
        return player;
      }
    }
    return null;
  }

  findByHandle(handle: string): StoredPlayer | null {
    const target = sanitizeHandle(handle).toLowerCase();
    if (!target) return null;
    for (const player of Object.values(this.db.players)) {
      if (player.handle.toLowerCase() === target) {
        return player;
      }
    }
    return null;
  }

  getPlayerById(id: string): PublicPlayer | null {
    const p = this.db.players[id];
    return p ? toPublicPlayer(p) : null;
  }

  async registerOrAuthenticate(params: {
    handle: string;
    passcode?: string;
    currentToken?: string;
    mode: 'auto' | 'register' | 'login';
  }): Promise<{ player: PublicPlayer; sessionToken: string } | { error: string }> {
    await this.init();
    const cleanHandle = sanitizeHandle(params.handle);
    if (cleanHandle.length < 2 || cleanHandle.length > 20) {
      return { error: 'Handle must be between 2 and 20 characters.' };
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(cleanHandle)) {
      return { error: 'Handle may only contain letters, numbers, spaces, hyphens, or underscores.' };
    }

    const passcode = params.passcode?.trim() ?? '';
    const existing = this.findByHandle(cleanHandle);

    if (existing) {
      if (params.mode === 'register') {
        return { error: 'That handle is already claimed. Sign in or pick another handle.' };
      }

      const tokenMatches = Boolean(
        params.currentToken && existing.sessionTokens.includes(params.currentToken)
      );

      if (existing.passcodeHash && existing.passcodeSalt) {
        if (!passcode && !tokenMatches) {
          return { error: 'This handle is protected by a passcode. Enter your passcode to sign in.' };
        }
        if (passcode && !verifyPasscode(passcode, existing.passcodeSalt, existing.passcodeHash)) {
          return { error: 'Incorrect passcode for this handle.' };
        }
      } else if (!tokenMatches) {
        return { error: 'This handle is already in use by another player. Choose another handle.' };
      }

      const token =
        params.currentToken && existing.sessionTokens.includes(params.currentToken)
          ? params.currentToken
          : crypto.randomBytes(24).toString('hex');

      if (!existing.sessionTokens.includes(token)) {
        existing.sessionTokens.push(token);
        if (existing.sessionTokens.length > 5) {
          existing.sessionTokens = existing.sessionTokens.slice(-5);
        }
      }
      existing.lastActiveAt = Date.now();
      await this.persist();
      return { player: toPublicPlayer(existing), sessionToken: token };
    }

    if (params.mode === 'login') {
      return { error: 'No player found with that handle.' };
    }

    const now = Date.now();
    const id = `plr_${crypto.randomBytes(6).toString('hex')}`;
    const token = crypto.randomBytes(24).toString('hex');
    let passcodeSalt: string | null = null;
    let passcodeHash: string | null = null;
    if (passcode.length > 0) {
      if (passcode.length < 4) {
        return { error: 'Passcode must be at least 4 characters.' };
      }
      passcodeSalt = crypto.randomBytes(16).toString('hex');
      passcodeHash = hashPasscode(passcode, passcodeSalt);
    }

    const created: StoredPlayer = {
      id,
      handle: cleanHandle,
      hasPasscode: Boolean(passcodeHash),
      elo: 1200,
      peakElo: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winStreak: 0,
      bestStreak: 0,
      createdAt: now,
      lastActiveAt: now,
      ratingHistory: [{ elo: 1200, timestamp: now }],
      sessionTokens: [token],
      passcodeHash,
      passcodeSalt,
    };

    this.db.players[id] = created;
    await this.persist();
    return { player: toPublicPlayer(created), sessionToken: token };
  }

  async setPasscode(sessionToken: string, passcode: string): Promise<{ player: PublicPlayer } | { error: string }> {
    await this.init();
    const player = this.findBySessionToken(sessionToken);
    if (!player) return { error: 'Session not found.' };
    const clean = passcode.trim();
    if (clean.length < 4) {
      return { error: 'Passcode must be at least 4 characters.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    player.passcodeSalt = salt;
    player.passcodeHash = hashPasscode(clean, salt);
    player.hasPasscode = true;
    await this.persist();
    return { player: toPublicPlayer(player) };
  }

  async recordCompletedMatch(input: {
    roomId: string;
    timeControl: TimeControlId;
    rated: boolean;
    whiteId: string;
    blackId: string;
    winner: 'w' | 'b' | 'draw';
    endReason: EndReason;
    moves: RecordedMove[];
    pgn: string;
    finalFen: string;
    startedAt: number;
    endedAt: number;
  }): Promise<{
    match: MatchRecord;
    whitePlayer: PublicPlayer;
    blackPlayer: PublicPlayer;
    whiteDelta: number;
    blackDelta: number;
  } | null> {
    await this.init();
    const white = this.db.players[input.whiteId];
    const black = this.db.players[input.blackId];
    if (!white || !black) return null;

    const whiteEloBefore = white.elo;
    const blackEloBefore = black.elo;

    let whiteDelta = 0;
    let blackDelta = 0;
    let whiteEloAfter = whiteEloBefore;
    let blackEloAfter = blackEloBefore;

    if (input.rated && white.id !== black.id) {
      const scoreW: 1 | 0.5 | 0 = input.winner === 'w' ? 1 : input.winner === 'draw' ? 0.5 : 0;
      const calc = calculateEloDelta(
        whiteEloBefore,
        blackEloBefore,
        scoreW,
        white.gamesPlayed,
        black.gamesPlayed
      );
      whiteDelta = calc.deltaA;
      blackDelta = calc.deltaB;
      whiteEloAfter = calc.newRatingA;
      blackEloAfter = calc.newRatingB;
    }

    const now = input.endedAt;

    white.elo = whiteEloAfter;
    white.peakElo = Math.max(white.peakElo, whiteEloAfter);
    white.gamesPlayed += 1;
    white.lastActiveAt = now;

    black.elo = blackEloAfter;
    black.peakElo = Math.max(black.peakElo, blackEloAfter);
    black.gamesPlayed += 1;
    black.lastActiveAt = now;

    if (input.winner === 'w') {
      white.wins += 1;
      white.winStreak += 1;
      white.bestStreak = Math.max(white.bestStreak, white.winStreak);
      black.losses += 1;
      black.winStreak = 0;
    } else if (input.winner === 'b') {
      black.wins += 1;
      black.winStreak += 1;
      black.bestStreak = Math.max(black.bestStreak, black.winStreak);
      white.losses += 1;
      white.winStreak = 0;
    } else {
      white.draws += 1;
      black.draws += 1;
      white.winStreak = 0;
      black.winStreak = 0;
    }

    if (input.rated) {
      white.ratingHistory = [...white.ratingHistory, { elo: whiteEloAfter, timestamp: now }].slice(-40);
      black.ratingHistory = [...black.ratingHistory, { elo: blackEloAfter, timestamp: now }].slice(-40);
    }

    const match: MatchRecord = {
      id: `m_${crypto.randomBytes(6).toString('hex')}`,
      roomId: input.roomId,
      timeControl: input.timeControl,
      rated: input.rated,
      whiteId: white.id,
      whiteHandle: white.handle,
      whiteEloBefore,
      whiteEloAfter,
      blackId: black.id,
      blackHandle: black.handle,
      blackEloBefore,
      blackEloAfter,
      winner: input.winner,
      endReason: input.endReason,
      moves: input.moves,
      pgn: input.pgn,
      finalFen: input.finalFen,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    };

    this.db.matches.unshift(match);
    if (this.db.matches.length > 500) {
      this.db.matches = this.db.matches.slice(0, 500);
    }

    await this.persist();
    return {
      match,
      whitePlayer: toPublicPlayer(white),
      blackPlayer: toPublicPlayer(black),
      whiteDelta,
      blackDelta,
    };
  }

  getLeaderboard(limit = 50): PublicPlayer[] {
    return Object.values(this.db.players)
      .map(toPublicPlayer)
      .sort((a, b) => {
        if (b.elo !== a.elo) return b.elo - a.elo;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.gamesPlayed - a.gamesPlayed;
      })
      .slice(0, limit);
  }

  getMatchesForPlayer(playerId: string, limit = 25): MatchRecord[] {
    return this.db.matches
      .filter((m) => m.whiteId === playerId || m.blackId === playerId)
      .slice(0, limit);
  }

  getMatchById(matchId: string): MatchRecord | null {
    return this.db.matches.find((m) => m.id === matchId) ?? null;
  }

  getRecentMatches(limit = 20): MatchRecord[] {
    return this.db.matches.slice(0, limit);
  }
}

export const arenaStore = new ArenaStore();
