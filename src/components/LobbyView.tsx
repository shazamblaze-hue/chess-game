import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  Eye,
  Plus,
  Swords,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  LobbySnapshot,
  MatchRecord,
  OpenChallenge,
  PublicPlayer,
  RANK_TIERS,
  TIME_CONTROLS,
  TimeControlId,
  getRankTier,
} from '../shared/chessTypes';
import { BOT_PROFILES, BotDifficulty } from '../engine/chessBot';
import { RankCrestSvg } from './RankCrestSvg';

interface LobbyViewProps {
  initialTab: 'play' | 'leaderboard' | 'history';
  player: PublicPlayer | null;
  wsConnected: boolean;
  lobby: LobbySnapshot;
  inQueue: boolean;
  queueTimeControl: TimeControlId | null;
  activeChallenge: OpenChallenge | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onBackToTitle: () => void;
  onOpenAuth: () => void;
  onJoinQueue: (tc: TimeControlId) => void;
  onLeaveQueue: () => void;
  onCreateChallenge: (params: {
    timeControl: TimeControlId;
    rated: boolean;
    hostColor: 'w' | 'b' | 'random';
    isPrivate: boolean;
  }) => void;
  onCancelChallenge: (challengeId: string) => void;
  onAcceptChallenge: (challengeId: string) => void;
  onJoinRoomCode: (code: string) => void;
  onStartEngineGame: (difficulty: BotDifficulty, color: 'w' | 'b' | 'random') => void;
  onStartLocalGame: (timeControl: TimeControlId | null) => void;
  onReviewMatch: (match: MatchRecord) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  initialTab,
  player,
  wsConnected,
  lobby,
  inQueue,
  queueTimeControl,
  activeChallenge,
  isMuted,
  onToggleMute,
  onBackToTitle,
  onOpenAuth,
  onJoinQueue,
  onLeaveQueue,
  onCreateChallenge,
  onCancelChallenge,
  onAcceptChallenge,
  onJoinRoomCode,
  onStartEngineGame,
  onStartLocalGame,
  onReviewMatch,
}) => {
  const [tab, setTab] = useState<'play' | 'leaderboard' | 'history'>(initialTab);
  const [selectedTc, setSelectedTc] = useState<TimeControlId>('blitz_3_2');
  const [challengeTc, setChallengeTc] = useState<TimeControlId>('blitz_3_2');
  const [challengeRated, setChallengeRated] = useState(true);
  const [challengeColor, setChallengeColor] = useState<'w' | 'b' | 'random'>('random');
  const [challengePrivate, setChallengePrivate] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [queueElapsedSec, setQueueElapsedSec] = useState(0);

  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(1200);
  const [botColor, setBotColor] = useState<'w' | 'b' | 'random'>('w');
  const [localTc, setLocalTc] = useState<TimeControlId | 'untimed'>('untimed');

  const [leaderboardPlayers, setLeaderboardPlayers] = useState<PublicPlayer[]>(lobby.leaderboardTop);
  const [recentMatches, setRecentMatches] = useState<MatchRecord[]>([]);
  const [personalMatches, setPersonalMatches] = useState<MatchRecord[]>([]);
  const [inspectedPlayer, setInspectedPlayer] = useState<{
    player: PublicPlayer;
    matches: MatchRecord[];
  } | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (lobby.leaderboardTop.length > 0) {
      setLeaderboardPlayers(lobby.leaderboardTop);
    }
  }, [lobby.leaderboardTop]);

  useEffect(() => {
    if (!inQueue) {
      setQueueElapsedSec(0);
      return;
    }
    const id = window.setInterval(() => {
      setQueueElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [inQueue]);

  useEffect(() => {
    if (tab === 'leaderboard') {
      fetch('/api/leaderboard?limit=50')
        .then((r) => r.json())
        .then((data: { players?: PublicPlayer[]; recentMatches?: MatchRecord[] }) => {
          if (data.players) setLeaderboardPlayers(data.players);
          if (data.recentMatches) setRecentMatches(data.recentMatches);
        })
        .catch(() => {});
    } else if (tab === 'history' && player) {
      fetch(`/api/players/${player.id}/matches`)
        .then((r) => r.json())
        .then((data: { matches?: MatchRecord[] }) => {
          if (data.matches) setPersonalMatches(data.matches);
        })
        .catch(() => {});
    }
  }, [tab, player]);

  const inspectPlayerProfile = async (target: PublicPlayer) => {
    try {
      const res = await fetch(`/api/players/${target.id}/matches`);
      const data = (await res.json()) as { player?: PublicPlayer; matches?: MatchRecord[] };
      if (data.player) {
        setInspectedPlayer({ player: data.player, matches: data.matches ?? [] });
      }
    } catch {
      // ignore network error
    }
  };

  const handleCopyInvite = () => {
    if (!activeChallenge) return;
    const url = `${window.location.origin}/?room=${activeChallenge.roomId}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const tier = player ? getRankTier(player.elo) : null;

  return (
    <div className="min-h-screen w-full bg-[#111315] text-[#F3EFE6] flex flex-col">
      {/* Compact In-Game Salon Bar */}
      <header className="border-b border-white/8 bg-[#16191D]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={onBackToTitle}
              className="inline-flex items-center gap-2 text-xs font-medium text-[#F3EFE6]/65 hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Title</span>
            </button>
            <span className="h-4 w-px bg-white/10" aria-hidden="true" />
            <span className="font-display text-lg font-semibold tracking-tight text-[#F3EFE6] whitespace-nowrap shrink-0">
              Kingsgate Salon
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-[#F3EFE6]/55 whitespace-nowrap">
              {wsConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#3FB97C]" />
                  <span className="font-mono-tabular">{lobby.onlineCount} online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#E05252]" />
                  <span>Connecting</span>
                </>
              )}
            </span>
          </div>

          {/* Segmented Navigation Tabs */}
          <nav className="flex items-center gap-1 p-1 bg-[#111315] rounded-md border border-white/6">
            {(
              [
                { id: 'play', label: 'Play' },
                { id: 'leaderboard', label: 'Rankings' },
                { id: 'history', label: 'History' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === item.id
                    ? 'bg-[#252930] text-[#F3EFE6]'
                    : 'text-[#F3EFE6]/60 hover:text-[#F3EFE6]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-2 rounded-md text-[#F3EFE6]/65 hover:text-[#F3EFE6] hover:bg-white/5 transition-colors cursor-pointer"
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {player && tier ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[#1D2025] hover:bg-[#252930] border border-white/10 transition-colors cursor-pointer"
              >
                <RankCrestSvg elo={player.elo} size={18} />
                <span className="text-xs font-semibold text-[#F3EFE6] max-w-[110px] truncate">
                  {player.handle}
                </span>
                <span className="text-xs font-mono-tabular text-[#D4A853]">{player.elo}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-2 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-7">
        {tab === 'play' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Left Column: Online Matchmaking & Private Room */}
            <div className="lg:col-span-7 space-y-6">
              {!player && (
                <div className="bg-[#1A1D21] border border-[#D4A853]/35 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#F3EFE6]">Claim a handle to play ranked online</h2>
                    <p className="text-xs text-[#F3EFE6]/65 mt-1">
                      Online matchmaking and the Elo leaderboard require a player handle. Solo Engine and Pass & Play are always available.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-4 py-2 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Claim Handle
                  </button>
                </div>
              )}

              {/* Quick Ranked Matchmaking */}
              <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
                      Ranked Online Matchmaking
                    </h2>
                    <p className="text-xs text-[#F3EFE6]/60 mt-1">
                      Paired by Elo rating · Server-authoritative clocks and move validation
                    </p>
                  </div>
                  <span className="text-xs font-mono-tabular text-[#F3EFE6]/55">
                    {lobby.activeGamesCount} active boards
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {(Object.keys(TIME_CONTROLS) as TimeControlId[]).map((tcId) => {
                    const tc = TIME_CONTROLS[tcId];
                    const active = selectedTc === tcId;
                    const qCount = lobby.queueCounts[tcId] ?? 0;
                    return (
                      <button
                        key={tcId}
                        type="button"
                        disabled={inQueue}
                        onClick={() => setSelectedTc(tcId)}
                        className={`p-3.5 rounded-md border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#252930] border-[#D4A853] text-[#F3EFE6]'
                            : 'bg-[#131518] border-white/8 text-[#F3EFE6]/75 hover:border-white/20'
                        } disabled:opacity-60`}
                      >
                        <div className="text-lg font-mono-tabular font-semibold">{tc.shortLabel}</div>
                        <div className="text-xs text-[#F3EFE6]/65 mt-0.5">
                          {tc.category}
                          <span className="mx-1.5 text-[#F3EFE6]/30">·</span>
                          <span className="font-mono-tabular">{qCount} waiting</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {inQueue ? (
                  <div className="flex items-center justify-between gap-4 p-4 rounded-md bg-[#131518] border border-[#D4A853]/40">
                    <div>
                      <p className="text-sm font-semibold text-[#F3EFE6]">
                        Searching {queueTimeControl ? TIME_CONTROLS[queueTimeControl].label : ''} queue...
                      </p>
                      <p className="text-xs font-mono-tabular text-[#F3EFE6]/60 mt-0.5">
                        Elapsed: {queueElapsedSec}s · Expanding rating window automatically
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onLeaveQueue}
                      className="px-4 py-2 rounded-md border border-[#E05252]/40 text-[#E05252] hover:bg-[#E05252]/10 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Cancel Search
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!player || !wsConnected}
                    onClick={() => onJoinQueue(selectedTc)}
                    className="w-full py-3 rounded-md bg-[#D4A853] hover:bg-[#DFB766] disabled:opacity-45 text-[#111315] font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Swords className="w-4 h-4" />
                    <span>Find Ranked Match ({TIME_CONTROLS[selectedTc].label})</span>
                  </button>
                )}
              </section>

              {/* Create Challenge or Join Private Room */}
              <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-6">
                <h2 className="font-display text-xl font-semibold text-[#F3EFE6] mb-1">
                  Challenge a Friend or Open Table
                </h2>
                <p className="text-xs text-[#F3EFE6]/60 mb-5">
                  Host a public challenge in the lobby or generate a private room code to share directly.
                </p>

                {activeChallenge ? (
                  <div className="p-4 rounded-md bg-[#131518] border border-[#D4A853]/45 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#F3EFE6]/60">
                          {activeChallenge.isPrivate ? 'Private Invite Room' : 'Public Lobby Challenge'}
                          <span className="mx-1.5">·</span>
                          {TIME_CONTROLS[activeChallenge.timeControl].label}
                          <span className="mx-1.5">·</span>
                          {activeChallenge.rated ? 'Rated' : 'Casual'}
                        </p>
                        <p className="text-2xl font-mono-tabular font-bold tracking-widest text-[#D4A853] mt-1">
                          {activeChallenge.roomId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyInvite}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#252930] hover:bg-[#2F343C] text-xs font-medium text-[#F3EFE6] cursor-pointer"
                        >
                          {copiedCode ? <Check className="w-3.5 h-3.5 text-[#3FB97C]" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedCode ? 'Link Copied' : 'Copy Invite Link'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancelChallenge(activeChallenge.id)}
                          className="px-3.5 py-2 rounded-md border border-white/12 hover:bg-white/5 text-xs font-medium text-[#F3EFE6]/75 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[#F3EFE6]/55">
                      Waiting for an opponent to join room {activeChallenge.roomId}...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-[#F3EFE6]/60 mb-1.5">Time Control</label>
                        <select
                          value={challengeTc}
                          onChange={(e) => setChallengeTc(e.target.value as TimeControlId)}
                          className="w-full px-3 py-2 rounded-md bg-[#131518] border border-white/12 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4A853]"
                        >
                          {(Object.keys(TIME_CONTROLS) as TimeControlId[]).map((tcId) => (
                            <option key={tcId} value={tcId}>
                              {TIME_CONTROLS[tcId].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-[#F3EFE6]/60 mb-1.5">Your Side</label>
                        <select
                          value={challengeColor}
                          onChange={(e) => setChallengeColor(e.target.value as 'w' | 'b' | 'random')}
                          className="w-full px-3 py-2 rounded-md bg-[#131518] border border-white/12 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4A853]"
                        >
                          <option value="random">Random Color</option>
                          <option value="w">White</option>
                          <option value="b">Black</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-[#F3EFE6]/60 mb-1.5">Match Type</label>
                        <div className="flex items-center gap-1 p-1 bg-[#131518] border border-white/10 rounded-md">
                          <button
                            type="button"
                            onClick={() => setChallengeRated(true)}
                            className={`flex-1 py-1 text-xs rounded transition-colors cursor-pointer ${
                              challengeRated ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/55'
                            }`}
                          >
                            Rated
                          </button>
                          <button
                            type="button"
                            onClick={() => setChallengeRated(false)}
                            className={`flex-1 py-1 text-xs rounded transition-colors cursor-pointer ${
                              !challengeRated ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/55'
                            }`}
                          >
                            Casual
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs text-[#F3EFE6]/75 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={challengePrivate}
                          onChange={(e) => setChallengePrivate(e.target.checked)}
                          className="accent-[#D4A853]"
                        />
                        <span>Private room (invite link / code only)</span>
                      </label>

                      <button
                        type="button"
                        disabled={!player || !wsConnected}
                        onClick={() =>
                          onCreateChallenge({
                            timeControl: challengeTc,
                            rated: challengeRated,
                            hostColor: challengeColor,
                            isPrivate: challengePrivate,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#252930] hover:bg-[#303640] disabled:opacity-45 border border-white/12 text-xs font-semibold text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#D4A853]" />
                        <span>{challengePrivate ? 'Create Private Room' : 'Post Open Challenge'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Join by Room Code */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (roomCodeInput.trim()) onJoinRoomCode(roomCodeInput.trim().toUpperCase());
                  }}
                  className="mt-5 pt-5 border-t border-white/8 flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={8}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter 6-char room code (e.g. K7M4Q2)"
                    className="flex-1 min-w-0 px-3 py-2 rounded-md bg-[#131518] border border-white/12 text-xs font-mono-tabular uppercase tracking-wider text-[#F3EFE6] placeholder-[#F3EFE6]/35 focus:outline-none focus:border-[#D4A853]"
                  />
                  <button
                    type="submit"
                    disabled={!player || !wsConnected || !roomCodeInput.trim()}
                    className="px-4 py-2 rounded-md bg-[#252930] hover:bg-[#303640] disabled:opacity-45 border border-white/12 text-xs font-semibold text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Join Room
                  </button>
                </form>
              </section>
            </div>

            {/* Secondary Right Column: Open Lobby Challenges + Solo Engine + Pass & Play */}
            <div className="lg:col-span-5 space-y-6">
              {/* Live Open Challenges */}
              <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-semibold text-[#F3EFE6]">Open Challenges</h2>
                  <span className="text-xs font-mono-tabular text-[#F3EFE6]/55">
                    {lobby.openChallenges.length} open
                  </span>
                </div>

                {lobby.openChallenges.length === 0 ? (
                  <p className="text-xs text-[#F3EFE6]/55 py-6 text-center border border-dashed border-white/10 rounded-md">
                    No open lobby challenges right now. Post a challenge or join the ranked queue.
                  </p>
                ) : (
                  <div className="divide-y divide-white/8">
                    {lobby.openChallenges.map((ch) => {
                      const isMine = player?.id === ch.hostId;
                      return (
                        <div key={ch.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <RankCrestSvg elo={ch.hostElo} size={20} className="shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#F3EFE6] truncate">
                                {ch.hostHandle}
                              </div>
                              <div className="text-xs text-[#F3EFE6]/55 font-mono-tabular">
                                {ch.hostElo} Elo · {TIME_CONTROLS[ch.timeControl].shortLabel} ·{' '}
                                {ch.rated ? 'Rated' : 'Casual'}
                              </div>
                            </div>
                          </div>
                          {isMine ? (
                            <button
                              type="button"
                              onClick={() => onCancelChallenge(ch.id)}
                              className="px-3 py-1.5 rounded border border-white/12 text-xs text-[#F3EFE6]/70 hover:text-[#F3EFE6] cursor-pointer"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!player}
                              onClick={() => onAcceptChallenge(ch.id)}
                              className="px-3.5 py-1.5 rounded bg-[#D4A853] hover:bg-[#DFB766] disabled:opacity-45 text-[#111315] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Accept
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Solo vs. Chess Engine */}
              <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-[#D4A853]" />
                  <h2 className="font-display text-lg font-semibold text-[#F3EFE6]">Solo Training Engine</h2>
                </div>
                <p className="text-xs text-[#F3EFE6]/60 mb-4">
                  Unrated offline sparring against alpha-beta search bots.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {BOT_PROFILES.map((bot) => (
                    <button
                      key={bot.elo}
                      type="button"
                      onClick={() => setBotDifficulty(bot.elo)}
                      className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                        botDifficulty === bot.elo
                          ? 'bg-[#252930] border-[#D4A853] text-[#F3EFE6]'
                          : 'bg-[#131518] border-white/8 text-[#F3EFE6]/75 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{bot.name}</span>
                        <span className="text-xs font-mono-tabular text-[#D4A853]">{bot.elo}</span>
                      </div>
                      <div className="text-[11px] text-[#F3EFE6]/55 mt-0.5">{bot.title}</div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 p-1 bg-[#131518] rounded-md border border-white/8">
                    {(
                      [
                        { id: 'w', label: 'White' },
                        { id: 'random', label: 'Random' },
                        { id: 'b', label: 'Black' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBotColor(opt.id)}
                        className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                          botColor === opt.id ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/55'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartEngineGame(botDifficulty, botColor)}
                    className="px-4 py-2 rounded-md bg-[#252930] hover:bg-[#303640] border border-white/15 text-xs font-semibold text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Start vs. Engine
                  </button>
                </div>
              </section>

              {/* Pass & Play */}
              <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#F3EFE6]/70" />
                    <h2 className="text-sm font-semibold text-[#F3EFE6]">Pass & Play</h2>
                  </div>
                  <p className="text-xs text-[#F3EFE6]/55 mt-0.5">Local two-player board</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={localTc}
                    onChange={(e) => setLocalTc(e.target.value as TimeControlId | 'untimed')}
                    aria-label="Local time control"
                    className="px-2.5 py-1.5 rounded bg-[#131518] border border-white/12 text-xs text-[#F3EFE6]"
                  >
                    <option value="untimed">Untimed</option>
                    <option value="blitz_3_2">3+2</option>
                    <option value="rapid_10_0">10+0</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onStartLocalGame(localTc === 'untimed' ? null : localTc)}
                    className="px-3.5 py-1.5 rounded-md bg-[#252930] hover:bg-[#303640] border border-white/12 text-xs font-semibold text-[#F3EFE6] whitespace-nowrap cursor-pointer"
                  >
                    Open Board
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="space-y-6">
            {/* Rank Tier Ladder Legend */}
            <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#D4A853]" />
                  <h2 className="font-display text-lg font-semibold text-[#F3EFE6]">Competitive Tiers</h2>
                </div>
                <span className="text-xs text-[#F3EFE6]/55">Starting rating: 1200 Elo (Gold)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {RANK_TIERS.map((t) => (
                  <div key={t.id} className="p-2.5 rounded-md bg-[#131518] border border-white/6 flex items-center gap-2.5">
                    <RankCrestSvg elo={t.minElo} size={22} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: t.color }}>
                        {t.name}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[#F3EFE6]/55">
                        {t.maxElo ? `${t.minElo}–${t.maxElo}` : `${t.minElo}+`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Global Leaderboard Table */}
              <section className="lg:col-span-8 bg-[#1A1D21] border border-white/8 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">Global Elo Standings</h2>
                  <span className="text-xs font-mono-tabular text-[#F3EFE6]/55">
                    {leaderboardPlayers.length} ranked players
                  </span>
                </div>

                {leaderboardPlayers.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[#F3EFE6]/55">
                    No players registered yet. Claim a handle and play the first ranked match!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/8 text-[11px] font-medium text-[#F3EFE6]/50">
                          <th className="py-3 pl-6 pr-3">Rank</th>
                          <th className="py-3 px-3">Player</th>
                          <th className="py-3 px-3">Division</th>
                          <th className="py-3 px-3 text-right">Elo</th>
                          <th className="py-3 px-3 text-right">Peak</th>
                          <th className="py-3 px-3 text-right">W / L / D</th>
                          <th className="py-3 pl-3 pr-6 text-right">Win %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6 text-sm">
                        {leaderboardPlayers.map((p, index) => {
                          const pTier = getRankTier(p.elo);
                          const winPct =
                            p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0;
                          const isMe = player?.id === p.id;
                          return (
                            <tr
                              key={p.id}
                              onClick={() => inspectPlayerProfile(p)}
                              className={`cursor-pointer transition-colors ${
                                isMe ? 'bg-[#D4A853]/10' : 'hover:bg-white/[0.03]'
                              }`}
                            >
                              <td className="py-3 pl-6 pr-3 font-mono-tabular text-xs text-[#F3EFE6]/65">
                                #{index + 1}
                              </td>
                              <td className="py-3 px-3 font-medium text-[#F3EFE6]">
                                <span className="truncate">{p.handle}</span>
                                {isMe && (
                                  <span className="ml-2 text-[11px] text-[#D4A853]">You</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <span className="inline-flex items-center gap-2 text-xs">
                                  <RankCrestSvg elo={p.elo} size={16} />
                                  <span style={{ color: pTier.color }}>{pTier.name}</span>
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#F3EFE6]">
                                {p.elo}
                              </td>
                              <td className="py-3 px-3 text-right font-mono-tabular text-xs text-[#F3EFE6]/60">
                                {p.peakElo}
                              </td>
                              <td className="py-3 px-3 text-right font-mono-tabular text-xs text-[#F3EFE6]/70">
                                {p.wins}/{p.losses}/{p.draws}
                              </td>
                              <td className="py-3 pl-3 pr-6 text-right font-mono-tabular text-xs text-[#F3EFE6]/70">
                                {p.gamesPlayed > 0 ? `${winPct}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Inspected Player or Recent Arena Matches */}
              <aside className="lg:col-span-4 space-y-6">
                {inspectedPlayer && (
                  <section className="bg-[#1A1D21] border border-[#D4A853]/30 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <RankCrestSvg elo={inspectedPlayer.player.elo} size={24} />
                        <div>
                          <h3 className="text-sm font-semibold text-[#F3EFE6]">
                            {inspectedPlayer.player.handle}
                          </h3>
                          <p className="text-xs font-mono-tabular text-[#D4A853]">
                            {inspectedPlayer.player.elo} Elo · Peak {inspectedPlayer.player.peakElo}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInspectedPlayer(null)}
                        className="text-xs text-[#F3EFE6]/55 hover:text-[#F3EFE6] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    {inspectedPlayer.matches.length === 0 ? (
                      <p className="text-xs text-[#F3EFE6]/55">No completed online matches yet.</p>
                    ) : (
                      <div className="divide-y divide-white/8">
                        {inspectedPlayer.matches.slice(0, 6).map((m) => (
                          <div key={m.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="text-[#F3EFE6] truncate">
                                {m.whiteHandle} vs {m.blackHandle}
                              </div>
                              <div className="text-[#F3EFE6]/50 font-mono-tabular">
                                {TIME_CONTROLS[m.timeControl].shortLabel} ·{' '}
                                {m.winner === 'draw' ? 'Draw' : m.winner === 'w' ? `${m.whiteHandle} won` : `${m.blackHandle} won`}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onReviewMatch(m)}
                              className="p-1.5 rounded hover:bg-white/5 text-[#D4A853] cursor-pointer"
                              title="Review board"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-5">
                  <h3 className="font-display text-lg font-semibold text-[#F3EFE6] mb-3">
                    Recent Arena Matches
                  </h3>
                  {recentMatches.length === 0 ? (
                    <p className="text-xs text-[#F3EFE6]/55">Completed online games will appear here.</p>
                  ) : (
                    <div className="divide-y divide-white/8">
                      {recentMatches.map((m) => (
                        <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs">
                            <div className="font-medium text-[#F3EFE6] truncate">
                              {m.whiteHandle} ({m.whiteEloBefore}) vs {m.blackHandle} ({m.blackEloBefore})
                            </div>
                            <div className="text-[#F3EFE6]/55 font-mono-tabular mt-0.5">
                              {TIME_CONTROLS[m.timeControl].shortLabel} ·{' '}
                              {m.winner === 'draw'
                                ? '½–½'
                                : m.winner === 'w'
                                  ? '1–0'
                                  : '0–1'}{' '}
                              · {m.endReason.replace(/_/g, ' ')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onReviewMatch(m)}
                            className="px-2.5 py-1 rounded bg-[#252930] hover:bg-[#303640] text-xs text-[#F3EFE6] shrink-0 cursor-pointer"
                          >
                            Review
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            {!player ? (
              <div className="bg-[#1A1D21] border border-white/8 rounded-lg p-10 text-center max-w-lg mx-auto">
                <User className="w-8 h-8 text-[#D4A853] mx-auto mb-3" />
                <h2 className="font-display text-xl font-semibold text-[#F3EFE6] mb-2">
                  No Player Profile Active
                </h2>
                <p className="text-sm text-[#F3EFE6]/60 mb-5">
                  Claim a handle or sign in to track your Elo progression and review your online match archive.
                </p>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-5 py-2.5 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] text-xs font-semibold cursor-pointer"
                >
                  Sign In / Register
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Player Summary & Elo Sparkline */}
                <section className="bg-[#1A1D21] border border-white/8 rounded-lg p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-5 flex items-center gap-4">
                    <RankCrestSvg elo={player.elo} size={48} className="shrink-0" />
                    <div>
                      <h2 className="font-display text-2xl font-semibold text-[#F3EFE6]">
                        {player.handle}
                      </h2>
                      <p className="text-sm font-mono-tabular mt-0.5">
                        <span style={{ color: getRankTier(player.elo).color }}>
                          {getRankTier(player.elo).name}
                        </span>
                        <span className="mx-2 text-[#F3EFE6]/30">·</span>
                        <span className="text-[#F3EFE6] font-semibold">{player.elo} Elo</span>
                      </p>
                      <p className="text-xs font-mono-tabular text-[#F3EFE6]/55 mt-1">
                        Peak {player.peakElo} · Best Streak {player.bestStreak} · {player.wins}W{' '}
                        {player.losses}L {player.draws}D
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="flex items-center justify-between text-xs text-[#F3EFE6]/55 mb-2">
                      <span>Elo Rating Trajectory</span>
                      <span className="font-mono-tabular">
                        {player.ratingHistory.length} checkpoints
                      </span>
                    </div>
                    <RatingSparkline points={player.ratingHistory} />
                  </div>
                </section>

                {/* Match Archive */}
                <section className="bg-[#1A1D21] border border-white/8 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                    <h3 className="font-display text-lg font-semibold text-[#F3EFE6]">
                      Completed Online Matches
                    </h3>
                    <span className="text-xs font-mono-tabular text-[#F3EFE6]/55">
                      {personalMatches.length} recorded
                    </span>
                  </div>

                  {personalMatches.length === 0 ? (
                    <p className="p-8 text-center text-sm text-[#F3EFE6]/55">
                      You haven&apos;t completed any online games yet. Queue up in the Play tab to start climbing!
                    </p>
                  ) : (
                    <div className="divide-y divide-white/8">
                      {personalMatches.map((m) => {
                        const isWhite = m.whiteId === player.id;
                        const opponentHandle = isWhite ? m.blackHandle : m.whiteHandle;
                        const opponentElo = isWhite ? m.blackEloBefore : m.whiteEloBefore;
                        const myBefore = isWhite ? m.whiteEloBefore : m.blackEloBefore;
                        const myAfter = isWhite ? m.whiteEloAfter : m.blackEloAfter;
                        const delta = myAfter - myBefore;
                        const won = (isWhite && m.winner === 'w') || (!isWhite && m.winner === 'b');
                        const draw = m.winner === 'draw';

                        return (
                          <div
                            key={m.id}
                            className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/[0.02]"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <span
                                className={`w-12 text-xs font-semibold font-mono-tabular ${
                                  won
                                    ? 'text-[#3FB97C]'
                                    : draw
                                      ? 'text-[#F3EFE6]/70'
                                      : 'text-[#E05252]'
                                }`}
                              >
                                {won ? 'WIN' : draw ? 'DRAW' : 'LOSS'}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[#F3EFE6] truncate">
                                  vs {opponentHandle}{' '}
                                  <span className="text-xs font-mono-tabular text-[#F3EFE6]/55">
                                    ({opponentElo})
                                  </span>
                                </div>
                                <div className="text-xs text-[#F3EFE6]/55 font-mono-tabular">
                                  Played as {isWhite ? 'White' : 'Black'} ·{' '}
                                  {TIME_CONTROLS[m.timeControl].label} ·{' '}
                                  {Math.ceil(m.moves.length / 2)} moves ·{' '}
                                  {m.endReason.replace(/_/g, ' ')}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              {m.rated && (
                                <span
                                  className={`text-xs font-mono-tabular font-semibold ${
                                    delta > 0
                                      ? 'text-[#3FB97C]'
                                      : delta < 0
                                        ? 'text-[#E05252]'
                                        : 'text-[#F3EFE6]/55'
                                  }`}
                                >
                                  {delta > 0 ? `+${delta}` : delta} Elo
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onReviewMatch(m)}
                                className="px-3.5 py-1.5 rounded bg-[#252930] hover:bg-[#303640] text-xs font-medium text-[#F3EFE6] cursor-pointer"
                              >
                                Review Board
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const RatingSparkline: React.FC<{ points: { elo: number; timestamp: number }[] }> = ({ points }) => {
  if (points.length < 2) {
    return (
      <div className="h-16 rounded-md bg-[#131518] border border-white/6 flex items-center justify-center text-xs text-[#F3EFE6]/45">
        Play rated games to chart your Elo trajectory
      </div>
    );
  }

  const width = 560;
  const height = 72;
  const padX = 8;
  const padY = 10;
  const elos = points.map((p) => p.elo);
  const minElo = Math.min(...elos) - 15;
  const maxElo = Math.max(...elos) + 15;
  const range = Math.max(20, maxElo - minElo);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((p.elo - minElo) / range) * (height - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = coords[coords.length - 1].split(',');

  return (
    <div className="h-[72px] rounded-md bg-[#131518] border border-white/6 px-2 py-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <polyline
          fill="none"
          stroke="#D4A853"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={coords.join(' ')}
        />
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="#D4A853" />
      </svg>
    </div>
  );
};
