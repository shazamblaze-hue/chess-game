import React, { useMemo, useRef, useState } from 'react';
import { Chess, PieceSymbol, Square } from 'chess.js';
import { ChessPieceSvg } from './ChessPieceSvg';

export type BoardThemeId = 'walnut' | 'emerald' | 'slate';

export const BOARD_THEMES: Record<
  BoardThemeId,
  {
    name: string;
    light: string;
    dark: string;
    coordOnLight: string;
    coordOnDark: string;
    lastMoveLight: string;
    lastMoveDark: string;
    selected: string;
  }
> = {
  walnut: {
    name: 'Walnut Classic',
    light: '#EADBC8',
    dark: '#825B3E',
    coordOnLight: '#6F4B30',
    coordOnDark: '#E6D5BE',
    lastMoveLight: '#D8C27A',
    lastMoveDark: '#A5863C',
    selected: 'rgba(212, 168, 83, 0.55)',
  },
  emerald: {
    name: 'Tournament Felt',
    light: '#EEEED2',
    dark: '#5C7E55',
    coordOnLight: '#496643',
    coordOnDark: '#E5E9CC',
    lastMoveLight: '#D6D97C',
    lastMoveDark: '#8EA24E',
    selected: 'rgba(212, 168, 83, 0.58)',
  },
  slate: {
    name: 'Midnight Slate',
    light: '#DCE1E8',
    dark: '#4D5C6E',
    coordOnLight: '#3C4959',
    coordOnDark: '#CFD6DF',
    lastMoveLight: '#BCC79E',
    lastMoveDark: '#71856F',
    selected: 'rgba(212, 168, 83, 0.55)',
  },
};

interface ChessBoardProps {
  fen: string;
  orientation: 'w' | 'b';
  interactiveColors: ('w' | 'b')[];
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  theme: BoardThemeId;
  onMove: (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation,
  interactiveColors,
  disabled = false,
  lastMove = null,
  theme,
  onMove,
}) => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
    color: 'w' | 'b';
  } | null>(null);
  const [dragState, setDragState] = useState<{
    from: Square;
    piece: { type: PieceSymbol; color: 'w' | 'b' };
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const boardMatrix = useMemo(() => chess.board(), [chess]);
  const turn = chess.turn();
  const inCheck = chess.inCheck();

  const checkedKingSquare = useMemo(() => {
    if (!inCheck) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardMatrix[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return `${FILES[c]}${RANKS[r]}` as Square;
        }
      }
    }
    return null;
  }, [boardMatrix, inCheck, turn]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare || disabled || !interactiveColors.includes(turn)) {
      return new Map<Square, { isCapture: boolean; isPromotion: boolean }>();
    }
    const moves = chess.moves({ square: selectedSquare, verbose: true });
    const map = new Map<Square, { isCapture: boolean; isPromotion: boolean }>();
    for (const m of moves) {
      map.set(m.to, {
        isCapture: Boolean(m.captured) || m.flags.includes('e'),
        isPromotion: Boolean(m.promotion),
      });
    }
    return map;
  }, [chess, selectedSquare, disabled, interactiveColors, turn]);

  const palette = BOARD_THEMES[theme];

  const displaySquares = useMemo(() => {
    const rows = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const cols = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const squares: {
      rowIdx: number;
      colIdx: number;
      visualRow: number;
      visualCol: number;
      square: Square;
      isLight: boolean;
      piece: { type: PieceSymbol; color: 'w' | 'b' } | null;
    }[] = [];

    rows.forEach((r, vr) => {
      cols.forEach((c, vc) => {
        const sq = `${FILES[c]}${RANKS[r]}` as Square;
        const p = boardMatrix[r][c];
        squares.push({
          rowIdx: r,
          colIdx: c,
          visualRow: vr,
          visualCol: vc,
          square: sq,
          isLight: (r + c) % 2 === 0,
          piece: p ? { type: p.type, color: p.color } : null,
        });
      });
    });

    return squares;
  }, [boardMatrix, orientation]);

  const attemptMove = (from: Square, to: Square) => {
    const moves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (moves.length === 0) return false;
    const hasPromotion = moves.some((m) => Boolean(m.promotion));
    if (hasPromotion) {
      setPendingPromotion({ from, to, color: turn });
      setSelectedSquare(null);
      return true;
    }
    setSelectedSquare(null);
    onMove(from, to);
    return true;
  };

  const squareFromClientPoint = (clientX: number, clientY: number): Square | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const vc = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const vr = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (vc < 0 || vc > 7 || vr < 0 || vr > 7) return null;
    const r = orientation === 'w' ? vr : 7 - vr;
    const c = orientation === 'w' ? vc : 7 - vc;
    return `${FILES[c]}${RANKS[r]}` as Square;
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    sq: Square,
    piece: { type: PieceSymbol; color: 'w' | 'b' } | null
  ) => {
    if (disabled || pendingPromotion) return;
    const canControlTurn = interactiveColors.includes(turn);

    if (selectedSquare && legalTargets.has(sq)) {
      attemptMove(selectedSquare, sq);
      return;
    }

    if (piece && piece.color === turn && canControlTurn) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setSelectedSquare(sq);
      setDragState({
        from: sq,
        piece,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
      });
    } else {
      setSelectedSquare(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const active = dragState.active || dx * dx + dy * dy > 25;
    setDragState({
      ...dragState,
      x: e.clientX,
      y: e.clientY,
      active,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    if (dragState.active) {
      const targetSq = squareFromClientPoint(e.clientX, e.clientY);
      if (targetSq && targetSq !== dragState.from) {
        attemptMove(dragState.from, targetSq);
      }
    }
    setDragState(null);
  };

  return (
    <div className="relative select-none">
      <div
        ref={boardRef}
        className="relative grid grid-cols-8 grid-rows-8 w-full aspect-square rounded-md overflow-hidden border border-white/15 shadow-2xl touch-none"
        role="grid"
        aria-label="Chessboard"
      >
        {displaySquares.map((cell) => {
          const isSelected = selectedSquare === cell.square;
          const isLastMove = lastMove?.from === cell.square || lastMove?.to === cell.square;
          const targetInfo = legalTargets.get(cell.square);
          const isCheckedKing = checkedKingSquare === cell.square;
          const isBeingDragged = dragState?.active && dragState.from === cell.square;

          let bg = cell.isLight ? palette.light : palette.dark;
          if (isLastMove) {
            bg = cell.isLight ? palette.lastMoveLight : palette.lastMoveDark;
          }

          const coordColor = cell.isLight ? palette.coordOnLight : palette.coordOnDark;
          const showRank = cell.visualCol === 0;
          const showFile = cell.visualRow === 7;

          return (
            <button
              key={cell.square}
              type="button"
              onPointerDown={(e) => handlePointerDown(e, cell.square, cell.piece)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setDragState(null)}
              aria-label={`Square ${cell.square}${cell.piece ? ` ${cell.piece.color === 'w' ? 'white' : 'black'} ${cell.piece.type}` : ''}`}
              className="relative flex items-center justify-center min-w-[44px] min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853]"
              style={{ backgroundColor: bg }}
            >
              {isSelected && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundColor: palette.selected }}
                />
              )}

              {isCheckedKing && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, rgba(224,82,82,0.88) 0%, rgba(224,82,82,0.45) 55%, rgba(224,82,82,0) 78%)',
                  }}
                />
              )}

              {showRank && (
                <span
                  className="absolute top-0.5 left-1 text-[10px] font-mono-tabular font-semibold leading-none pointer-events-none opacity-85"
                  style={{ color: coordColor }}
                >
                  {cell.square[1]}
                </span>
              )}

              {showFile && (
                <span
                  className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-semibold leading-none pointer-events-none opacity-85"
                  style={{ color: coordColor }}
                >
                  {cell.square[0]}
                </span>
              )}

              {cell.piece && !isBeingDragged && (
                <div className="w-[84%] h-[84%] transition-transform duration-150 ease-out pointer-events-none">
                  <ChessPieceSvg type={cell.piece.type} color={cell.piece.color} />
                </div>
              )}

              {targetInfo && !targetInfo.isCapture && (
                <span className="absolute w-[28%] h-[28%] rounded-full bg-black/28 pointer-events-none" />
              )}

              {targetInfo && targetInfo.isCapture && (
                <span className="absolute inset-[6%] rounded-full border-[4px] border-black/30 pointer-events-none" />
              )}
            </button>
          );
        })}

        {/* Pawn Promotion Overlay */}
        {pendingPromotion && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-[#1A1D21] border border-white/15 rounded-lg p-4 shadow-2xl">
              <p className="text-xs font-medium text-[#F3EFE6]/75 mb-3 text-center">
                Choose promotion piece
              </p>
              <div className="flex items-center gap-2">
                {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                  <button
                    key={promo}
                    type="button"
                    onClick={() => {
                      const { from, to } = pendingPromotion;
                      setPendingPromotion(null);
                      onMove(from, to, promo);
                    }}
                    className="w-14 h-14 p-2 rounded-md bg-[#252930] hover:bg-[#D4A853]/25 border border-white/10 hover:border-[#D4A853] transition-colors flex items-center justify-center"
                    aria-label={`Promote to ${promo}`}
                  >
                    <ChessPieceSvg type={promo} color={pendingPromotion.color} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                  className="ml-1 px-3 py-2 text-xs text-[#F3EFE6]/70 hover:text-[#F3EFE6] rounded-md hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dragging ghost piece */}
      {dragState?.active && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardRef.current ? boardRef.current.clientWidth / 8 : 64,
            height: boardRef.current ? boardRef.current.clientWidth / 8 : 64,
            transform: `translate3d(${dragState.x - (boardRef.current ? boardRef.current.clientWidth / 16 : 32)}px, ${dragState.y - (boardRef.current ? boardRef.current.clientWidth / 16 : 32)}px, 0) scale(1.12)`,
          }}
        >
          <ChessPieceSvg type={dragState.piece.type} color={dragState.piece.color} />
        </div>
      )}
    </div>
  );
};
