/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { BlueprintUploadModal } from './components/BlueprintUploadModal';
import { TacticalHUD } from './components/TacticalHUD';
import { GameOverModal } from './components/GameOverModal';
import { GameEngine } from './game/gameEngine';
import { MapData, Player, GameStats, GameState } from './game/types';
import { FloorPlanPreset, MAP_PRESETS } from './game/presets';
import { parseFloorPlanFromImage } from './game/floorPlanParser';
import { sounds } from './game/audio';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [playerState, setPlayerState] = useState<Player | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string>('');
  const [stats, setStats] = useState<GameStats>({
    shotsFired: 0,
    shotsHit: 0,
    enemiesKilled: 0,
    headshots: 0,
    damageDealt: 0,
    damageTaken: 0,
    timeElapsed: 0,
    roomsCleared: 0,
    objectiveCompleted: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Resize canvas to match screen window
  const updateCanvasSize = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  // Audio mute toggle
  const handleToggleMute = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  // Launch game with a MapData
  const startGameWithMap = useCallback((map: MapData) => {
    setCurrentMap(map);
    setGameState('PLAYING');

    // Reset stats
    setStats({
      shotsFired: 0,
      shotsHit: 0,
      enemiesKilled: 0,
      headshots: 0,
      damageDealt: 0,
      damageTaken: 0,
      timeElapsed: 0,
      roomsCleared: 0,
      objectiveCompleted: false,
    });

    if (canvasRef.current) {
      if (engineRef.current) {
        engineRef.current.destroy();
      }

      const engine = new GameEngine(canvasRef.current, map, {
        onStatsUpdate: (s) => setStats({ ...s }),
        onPlayerUpdate: (p) => setPlayerState({ ...p }),
        onRoomChange: (r) => setCurrentRoom(r),
        onVictory: () => setGameState('VICTORY'),
        onGameOver: () => setGameState('GAMEOVER'),
      });

      engineRef.current = engine;
      engine.start();
    }
  }, []);

  // Launch game with a built-in preset
  const handleStartPreset = async (preset?: FloorPlanPreset) => {
    const targetPreset = preset || MAP_PRESETS[0];
    const img = await targetPreset.generateImage();
    const map = await parseFloorPlanFromImage(img, {
      gridSize: 80,
      worldSize: 1600,
    });
    map.name = targetPreset.name;
    map.description = targetPreset.description;
    startGameWithMap(map);
  };

  // Listen for Escape key to pause / resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === 'PLAYING') {
          engineRef.current?.pause();
          setGameState('PAUSED');
        } else if (gameState === 'PAUSED') {
          engineRef.current?.resume();
          setGameState('PLAYING');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const handleResume = () => {
    engineRef.current?.resume();
    setGameState('PLAYING');
  };

  const handleRestart = () => {
    if (currentMap) {
      startGameWithMap(currentMap);
    }
  };

  const handleSelectMap = () => {
    engineRef.current?.destroy();
    engineRef.current = null;
    setGameState('TITLE');
  };

  const handleSelectWeapon = (idx: number) => {
    engineRef.current?.selectWeapon(idx);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Simulation Viewport Canvas */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full block cursor-crosshair ${
          gameState === 'TITLE' ? 'hidden' : ''
        }`}
      />

      {/* Title Screen View */}
      {gameState === 'TITLE' && (
        <TitleScreen
          onStartGame={handleStartPreset}
          onOpenUpload={() => setIsUploadOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* In-Game Low-Occlusion HUD */}
      {gameState === 'PLAYING' && (
        <TacticalHUD
          player={playerState}
          stats={stats}
          currentRoom={currentRoom}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onPause={() => {
            engineRef.current?.pause();
            setGameState('PAUSED');
          }}
          onSelectWeapon={handleSelectWeapon}
        />
      )}

      {/* Pause / Victory / Game Over Modal */}
      {(gameState === 'PAUSED' || gameState === 'VICTORY' || gameState === 'GAMEOVER') && (
        <GameOverModal
          status={gameState}
          stats={stats}
          onResume={handleResume}
          onRestart={handleRestart}
          onSelectMap={handleSelectMap}
        />
      )}

      {/* Floor Plan Upload & Wall Scanner Modal */}
      <BlueprintUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onMapReady={(map) => {
          startGameWithMap(map);
        }}
      />
    </div>
  );
}
