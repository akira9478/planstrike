import React from 'react';
import { Shield, Heart, Crosshair, Pause, Volume2, VolumeX, Bomb, Eye, EyeOff, Radio } from 'lucide-react';
import { Player, GameStats, Weapon } from '../game/types';

interface TacticalHUDProps {
  player: Player | null;
  stats: GameStats;
  currentRoom: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onSelectWeapon: (idx: number) => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  player,
  stats,
  currentRoom,
  isMuted,
  onToggleMute,
  onPause,
  onSelectWeapon,
}) => {
  if (!player) return null;

  const currentWeapon = player.weapons[player.currentWeaponIndex];
  const isReloading = player.reloadingUntil > performance.now();

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden font-mono text-slate-100 z-20 flex flex-col justify-between p-4 md:p-6">
      {/* Top Bar: Objective on left, Room Title in center, Controls on right */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left: Directive & Tactical Squelch */}
        <div className="pointer-events-auto flex flex-col gap-1.5 bg-slate-950/85 border border-slate-800/80 rounded-lg p-2.5 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>SWAT 任務簡報：肅清建築敵對威脅</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-300">
            <div>
              <span>已消滅敵目標：</span>
              <span className="font-bold text-sky-400 tabular-nums ml-1">{stats.enemiesKilled}</span>
            </div>
            <div>
              <span>任務時間：</span>
              <span className="font-bold text-slate-200 tabular-nums ml-1">
                {Math.floor(stats.timeElapsed / 60)}:
                {Math.floor(stats.timeElapsed % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Center: Current Room Banner */}
        {currentRoom && (
          <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/90 border border-sky-500/40 text-sky-300 text-xs tracking-wider shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
            <span>當前區域 // {currentRoom}</span>
          </div>
        )}

        {/* Top-Right: Perimeter Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg bg-slate-950/85 border border-slate-800 hover:border-sky-500 text-slate-300 hover:text-sky-300 transition-colors"
            title="音效開關"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            onClick={onPause}
            className="p-2 rounded-lg bg-slate-950/85 border border-slate-800 hover:border-sky-500 text-slate-300 hover:text-sky-300 transition-colors"
            title="暫停遊戲 (ESC)"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Bar: Health/Armor on Left, Weapons on Right */}
      <div className="flex items-end justify-between w-full">
        {/* Bottom-Left: Operator Vitals Cluster */}
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 shadow-xl flex flex-col gap-2.5 min-w-[200px]">
          {/* Health Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                <Heart className="w-3.5 h-3.5 fill-current" /> 生命值 HP
              </span>
              <span className="text-sm font-bold text-white tabular-nums">{Math.round(player.health)}</span>
            </div>
            <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, player.health))}%` }}
              />
            </div>
          </div>

          {/* Armor Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 text-sky-400 font-bold">
                <Shield className="w-3.5 h-3.5 fill-current" /> 戰術防彈衣 AP
              </span>
              <span className="text-sm font-bold text-white tabular-nums">{Math.round(player.armor)}</span>
            </div>
            <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-600 to-sky-400 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, player.armor))}%` }}
              />
            </div>
          </div>

          {/* Tactical Status Indicators */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
            <span className={`px-1.5 py-0.5 rounded border ${player.flashlightOn ? 'border-amber-400/50 text-amber-300 bg-amber-950/40' : 'border-slate-800'}`}>
              [F] 電筒 {player.flashlightOn ? 'ON' : 'OFF'}
            </span>
            <span className={`px-1.5 py-0.5 rounded border ${player.laserOn ? 'border-emerald-400/50 text-emerald-300 bg-emerald-950/40' : 'border-slate-800'}`}>
              [L] 雷射 {player.laserOn ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Bottom-Right: Firearm & Ammo Cluster */}
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 shadow-xl flex flex-col items-end min-w-[220px]">
          {/* Weapon Selector (Keys 1-4) */}
          <div className="flex items-center gap-1.5 mb-2.5">
            {player.weapons.map((w, idx) => (
              <button
                key={w.name}
                onClick={() => onSelectWeapon(idx)}
                className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all border ${
                  player.currentWeaponIndex === idx
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.5)]'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                }`}
              >
                [{idx + 1}]
              </button>
            ))}
          </div>

          {/* Current Weapon Title */}
          <div className="text-right">
            <span className="text-sm font-bold text-white tracking-wide block truncate max-w-[200px]">
              {currentWeapon.name}
            </span>
            <span className="text-[10px] text-slate-400 uppercase font-mono">
              {currentWeapon.type} {currentWeapon.silenced ? '· 消音' : ''}
            </span>
          </div>

          {/* Ammo Readout */}
          <div className="flex items-baseline gap-1 mt-1">
            {isReloading ? (
              <span className="text-lg font-bold text-sky-400 animate-pulse font-mono tracking-wider">
                RELOADING...
              </span>
            ) : (
              <>
                <span className="text-3xl font-black text-white tabular-nums tracking-tight">
                  {currentWeapon.currentMag}
                </span>
                <span className="text-slate-500 text-lg font-normal">/</span>
                <span className="text-base font-semibold text-slate-400 tabular-nums">
                  {currentWeapon.reserveAmmo}
                </span>
              </>
            )}
          </div>

          {/* Grenade / Tactical Equipment Counter */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
            <span className="flex items-center gap-1 text-amber-400 font-semibold">
              <Bomb className="w-3.5 h-3.5" /> [G] 破片手榴彈:
            </span>
            <span className="font-bold text-white tabular-nums">{player.grenades} 枚</span>
          </div>
        </div>
      </div>
    </div>
  );
};
