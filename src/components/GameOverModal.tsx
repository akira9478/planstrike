import React from 'react';
import { RotateCcw, Home, Play, Award, Skull, Clock, Target, ShieldAlert, Crosshair } from 'lucide-react';
import { GameStats } from '../game/types';

interface GameOverModalProps {
  status: 'VICTORY' | 'GAMEOVER' | 'PAUSED';
  stats: GameStats;
  onResume: () => void;
  onRestart: () => void;
  onSelectMap: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  status,
  stats,
  onResume,
  onRestart,
  onSelectMap,
}) => {
  const isVictory = status === 'VICTORY';
  const isGameOver = status === 'GAMEOVER';
  const isPaused = status === 'PAUSED';

  const accuracy =
    stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden font-mono text-slate-100 flex flex-col">
        {/* Banner */}
        <div
          className={`p-6 text-center border-b ${
            isVictory
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
              : isGameOver
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-400'
              : 'bg-slate-800/60 border-slate-700 text-sky-400'
          }`}
        >
          <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center border mb-2 bg-slate-900/60">
            {isVictory && <Award className="w-6 h-6 text-emerald-400" />}
            {isGameOver && <Skull className="w-6 h-6 text-rose-400" />}
            {isPaused && <ShieldAlert className="w-6 h-6 text-sky-400" />}
          </div>

          <h2 className="text-xl font-bold tracking-wider uppercase">
            {isVictory && 'MISSION ACCOMPLISHED // 突擊成功'}
            {isGameOver && 'OPERATOR K.I.A. // 作戰陣亡'}
            {isPaused && 'TACTICAL PAUSE // 現場暫停'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            {isVictory && '全棟敵對目標已清除，室內環境確認安全。'}
            {isGameOver && '特警幹員遭遇致命火力壓制，行動中止。'}
            {isPaused && '行動已暫停，隨時可恢復交火。'}
          </p>
        </div>

        {/* Debrief Stats */}
        <div className="p-6 space-y-3 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
            <span className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4 text-sky-400" /> 突擊耗時
            </span>
            <span className="font-bold text-white tabular-nums">
              {Math.floor(stats.timeElapsed / 60)} 分 {Math.floor(stats.timeElapsed % 60)} 秒
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
            <span className="flex items-center gap-2 text-slate-400">
              <Target className="w-4 h-4 text-emerald-400" /> 肅清敵對人數
            </span>
            <span className="font-bold text-white tabular-nums">{stats.enemiesKilled} 名</span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
            <span className="flex items-center gap-2 text-slate-400">
              <Crosshair className="w-4 h-4 text-amber-400" /> 射擊命中率
            </span>
            <span className="font-bold text-white tabular-nums">
              {accuracy}% ({stats.shotsHit} / {stats.shotsFired})
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
            <span className="flex items-center gap-2 text-slate-400">
              <Award className="w-4 h-4 text-purple-400" /> VIP 人質解救
            </span>
            <span
              className={`font-bold ${
                stats.objectiveCompleted ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {stats.objectiveCompleted ? '成功安全撤離' : '未解救'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex flex-col gap-2">
          {isPaused && (
            <button
              onClick={onResume}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>繼續突擊 (RESUME)</span>
            </button>
          )}

          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重新突擊此格局 (RESTART)</span>
          </button>

          <button
            onClick={onSelectMap}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 text-slate-300 font-semibold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>返回主選單 / 更換平面圖</span>
          </button>
        </div>
      </div>
    </div>
  );
};
