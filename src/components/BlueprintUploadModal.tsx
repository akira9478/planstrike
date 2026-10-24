import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Sliders, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { parseFloorPlanFromImage } from '../game/floorPlanParser';
import { MapData } from '../game/types';
import { sounds } from '../game/audio';

interface BlueprintUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMapReady: (map: MapData) => void;
}

export const BlueprintUploadModal: React.FC<BlueprintUploadModalProps> = ({
  isOpen,
  onClose,
  onMapReady,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState<number>(140);
  const [invert, setInvert] = useState<boolean>(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [aiData, setAiData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle image upload from file or drop
  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('請上傳圖片格式檔案 (PNG, JPG, WEBP)');
      return;
    }
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageSrc(result);
      const img = new Image();
      img.onload = () => {
        setImageElement(img);
        // Automatically check if image is blueprint (dark background)
        detectAutoInvert(img);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Heuristic: check if corners are dark (blueprint) or light (paper)
  const detectAutoInvert = (img: HTMLImageElement) => {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 50;
    testCanvas.height = 50;
    const ctx = testCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 50, 50);
    const p = ctx.getImageData(0, 0, 10, 10).data;
    let avg = 0;
    for (let i = 0; i < p.length; i += 4) {
      avg += (p[i] + p[i + 1] + p[i + 2]) / 3;
    }
    avg /= p.length / 4;
    // If average corner brightness is low, it's a dark blueprint, so invert!
    setInvert(avg < 100);
  };

  // Re-render live wall detection preview whenever image, threshold, or invert changes
  useEffect(() => {
    if (!imageElement || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Draw background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, 0 + h);

    // Draw semi-transparent original image
    ctx.globalAlpha = 0.45;
    ctx.drawImage(imageElement, 0, 0, w, h);
    ctx.globalAlpha = 1.0;

    // Run quick threshold overlay
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 80;
    offCanvas.height = 80;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    offCtx.drawImage(imageElement, 0, 0, 80, 80);
    const imgData = offCtx.getImageData(0, 0, 80, 80);
    const data = imgData.data;

    const cellW = w / 80;
    const cellH = h / 80;

    ctx.fillStyle = 'rgba(56, 189, 248, 0.75)'; // Cyan highlight for detected walls
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        const idx = (y * 80 + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const isWall = invert ? lum > threshold : lum < threshold;

        if (isWall) {
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // Overlay AI markers if present
    if (aiData) {
      // Draw rooms
      if (Array.isArray(aiData.rooms)) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        aiData.rooms.forEach((r: any) => {
          const rx = (r.x / 100) * w;
          const ry = (r.y / 100) * h;
          ctx.fillText(`[${r.name}]`, rx, ry);
        });
      }

      // Draw Player Spawn
      if (aiData.playerSpawn) {
        const sx = (aiData.playerSpawn.x / 100) * w;
        const sy = (aiData.playerSpawn.y / 100) * h;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw VIP Objective
      if (aiData.objective) {
        const ox = (aiData.objective.x / 100) * w;
        const oy = (aiData.objective.y / 100) * h;
        ctx.beginPath();
        ctx.arc(ox, oy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#eab308';
        ctx.fill();
      }
    }
  }, [imageElement, threshold, invert, aiData]);

  // Trigger Gemini Deep Tactical AI Analysis
  const handleAiAnalyze = async () => {
    if (!imageSrc) return;
    setIsAnalyzingAi(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/analyze-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageSrc,
        }),
      });

      if (!response.ok) {
        throw new Error('Static environment or server offline');
      }

      const res = await response.json();
      if (res.data) {
        setAiData(res.data);
      } else if (res.fallback) {
        setErrorMsg('已使用本機幾何與電腦視覺完成戰術部署');
      }
    } catch {
      // In static hosting (e.g. GitHub Pages), fallback seamlessly to client CV
      setErrorMsg('靜態託管環境（GitHub Pages）：已自動採用純前端電腦視覺完成牆壁與戰術部署！');
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Launch game with parsed map
  const handleLaunchGame = async () => {
    if (!imageElement) return;

    try {
      const map = await parseFloorPlanFromImage(imageElement, {
        threshold,
        invert,
        gridSize: 80,
        worldSize: 1600,
        aiData: aiData,
      });

      sounds.playReload();
      onMapReady(map);
      onClose();
    } catch (err: any) {
      setErrorMsg('地圖解析失敗：' + (err.message || '未知錯誤'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">輸入建築平面圖 · 自動戰術部署</h2>
              <p className="text-xs text-slate-400 font-mono">支援一般格局圖、CAD藍圖、裝修設計圖與手繪草圖</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Upload / Preview */}
          <div className="md:col-span-7 flex flex-col items-center justify-center">
            {!imageSrc ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-80 rounded-xl border-2 border-dashed border-slate-700 hover:border-sky-400 bg-slate-800/30 hover:bg-slate-800/60 transition-all flex flex-col items-center justify-center p-6 text-center cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                  }}
                />
                <div className="p-4 rounded-full bg-slate-800 group-hover:bg-sky-500/20 text-slate-400 group-hover:text-sky-400 transition-colors mb-3">
                  <Upload className="w-8 h-8" />
                </div>
                <p className="text-sm font-semibold text-white">點擊或拖曳房屋格局圖至此</p>
                <p className="text-xs text-slate-400 mt-1 font-mono">支援 PNG, JPG, JPEG, WEBP 格式</p>
                <span className="mt-4 px-3 py-1 text-[11px] font-mono text-sky-400 bg-sky-950/60 border border-sky-800/50 rounded-full">
                  演算法將自動識別實體牆壁、廊道與轉角掩體
                </span>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <div className="relative rounded-xl border border-slate-700 overflow-hidden bg-slate-950 w-full max-w-[420px] aspect-square flex items-center justify-center shadow-inner">
                  <canvas
                    ref={previewCanvasRef}
                    width={400}
                    height={400}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 px-2 py-1 bg-slate-900/80 border border-slate-700/60 rounded text-[10px] font-mono text-sky-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    即時牆壁識別預覽 (青色為實體牆)
                  </div>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 text-xs text-slate-400 hover:text-sky-400 font-mono underline"
                >
                  更換其他圖檔
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                  }}
                />
              </div>
            )}
          </div>

          {/* Right Column: Parameters & Tactical AI */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-400" />
                    牆壁識別靈敏度 (閾值)
                  </span>
                  <span className="font-mono text-sky-400">{threshold}</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="220"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>更嚴格 (只抓深黑線)</span>
                  <span>更寬鬆 (含淺灰牆)</span>
                </div>
              </div>

              {/* Invert Blueprint Colors Toggle */}
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">反相識別模式 (藍圖模式)</span>
                  <span className="text-[11px] text-slate-400">適用深色底、白線條之建築工程藍圖</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInvert(!invert)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    invert ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      invert ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Gemini AI Tactical Intelligence */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-sky-950/40 border border-sky-800/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Gemini AI 戰術情報分析</span>
                  </div>
                  {aiData && (
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> 已完成標註
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                  利用視覺模型解析圖面空間，自動判定客廳/主臥等房間名稱、突擊突破口與 VIP 人質位置。
                </p>

                <button
                  onClick={handleAiAnalyze}
                  disabled={!imageSrc || isAnalyzingAi}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-900/60 hover:bg-sky-800/70 border border-sky-600/60 text-xs font-semibold text-sky-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzingAi ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                      <span>戰術 AI 正在解析格局...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      <span>{aiData ? '重新執行 AI 戰術分析' : '啟動 AI 戰術情報標記'}</span>
                    </>
                  )}
                </button>

                {aiData && (
                  <div className="mt-3 pt-3 border-t border-sky-800/40 font-mono text-[11px] text-slate-300 space-y-1">
                    <p className="text-emerald-400 font-semibold truncate">代號：{aiData.missionTitle}</p>
                    <p className="text-slate-400 text-[10px] line-clamp-2">{aiData.briefing}</p>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Launch CTA */}
            <button
              onClick={handleLaunchGame}
              disabled={!imageSrc}
              className="w-full py-3.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(14,165,233,0.4)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-2"
            >
              <span>確認生成戰鬥環境並突擊</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
