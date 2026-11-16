import React, { useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { PublicPlayer } from '../shared/chessTypes';

interface AuthModalProps {
  player: PublicPlayer | null;
  onClose: () => void;
  onAuthenticate: (params: {
    handle: string;
    passcode?: string;
    mode: 'auto' | 'register' | 'login';
  }) => Promise<string | null>;
  onSetPasscode: (passcode: string) => Promise<string | null>;
  onSignOut: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  player,
  onClose,
  onAuthenticate,
  onSetPasscode,
  onSignOut,
}) => {
  const [tab, setTab] = useState<'switch' | 'protect'>(player && !player.hasPasscode ? 'protect' : 'switch');
  const [mode, setMode] = useState<'register' | 'login'>('login');
  const [handle, setHandle] = useState('');
  const [passcode, setPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const err = await onAuthenticate({ handle, passcode: passcode || undefined, mode });
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  const handleProtect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const err = await onSetPasscode(newPasscode);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      setSuccess('Passcode saved. You can now reclaim this handle from any device.');
      setNewPasscode('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1A1D21] border border-white/12 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
            {player ? 'Player Account' : 'Sign In or Register'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[#F3EFE6]/60 hover:text-[#F3EFE6] hover:bg-white/5 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {player && (
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/8">
              <div>
                <p className="text-sm font-semibold text-[#F3EFE6]">{player.handle}</p>
                <p className="text-xs text-[#F3EFE6]/60 font-mono-tabular">
                  {player.elo} Elo · {player.wins}W {player.losses}L {player.draws}D
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#E05252] hover:bg-[#E05252]/10 rounded border border-[#E05252]/30 cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          )}

          {player && (
            <div className="flex items-center gap-1 p-1 bg-[#111315] rounded-md">
              <button
                type="button"
                onClick={() => {
                  setTab('protect');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  tab === 'protect' ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/60 hover:text-[#F3EFE6]'
                }`}
              >
                Passcode Lock
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('switch');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  tab === 'switch' ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/60 hover:text-[#F3EFE6]'
                }`}
              >
                Switch / Create Handle
              </button>
            </div>
          )}

          {player && tab === 'protect' ? (
            <form onSubmit={handleProtect} className="space-y-4">
              <div className="flex items-start gap-2.5 text-xs text-[#F3EFE6]/70 leading-relaxed">
                {player.hasPasscode ? (
                  <ShieldCheck className="w-4 h-4 text-[#3FB97C] shrink-0 mt-0.5" />
                ) : (
                  <Lock className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                )}
                <span>
                  {player.hasPasscode
                    ? 'Your handle is protected. Enter a new passcode below to update it.'
                    : 'Set an optional passcode so you can sign into your ranked profile on another browser or device.'}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#F3EFE6]/75 mb-1.5">
                  New Passcode (min 4 characters)
                </label>
                <input
                  type="password"
                  minLength={4}
                  required
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  placeholder="Enter passcode"
                  className="w-full px-3 py-2 rounded-md bg-[#111315] border border-white/12 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4A853]"
                />
              </div>
              {error && <p className="text-xs text-[#E05252]">{error}</p>}
              {success && <p className="text-xs text-[#3FB97C]">{success}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] font-semibold text-sm transition-colors cursor-pointer"
              >
                {busy ? 'Saving...' : 'Save Passcode'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmitAuth} className="space-y-4">
              <div className="flex items-center gap-1 p-1 bg-[#111315] rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    mode === 'login' ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/60 hover:text-[#F3EFE6]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    mode === 'register' ? 'bg-[#252930] text-[#F3EFE6]' : 'text-[#F3EFE6]/60 hover:text-[#F3EFE6]'
                  }`}
                >
                  New Account
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F3EFE6]/75 mb-1.5">Player Handle</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={20}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="2-20 characters"
                  className="w-full px-3 py-2 rounded-md bg-[#111315] border border-white/12 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4A853]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F3EFE6]/75 mb-1.5">
                  Passcode {mode === 'register' ? '(optional)' : '(if protected)'}
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={mode === 'register' ? 'Optional 4+ char passcode' : 'Enter passcode'}
                  className="w-full px-3 py-2 rounded-md bg-[#111315] border border-white/12 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4A853]"
                />
              </div>

              {error && <p className="text-xs text-[#E05252]">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-md bg-[#D4A853] hover:bg-[#DFB766] text-[#111315] font-semibold text-sm transition-colors cursor-pointer"
              >
                {busy ? 'Authenticating...' : mode === 'register' ? 'Create Ranked Profile' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
