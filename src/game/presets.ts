/**
 * Pre-rendered realistic architectural floor plan presets.
 * Each preset renders a crisp blueprint image to an HTML Canvas and exports as data URL,
 * so the floor plan parser processes it identically to user-uploaded plans!
 */

export interface FloorPlanPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnailUrl: string;
  generateImage: () => Promise<HTMLImageElement>;
}

function createCanvas(width = 800, height = 800): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function imageFromCanvas(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL('image/png');
  });
}

/**
 * Preset 1: 奢華頂樓公寓 (Penthouse CQB)
 */
async function generatePenthouseImage(): Promise<HTMLImageElement> {
  const { canvas, ctx } = createCanvas(800, 800);

  // Background: clean architectural white
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 800, 800);

  // Grid line accents
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i < 800; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 800);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(800, i);
    ctx.stroke();
  }

  // Draw thick structural walls (Black)
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 16;

  // Outer border with an entrance opening at bottom-left
  ctx.strokeRect(40, 40, 720, 720);

  // Breach opening at bottom (Entrance door)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(80, 750, 70, 30);

  // Interior dividing walls
  ctx.fillStyle = '#0f172a';

  // Vertical main hallway wall
  ctx.fillRect(240, 40, 16, 440); // Leaves doorway from 480 to 560
  ctx.fillRect(240, 560, 16, 200);

  // Living Room / Kitchen horizontal wall
  ctx.fillRect(240, 360, 340, 16); // leaves doorway from 580 to 660
  ctx.fillRect(660, 360, 100, 16);

  // Master Bedroom vertical partition
  ctx.fillRect(520, 40, 16, 320);

  // Balcony / Terrace top partition
  ctx.fillRect(40, 220, 200, 16);

  // Bathroom partition
  ctx.fillRect(40, 460, 200, 16);

  // Half-cover furniture (Desks, Sofas, Kitchen Island) - dark grey
  ctx.fillStyle = '#334155';

  // Kitchen Island (Counter)
  ctx.fillRect(360, 440, 120, 45);

  // Large Sectional Sofa in Living Room
  ctx.fillRect(320, 100, 140, 35);
  ctx.fillRect(320, 135, 35, 70);

  // Dining Table
  ctx.fillRect(600, 440, 90, 55);

  // Master Bed
  ctx.fillRect(620, 100, 90, 110);

  // Office Desk
  ctx.fillRect(80, 280, 80, 35);

  // Text labels on floor plan
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('ENTRY / 玄關', 70, 730);
  ctx.fillText('LIVING ROOM / 客廳', 320, 240);
  ctx.fillText('KITCHEN / 開放式廚房', 340, 540);
  ctx.fillText('MASTER BEDROOM / 主臥', 570, 260);
  ctx.fillText('DINING / 餐廳', 610, 540);
  ctx.fillText('OFFICE / 書房', 80, 350);

  return imageFromCanvas(canvas);
}

/**
 * Preset 2: 科技企業開放式辦公室 (Tech Office)
 */
async function generateOfficeImage(): Promise<HTMLImageElement> {
  const { canvas, ctx } = createCanvas(800, 800);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 800, 800);

  // Subtle grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i < 800; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 800);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(800, i);
    ctx.stroke();
  }

  // Exterior walls
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#0f172a';
  ctx.strokeRect(40, 40, 720, 720);

  // Main elevator lobby entrance opening at bottom center
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(360, 750, 80, 30);

  // Interior executive rooms (top)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, 240, 240, 16);
  ctx.fillRect(280, 40, 16, 200);

  // Server Room (Top Right - high value target)
  ctx.fillRect(540, 40, 16, 220);
  ctx.fillRect(540, 260, 140, 16); // leaves doorway 680 to 760

  // Conference Room (Middle Left)
  ctx.fillRect(40, 480, 240, 16);
  ctx.fillRect(280, 320, 16, 160);

  // Breakroom / Lounge (Bottom Right)
  ctx.fillRect(520, 480, 240, 16);
  ctx.fillRect(520, 480, 16, 180);

  // Cubicle Clusters & Desks (Half-cover)
  ctx.fillStyle = '#334155';

  // Central Open Workspace Desks
  ctx.fillRect(340, 320, 60, 40);
  ctx.fillRect(420, 320, 60, 40);
  ctx.fillRect(340, 400, 60, 40);
  ctx.fillRect(420, 400, 60, 40);
  ctx.fillRect(340, 480, 60, 40);
  ctx.fillRect(420, 480, 60, 40);

  // Conference table
  ctx.fillRect(90, 380, 120, 50);

  // Server Racks (solid metal)
  ctx.fillRect(590, 80, 120, 35);
  ctx.fillRect(590, 150, 120, 35);

  // Labels
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('LOBBY BREACH', 340, 730);
  ctx.fillText('OPEN WORKSPACE', 330, 280);
  ctx.fillText('SERVER VAULT [OBJ]', 570, 230);
  ctx.fillText('CONFERENCE ROOM', 70, 350);
  ctx.fillText('CEO OFFICE', 70, 140);
  ctx.fillText('LOUNGE', 600, 560);

  return imageFromCanvas(canvas);
}

/**
 * Preset 3: SWAT 突擊訓練靶場 (CQB Killhouse)
 */
async function generateKillhouseImage(): Promise<HTMLImageElement> {
  const { canvas, ctx } = createCanvas(800, 800);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 800, 800);

  // Grid
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  for (let i = 0; i < 800; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 800);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(800, i);
    ctx.stroke();
  }

  // Outer walls
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#090d16';
  ctx.strokeRect(40, 40, 720, 720);

  // Entrance opening at left
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(25, 360, 30, 80);

  // Killhouse tactical maze walls with corner blindspots
  ctx.fillStyle = '#090d16';

  // Funnel choke 1
  ctx.fillRect(180, 40, 18, 280);
  ctx.fillRect(180, 480, 18, 280);

  // Room A & B partition
  ctx.fillRect(180, 240, 240, 18);
  ctx.fillRect(360, 40, 18, 200);

  // Center killzone barricades
  ctx.fillRect(320, 380, 160, 18);
  ctx.fillRect(460, 240, 18, 140);

  // Room C & D corridor
  ctx.fillRect(180, 560, 340, 18);
  ctx.fillRect(520, 380, 18, 200);

  // Back room
  ctx.fillRect(600, 140, 18, 420);

  // Tactical Sandbags and Wooden Barricades (Covers)
  ctx.fillStyle = '#475569';
  ctx.fillRect(100, 200, 50, 25);
  ctx.fillRect(100, 540, 50, 25);
  ctx.fillRect(240, 320, 25, 50);
  ctx.fillRect(400, 460, 60, 25);
  ctx.fillRect(540, 200, 30, 60);
  ctx.fillRect(650, 320, 50, 30);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('ENTRY POINT', 60, 350);
  ctx.fillText('SECTOR ALPHA', 230, 140);
  ctx.fillText('SECTOR BRAVO', 240, 640);
  ctx.fillText('KILLZONE DELTA', 340, 350);
  ctx.fillText('SAFE ROOM ECHO', 630, 180);

  return imageFromCanvas(canvas);
}

/**
 * Preset 4: 雙層雙拼別墅 (Suburban Villa)
 */
async function generateVillaImage(): Promise<HTMLImageElement> {
  const { canvas, ctx } = createCanvas(800, 800);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 800, 800);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i < 800; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 800);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(800, i);
    ctx.stroke();
  }

  // Outer walls
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#0f172a';
  ctx.strokeRect(50, 50, 700, 700);

  // Front porch entrance (bottom-left)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(120, 740, 80, 20);

  // Interior layout
  ctx.fillStyle = '#0f172a';

  // Garage wall (Left bottom)
  ctx.fillRect(260, 480, 16, 270);
  ctx.fillRect(50, 480, 210, 16);

  // Grand Hallway & Stairs
  ctx.fillRect(380, 180, 16, 420);

  // Kitchen & Dining (Right bottom)
  ctx.fillRect(396, 480, 240, 16);

  // Master Suite (Top Right)
  ctx.fillRect(396, 260, 240, 16);
  ctx.fillRect(636, 50, 16, 210);

  // Study / Library (Top Left)
  ctx.fillRect(50, 240, 230, 16);

  // Furniture / Covers
  ctx.fillStyle = '#334155';
  ctx.fillRect(80, 320, 120, 50); // Living Room sectional
  ctx.fillRect(480, 560, 110, 45); // Dining table
  ctx.fillRect(460, 100, 100, 90); // Master bed
  ctx.fillRect(100, 100, 80, 35); // Study desk

  // Labels
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('FRONT ENTRY', 90, 720);
  ctx.fillText('GRAND SALON', 80, 420);
  ctx.fillText('CENTRAL GALLERY', 330, 390);
  ctx.fillText('GOURMET KITCHEN', 450, 680);
  ctx.fillText('MASTER BEDROOM', 450, 230);
  ctx.fillText('LIBRARY', 90, 190);

  return imageFromCanvas(canvas);
}

export const MAP_PRESETS: FloorPlanPreset[] = [
  {
    id: 'preset-penthouse',
    name: '奢華頂樓豪宅',
    category: '住宅格局',
    description: '經典 3 房 2 廳格局，寬敞客廳與開放式中島廚房，多重進攻與架槍視角。',
    thumbnailUrl: '',
    generateImage: generatePenthouseImage,
  },
  {
    id: 'preset-office',
    name: '科技企業辦公樓',
    category: '商務格局',
    description: '開放式辦公卡座、會議室與機房金庫，包含狹長走道與高掩護密度戰區。',
    thumbnailUrl: '',
    generateImage: generateOfficeImage,
  },
  {
    id: 'preset-killhouse',
    name: 'SWAT 戰術突擊靶場',
    category: '特警突擊',
    description: '專為 CQB 室內近身格鬥設計的戰術訓練場，充滿死角障礙、木質掩體與盲區。',
    thumbnailUrl: '',
    generateImage: generateKillhouseImage,
  },
  {
    id: 'preset-villa',
    name: '雙層雙拼別墅',
    category: '獨棟住宅',
    description: '雙進車庫、中央挑高走廊與環形房間配置，考驗拐角清房技巧。',
    thumbnailUrl: '',
    generateImage: generateVillaImage,
  },
];
