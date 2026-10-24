import { MapData, WallSegment, TacticalRoom, TacticalCover, TacticalObjective, Point } from './types';

export interface ParseOptions {
  threshold?: number; // 0 to 255 luminance cut-off (default 140)
  invert?: boolean; // invert detection (for dark blueprints with white lines)
  gridSize?: number; // grid dimensions, e.g. 80 for 80x80
  worldSize?: number; // virtual canvas dimensions, e.g. 1600x1600
  aiData?: any; // optional Gemini tactical intelligence override
}

/**
 * Automatically converts any architectural floor plan / blueprint image
 * into a combat arena with wall segmentation, cover detection, and tactical spawns.
 */
export async function parseFloorPlanFromImage(
  imageSource: HTMLImageElement,
  options: ParseOptions = {}
): Promise<MapData> {
  const worldSize = options.worldSize || 1600;
  const gridSize = options.gridSize || 80;
  const cellSize = worldSize / gridSize;
  const threshold = options.threshold ?? 140;
  const invert = options.invert ?? false;

  // Render to offscreen canvas at analysis resolution
  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Fill with white or clear
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, gridSize, gridSize);
  ctx.drawImage(imageSource, 0, 0, gridSize, gridSize);

  const imgData = ctx.getImageData(0, 0, gridSize, gridSize);
  const data = imgData.data;

  // Build raw binary grid
  // 1 = solid obstacle/wall, 0 = open floor
  const rawGrid: number[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = (y * gridSize + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Standard perceptual luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Wall detection: In standard floor plans, walls are black/dark grey lines (low luminance)
      // If transparent or outside, consider open
      let isWall = false;
      if (a < 50) {
        isWall = false;
      } else if (invert) {
        // Blueprint mode: bright lines on dark background
        isWall = lum > threshold;
      } else {
        // Standard floor plan: dark lines on light background
        isWall = lum < threshold;
      }

      rawGrid[y][x] = isWall ? 1 : 0;
    }
  }

  // Force perimeter boundary walls so players & bullets don't fly offscreen
  for (let i = 0; i < gridSize; i++) {
    rawGrid[0][i] = 1;
    rawGrid[gridSize - 1][i] = 1;
    rawGrid[i][0] = 1;
    rawGrid[i][gridSize - 1] = 1;
  }

  // Morphological cleanup: remove single isolated noise pixels
  const cleanedGrid: number[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));
  for (let y = 1; y < gridSize - 1; y++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const current = rawGrid[y][x];
      if (current === 1) {
        // Count neighbors
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (rawGrid[y + dy][x + dx] === 1) neighbors++;
          }
        }
        // If it's a lone speck with no neighbors, ignore it
        cleanedGrid[y][x] = neighbors >= 2 ? 1 : 0;
      } else {
        cleanedGrid[y][x] = 0;
      }
    }
  }

  // Re-enforce perimeter
  for (let i = 0; i < gridSize; i++) {
    cleanedGrid[0][i] = 1;
    cleanedGrid[gridSize - 1][i] = 1;
    cleanedGrid[i][0] = 1;
    cleanedGrid[i][gridSize - 1] = 1;
  }

  // Wall segment extraction (marching squares / contour edges for fast continuous raycasting)
  const wallSegments: WallSegment[] = extractSegmentsFromGrid(cleanedGrid, cellSize);

  // Identify rooms and open floor regions via Flood-fill
  const visited: boolean[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(false));
  const openClusters: Point[][] = [];

  for (let y = 1; y < gridSize - 1; y++) {
    for (let x = 1; x < gridSize - 1; x++) {
      if (cleanedGrid[y][x] === 0 && !visited[y][x]) {
        // Flood fill cluster
        const cluster: Point[] = [];
        const queue: Point[] = [{ x, y }];
        visited[y][x] = true;

        while (queue.length > 0) {
          const pt = queue.pop()!;
          cluster.push(pt);

          const neighbors = [
            { x: pt.x + 1, y: pt.y },
            { x: pt.x - 1, y: pt.y },
            { x: pt.x, y: pt.y + 1 },
            { x: pt.x, y: pt.y - 1 },
          ];

          for (const n of neighbors) {
            if (
              n.x >= 0 &&
              n.x < gridSize &&
              n.y >= 0 &&
              n.y < gridSize &&
              cleanedGrid[n.y][n.x] === 0 &&
              !visited[n.y][n.x]
            ) {
              visited[n.y][n.x] = true;
              queue.push(n);
            }
          }
        }

        if (cluster.length > 15) {
          openClusters.push(cluster);
        }
      }
    }
  }

  // Sort clusters by size (largest open spaces first)
  openClusters.sort((a, b) => b.length - a.length);

  // If no open cluster found, create default center spawn
  const mainCluster = openClusters[0] || [{ x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) }];

  // Find Player Spawn: Choose an open cell near an edge (Entry/Breach)
  let bestSpawn = mainCluster[0];
  let minEdgeDist = Infinity;
  for (const pt of mainCluster) {
    const distToEdge = Math.min(pt.x, gridSize - 1 - pt.x, pt.y, gridSize - 1 - pt.y);
    if (distToEdge >= 3 && distToEdge < minEdgeDist) {
      minEdgeDist = distToEdge;
      bestSpawn = pt;
    }
  }

  const playerSpawnWorld = {
    x: (bestSpawn.x + 0.5) * cellSize,
    y: (bestSpawn.y + 0.5) * cellSize,
    angle: 0,
  };

  // Find Objective / Deepest Room: Cell farthest from player spawn
  let bestObjectivePt = mainCluster[0];
  let maxDist = 0;
  for (const cluster of openClusters) {
    for (const pt of cluster) {
      const dx = pt.x - bestSpawn.x;
      const dy = pt.y - bestSpawn.y;
      const dist = dx * dx + dy * dy;
      if (dist > maxDist) {
        maxDist = dist;
        bestObjectivePt = pt;
      }
    }
  }

  // Cover Detection: Look for small obstacle shapes or place strategic covers
  const covers: TacticalCover[] = [];
  const coversGrid: number[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));

  // Generate tactical rooms
  const rooms: TacticalRoom[] = [];
  const defaultRoomNames = ['玄關 / 前廳', '主客廳', '中庭走廊', '中央會議室', '高級辦公區', '主臥室', '作戰機房', '安全庫房'];

  openClusters.slice(0, 6).forEach((cluster, idx) => {
    // Center of mass
    let sumX = 0;
    let sumY = 0;
    for (const pt of cluster) {
      sumX += pt.x;
      sumY += pt.y;
    }
    const cx = (sumX / cluster.length + 0.5) * cellSize;
    const cy = (sumY / cluster.length + 0.5) * cellSize;

    rooms.push({
      id: `room-${idx}`,
      name: defaultRoomNames[idx % defaultRoomNames.length],
      x: cx,
      y: cy,
      threatLevel: idx === 0 ? 'low' : idx % 2 === 0 ? 'high' : 'medium',
      isCleared: false,
    });

    // Place a waist-high cover (table, sofa, crate) in rooms with enough space
    if (cluster.length > 40) {
      const centerPt = cluster[Math.floor(cluster.length / 2)];
      covers.push({
        id: `cover-${idx}`,
        x: (centerPt.x + 0.5) * cellSize - 24,
        y: (centerPt.y + 0.5) * cellSize - 14,
        w: 48,
        h: 28,
        type: idx % 2 === 0 ? 'desk' : 'crate',
        durability: 100,
      });
      // Mark as half-cover in grid
      coversGrid[centerPt.y][centerPt.x] = 2;
    }
  });

  // Distribute Enemies intelligently across non-spawn rooms
  const enemySpawns: Array<{
    x: number;
    y: number;
    type: 'scout' | 'guard' | 'heavy';
    weapon: 'pistol' | 'shotgun' | 'rifle';
    facingAngle: number;
  }> = [];

  // Spawn 4 to 8 enemies stationed across corridors and inner chambers
  const targetEnemyCount = Math.min(8, Math.max(4, Math.floor(openClusters.length * 1.5) + 3));

  for (let i = 0; i < targetEnemyCount; i++) {
    // Pick from clusters, preferring ones further from player
    const chosenCluster = openClusters[Math.min(openClusters.length - 1, 1 + (i % (openClusters.length - 1 || 1)))];
    if (!chosenCluster || chosenCluster.length === 0) continue;

    // Pick random point inside cluster away from spawn
    const candidate = chosenCluster[Math.floor(Math.random() * chosenCluster.length)];
    const wx = (candidate.x + 0.5) * cellSize;
    const wy = (candidate.y + 0.5) * cellSize;

    const distToPlayer = Math.hypot(wx - playerSpawnWorld.x, wy - playerSpawnWorld.y);
    if (distToPlayer < 250) continue; // Don't spawn on top of player!

    const isBoss = i === targetEnemyCount - 1;
    const type: 'scout' | 'guard' | 'heavy' = isBoss ? 'heavy' : i % 2 === 0 ? 'guard' : 'scout';
    const weapon: 'pistol' | 'shotgun' | 'rifle' = type === 'heavy' ? 'rifle' : type === 'guard' ? 'shotgun' : 'pistol';

    enemySpawns.push({
      x: wx,
      y: wy,
      type,
      weapon,
      facingAngle: Math.atan2(playerSpawnWorld.y - wy, playerSpawnWorld.x - wx),
    });
  }

  // Check if AI analysis override was supplied
  if (options.aiData) {
    applyAiTacticalData(options.aiData, worldSize, rooms, enemySpawns, covers, playerSpawnWorld);
  }

  // Create High-value Objective
  const objective: TacticalObjective = {
    x: (bestObjectivePt.x + 0.5) * cellSize,
    y: (bestObjectivePt.y + 0.5) * cellSize,
    type: 'hostage',
    label: '解救關鍵人質 (VIP)',
    completed: false,
    interactionProgress: 0,
  };

  return {
    id: `map-${Date.now()}`,
    name: options.aiData?.missionTitle || '建築格局圖戰鬥部署',
    description: options.aiData?.briefing || '自動識別牆壁、通道與掩體，肅清全棟敵對目標。',
    width: worldSize,
    height: worldSize,
    gridWidth: gridSize,
    gridHeight: gridSize,
    cellSize,
    grid: cleanedGrid,
    wallSegments,
    rooms,
    covers,
    playerSpawn: playerSpawnWorld,
    objective,
    enemySpawns,
  };
}

/**
 * Converts adjacent cell borders of a binary grid into simplified, merged WallSegments.
 * Blazingly fast raycasting & physics!
 */
function extractSegmentsFromGrid(grid: number[][], cellSize: number): WallSegment[] {
  const gridSize = grid.length;
  const segments: WallSegment[] = [];

  // Horizontal edge pass (look between y and y+1)
  for (let y = 0; y <= gridSize; y++) {
    let startX = -1;
    for (let x = 0; x < gridSize; x++) {
      const top = y > 0 ? grid[y - 1][x] : 0;
      const bottom = y < gridSize ? grid[y][x] : 0;
      const isEdge = top !== bottom;

      if (isEdge) {
        if (startX === -1) startX = x;
      } else {
        if (startX !== -1) {
          segments.push({
            x1: startX * cellSize,
            y1: y * cellSize,
            x2: x * cellSize,
            y2: y * cellSize,
          });
          startX = -1;
        }
      }
    }
    if (startX !== -1) {
      segments.push({
        x1: startX * cellSize,
        y1: y * cellSize,
        x2: gridSize * cellSize,
        y2: y * cellSize,
      });
    }
  }

  // Vertical edge pass (look between x and x+1)
  for (let x = 0; x <= gridSize; x++) {
    let startY = -1;
    for (let y = 0; y < gridSize; y++) {
      const left = x > 0 ? grid[y][x - 1] : 0;
      const right = x < gridSize ? grid[y][x] : 0;
      const isEdge = left !== right;

      if (isEdge) {
        if (startY === -1) startY = y;
      } else {
        if (startY !== -1) {
          segments.push({
            x1: x * cellSize,
            y1: startY * cellSize,
            x2: x * cellSize,
            y2: y * cellSize,
          });
          startY = -1;
        }
      }
    }
    if (startY !== -1) {
      segments.push({
        x1: x * cellSize,
        y1: startY * cellSize,
        x2: x * cellSize,
        y2: gridSize * cellSize,
      });
    }
  }

  return segments;
}

/**
 * Enhances MapData with Gemini AI analysis findings when available
 */
function applyAiTacticalData(
  ai: any,
  worldSize: number,
  rooms: TacticalRoom[],
  enemySpawns: any[],
  covers: TacticalCover[],
  playerSpawn: { x: number; y: number; angle: number }
) {
  if (ai.playerSpawn?.x != null && ai.playerSpawn?.y != null) {
    playerSpawn.x = (ai.playerSpawn.x / 100) * worldSize;
    playerSpawn.y = (ai.playerSpawn.y / 100) * worldSize;
    if (ai.playerSpawn.angle != null) {
      playerSpawn.angle = (ai.playerSpawn.angle * Math.PI) / 180;
    }
  }

  if (Array.isArray(ai.rooms) && ai.rooms.length > 0) {
    rooms.length = 0; // Clear and replace with AI labeled rooms
    ai.rooms.forEach((r: any, idx: number) => {
      rooms.push({
        id: `ai-room-${idx}`,
        name: r.name || `區域 ${idx + 1}`,
        x: (r.x / 100) * worldSize,
        y: (r.y / 100) * worldSize,
        threatLevel: r.threatLevel || 'medium',
        isCleared: false,
      });
    });
  }

  if (Array.isArray(ai.enemies) && ai.enemies.length > 0) {
    enemySpawns.length = 0;
    ai.enemies.forEach((e: any) => {
      enemySpawns.push({
        x: (e.x / 100) * worldSize,
        y: (e.y / 100) * worldSize,
        type: e.type || 'guard',
        weapon: e.weapon || 'pistol',
        facingAngle: ((e.facingAngle || 0) * Math.PI) / 180,
      });
    });
  }

  if (Array.isArray(ai.covers) && ai.covers.length > 0) {
    covers.length = 0;
    ai.covers.forEach((c: any, idx: number) => {
      covers.push({
        id: `ai-cover-${idx}`,
        x: (c.x / 100) * worldSize - 20,
        y: (c.y / 100) * worldSize - 12,
        w: ((c.w || 4) / 100) * worldSize,
        h: ((c.h || 3) / 100) * worldSize,
        type: c.type || 'desk',
        durability: 100,
      });
    });
  }
}
