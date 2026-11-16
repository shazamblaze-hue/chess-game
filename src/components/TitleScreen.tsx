import React, { useEffect, useState } from 'react';
import { ArrowRight, Cpu, Globe, ShieldCheck, Users } from 'lucide-react';
import { PublicPlayer, getRankTier } from '../shared/chessTypes';
import { RankCrestSvg } from './RankCrestSvg';

interface TitleScreenProps {
  player: PublicPlayer | null;
  onlineCount: number;
  activeGamesCount: number;
  onEnterArena: (initialTab?: 'play' | 'leaderboard') => void;
  onQuickEngine: () => void;
  onQuickLocal: () => void;
  onOpenAuth: () => void;
  onRegisterHandle: (handle: string) => Promise<string | null>;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  player,
  onlineCount,
  activeGamesCount,
  onEnterArena,
  onQuickEngine,
  onQuickLocal,
  onOpenAuth,
  onRegisterHandle,
}) => {
  const [imgError, setImgError] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (player) {
          onEnterArena('play');
        } else {
          document.getElementById('title-handle-input')?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player, onEnterArena]);

  const handleQuickClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleInput.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const err = await onRegisterHandle(handleInput.trim());
    setSubmitting(false);
    if (err) {
      setErrorMsg(err);
    } else {
      onEnterArena('play');
    }
  };

  const tier = player ? getRankTier(player.elo) : null;

  return (
    <div className="relative w-full min-h-screen bg-[#111315] text-[#F3EFE6] overflow-hidden flex flex-col justify-between">
      {/* Atmospheric Illustrated Key-Art Backdrop with CSS fallback */}
      <div className="absolute inset-0 pointer-events-none">
        {!imgError ? (
          <img
            src="/src/assets/images/chess_salon_backdrop_1794826492456.jpg"
            alt="Walnut chessboard in a dimly lit grandmaster study"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center opacity-75"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at 75% 40%, rgba(212,168,83,0.16), transparent 45%), linear-gradient(125deg, #111315 0%, #1B1E23 55%, #231D17 100%)',
            }}
          />
        )}
        {/* Measured contrast scrim preserving 35%+ calm left negative space */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(95deg, rgba(17,19,21,0.96) 0%, rgba(17,19,21,0.88) 42%, rgba(17,19,21,0.45) 75%, rgba(17,19,21,0.68) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(17,19,21,0.45) 0%, transparent 25%, transparent 72%, rgba(17,19,21,0.92) 100%)',
          }}
        />
      </div>

      {/* Minimal Top Perimeter Telemetry */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 pt-6">
        <div className="flex items-center gap-3">
          <img
            src="/src/assets/images/chess_emblem_crest_1794826492045.jpg"
            alt="Kingsgate crest"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded object-cover border border-white/15"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="text-xs font-medium tracking-wide text-[#F3EFE6]/70">
            Online Arena
            <span className="mx-2 text-[#F3EFE6]/30" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#F3EFE6]">{onlineCount}</span> Online
            <span className="mx-2 text-[#F3EFE6]/30" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#F3EFE6]">{activeGamesCount}</span> Live Boards
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onEnterArena('leaderboard')}
            className="text-xs font-medium text-[#F3EFE6]/80 hover:text-[#D4A853] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Rankings Ladder
          </button>
          <button
            type="button"
            onClick={onOpenAuth}
            className="text-xs font-medium text-[#F3EFE6]/80 hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {player ? 'Switch Account' : 'Sign In'}
          </button>
        </div>
      </header>

      {/* Main Title Lockup & Action Zone */}
      <main className="relative z-10 px-6 sm:px-10 py-10 my-auto max-w-2xl">
        {/* Bespoke Inline SVG Chess Title Lockup */}
        <div className="flex items-center gap-3.5 mb-5">
          <svg width="42" height="42" viewBox="0 0 44 44" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="41" height="41" rx="6" fill="#1A1D21" stroke="#D4A853" strokeOpacity="0.45" strokeWidth="1.5" />
            <path
              d="M13 31H31V33.5H13V31ZM14.5 28.5L12 16L17.5 20.5L22 12L26.5 20.5L32 16L29.5 28.5H14.5Z"
              fill="#D4A853"
            />
            <circle cx="22" cy="10" r="1.7" fill="#F3EFE6" />
          </svg>
          <div>
            <p className="text-xs font-medium text-[#D4A853] tracking-wide">
              Ranked Competitive Chess
            </p>
          </div>
        </div>

        <h1
          className="font-display text-5xl sm:text-6xl font-semibold tracking-tight text-[#F3EFE6] leading-[1.06] mb-4"
          style={{ textWrap: 'balance' }}
        >
          Kingsgate Chess
        </h1>

        <p className="text-base sm:text-lg text-[#F3EFE6]/72 leading-relaxed max-w-lg mb-8">
          Server-authoritative multiplayer chess with live matchmaking, private friend rooms, tiered AI sparring, and a competitive Elo ladder.
        </p>

        {/* Signed-in Player Card OR Handle Entry */}
        {player && tier ? (
          <div className="mb-7 max-w-md bg-[#1A1D21]/92 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <RankCrestSvg elo={player.elo} size={28} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F3EFE6] truncate">{player.handle}</span>
                    {player.hasPasscode && (
                      <ShieldCheck className="w-3.5 h-3.5 text-[#D4A853] shrink-0" aria-label="Passcode protected" />
                    )}
                  </div>
                  <div className="text-xs text-[#F3EFE6]/65 font-mono-tabular">
                    <span style={{ color: tier.color }}>{tier.name}</span>
                    <span className="mx-1.5 text-[#F3EFE6]/30">·</span>
                    <span>{player.elo} Elo</span>
                    <span className="mx-1.5 text-[#F3EFE6]/30">·</span>
                    <span>{player.wins}W {player.losses}L {player.draws}D</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenAuth}
                className="text-xs text-[#F3EFE6]/65 hover:text-[#F3EFE6] underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Account
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleQuickClaim} className="mb-7 max-w-md">
            <label htmlFor="title-handle-input" className="block text-xs font-medium text-[#F3EFE6]/70 mb-2">
              Choose your player handle to enter online rankings
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="title-handle-input"
                type="text"
                maxLength={20}
                value={handleInput}
                onChange={(e) => {
                  setHandleInput(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="e.g. Kasparov99"
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-md bg-[#1A1D21] border border-white/15 text-sm text-[#F3EFE6] placeholder-[#F3EFE6]/35 focus:outline-none focus:border-[#D4A853]"
              />
              <button
                type="submit"
                disabled={submitting || !handleInput.trim()}
                className="px-5 py-2.5 rounded-md bg-[#D4A853] hover:bg-[#DFB766] disabled:opacity-45 text-[#111315] font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {submitting ? 'Entering...' : 'Claim Handle'}
              </button>
            </div>
            {errorMsg && <p className="mt-2 text-xs text-[#E05252]">{errorMsg}</p>}
          </form>
        )}

        {/* Primary & Secondary Launch Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onEnterArena('play')}
            className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg"
          >
            <Globe className="w-4 h-4" />
            <span>{player ? 'Enter Multiplayer Salon' : 'Browse Live Lobby'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onQuickEngine}
            className="inline-flex items-center gap-2 px-4 py-3.5 rounded-md bg-[#1A1D21]/90 hover:bg-[#24282E] border border-white/15 text-[#F3EFE6] font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cpu className="w-4 h-4 text-[#D4A853]" />
            <span>Play vs. Engine</span>
          </button>

          <button
            type="button"
            onClick={onQuickLocal}
            className="inline-flex items-center gap-2 px-4 py-3.5 rounded-md bg-[#1A1D21]/90 hover:bg-[#24282E] border border-white/15 text-[#F3EFE6] font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4 text-[#F3EFE6]/75" />
            <span>Pass & Play</span>
          </button>
        </div>
      </main>

      {/* Single Flat Control-Hint Line */}
      <footer className="relative z-10 px-6 sm:px-10 pb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[#F3EFE6]/55 font-mono-tabular">
          Click or Drag to Move · Arrow Keys Review · F Flip Board · M Mute Audio · Enter Start
        </p>
      </footer>
    </div>
  );
};
