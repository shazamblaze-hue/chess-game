import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, PieceSymbol, Square } from 'chess.js';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Flag,
  Handshake,
  Palette,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ActiveGameSnapshot,
  MatchRecord,
  PublicPlayer,
  RecordedMove,
  TIME_CONTROLS,
  TimeControlId,
  getRankTier,
} from '../shared/chessTypes';
import { BOT_PROFILES, BotDifficulty, chooseBotMove } from '../engine/chessBot';
import { soundFx } from '../utils/soundFx';
import { BOARD_THEMES, BoardThemeId, ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieceSvg';
import { RankCrestSvg } from './RankCrestSvg';

export type ArenaMode =
  | { kind: 'online' }
  | { kind: 'bot'; difficulty: BotDifficulty; humanColor: 'w' | 'b' }
  | { kind: 'local'; timeControl: TimeControlId | null }
  | { kind: 'review'; match: MatchRecord };

interface GameArenaProps {
  mode: ArenaMode;
  onlineGame: ActiveGameSnapshot | null;
  player: PublicPlayer | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onExitArena: () => void;
  onSendOnlineMove: (roomId: string, from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => void;
  onOnlineResign: (roomId: string) => void;
  onOnlineOfferDraw: (roomId: string) => void;
  onOnlineRespondDraw: (roomId: string, accept: boolean) => void;
  onOnlineRematch: (roomId: string) => void;
  onOnlineChat: (roomId: string, text: string) => void;
}

const PIECE_SCORE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (clamped < 10_000 && clamped > 0) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function computeCapturedAndAdvantage(fen: string): {
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  whiteAdvantage: number;
} {
  const startCounts: Record<'w' | 'b', Record<PieceSymbol, number>> = {
    w: { q: 1, r: 2, b: 2, n: 2, p: 8, k: 1 },
    b: { q: 1, r: 2, b: 2, n: 2, p: 8, k: 1 },
  };
  const currentCounts: Record<'w' | 'b', Record<PieceSymbol, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 },
  };

  try {
    const chess = new Chess(fen);
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell) {
          currentCounts[cell.color][cell.type] += 1;
        }
      }
    }
  } catch {
    return { capturedByWhite: [], capturedByBlack: [], whiteAdvantage: 0 };
  }

  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];
  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (const t of order) {
    whiteMaterial += currentCounts.w[t] * PIECE_SCORE[t];
    blackMaterial += currentCounts.b[t] * PIECE_SCORE[t];

    const blackLost = Math.max(0, startCounts.b[t] - currentCounts.b[t]);
    for (let i = 0; i < blackLost; i++) capturedByWhite.push(t);

    const whiteLost = Math.max(0, startCounts.w[t] - currentCounts.w[t]);
    for (let i = 0; i < whiteLost; i++) capturedByBlack.push(t);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

export const GameArena: React.FC<GameArenaProps> = ({
  mode,
  onlineGame,
  player,
  isMuted,
  onToggleMute,
  onExitArena,
  onSendOnlineMove,
  onOnlineResign,
  onOnlineOfferDraw,
  onOnlineRespondDraw,
  onOnlineRematch,
  onOnlineChat,
}) => {
  const [theme, setTheme] = useState<BoardThemeId>(() => {
    try {
      const saved = localStorage.getItem('kingsgate_board_theme') as BoardThemeId | null;
      return saved && BOARD_THEMES[saved] ? saved : 'walnut';
    } catch {
      return 'walnut';
    }
  });

  // Offline / Local / Bot state
  const [offlineChess, setOfflineChess] = useState<Chess>(() => new Chess());
  const [offlineMoves, setOfflineMoves] = useState<RecordedMove[]>([]);
  const [offlineStatus, setOfflineStatus] = useState<'active' | 'finished'>('active');
  const [offlineWinner, setOfflineWinner] = useState<'w' | 'b' | 'draw' | null>(null);
  const [offlineEndReason, setOfflineEndReason] = useState<string | null>(null);
  const [botThinking, setBotThinking] = useState(false);

  // Local clocks for offline modes when timed
  const initialLocalMs =
    mode.kind === 'local' && mode.timeControl ? TIME_CONTROLS[mode.timeControl].initialMs : 0;
  const [localWhiteMs, setLocalWhiteMs] = useState(initialLocalMs);
  const [localBlackMs, setLocalBlackMs] = useState(initialLocalMs);
  const [localLastTick, setLocalLastTick] = useState<number | null>(null);

  // Online interpolated clocks
  const [displayWhiteMs, setDisplayWhiteMs] = useState(0);
  const [displayBlackMs, setDisplayBlackMs] = useState(0);

  // Review / history ply index (null = live latest position)
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showEndModal, setShowEndModal] = useState(true);
  const [chatInput, setChatInput] = useState('');

  const moveListRef = useRef<HTMLDivElement | null>(null);
  const prevMoveCountRef = useRef(0);
  const prevStatusRef = useRef<string>('active');
  const lowTimeBeepRef = useRef<number>(0);

  const cycleTheme = () => {
    const order: BoardThemeId[] = ['walnut', 'emerald', 'slate'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    try {
      localStorage.setItem('kingsgate_board_theme', next);
    } catch {
      // ignore
    }
  };

  // Determine unified view data across modes
  const activeMoves: RecordedMove[] = useMemo(() => {
    if (mode.kind === 'online') return onlineGame?.moves ?? [];
    if (mode.kind === 'review') return mode.match.moves;
    return offlineMoves;
  }, [mode, onlineGame, offlineMoves]);

  const liveFen = useMemo(() => {
    if (mode.kind === 'online') return onlineGame?.fen ?? new Chess().fen();
    if (mode.kind === 'review') return mode.match.finalFen;
    return offlineChess.fen();
  }, [mode, onlineGame, offlineChess]);

  const displayedFen = useMemo(() => {
    if (viewPly === null || viewPly >= activeMoves.length) {
      if (mode.kind === 'review' && activeMoves.length > 0 && viewPly === null) {
        return mode.match.finalFen;
      }
      return liveFen;
    }
    if (viewPly <= 0) {
      return new Chess().fen();
    }
    return activeMoves[viewPly - 1].fenAfter;
  }, [viewPly, activeMoves, liveFen, mode]);

  const displayedLastMove = useMemo(() => {
    const idx = viewPly === null ? activeMoves.length - 1 : viewPly - 1;
    if (idx < 0 || idx >= activeMoves.length) return null;
    return { from: activeMoves[idx].from, to: activeMoves[idx].to };
  }, [viewPly, activeMoves]);

  const isReviewingHistory = viewPly !== null && viewPly < activeMoves.length;

  const isFinished =
    mode.kind === 'online'
      ? onlineGame?.status === 'finished'
      : mode.kind === 'review'
        ? true
        : offlineStatus === 'finished';

  // Player orientation
  const myOnlineColor: 'w' | 'b' | null = useMemo(() => {
    if (mode.kind !== 'online' || !onlineGame || !player) return null;
    if (onlineGame.whitePlayer?.id === player.id) return 'w';
    if (onlineGame.blackPlayer?.id === player.id) return 'b';
    return null;
  }, [mode, onlineGame, player]);

  const baseOrientation: 'w' | 'b' = useMemo(() => {
    if (mode.kind === 'online') return myOnlineColor ?? 'w';
    if (mode.kind === 'bot') return mode.humanColor;
    if (mode.kind === 'review' && player && mode.match.blackId === player.id) return 'b';
    return 'w';
  }, [mode, myOnlineColor, player]);

  const orientation: 'w' | 'b' = flipped
    ? baseOrientation === 'w'
      ? 'b'
      : 'w'
    : baseOrientation;

  const interactiveColors: ('w' | 'b')[] = useMemo(() => {
    if (isReviewingHistory || isFinished) return [];
    if (mode.kind === 'online') {
      return myOnlineColor ? [myOnlineColor] : [];
    }
    if (mode.kind === 'bot') {
      return botThinking ? [] : [mode.humanColor];
    }
    if (mode.kind === 'local') {
      return ['w', 'b'];
    }
    return [];
  }, [isReviewingHistory, isFinished, mode, myOnlineColor, botThinking]);

  // Reset modal visibility when a new game starts
  useEffect(() => {
    if (mode.kind === 'online' && onlineGame?.status === 'active') {
      setShowEndModal(true);
      setViewPly(null);
    }
  }, [mode.kind, onlineGame?.roomId, onlineGame?.status]);

  // Play start sound on initial mount
  useEffect(() => {
    if (mode.kind !== 'review') {
      soundFx.playGameStart();
    }
  }, [mode.kind]);

  // Sound effects for new moves & game end
  useEffect(() => {
    const count = activeMoves.length;
    if (count > prevMoveCountRef.current) {
      const latest = activeMoves[count - 1];
      if (latest) {
        if (latest.isCheck) {
          soundFx.playCheck();
        } else if (latest.promotion) {
          soundFx.playPromote();
        } else if (latest.san.startsWith('O-O')) {
          soundFx.playCastle();
        } else if (latest.captured) {
          soundFx.playCapture();
        } else {
          soundFx.playMove();
        }
      }
      if (viewPly !== null && viewPly === prevMoveCountRef.current) {
        setViewPly(null);
      }
    }
    prevMoveCountRef.current = count;

    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [activeMoves, viewPly]);

  useEffect(() => {
    const curStatus = isFinished ? 'finished' : 'active';
    if (curStatus === 'finished' && prevStatusRef.current !== 'finished' && mode.kind !== 'review') {
      const myCol =
        mode.kind === 'online' ? myOnlineColor : mode.kind === 'bot' ? mode.humanColor : null;
      const win = mode.kind === 'online' ? onlineGame?.winner : offlineWinner;
      const victory = myCol ? win === myCol : win !== 'draw';
      soundFx.playGameOver(victory);
      setShowEndModal(true);
    }
    prevStatusRef.current = curStatus;
  }, [isFinished, mode, myOnlineColor, onlineGame?.winner, offlineWinner]);

  // Online clock smooth tick
  useEffect(() => {
    if (mode.kind !== 'online' || !onlineGame) return;

    const updateClocks = () => {
      if (onlineGame.status !== 'active' || onlineGame.moves.length < 1 || !onlineGame.lastMoveAt) {
        setDisplayWhiteMs(onlineGame.whiteTimeMs);
        setDisplayBlackMs(onlineGame.blackTimeMs);
        return;
      }
      const elapsed = Math.max(0, Date.now() - onlineGame.lastMoveAt);
      const wMs = onlineGame.turn === 'w' ? Math.max(0, onlineGame.whiteTimeMs - elapsed) : onlineGame.whiteTimeMs;
      const bMs = onlineGame.turn === 'b' ? Math.max(0, onlineGame.blackTimeMs - elapsed) : onlineGame.blackTimeMs;
      setDisplayWhiteMs(wMs);
      setDisplayBlackMs(bMs);

      if (myOnlineColor && onlineGame.turn === myOnlineColor) {
        const myMs = myOnlineColor === 'w' ? wMs : bMs;
        const sec = Math.ceil(myMs / 1000);
        if (sec > 0 && sec <= 10 && sec !== lowTimeBeepRef.current) {
          lowTimeBeepRef.current = sec;
          soundFx.playLowTime();
        }
      }
    };

    updateClocks();
    const id = window.setInterval(updateClocks, 100);
    return () => window.clearInterval(id);
  }, [mode.kind, onlineGame, myOnlineColor]);

  // Local timed clock tick
  useEffect(() => {
    if (mode.kind !== 'local' || !mode.timeControl || offlineStatus !== 'active' || offlineMoves.length < 1) {
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!localLastTick) {
        setLocalLastTick(now);
        return;
      }
      const delta = now - localLastTick;
      setLocalLastTick(now);
      if (offlineChess.turn() === 'w') {
        setLocalWhiteMs((prev) => {
          const next = Math.max(0, prev - delta);
          if (next <= 0) {
            setOfflineStatus('finished');
            setOfflineWinner('b');
            setOfflineEndReason('timeout');
          }
          return next;
        });
      } else {
        setLocalBlackMs((prev) => {
          const next = Math.max(0, prev - delta);
          if (next <= 0) {
            setOfflineStatus('finished');
            setOfflineWinner('w');
            setOfflineEndReason('timeout');
          }
          return next;
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [mode, offlineStatus, offlineMoves.length, localLastTick, offlineChess]);

  // Bot turn trigger
  useEffect(() => {
    if (mode.kind !== 'bot' || offlineStatus !== 'active') return;
    const botColor: 'w' | 'b' = mode.humanColor === 'w' ? 'b' : 'w';
    if (offlineChess.turn() !== botColor) return;

    setBotThinking(true);
    const delayMs = 520 + Math.floor(Math.random() * 260);
    const timer = window.setTimeout(() => {
      const chosen = chooseBotMove(offlineChess.fen(), mode.difficulty);
      if (chosen) {
        applyOfflineMove(chosen.from, chosen.to, chosen.promotion as 'q' | 'r' | 'b' | 'n' | undefined);
      }
      setBotThinking(false);
    }, delayMs);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, offlineChess, offlineStatus]);

  // Keyboard shortcuts (F flip, M mute, Arrow keys review)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onToggleMute();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewPly((cur) => {
          const idx = cur === null ? activeMoves.length : cur;
          return Math.max(0, idx - 1);
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewPly((cur) => {
          if (cur === null) return null;
          const next = cur + 1;
          return next >= activeMoves.length ? null : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setViewPly(0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setViewPly(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMoves.length, onToggleMute]);

  const applyOfflineMove = (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
    const nextChess = new Chess(offlineChess.fen());
    const turnBefore = nextChess.turn();
    let result;
    try {
      result = nextChess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return;
    }
    if (!result) return;

    if (mode.kind === 'local' && mode.timeControl) {
      const inc = TIME_CONTROLS[mode.timeControl].incrementMs;
      if (offlineMoves.length >= 1) {
        if (turnBefore === 'w') setLocalWhiteMs((ms) => ms + inc);
        else setLocalBlackMs((ms) => ms + inc);
      }
      setLocalLastTick(Date.now());
    }

    const moveRecord: RecordedMove = {
      san: result.san,
      from: result.from,
      to: result.to,
      color: result.color,
      fenAfter: nextChess.fen(),
      timestamp: Date.now(),
      captured: result.captured,
      promotion: result.promotion,
      isCheck: nextChess.inCheck(),
      isCheckmate: nextChess.isCheckmate(),
    };

    setOfflineChess(nextChess);
    setOfflineMoves((prev) => [...prev, moveRecord]);
    setViewPly(null);

    if (nextChess.isCheckmate()) {
      setOfflineStatus('finished');
      setOfflineWinner(turnBefore);
      setOfflineEndReason('checkmate');
    } else if (nextChess.isStalemate()) {
      setOfflineStatus('finished');
      setOfflineWinner('draw');
      setOfflineEndReason('stalemate');
    } else if (nextChess.isThreefoldRepetition()) {
      setOfflineStatus('finished');
      setOfflineWinner('draw');
      setOfflineEndReason('threefold_repetition');
    } else if (nextChess.isInsufficientMaterial()) {
      setOfflineStatus('finished');
      setOfflineWinner('draw');
      setOfflineEndReason('insufficient_material');
    } else if (nextChess.isDraw()) {
      setOfflineStatus('finished');
      setOfflineWinner('draw');
      setOfflineEndReason('fifty_move_rule');
    }
  };

  const handleBoardMove = (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
    if (mode.kind === 'online' && onlineGame) {
      onSendOnlineMove(onlineGame.roomId, from, to, promotion);
    } else if (mode.kind === 'bot' || mode.kind === 'local') {
      applyOfflineMove(from, to, promotion);
    }
  };

  const resetOfflineGame = () => {
    setOfflineChess(new Chess());
    setOfflineMoves([]);
    setOfflineStatus('active');
    setOfflineWinner(null);
    setOfflineEndReason(null);
    setViewPly(null);
    setBotThinking(false);
    setShowEndModal(false);
    if (mode.kind === 'local' && mode.timeControl) {
      const ms = TIME_CONTROLS[mode.timeControl].initialMs;
      setLocalWhiteMs(ms);
      setLocalBlackMs(ms);
      setLocalLastTick(null);
    }
    soundFx.playGameStart();
  };

  const material = useMemo(() => computeCapturedAndAdvantage(displayedFen), [displayedFen]);

  // Build top & bottom player bar metadata
  const topColor: 'w' | 'b' = orientation === 'w' ? 'b' : 'w';
  const bottomColor: 'w' | 'b' = orientation;

  const getSideMeta = (color: 'w' | 'b') => {
    if (mode.kind === 'online' && onlineGame) {
      const info = color === 'w' ? onlineGame.whitePlayer : onlineGame.blackPlayer;
      const ms = color === 'w' ? displayWhiteMs : displayBlackMs;
      return {
        handle: info?.handle ?? (color === 'w' ? 'White' : 'Black'),
        elo: info?.elo ?? null,
        connected: info?.connected ?? true,
        timeMs: ms,
        timed: true,
        isActiveTurn: onlineGame.status === 'active' && onlineGame.turn === color,
        captured: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
        advantage:
          color === 'w'
            ? material.whiteAdvantage > 0
              ? material.whiteAdvantage
              : 0
            : material.whiteAdvantage < 0
              ? -material.whiteAdvantage
              : 0,
      };
    }

    if (mode.kind === 'bot') {
      const botProfile = BOT_PROFILES.find((b) => b.elo === mode.difficulty) ?? BOT_PROFILES[1];
      const isHuman = color === mode.humanColor;
      return {
        handle: isHuman ? player?.handle ?? 'You' : `${botProfile.name} (Engine)`,
        elo: isHuman ? player?.elo ?? null : botProfile.elo,
        connected: true,
        timeMs: null,
        timed: false,
        isActiveTurn: offlineStatus === 'active' && offlineChess.turn() === color,
        captured: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
        advantage:
          color === 'w'
            ? material.whiteAdvantage > 0
              ? material.whiteAdvantage
              : 0
            : material.whiteAdvantage < 0
              ? -material.whiteAdvantage
              : 0,
      };
    }

    if (mode.kind === 'review') {
      const m = mode.match;
      return {
        handle: color === 'w' ? m.whiteHandle : m.blackHandle,
        elo: color === 'w' ? m.whiteEloBefore : m.blackEloBefore,
        connected: true,
        timeMs: null,
        timed: false,
        isActiveTurn: false,
        captured: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
        advantage:
          color === 'w'
            ? material.whiteAdvantage > 0
              ? material.whiteAdvantage
              : 0
            : material.whiteAdvantage < 0
              ? -material.whiteAdvantage
              : 0,
      };
    }

    // Local Pass & Play
    const localTc = mode.kind === 'local' ? mode.timeControl : null;
    return {
      handle: color === 'w' ? 'White Player' : 'Black Player',
      elo: null,
      connected: true,
      timeMs: localTc ? (color === 'w' ? localWhiteMs : localBlackMs) : null,
      timed: Boolean(localTc),
      isActiveTurn: offlineStatus === 'active' && offlineChess.turn() === color,
      captured: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
      advantage:
        color === 'w'
          ? material.whiteAdvantage > 0
            ? material.whiteAdvantage
            : 0
          : material.whiteAdvantage < 0
            ? -material.whiteAdvantage
            : 0,
    };
  };

  const topMeta = getSideMeta(topColor);
  const bottomMeta = getSideMeta(bottomColor);

  // Pair moves into rows: 1. e4 e5
  const moveRows = useMemo(() => {
    const rows: { moveNum: number; white?: RecordedMove; whitePly: number; black?: RecordedMove; blackPly?: number }[] = [];
    for (let i = 0; i < activeMoves.length; i += 2) {
      rows.push({
        moveNum: Math.floor(i / 2) + 1,
        white: activeMoves[i],
        whitePly: i + 1,
        black: activeMoves[i + 1],
        blackPly: activeMoves[i + 1] ? i + 2 : undefined,
      });
    }
    return rows;
  }, [activeMoves]);

  const incomingDrawOffer =
    mode.kind === 'online' &&
    onlineGame?.status === 'active' &&
    onlineGame.drawOfferFrom &&
    myOnlineColor &&
    onlineGame.drawOfferFrom !== myOnlineColor;

  const sentDrawOffer =
    mode.kind === 'online' &&
    onlineGame?.status === 'active' &&
    onlineGame.drawOfferFrom &&
    myOnlineColor &&
    onlineGame.drawOfferFrom === myOnlineColor;

  const finalWinner = mode.kind === 'online' ? onlineGame?.winner : mode.kind === 'review' ? mode.match.winner : offlineWinner;
  const finalReason = mode.kind === 'online' ? onlineGame?.endReason : mode.kind === 'review' ? mode.match.endReason : offlineEndReason;

  const headlineModeLabel =
    mode.kind === 'online'
      ? onlineGame
        ? `${TIME_CONTROLS[onlineGame.timeControl].label} · ${onlineGame.rated ? 'Ranked' : 'Casual'}`
        : 'Online Match'
      : mode.kind === 'bot'
        ? `Solo vs. Engine ${mode.difficulty}`
        : mode.kind === 'review'
          ? `Match Review · ${TIME_CONTROLS[mode.match.timeControl].label}`
          : `Pass & Play${mode.timeControl ? ` · ${TIME_CONTROLS[mode.timeControl].label}` : ''}`;

  return (
    <div className="min-h-screen w-full bg-[#111315] text-[#F3EFE6] flex flex-col lg:h-screen lg:overflow-hidden">
      {/* Compact Perimeter Top Bar */}
      <header className="h-12 px-4 sm:px-6 border-b border-white/8 bg-[#16191D] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onExitArena}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F3EFE6]/70 hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Salon</span>
          </button>
          <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
          <span className="text-xs font-medium text-[#D4A853] truncate">{headlineModeLabel}</span>
          {mode.kind === 'online' && onlineGame && (
            <span className="hidden sm:inline text-xs font-mono-tabular text-[#F3EFE6]/45">
              Room {onlineGame.roomId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFlipped((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-[#F3EFE6]/70 hover:text-[#F3EFE6] hover:bg-white/5 transition-colors cursor-pointer"
            title="Flip board (F)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Flip</span>
          </button>

          <button
            type="button"
            onClick={cycleTheme}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-[#F3EFE6]/70 hover:text-[#F3EFE6] hover:bg-white/5 transition-colors cursor-pointer"
            title={`Board theme: ${BOARD_THEMES[theme].name}`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{BOARD_THEMES[theme].name}</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="p-1.5 rounded text-[#F3EFE6]/70 hover:text-[#F3EFE6] hover:bg-white/5 transition-colors cursor-pointer"
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            title="Toggle sound (M)"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Playfield + Side Rail */}
      <div className="flex-1 min-h-0 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-6">
        {/* Centerpiece Board Column (>= 85% unobstructed focus) */}
        <div className="flex flex-col items-center justify-center w-full lg:w-auto min-h-0">
          <div className="w-full max-w-[min(68vh,94vw)] lg:w-[min(70vh,56vw)] flex flex-col gap-2.5">
            {/* Top Opponent Bar */}
            <PlayerHudBar
              meta={topMeta}
              color={topColor}
              thinking={mode.kind === 'bot' && botThinking && topColor !== mode.humanColor}
            />

            {/* Board Container */}
            <div className="relative">
              <ChessBoard
                fen={displayedFen}
                orientation={orientation}
                interactiveColors={interactiveColors}
                disabled={isFinished || isReviewingHistory}
                lastMove={displayedLastMove}
                theme={theme}
                onMove={handleBoardMove}
              />

              {/* Reviewing past move notice */}
              {isReviewingHistory && (
                <div className="mt-1.5 flex items-center justify-between px-3 py-1.5 rounded bg-[#1A1D21] border border-[#D4A853]/35 text-xs">
                  <span className="text-[#D4A853]">
                    Inspecting move {viewPly} of {activeMoves.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewPly(null)}
                    className="font-semibold text-[#F3EFE6] hover:text-[#D4A853] cursor-pointer"
                  >
                    Return to Live
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Player Bar */}
            <PlayerHudBar
              meta={bottomMeta}
              color={bottomColor}
              thinking={mode.kind === 'bot' && botThinking && bottomColor !== mode.humanColor}
            />
          </div>
        </div>

        {/* Right Side Rail: Moves, Controls, Match Chat */}
        <aside className="w-full max-w-[min(68vh,94vw)] lg:w-[360px] lg:max-w-[360px] bg-[#1A1D21] border border-white/8 rounded-lg flex flex-col min-h-[320px] lg:min-h-0 overflow-hidden shrink-0">
          {/* Draw Offer Banner */}
          {incomingDrawOffer && onlineGame && (
            <div className="px-4 py-3 bg-[#D4A853]/15 border-b border-[#D4A853]/35 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#F3EFE6]">Opponent offers a draw</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOnlineRespondDraw(onlineGame.roomId, true)}
                  className="px-2.5 py-1 rounded bg-[#D4A853] text-[#111315] text-xs font-semibold cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => onOnlineRespondDraw(onlineGame.roomId, false)}
                  className="px-2.5 py-1 rounded bg-white/10 text-[#F3EFE6] text-xs cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Header & Transport Controls */}
          <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F3EFE6]">Move List</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewPly(0)}
                disabled={activeMoves.length === 0}
                className="p-1.5 rounded text-[#F3EFE6]/65 hover:text-[#F3EFE6] hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                aria-label="First position"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewPly((cur) => Math.max(0, (cur === null ? activeMoves.length : cur) - 1))
                }
                disabled={activeMoves.length === 0 || viewPly === 0}
                className="p-1.5 rounded text-[#F3EFE6]/65 hover:text-[#F3EFE6] hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                aria-label="Previous move"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewPly((cur) => {
                    if (cur === null) return null;
                    const next = cur + 1;
                    return next >= activeMoves.length ? null : next;
                  })
                }
                disabled={viewPly === null}
                className="p-1.5 rounded text-[#F3EFE6]/65 hover:text-[#F3EFE6] hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                aria-label="Next move"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewPly(null)}
                disabled={viewPly === null}
                className="p-1.5 rounded text-[#F3EFE6]/65 hover:text-[#F3EFE6] hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                aria-label="Latest position"
              >
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Algebraic Notation Table */}
          <div ref={moveListRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-[160px]">
            {moveRows.length === 0 ? (
              <p className="text-xs text-[#F3EFE6]/45 text-center py-8">
                White to move · Make the opening move
              </p>
            ) : (
              <div className="space-y-0.5 font-mono-tabular text-xs">
                {moveRows.map((row) => (
                  <div key={row.moveNum} className="grid grid-cols-12 items-center">
                    <span className="col-span-2 text-[#F3EFE6]/40 pl-1.5">{row.moveNum}.</span>
                    <button
                      type="button"
                      onClick={() =>
                        setViewPly(row.whitePly === activeMoves.length ? null : row.whitePly)
                      }
                      className={`col-span-5 text-left px-2 py-1 rounded transition-colors cursor-pointer ${
                        (viewPly ?? activeMoves.length) === row.whitePly
                          ? 'bg-[#D4A853]/25 text-[#D4A853] font-semibold'
                          : 'text-[#F3EFE6]/85 hover:bg-white/5'
                      }`}
                    >
                      {row.white?.san}
                    </button>
                    {row.black && row.blackPly ? (
                      <button
                        type="button"
                        onClick={() =>
                          setViewPly(row.blackPly === activeMoves.length ? null : row.blackPly!)
                        }
                        className={`col-span-5 text-left px-2 py-1 rounded transition-colors cursor-pointer ${
                          (viewPly ?? activeMoves.length) === row.blackPly
                            ? 'bg-[#D4A853]/25 text-[#D4A853] font-semibold'
                            : 'text-[#F3EFE6]/85 hover:bg-white/5'
                        }`}
                      >
                        {row.black.san}
                      </button>
                    ) : (
                      <span className="col-span-5" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Controls */}
          {mode.kind !== 'review' && (
            <div className="px-4 py-3 border-t border-white/8 bg-[#16191D] flex flex-wrap items-center gap-2">
              {!isFinished ? (
                <>
                  {mode.kind === 'online' && onlineGame && myOnlineColor && (
                    <button
                      type="button"
                      disabled={Boolean(sentDrawOffer)}
                      onClick={() => onOnlineOfferDraw(onlineGame.roomId)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#252930] hover:bg-[#2F343C] disabled:opacity-50 text-xs font-medium text-[#F3EFE6] whitespace-nowrap cursor-pointer"
                    >
                      <Handshake className="w-3.5 h-3.5" />
                      <span>{sentDrawOffer ? 'Draw Offered' : 'Offer Draw'}</span>
                    </button>
                  )}

                  {mode.kind !== 'online' && (
                    <button
                      type="button"
                      onClick={resetOfflineGame}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#252930] hover:bg-[#2F343C] text-xs font-medium text-[#F3EFE6] whitespace-nowrap cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restart</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (mode.kind === 'online' && onlineGame) {
                        onOnlineResign(onlineGame.roomId);
                      } else {
                        const turn = offlineChess.turn();
                        const winner =
                          mode.kind === 'bot'
                            ? mode.humanColor === 'w'
                              ? 'b'
                              : 'w'
                            : turn === 'w'
                              ? 'b'
                              : 'w';
                        setOfflineStatus('finished');
                        setOfflineWinner(winner);
                        setOfflineEndReason('resignation');
                      }
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#E05252]/35 text-[#E05252] hover:bg-[#E05252]/10 text-xs font-medium whitespace-nowrap cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Resign</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEndModal(true)}
                  className="w-full py-2 rounded bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] text-xs font-semibold cursor-pointer"
                >
                  View Match Summary
                </button>
              )}
            </div>
          )}

          {/* Online Match Chat */}
          {mode.kind === 'online' && onlineGame && (
            <div className="border-t border-white/8 flex flex-col h-44 shrink-0 bg-[#131518]">
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-xs">
                {onlineGame.chat.length === 0 ? (
                  <p className="text-[#F3EFE6]/35 italic">Match chat</p>
                ) : (
                  onlineGame.chat.map((c) => (
                    <div key={c.id} className="leading-snug">
                      <span className="font-semibold text-[#D4A853]">{c.senderHandle}: </span>
                      <span className="text-[#F3EFE6]/85 break-words">{c.text}</span>
                    </div>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim()) return;
                  onOnlineChat(onlineGame.roomId, chatInput.trim());
                  setChatInput('');
                }}
                className="p-2 border-t border-white/8 flex items-center gap-1.5"
              >
                <input
                  type="text"
                  maxLength={200}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Say good game..."
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-[#1A1D21] border border-white/10 text-xs text-[#F3EFE6] placeholder-[#F3EFE6]/35 focus:outline-none focus:border-[#D4A853]"
                />
                <button
                  type="submit"
                  className="p-1.5 rounded bg-[#252930] hover:bg-[#303640] text-[#F3EFE6] cursor-pointer"
                  aria-label="Send chat"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* Victory / Game Over Modal */}
      {isFinished && showEndModal && mode.kind !== 'review' && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1A1D21] border border-white/15 rounded-lg p-6 shadow-2xl">
            <p className="text-xs font-medium text-[#D4A853] mb-1">
              {finalReason ? finalReason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Match Concluded'}
            </p>
            <h2 className="font-display text-2xl font-semibold text-[#F3EFE6] mb-4">
              {finalWinner === 'draw'
                ? 'Game Drawn'
                : finalWinner === 'w'
                  ? 'White Wins'
                  : 'Black Wins'}
            </h2>

            {/* Rating Change Summary for Online Ranked Games */}
            {mode.kind === 'online' && onlineGame?.ratingChange && myOnlineColor && (
              <div className="mb-5 p-4 rounded-md bg-[#131518] border border-white/8 flex items-center justify-between">
                {(() => {
                  const isW = myOnlineColor === 'w';
                  const delta = isW
                    ? onlineGame.ratingChange.whiteDelta
                    : onlineGame.ratingChange.blackDelta;
                  const newElo = isW
                    ? onlineGame.ratingChange.whiteNewElo
                    : onlineGame.ratingChange.blackNewElo;
                  const oldElo = newElo - delta;
                  const newTier = getRankTier(newElo);
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <RankCrestSvg elo={newElo} size={30} />
                        <div>
                          <div className="text-xs text-[#F3EFE6]/60">Updated Rating</div>
                          <div className="text-base font-mono-tabular font-semibold text-[#F3EFE6]">
                            {oldElo} → {newElo}{' '}
                            <span style={{ color: newTier.color }} className="text-xs ml-1">
                              ({newTier.name})
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-lg font-mono-tabular font-bold ${
                          delta > 0
                            ? 'text-[#3FB97C]'
                            : delta < 0
                              ? 'text-[#E05252]'
                              : 'text-[#F3EFE6]/60'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </>
                  );
                })()}
              </div>
            )}

            <p className="text-xs text-[#F3EFE6]/65 font-mono-tabular mb-6">
              Total plies: {activeMoves.length} · Full moves: {Math.ceil(activeMoves.length / 2)}
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              {mode.kind === 'online' && onlineGame && myOnlineColor ? (
                <button
                  type="button"
                  disabled={Boolean(player && onlineGame.rematchVotes.includes(player.id))}
                  onClick={() => onOnlineRematch(onlineGame.roomId)}
                  className="flex-1 py-2.5 px-4 rounded-md bg-[#D4A853] hover:bg-[#DFB766] disabled:opacity-60 text-[#111315] text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  {player && onlineGame.rematchVotes.includes(player.id)
                    ? `Rematch Requested (${onlineGame.rematchVotes.length}/2)`
                    : onlineGame.rematchVotes.length > 0
                      ? 'Accept Rematch (1/2)'
                      : 'Play Again'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetOfflineGame}
                  className="flex-1 py-2.5 px-4 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Play Again
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="py-2.5 px-4 rounded-md bg-[#252930] hover:bg-[#303640] text-xs font-medium text-[#F3EFE6] whitespace-nowrap cursor-pointer"
              >
                Review Board
              </button>

              <button
                type="button"
                onClick={onExitArena}
                className="w-full py-2 text-xs text-[#F3EFE6]/65 hover:text-[#F3EFE6] cursor-pointer"
              >
                Return to Salon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface HudMeta {
  handle: string;
  elo: number | null;
  connected: boolean;
  timeMs: number | null;
  timed: boolean;
  isActiveTurn: boolean;
  captured: PieceSymbol[];
  advantage: number;
}

const PlayerHudBar: React.FC<{ meta: HudMeta; color: 'w' | 'b'; thinking?: boolean }> = ({
  meta,
  color,
  thinking,
}) => {
  const lowTime = meta.timed && meta.timeMs !== null && meta.timeMs <= 10_000 && meta.isActiveTurn;

  return (
    <div
      className={`px-3.5 py-2 rounded-md border flex items-center justify-between gap-3 transition-colors ${
        meta.isActiveTurn
          ? 'bg-[#1F2329] border-[#D4A853]/50'
          : 'bg-[#171A1E] border-white/8'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {meta.elo !== null ? (
          <RankCrestSvg elo={meta.elo} size={22} className="shrink-0" />
        ) : (
          <span
            className={`w-4 h-4 rounded-sm border shrink-0 ${
              color === 'w' ? 'bg-[#F5EFE3] border-white/30' : 'bg-[#1E2126] border-white/25'
            }`}
          />
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#F3EFE6] truncate">{meta.handle}</span>
            {meta.elo !== null && (
              <span className="text-xs font-mono-tabular text-[#F3EFE6]/60">{meta.elo}</span>
            )}
            {thinking && (
              <span className="text-[11px] text-[#D4A853]">Thinking...</span>
            )}
            {!meta.connected && (
              <span className="text-[11px] text-[#E05252]">Reconnecting</span>
            )}
          </div>

          {/* Captured pieces & material advantage */}
          <div className="flex items-center gap-1 h-4 mt-0.5">
            {meta.captured.map((piece, idx) => (
              <div key={`${piece}-${idx}`} className="w-3.5 h-3.5 opacity-85">
                <ChessPieceSvg type={piece} color={color === 'w' ? 'b' : 'w'} />
              </div>
            ))}
            {meta.advantage > 0 && (
              <span className="text-[11px] font-mono-tabular text-[#F3EFE6]/60 ml-1">
                +{meta.advantage}
              </span>
            )}
          </div>
        </div>
      </div>

      {meta.timed && meta.timeMs !== null && (
        <div
          className={`px-3 py-1 rounded font-mono-tabular text-base font-semibold tracking-tight shrink-0 ${
            lowTime
              ? 'bg-[#E05252]/20 text-[#E05252] border border-[#E05252]/40'
              : meta.isActiveTurn
                ? 'bg-[#D4A853]/15 text-[#F3EFE6] border border-[#D4A853]/40'
                : 'bg-[#111315] text-[#F3EFE6]/65 border border-white/6'
          }`}
        >
          {formatClock(meta.timeMs)}
        </div>
      )}
    </div>
  );
};
