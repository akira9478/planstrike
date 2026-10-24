export type GameState = 'TITLE' | 'MAP_SELECT' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAMEOVER';

export type GameMode = 'CLEAR_ALL' | 'HOSTAGE_RESCUE' | 'BOMB_DEFUSAL';

export interface Point {
  x: number;
  y: number;
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isCover?: boolean; // Half-height cover vs full wall
  normalX?: number;
  normalY?: number;
}

export interface TacticalRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  threatLevel: 'low' | 'medium' | 'high';
  isCleared?: boolean;
}

export interface TacticalCover {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'desk' | 'sofa' | 'crate' | 'island';
  durability: number;
}

export interface TacticalObjective {
  x: number;
  y: number;
  type: 'hostage' | 'bomb' | 'intel' | 'clear_all';
  label: string;
  completed: boolean;
  interactionProgress?: number; // 0 to 1
}

export interface MapData {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  width: number;
  height: number;
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  // 0: empty floor, 1: solid wall, 2: half-cover, 3: doorway/breach
  grid: number[][];
  wallSegments: WallSegment[];
  rooms: TacticalRoom[];
  covers: TacticalCover[];
  playerSpawn: { x: number; y: number; angle: number };
  objective?: TacticalObjective;
  enemySpawns: Array<{
    x: number;
    y: number;
    type: 'scout' | 'guard' | 'heavy';
    weapon: 'pistol' | 'shotgun' | 'rifle';
    facingAngle: number;
  }>;
}

export interface Weapon {
  name: string;
  type: 'pistol' | 'rifle' | 'shotgun' | 'sniper';
  fireRate: number; // shots per sec
  damage: number;
  pellets: number;
  spread: number; // in radians
  recoil: number;
  magSize: number;
  currentMag: number;
  reserveAmmo: number;
  reloadTime: number; // in ms
  bulletSpeed: number;
  noiseRadius: number;
  silenced?: boolean;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  fromPlayer: boolean;
  distanceTraveled: number;
  maxDistance: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'spark' | 'smoke' | 'blood' | 'casing' | 'muzzle' | 'debris';
  angle?: number;
  angularVelocity?: number;
}

export interface Grenade {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  timer: number;
  maxTimer: number;
  radius: number;
  damage: number;
  type: 'frag' | 'flash';
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  type: 'scout' | 'guard' | 'heavy';
  weapon: Weapon;
  health: number;
  maxHealth: number;
  state: 'idle' | 'patrol' | 'investigate' | 'alert' | 'aiming' | 'dead';
  targetPos?: Point;
  lastKnownPlayerPos?: Point;
  aimProgress: number; // 0 to 1 windup telegraph
  patrolRoute: Point[];
  patrolIndex: number;
  flashStunTimer: number;
  shootCooldown: number;
  searchTimer: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  speed: number;
  isSprinting: boolean;
  isPeeking: boolean;
  weapons: Weapon[];
  currentWeaponIndex: number;
  grenades: number;
  reloadingUntil: number; // timestamp
  lastShotTime: number;
  flashlightOn: boolean;
  laserOn: boolean;
}

export interface GameStats {
  shotsFired: number;
  shotsHit: number;
  enemiesKilled: number;
  headshots: number;
  damageDealt: number;
  damageTaken: number;
  timeElapsed: number;
  roomsCleared: number;
  objectiveCompleted: boolean;
}
