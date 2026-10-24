import React from 'react';
import { Shield, Crosshair, Upload, Play, Volume2, VolumeX, Sparkles, MapPin } from 'lucide-react';
import { FloorPlanPreset, MAP_PRESETS } from '../game/presets';
import { sounds } from '../game/audio';

interface TitleScreenProps {
  onStartGame: (preset?: FloorPlanPreset) => void;
  onOpenUpload: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenUpload,
  isMuted,
  onToggleMute,
}) => {
  const [selectedPreset, setSelectedPreset] = React.useState<FloorPlanPreset>(MAP_PRESETS[0]);

  // Keyboard shortcut: Enter or Space to start
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sounds.playReload();
        onStartGame(selectedPreset);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPreset, onStartGame]);

  return (
    <div className="relative w-full h-full min-h-screen bg-[#070d1e] text-slate-100 flex flex-col justify-between p-6 md:p-10 select-none overflow-hidden font-sans">
      {/* Background Tactical Blueprint Grid & Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, #1e3a8a 1px, transparent 1px),
            linear-gradient(to bottom, #1e3a8a 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.12),transparent_70%)]" />

      {/* Top Header: Tactical Protocol & Audio Mute */}
      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sky-400 font-mono text-xs tracking-widest uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>SYSTEM ONLINE · BLUEPRINT CQB TACTICAL V3.8</span>
        </div>

        <button
          onClick={onToggleMute}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900/80 border border-slate-700/60 hover:border-sky-500 text-slate-300 hover:text-sky-300 transition-colors text-xs font-mono"
          title="切換音效"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          <span>{isMuted ? 'MUTE' : 'AUDIO ON'}</span>
        </button>
      </header>

      {/* Hero Centerpiece: Bespoke SVG Title Lockup with 35% Negative Space */}
      <main className="relative z-10 max-w-4xl mx-auto text-center my-auto flex flex-col items-center">
        {/* Bespoke Inline SVG Tactical Logo Lockup */}
        <div className="w-48 h-20 mb-3 flex items-center justify-center">
          <svg viewBox="0 0 200 80" className="w-full h-full stroke-sky-400 fill-none">
            {/* Tactical Grid Hexagon & Crosshair */}
            <polygon
              points="100,10 160,25 160,55 100,70 40,55 40,25"
              strokeWidth="2"
              className="stroke-sky-500/60"
            />
            <circle cx="100" cy="40" r="18" strokeWidth="1.5" className="stroke-sky-400" />
            <line x1="82" y1="40" x2="118" y2="40" strokeWidth="2" className="stroke-emerald-400" />
            <line x1="100" y1="22" x2="100" y2="58" strokeWidth="2" className="stroke-emerald-400" />
            <circle cx="100" cy="40" r="3" className="fill-emerald-400" />
            <path d="M70,18 L100,6 L130,18" strokeWidth="1.5" className="stroke-sky-300" />
          </svg>
        </div>

        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white uppercase drop-shadow-[0_0_35px_rgba(56,189,248,0.4)]">
          PLAN<span className="text-sky-400">STRIKE</span>
          <span className="text-emerald-400 text-lg md:text-2xl font-mono ml-3 font-semibold px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/40 align-middle">
            CQB
          </span>
        </h1>

        <p className="mt-3 text-slate-300 text-sm md:text-base max-w-xl mx-auto leading-relaxed font-normal">
          自動識別任何<strong className="text-white font-semibold">建築平面圖</strong>的牆壁與掩體，即時生成 2D 戰術突擊戰場，部署敵人巡邏與真實視線陰影。
        </p>

        {/* Map Preset Selector & Upload CTA */}
        <div className="mt-7 w-full max-w-2xl bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
              <MapPin className="w-3.5 h-3.5" /> 選擇突擊平面圖格局
            </span>
            <span>4 款內建格局 · 支援自訂上傳</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {MAP_PRESETS.map((p) => {
              const isSelected = selectedPreset.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPreset(p)}
                  className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-sky-950/60 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                      : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80'
                  }`}
                >
                  <span className="text-[10px] font-mono text-slate-400 uppercase">{p.category}</span>
                  <span className="text-xs font-semibold text-white mt-0.5 truncate">{p.name}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 mb-4 text-left font-mono line-clamp-1 border-t border-slate-800 pt-2">
            // {selectedPreset.description}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                sounds.playReload();
                onStartGame(selectedPreset);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-[0_0_25px_rgba(14,165,233,0.5)] active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>進入戰鬥突擊 (SPACE / ENTER)</span>
            </button>

            <button
              onClick={onOpenUpload}
              className="flex items-center justify-center gap-2 py-3.5 px-5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-emerald-400 text-slate-200 hover:text-emerald-300 font-semibold text-sm transition-all active:scale-95"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>輸入自訂平面圖檔</span>
            </button>
          </div>
        </div>
      </main>

      {/* Flat Control Hints Bar at bottom */}
      <footer className="relative z-10 text-center font-mono text-xs text-slate-400 tracking-wider">
        <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <span>WASD 移動</span>
          <span className="text-slate-600">·</span>
          <span>滑鼠左鍵 射擊</span>
          <span className="text-slate-600">·</span>
          <span>1-4 切換槍械</span>
          <span className="text-slate-600">·</span>
          <span>R 裝填彈匣</span>
          <span className="text-slate-600">·</span>
          <span>Shift 衝刺</span>
          <span className="text-slate-600">·</span>
          <span>G 投擲手榴彈</span>
          <span className="text-slate-600">·</span>
          <span>F 戰術電筒</span>
          <span className="text-slate-600">·</span>
          <span>E 互動目標</span>
        </div>
      </footer>
    </div>
  );
};
