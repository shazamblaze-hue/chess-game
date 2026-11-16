import { useCallback, useEffect, useRef, useState } from 'react';
import { Square } from 'chess.js';
import { AuthModal } from './components/AuthModal';
import { ArenaMode, GameArena } from './components/GameArena';
import { LobbyView } from './components/LobbyView';
import { TitleScreen } from './components/TitleScreen';
import { BotDifficulty } from './engine/chessBot';
import {
  ActiveGameSnapshot,
  ClientWsMessage,
  LobbySnapshot,
  MatchRecord,
  OpenChallenge,
  PublicPlayer,
  ServerWsMessage,
  TimeControlId,
} from './shared/chessTypes';
import { soundFx } from './utils/soundFx';

type AppScreen = 'TITLE_MENU' | 'LOBBY' | 'PLAYING';

const SESSION_STORAGE_KEY = 'kingsgate_session_token';

const EMPTY_LOBBY: LobbySnapshot = {
  onlineCount: 0,
  activeGamesCount: 0,
  queueCounts: { bullet_1_0: 0, blitz_3_2: 0, rapid_10_0: 0 },
  openChallenges: [],
  leaderboardTop: [],
};

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('TITLE_MENU');
  const [lobbyInitialTab, setLobbyInitialTab] = useState<'play' | 'leaderboard' | 'history'>('play');
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [lobby, setLobby] = useState<LobbySnapshot>(EMPTY_LOBBY);
  const [inQueue, setInQueue] = useState(false);
  const [queueTimeControl, setQueueTimeControl] = useState<TimeControlId | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<OpenChallenge | null>(null);
  const [onlineGame, setOnlineGame] = useState<ActiveGameSnapshot | null>(null);
  const [arenaMode, setArenaMode] = useState<ArenaMode>({ kind: 'online' });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundFx.isMuted());
  const [pendingInviteRoom, setPendingInviteRoom] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.trim().toUpperCase() || null;
    } catch {
      return null;
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  sessionTokenRef.current = sessionToken;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3600);
  }, []);

  const sendWs = useCallback((msg: ClientWsMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Restore saved session on load
  useEffect(() => {
    if (!sessionToken) return;
    fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Invalid session');
        const data = (await res.json()) as { player: PublicPlayer; sessionToken: string };
        setPlayer(data.player);
      })
      .catch(() => {
        try {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
        setSessionToken(null);
        setPlayer(null);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect WebSocket with automatic reconnect
  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'lobby:subscribe' } satisfies ClientWsMessage));
        if (sessionTokenRef.current) {
          ws.send(
            JSON.stringify({
              type: 'auth:hello',
              sessionToken: sessionTokenRef.current,
            } satisfies ClientWsMessage)
          );
        }
      };

      ws.onmessage = (event) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'auth:ok') {
          setPlayer(msg.player);
          if (msg.activeRoomId) {
            setArenaMode({ kind: 'online' });
            setScreen('PLAYING');
          }
        } else if (msg.type === 'auth:error') {
          showToast(msg.message);
        } else if (msg.type === 'lobby:state') {
          setLobby(msg.lobby);
        } else if (msg.type === 'queue:status') {
          setInQueue(msg.inQueue);
          setQueueTimeControl(msg.timeControl);
        } else if (msg.type === 'challenge:created') {
          setActiveChallenge(msg.challenge);
        } else if (msg.type === 'game:state') {
          setOnlineGame(msg.game);
          setActiveChallenge(null);
          setInQueue(false);
          setQueueTimeControl(null);
          setArenaMode({ kind: 'online' });
          setScreen('PLAYING');
        } else if (msg.type === 'player:updated') {
          setPlayer(msg.player);
        } else if (msg.type === 'game:error') {
          showToast(msg.message);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!disposed) {
          reconnectTimerRef.current = window.setTimeout(connect, 1800);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [showToast]);

  // Auto-join invite link ?room=CODE once authenticated and connected
  useEffect(() => {
    if (pendingInviteRoom && player && wsConnected) {
      sendWs({ type: 'room:join', roomId: pendingInviteRoom });
      setPendingInviteRoom(null);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }
    } else if (pendingInviteRoom && !player) {
      setLobbyInitialTab('play');
      setScreen('LOBBY');
      setShowAuthModal(true);
    }
  }, [pendingInviteRoom, player, wsConnected, sendWs]);

  const handleAuthenticate = async (params: {
    handle: string;
    passcode?: string;
    mode: 'auto' | 'register' | 'login';
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: params.handle,
          passcode: params.passcode,
          sessionToken,
          mode: params.mode,
        }),
      });
      const data = (await res.json()) as {
        player?: PublicPlayer;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.player || !data.sessionToken) {
        return data.error ?? 'Authentication failed.';
      }
      setPlayer(data.player);
      setSessionToken(data.sessionToken);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
      } catch {
        // ignore
      }
      sendWs({ type: 'auth:hello', sessionToken: data.sessionToken });
      return null;
    } catch {
      return 'Network error while connecting to server.';
    }
  };

  const handleSetPasscode = async (passcode: string): Promise<string | null> => {
    if (!sessionToken) return 'Not signed in.';
    try {
      const res = await fetch('/api/auth/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, passcode }),
      });
      const data = (await res.json()) as { player?: PublicPlayer; error?: string };
      if (!res.ok || !data.player) {
        return data.error ?? 'Failed to set passcode.';
      }
      setPlayer(data.player);
      return null;
    } catch {
      return 'Network error.';
    }
  };

  const handleSignOut = () => {
    if (inQueue) sendWs({ type: 'queue:leave' });
    if (activeChallenge) sendWs({ type: 'challenge:cancel', challengeId: activeChallenge.id });
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSessionToken(null);
    setPlayer(null);
    setInQueue(false);
    setActiveChallenge(null);
  };

  const toggleMute = useCallback(() => {
    const muted = soundFx.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleStartEngine = (difficulty: BotDifficulty, color: 'w' | 'b' | 'random') => {
    const resolved: 'w' | 'b' = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    setArenaMode({ kind: 'bot', difficulty, humanColor: resolved });
    setScreen('PLAYING');
  };

  const handleStartLocal = (timeControl: TimeControlId | null) => {
    setArenaMode({ kind: 'local', timeControl });
    setScreen('PLAYING');
  };

  const handleReviewMatch = (match: MatchRecord) => {
    setArenaMode({ kind: 'review', match });
    setScreen('PLAYING');
  };

  const handleExitArena = () => {
    if (arenaMode.kind === 'online' && onlineGame) {
      sendWs({ type: 'game:leave', roomId: onlineGame.roomId });
      setOnlineGame(null);
    }
    setScreen('LOBBY');
  };

  return (
    <>
      {screen === 'TITLE_MENU' && (
        <TitleScreen
          player={player}
          onlineCount={lobby.onlineCount}
          activeGamesCount={lobby.activeGamesCount}
          onEnterArena={(tab = 'play') => {
            setLobbyInitialTab(tab);
            setScreen('LOBBY');
          }}
          onQuickEngine={() => handleStartEngine(1200, 'w')}
          onQuickLocal={() => handleStartLocal(null)}
          onOpenAuth={() => setShowAuthModal(true)}
          onRegisterHandle={(handle) => handleAuthenticate({ handle, mode: 'auto' })}
        />
      )}

      {screen === 'LOBBY' && (
        <LobbyView
          initialTab={lobbyInitialTab}
          player={player}
          wsConnected={wsConnected}
          lobby={lobby}
          inQueue={inQueue}
          queueTimeControl={queueTimeControl}
          activeChallenge={activeChallenge}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onBackToTitle={() => setScreen('TITLE_MENU')}
          onOpenAuth={() => setShowAuthModal(true)}
          onJoinQueue={(tc) => sendWs({ type: 'queue:join', timeControl: tc })}
          onLeaveQueue={() => sendWs({ type: 'queue:leave' })}
          onCreateChallenge={(params) =>
            sendWs({
              type: 'challenge:create',
              timeControl: params.timeControl,
              rated: params.rated,
              hostColor: params.hostColor,
              isPrivate: params.isPrivate,
            })
          }
          onCancelChallenge={(challengeId) => {
            sendWs({ type: 'challenge:cancel', challengeId });
            setActiveChallenge(null);
          }}
          onAcceptChallenge={(challengeId) => sendWs({ type: 'challenge:accept', challengeId })}
          onJoinRoomCode={(code) => sendWs({ type: 'room:join', roomId: code })}
          onStartEngineGame={handleStartEngine}
          onStartLocalGame={handleStartLocal}
          onReviewMatch={handleReviewMatch}
        />
      )}

      {screen === 'PLAYING' && (
        <GameArena
          mode={arenaMode}
          onlineGame={onlineGame}
          player={player}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onExitArena={handleExitArena}
          onSendOnlineMove={(roomId: string, from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') =>
            sendWs({ type: 'game:move', roomId, from, to, promotion })
          }
          onOnlineResign={(roomId) => sendWs({ type: 'game:resign', roomId })}
          onOnlineOfferDraw={(roomId) => sendWs({ type: 'game:offer_draw', roomId })}
          onOnlineRespondDraw={(roomId, accept) => sendWs({ type: 'game:respond_draw', roomId, accept })}
          onOnlineRematch={(roomId) => sendWs({ type: 'game:rematch', roomId })}
          onOnlineChat={(roomId, text) => sendWs({ type: 'game:chat', roomId, text })}
        />
      )}

      {showAuthModal && (
        <AuthModal
          player={player}
          onClose={() => setShowAuthModal(false)}
          onAuthenticate={handleAuthenticate}
          onSetPasscode={handleSetPasscode}
          onSignOut={handleSignOut}
        />
      )}

      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-md bg-[#1F2329] border border-[#D4A853]/45 text-xs font-medium text-[#F3EFE6] shadow-xl"
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}
