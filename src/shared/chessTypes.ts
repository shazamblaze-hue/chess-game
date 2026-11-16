export type TimeControlId = 'bullet_1_0' | 'blitz_3_2' | 'rapid_10_0';

export interface TimeControlConfig {
  id: TimeControlId;
  label: string;
  category: 'Bullet' | 'Blitz' | 'Rapid';
  shortLabel: string;
  initialMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: Record<TimeControlId, TimeControlConfig> = {
  bullet_1_0: {
    id: 'bullet_1_0',
    label: 'Bullet 1+0',
    category: 'Bullet',
    shortLabel: '1+0',
    initialMs: 60_000,
    incrementMs: 0,
  },
  blitz_3_2: {
    id: 'blitz_3_2',
    label: 'Blitz 3+2',
    category: 'Blitz',
    shortLabel: '3+2',
    initialMs: 180_000,
    incrementMs: 2_000,
  },
  rapid_10_0: {
    id: 'rapid_10_0',
    label: 'Rapid 10+0',
    category: 'Rapid',
    shortLabel: '10+0',
    initialMs: 600_000,
    incrementMs: 0,
  },
};

export type TierId =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster';

export interface RankTier {
  id: TierId;
  name: string;
  minElo: number;
  maxElo: number | null;
  color: string;
  subtleBg: string;
}

export const RANK_TIERS: RankTier[] = [
  { id: 'iron', name: 'Iron', minElo: 0, maxElo: 799, color: '#8C929C', subtleBg: 'rgba(140, 146, 156, 0.12)' },
  { id: 'bronze', name: 'Bronze', minElo: 800, maxElo: 999, color: '#C47D4E', subtleBg: 'rgba(196, 125, 78, 0.12)' },
  { id: 'silver', name: 'Silver', minElo: 1000, maxElo: 1199, color: '#BCC4D0', subtleBg: 'rgba(188, 196, 208, 0.12)' },
  { id: 'gold', name: 'Gold', minElo: 1200, maxElo: 1399, color: '#D4A853', subtleBg: 'rgba(212, 168, 83, 0.14)' },
  { id: 'platinum', name: 'Platinum', minElo: 1400, maxElo: 1599, color: '#56B8B0', subtleBg: 'rgba(86, 184, 176, 0.14)' },
  { id: 'diamond', name: 'Diamond', minElo: 1600, maxElo: 1799, color: '#6DA4E8', subtleBg: 'rgba(109, 164, 232, 0.14)' },
  { id: 'master', name: 'Master', minElo: 1800, maxElo: 1999, color: '#C47FE8', subtleBg: 'rgba(196, 127, 232, 0.14)' },
  { id: 'grandmaster', name: 'Grandmaster', minElo: 2000, maxElo: null, color: '#E86C52', subtleBg: 'rgba(232, 108, 82, 0.16)' },
];

export function getRankTier(elo: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) {
      return RANK_TIERS[i];
    }
  }
  return RANK_TIERS[0];
}

export function calculateEloDelta(
  ratingA: number,
  ratingB: number,
  scoreA: 1 | 0.5 | 0,
  gamesA: number,
  gamesB: number
): {
  deltaA: number;
  deltaB: number;
  newRatingA: number;
  newRatingB: number;
} {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  const kFactor = (rating: number, games: number) => {
    if (games < 10) return 40;
    if (rating >= 2100) return 16;
    return 24;
  };

  const kA = kFactor(ratingA, gamesA);
  const kB = kFactor(ratingB, gamesB);

  const scoreB = 1 - scoreA;
  const deltaA = Math.round(kA * (scoreA - expectedA));
  const deltaB = Math.round(kB * (scoreB - expectedB));

  const newRatingA = Math.max(400, ratingA + deltaA);
  const newRatingB = Math.max(400, ratingB + deltaB);

  return {
    deltaA: newRatingA - ratingA,
    deltaB: newRatingB - ratingB,
    newRatingA,
    newRatingB,
  };
}

export interface RatingPoint {
  elo: number;
  timestamp: number;
}

export interface PublicPlayer {
  id: string;
  handle: string;
  hasPasscode: boolean;
  elo: number;
  peakElo: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestStreak: number;
  createdAt: number;
  lastActiveAt: number;
  ratingHistory: RatingPoint[];
}

export interface RecordedMove {
  san: string;
  from: string;
  to: string;
  color: 'w' | 'b';
  fenAfter: string;
  timestamp: number;
  captured?: string;
  promotion?: string;
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export type EndReason =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'threefold_repetition'
  | 'insufficient_material'
  | 'fifty_move_rule'
  | 'agreement'
  | 'abandoned';

export interface MatchRecord {
  id: string;
  roomId: string;
  timeControl: TimeControlId;
  rated: boolean;
  whiteId: string;
  whiteHandle: string;
  whiteEloBefore: number;
  whiteEloAfter: number;
  blackId: string;
  blackHandle: string;
  blackEloBefore: number;
  blackEloAfter: number;
  winner: 'w' | 'b' | 'draw';
  endReason: EndReason;
  moves: RecordedMove[];
  pgn: string;
  finalFen: string;
  startedAt: number;
  endedAt: number;
}

export interface OpenChallenge {
  id: string;
  roomId: string;
  hostId: string;
  hostHandle: string;
  hostElo: number;
  timeControl: TimeControlId;
  rated: boolean;
  hostColor: 'w' | 'b' | 'random';
  isPrivate: boolean;
  createdAt: number;
}

export interface RoomPlayerInfo {
  id: string;
  handle: string;
  elo: number;
  gamesPlayed: number;
  connected: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderHandle: string;
  text: string;
  timestamp: number;
}

export interface RatingChangeSummary {
  whiteDelta: number;
  blackDelta: number;
  whiteNewElo: number;
  blackNewElo: number;
}

export interface ActiveGameSnapshot {
  roomId: string;
  timeControl: TimeControlId;
  rated: boolean;
  whitePlayer: RoomPlayerInfo | null;
  blackPlayer: RoomPlayerInfo | null;
  fen: string;
  pgn: string;
  moves: RecordedMove[];
  turn: 'w' | 'b';
  status: 'waiting' | 'active' | 'finished';
  winner: 'w' | 'b' | 'draw' | null;
  endReason: EndReason | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  drawOfferFrom: 'w' | 'b' | null;
  rematchVotes: string[];
  ratingChange: RatingChangeSummary | null;
  chat: ChatMessage[];
  startedAt: number;
}

export interface LobbySnapshot {
  onlineCount: number;
  activeGamesCount: number;
  queueCounts: Record<TimeControlId, number>;
  openChallenges: OpenChallenge[];
  leaderboardTop: PublicPlayer[];
}

export type ClientWsMessage =
  | { type: 'auth:hello'; sessionToken: string }
  | { type: 'lobby:subscribe' }
  | { type: 'queue:join'; timeControl: TimeControlId }
  | { type: 'queue:leave' }
  | {
      type: 'challenge:create';
      timeControl: TimeControlId;
      rated: boolean;
      hostColor: 'w' | 'b' | 'random';
      isPrivate: boolean;
    }
  | { type: 'challenge:cancel'; challengeId: string }
  | { type: 'challenge:accept'; challengeId: string }
  | { type: 'room:join'; roomId: string }
  | { type: 'game:move'; roomId: string; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'game:resign'; roomId: string }
  | { type: 'game:offer_draw'; roomId: string }
  | { type: 'game:respond_draw'; roomId: string; accept: boolean }
  | { type: 'game:rematch'; roomId: string }
  | { type: 'game:chat'; roomId: string; text: string }
  | { type: 'game:leave'; roomId: string };

export type ServerWsMessage =
  | { type: 'auth:ok'; player: PublicPlayer; activeRoomId: string | null }
  | { type: 'auth:error'; message: string }
  | { type: 'lobby:state'; lobby: LobbySnapshot }
  | { type: 'queue:status'; inQueue: boolean; timeControl: TimeControlId | null }
  | { type: 'challenge:created'; challenge: OpenChallenge }
  | { type: 'game:state'; game: ActiveGameSnapshot }
  | { type: 'game:error'; message: string }
  | { type: 'player:updated'; player: PublicPlayer };
