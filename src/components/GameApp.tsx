'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sfx } from '@/game/audio/sfx';
import { BUILD_VERSION } from '@/game/config/tuning';
import { GameController } from '@/game/GameController';
import { DEFAULT_SETTINGS, getSessionId, loadSettings, saveSettings, type Settings } from '@/game/settings';
import { DEFAULT_CONFIG, type MatchResults } from '@/game/sim/match';
import type { MatchConfig } from '@/game/sim/types';
import type { MatchLogPayload } from '@/game/telemetry/matchLog';
import { resolveLoadout, type ResolvedCosmetics } from '@/game/config/shop';
import { useAccount } from '@/lib/account/AccountContext';
import { submitFeedback, submitMatchLog } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { FeedbackScreen, HomeScreen, HowToScreen, PauseMenu, ResultsScreen, SettingsScreen, SetupScreen } from './screens';

type Screen = 'home' | 'howto' | 'settings' | 'setup' | 'game' | 'results' | 'feedback';

/** Top-level screen router (plan §4.13). The canvas game runs only on the 'game' screen. */
export default function GameApp() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [returnTo, setReturnTo] = useState<Screen>('home');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [config, setConfig] = useState<MatchConfig>({ ...DEFAULT_CONFIG, controllers: ['HUMAN', 'CPU'] });
  const [matchKey, setMatchKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [log, setLog] = useState<MatchLogPayload | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [touchOnly, setTouchOnly] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [sfx] = useState(() => new Sfx());
  const settingsRef = useRef(settings);
  const { account } = useAccount();
  const router = useRouter();
  const [cosmeticsPlayer, setCosmeticsPlayer] = useState<0 | 1>(0);

  const myLook = account.signedIn ? resolveLoadout(account.loadout) : null;
  const cosmetics: (ResolvedCosmetics | null)[] = cosmeticsPlayer === 0 ? [myLook, null] : [null, myLook];

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // Browser-only values (localStorage, sessionStorage, matchMedia) are read after mount
    // so the server-rendered HTML matches the first client render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSettings(loadSettings());
    setSessionId(getSessionId());
    setTouchOnly(window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);
    /* eslint-enable react-hooks/set-state-in-effect */
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [sfx]);

  useEffect(() => {
    sfx.setVolumes(settings.masterVolume, settings.sfxVolume, settings.muted);
  }, [settings, sfx]);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const go = (s: Screen) => {
    sfx.play('click');
    setScreen(s);
  };

  const startMatch = (cfg: MatchConfig) => {
    setConfig(cfg);
    setResults(null);
    setLog(null);
    setUploadStatus('');
    setPaused(false);
    setMatchKey((k) => k + 1);
    go('game');
  };

  const onMatchOver = useCallback((r: MatchResults, l: MatchLogPayload) => {
    setResults(r);
    setLog(l);
    const winnerPlayer = r.players.find((p) => p.team === r.winner)?.player ?? 0;
    setScore((s) => (winnerPlayer === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]));
    setScreen('results');
    if (settingsRef.current.shareStats) {
      setUploadStatus('Saving anonymous match stats…');
      void submitMatchLog(l).then((res) =>
        setUploadStatus(res.ok ? 'Anonymous match stats saved. Thanks!' : 'Match stats not saved (offline or not configured).'),
      );
    }
  }, []);

  const toggleMute = useCallback(() => {
    const s = { ...settingsRef.current, muted: !settingsRef.current.muted };
    setSettings(s);
    saveSettings(s);
  }, []);

  const downloadLog = () => {
    if (!log) return;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkdom-match-${log.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app">
      {screen === 'home' && (
        <HomeScreen
          touchOnly={touchOnly}
          onPlay={() => go('setup')}
          onHowTo={() => { setReturnTo('home'); go('howto'); }}
          onSettings={() => { setReturnTo('home'); go('settings'); }}
          onFeedback={() => { setReturnTo('home'); go('feedback'); }}
          onShop={() => router.push('/shop')}
          account={account}
        />
      )}
      {screen === 'howto' && <HowToScreen onBack={() => go(returnTo)} />}
      {screen === 'settings' && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => go(returnTo)} />}
      {screen === 'setup' && (
        <SetupScreen
          config={config} onChange={setConfig} onStart={() => startMatch(config)} onBack={() => router.push('/')}
          cosmetics={myLook ? { player: cosmeticsPlayer, onPlayer: setCosmeticsPlayer } : undefined}
        />
      )}
      {screen === 'game' && (
        <GameView
          key={matchKey}
          config={config}
          settings={settings}
          sfx={sfx}
          sessionId={sessionId}
          cosmetics={cosmetics}
          paused={paused}
          onPauseChange={setPaused}
          onMatchOver={onMatchOver}
          onMuteToggle={toggleMute}
          onQuit={() => { setPaused(false); setScore([0, 0]); go('home'); }}
        />
      )}
      {screen === 'results' && results && (
        <ResultsScreen
          results={results}
          score={score}
          uploadStatus={uploadStatus}
          onRematch={() => startMatch(config)}
          onSwap={() => startMatch({ ...config, p1Team: config.p1Team === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER' })}
          onHome={() => { setScore([0, 0]); go('home'); }}
          onFeedback={() => { setReturnTo('results'); go('feedback'); }}
          onDownload={downloadLog}
        />
      )}
      {screen === 'feedback' && (
        <FeedbackScreen
          onBack={() => go(returnTo === 'results' && results ? 'results' : 'home')}
          onSubmit={(answers) => submitFeedback({ ...answers, sessionId: sessionId || getSessionId(), buildVersion: BUILD_VERSION })}
        />
      )}
    </main>
  );
}

function GameView(props: {
  config: MatchConfig; settings: Settings; sfx: Sfx; sessionId: string; paused: boolean;
  cosmetics: (ResolvedCosmetics | null)[];
  onPauseChange: (p: boolean) => void; onMatchOver: (r: MatchResults, l: MatchLogPayload) => void;
  onMuteToggle: () => void; onQuit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const cbRef = useRef(props);
  useEffect(() => {
    cbRef.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const debugAllowed = process.env.NODE_ENV !== 'production' || new URLSearchParams(window.location.search).has('debug');
    const ctrl = new GameController(
      canvas, props.config, props.settings, props.sfx, props.sessionId || 'anonymous',
      {
        onPauseChange: (p) => cbRef.current.onPauseChange(p),
        onMatchOver: (r, l) => cbRef.current.onMatchOver(r, l),
        onMuteToggle: () => cbRef.current.onMuteToggle(),
      },
      debugAllowed,
    );
    ctrlRef.current = ctrl;
    ctrl.setCosmetics(props.cosmetics);
    ctrl.start();
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
    // The controller is created once per match (component is keyed by match).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctrlRef.current?.applySettings(props.settings);
  }, [props.settings]);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Inkdom battle" />
      {props.paused && (
        <PauseMenu
          onResume={() => ctrlRef.current?.setPaused(false)}
          onRestart={() => ctrlRef.current?.restart()}
          onQuit={props.onQuit}
        />
      )}
    </>
  );
}
