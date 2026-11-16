import { Chess, Move, PieceSymbol } from 'chess.js';

export type BotDifficulty = 800 | 1200 | 1600 | 2000;

export interface BotProfile {
  elo: BotDifficulty;
  name: string;
  title: string;
  description: string;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    elo: 800,
    name: 'Alden',
    title: 'Apprentice',
    description: 'Plays natural developing moves with occasional tactical oversights.',
  },
  {
    elo: 1200,
    name: 'Vesper',
    title: 'Club Player',
    description: 'Spots two-move forks and defends material reliably.',
  },
  {
    elo: 1600,
    name: 'Korvin',
    title: 'Candidate Master',
    description: 'Strong positional awareness and sharp three-ply calculation.',
  },
  {
    elo: 2000,
    name: 'Mirella',
    title: 'Grandmaster',
    description: 'Deep tactical search with quiescence capture evaluation.',
  },
];

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables from White's perspective (rank 8 at index 0 -> rank 1 at index 7)
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 22, 22, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 8, 12, 12, 8, 0, -10,
  -10, 6, 6, 12, 12, 6, 6, -10,
  -10, 0, 10, 12, 12, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  6, 12, 12, 12, 12, 12, 12, 6,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 6, 6, 0, 0, 0,
];

const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const PST_KING_MID = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

function getPstBonus(type: PieceSymbol, color: 'w' | 'b', row: number, col: number): number {
  const idx = color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
  switch (type) {
    case 'p':
      return PST_PAWN[idx];
    case 'n':
      return PST_KNIGHT[idx];
    case 'b':
      return PST_BISHOP[idx];
    case 'r':
      return PST_ROOK[idx];
    case 'q':
      return PST_QUEEN[idx];
    case 'k':
      return PST_KING_MID[idx];
  }
}

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 : 99999;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }

  const board = chess.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] + getPstBonus(piece.type, piece.color, r, c);
      score += piece.color === 'w' ? val : -val;
    }
  }

  return chess.turn() === 'w' ? score : -score;
}

function scoreMoveOrder(move: Move): number {
  let score = 0;
  if (move.captured) {
    score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  if (move.san.includes('+')) {
    score += 45;
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));
}

function quiescence(chess: Chess, alpha: number, beta: number, qDepth: number): number {
  const standPat = evaluateBoard(chess);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  if (qDepth <= 0) return alpha;

  const captures = orderMoves(
    chess.moves({ verbose: true }).filter((m) => Boolean(m.captured) || Boolean(m.promotion))
  );

  for (const move of captures) {
    chess.move(move);
    const score = -quiescence(chess, -beta, -alpha, qDepth - 1);
    chess.undo();

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  useQuiescence: boolean,
  deadline: number
): number {
  if (Date.now() > deadline) {
    return evaluateBoard(chess);
  }
  if (chess.isCheckmate()) {
    return -99999 - depth;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }
  if (depth <= 0) {
    return useQuiescence ? quiescence(chess, alpha, beta, 3) : evaluateBoard(chess);
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  let best = -Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, useQuiescence, deadline);
    chess.undo();

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

export function chooseBotMove(fen: string, difficulty: BotDifficulty): Move | null {
  const chess = new Chess(fen);
  const legalMoves = orderMoves(chess.moves({ verbose: true }));
  if (legalMoves.length === 0) return null;

  if (difficulty === 800) {
    // Evaluate depth 1 and pick among top 3 with slight human-like variance
    const scored = legalMoves.map((move) => {
      chess.move(move);
      const val = -evaluateBoard(chess) + (Math.random() * 70 - 35);
      chess.undo();
      return { move, val };
    });
    scored.sort((a, b) => b.val - a.val);
    const pool = scored.slice(0, Math.min(3, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  const depth = difficulty === 1200 ? 2 : 3;
  const useQuiescence = difficulty === 2000;
  const deadline = Date.now() + (difficulty === 2000 ? 650 : 400);

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  for (const move of legalMoves) {
    chess.move(move);
    const jitter = difficulty === 1200 ? Math.random() * 16 - 8 : 0;
    const score = -negamax(chess, depth - 1, -Infinity, Infinity, useQuiescence, deadline) + jitter;
    chess.undo();

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
