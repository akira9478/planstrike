import {
  MapData,
  Player,
  Enemy,
  Bullet,
  Particle,
  Grenade,
  Weapon,
  GameStats,
  Point,
  TacticalRoom,
} from './types';
import { sounds } from './audio';
import { computeVisibilityPolygon, hasClearLineOfSight, raySegmentIntersection } from './raycaster';

export interface EngineCallbacks {
  onStatsUpdate: (stats: GameStats) => void;
  onPlayerUpdate: (player: Player) => void;
  onRoomChange: (roomName: string) => void;
  onVictory: () => void;
  onGameOver: () => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: MapData;
  private callbacks: EngineCallbacks;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastTime: number = 0;
  private hitstopTimer: number = 0;
  private cameraShake: number = 0;

  // Viewport & Camera
  private camera: Point = { x: 0, y: 0 };
  private mouseWorld: Point = { x: 0, y: 0 };
  private mouseScreen: Point = { x: 0, y: 0 };
  private isMouseDown: boolean = false;
  private isRightMouseDown: boolean = false;

  // Key states
  private keysHeld: Record<string, boolean> = {};

  // Entities
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private grenades: Grenade[] = [];
  private floorDecals: Array<{ x: number; y: number; size: number; color: string; rotation: number }> = [];

  // Floating Combat Texts (hit markers / damage)
  private combatTexts: Array<{ x: number; y: number; text: string; color: string; life: number; vy: number }> = [];

  // Fog of war memory
  private exploredGrid: boolean[][] = [];

  // Stats
  private stats: GameStats = {
    shotsFired: 0,
    shotsHit: 0,
    enemiesKilled: 0,
    headshots: 0,
    damageDealt: 0,
    damageTaken: 0,
    timeElapsed: 0,
    roomsCleared: 0,
    objectiveCompleted: false,
  };

  private currentRoomName: string = '';

  constructor(canvas: HTMLCanvasElement, map: MapData, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.map = map;
    this.callbacks = callbacks;

    // Initialize explored grid
    this.exploredGrid = Array.from({ length: map.gridHeight }, () => new Array(map.gridWidth).fill(false));

    // Initialize Player
    this.player = this.createDefaultPlayer(map.playerSpawn);
    this.unstickPlayerIfColliding();

    // Initialize Enemies from map
    this.initEnemies();

    // Center camera on player
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    this.bindEvents();
  }

  private createDefaultPlayer(spawn: { x: number; y: number; angle: number }): Player {
    const weapons: Weapon[] = [
      {
        name: 'USP 戰術消音手槍',
        type: 'pistol',
        fireRate: 4.5,
        damage: 34,
        pellets: 1,
        spread: 0.04,
        recoil: 3,
        magSize: 12,
        currentMag: 12,
        reserveAmmo: 48,
        reloadTime: 1200,
        bulletSpeed: 1400,
        noiseRadius: 120, // Suppressed
        silenced: true,
      },
      {
        name: 'M4A1 特種戰術卡賓槍',
        type: 'rifle',
        fireRate: 11,
        damage: 28,
        pellets: 1,
        spread: 0.07,
        recoil: 4,
        magSize: 30,
        currentMag: 30,
        reserveAmmo: 120,
        reloadTime: 1800,
        bulletSpeed: 1600,
        noiseRadius: 600, // Loud
      },
      {
        name: 'Benelli M4 CQB 霰彈槍',
        type: 'shotgun',
        fireRate: 2.2,
        damage: 20, // x8 pellets = 160 max point-blank
        pellets: 8,
        spread: 0.22,
        recoil: 9,
        magSize: 8,
        currentMag: 8,
        reserveAmmo: 32,
        reloadTime: 2200,
        bulletSpeed: 1200,
        noiseRadius: 750,
      },
      {
        name: 'AWP 戰術穿甲狙擊槍',
        type: 'sniper',
        fireRate: 1.1,
        damage: 130,
        pellets: 1,
        spread: 0.01,
        recoil: 12,
        magSize: 5,
        currentMag: 5,
        reserveAmmo: 15,
        reloadTime: 2500,
        bulletSpeed: 2400,
        noiseRadius: 900,
      },
    ];

    return {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: spawn.angle || 0,
      health: 100,
      maxHealth: 100,
      armor: 100,
      maxArmor: 100,
      speed: 210,
      isSprinting: false,
      isPeeking: false,
      weapons,
      currentWeaponIndex: 0,
      grenades: 2,
      reloadingUntil: 0,
      lastShotTime: 0,
      flashlightOn: true,
      laserOn: true,
    };
  }

  private initEnemies() {
    this.enemies = this.map.enemySpawns.map((s, idx) => {
      const isHeavy = s.type === 'heavy';
      const isGuard = s.type === 'guard';

      const health = isHeavy ? 180 : isGuard ? 90 : 65;

      const weapon: Weapon = {
        name: isHeavy ? 'AK-74M' : isGuard ? 'Pump Shotgun' : 'Pistol',
        type: isHeavy ? 'rifle' : isGuard ? 'shotgun' : 'pistol',
        fireRate: isHeavy ? 7 : isGuard ? 1.6 : 3,
        damage: isHeavy ? 18 : isGuard ? 14 : 15,
        pellets: isGuard ? 6 : 1,
        spread: isGuard ? 0.25 : 0.08,
        recoil: 2,
        magSize: 30,
        currentMag: 30,
        reserveAmmo: 999,
        reloadTime: 2000,
        bulletSpeed: 1100,
        noiseRadius: 500,
      };

      // Create a short patrol path around their spawn
      const patrolRoute: Point[] = [
        { x: s.x, y: s.y },
        { x: s.x + (Math.random() - 0.5) * 80, y: s.y + (Math.random() - 0.5) * 80 },
      ];

      return {
        id: `enemy-${idx}`,
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        angle: s.facingAngle || 0,
        type: s.type,
        weapon,
        health,
        maxHealth: health,
        state: 'idle',
        aimProgress: 0,
        patrolRoute,
        patrolIndex: 0,
        flashStunTimer: 0,
        shootCooldown: Math.random() * 0.8,
        searchTimer: 0,
      };
    });
  }

  // Event Listeners
  private onKeyDown = (e: KeyboardEvent) => {
    this.keysHeld[e.key.toLowerCase()] = true;

    // Edge-triggered actions
    if (e.key === 'r' || e.key === 'R') {
      this.reloadCurrentWeapon();
    } else if (e.key === '1') {
      this.selectWeapon(0);
    } else if (e.key === '2') {
      this.selectWeapon(1);
    } else if (e.key === '3') {
      this.selectWeapon(2);
    } else if (e.key === '4') {
      this.selectWeapon(3);
    } else if (e.key === 'f' || e.key === 'F') {
      this.player.flashlightOn = !this.player.flashlightOn;
    } else if (e.key === 'l' || e.key === 'L') {
      this.player.laserOn = !this.player.laserOn;
    } else if (e.key === 'g' || e.key === 'G') {
      this.throwGrenade();
    } else if (e.key === 'e' || e.key === 'E') {
      this.interactObjective();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld[e.key.toLowerCase()] = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isMouseDown = true;
      this.handleShoot();
    } else if (e.button === 2) {
      e.preventDefault();
      this.throwGrenade();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.isMouseDown = false;
    if (e.button === 2) this.isRightMouseDown = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreen.x = e.clientX - rect.left;
    this.mouseScreen.y = e.clientY - rect.top;

    // Translate to world coords
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    this.mouseWorld.x = this.mouseScreen.x - viewW / 2 + this.camera.x;
    this.mouseWorld.y = this.mouseScreen.y - viewH / 2 + this.camera.y;
  };

  private onBlur = () => {
    this.keysHeld = {};
    this.isMouseDown = false;
    this.isRightMouseDown = false;
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  public destroy() {
    this.isRunning = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop);
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
    this.lastTime = performance.now();
  }

  public selectWeapon(index: number) {
    if (index >= 0 && index < this.player.weapons.length) {
      this.player.currentWeaponIndex = index;
      this.player.reloadingUntil = 0; // Cancel reload
      sounds.playReload();
      this.callbacks.onPlayerUpdate(this.player);
    }
  }

  public reloadCurrentWeapon() {
    const weapon = this.player.weapons[this.player.currentWeaponIndex];
    if (weapon.currentMag >= weapon.magSize || weapon.reserveAmmo <= 0) return;
    if (this.player.reloadingUntil > performance.now()) return;

    this.player.reloadingUntil = performance.now() + weapon.reloadTime;
    sounds.playReload();
    this.callbacks.onPlayerUpdate(this.player);
  }

  private throwGrenade() {
    if (this.player.grenades <= 0) return;
    this.player.grenades--;

    const dx = this.mouseWorld.x - this.player.x;
    const dy = this.mouseWorld.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.min(500, Math.max(200, dist * 1.5));
    const angle = Math.atan2(dy, dx);

    this.grenades.push({
      id: `grenade-${Date.now()}`,
      x: this.player.x + Math.cos(angle) * 15,
      y: this.player.y + Math.sin(angle) * 15,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      timer: 1.6, // seconds
      maxTimer: 1.6,
      radius: 140,
      damage: 150,
      type: 'frag',
    });

    sounds.playReload();
    this.callbacks.onPlayerUpdate(this.player);
  }

  private interactObjective() {
    if (!this.map.objective || this.map.objective.completed) return;
    const dist = Math.hypot(this.player.x - this.map.objective.x, this.player.y - this.map.objective.y);

    if (dist < 60) {
      this.map.objective.completed = true;
      this.stats.objectiveCompleted = true;
      sounds.playVictory();
      this.addCombatText(this.map.objective.x, this.map.objective.y, 'VIP 解救成功！任務完成！', '#22c55e');

      setTimeout(() => {
        this.callbacks.onVictory();
      }, 1500);
    }
  }

  // Main 60 FPS Game Loop
  private gameLoop = (timestamp: number) => {
    if (!this.isRunning) return;

    const rawDt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Clamped frame delta time
    const dt = Math.min(rawDt, 0.05);

    if (!this.isPaused) {
      // Hitstop logic (simulation freeze for weighty critical impacts)
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.update(dt);
      }
    }

    this.render();

    requestAnimationFrame(this.gameLoop);
  };

  private update(dt: number) {
    this.stats.timeElapsed += dt;

    // Camera shake decay
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 25);
    }

    // Check weapon reload completion
    const weapon = this.player.weapons[this.player.currentWeaponIndex];
    if (this.player.reloadingUntil > 0 && performance.now() >= this.player.reloadingUntil) {
      const needed = weapon.magSize - weapon.currentMag;
      const actual = Math.min(needed, weapon.reserveAmmo);
      weapon.currentMag += actual;
      weapon.reserveAmmo -= actual;
      this.player.reloadingUntil = 0;
      this.callbacks.onPlayerUpdate(this.player);
    }

    // Continuous fire if mouse is held & weapon supports it
    if (this.isMouseDown) {
      this.handleShoot();
    }

    // Update Player Movement
    this.updatePlayer(dt);

    // Update Bullets
    this.updateBullets(dt);

    // Update Grenades
    this.updateGrenades(dt);

    // Update Enemies AI
    this.updateEnemies(dt);

    // Update Particles & FX
    this.updateParticles(dt);

    // Update Floating combat text
    this.updateCombatTexts(dt);

    // Update Fog of War exploration
    this.updateExploration();

    // Check Current Room
    this.checkCurrentRoom();

    // Camera smooth follow
    const targetCamX = this.player.x;
    const targetCamY = this.player.y;
    this.camera.x += (targetCamX - this.camera.x) * 0.12;
    this.camera.y += (targetCamY - this.camera.y) * 0.12;

    // Update stats periodically
    this.callbacks.onStatsUpdate(this.stats);
  }

  private updatePlayer(dt: number) {
    // Aiming angle towards mouse world position
    this.player.angle = Math.atan2(this.mouseWorld.y - this.player.y, this.mouseWorld.x - this.player.x);

    // Movement input
    let moveX = 0;
    let moveY = 0;

    if (this.keysHeld['w'] || this.keysHeld['arrowup']) moveY -= 1;
    if (this.keysHeld['s'] || this.keysHeld['arrowdown']) moveY += 1;
    if (this.keysHeld['a'] || this.keysHeld['arrowleft']) moveX -= 1;
    if (this.keysHeld['d'] || this.keysHeld['arrowright']) moveX += 1;

    // Normalize diagonal
    if (moveX !== 0 && moveY !== 0) {
      const len = Math.SQRT2;
      moveX /= len;
      moveY /= len;
    }

    this.player.isSprinting = !!(this.keysHeld['shift'] && (moveX !== 0 || moveY !== 0));
    this.player.isPeeking = !!(this.keysHeld['control'] || this.keysHeld['alt']);

    let currentSpeed = this.player.speed;
    if (this.player.isSprinting) currentSpeed *= 1.45;
    if (this.player.isPeeking) currentSpeed *= 0.5;

    // Emit footstep sound / alert enemies if sprinting
    if (this.player.isSprinting && (moveX !== 0 || moveY !== 0)) {
      this.alertEnemiesInRadius(this.player.x, this.player.y, 280);
    }

    const nextX = this.player.x + moveX * currentSpeed * dt;
    const nextY = this.player.y + moveY * currentSpeed * dt;

    // Apply movement with continuous slide collision & de-penetration
    const radius = 14;
    this.player.x = nextX;
    this.player.y = nextY;

    const resolved = this.resolveWallCollisions(this.player.x, this.player.y, radius);
    this.player.x = resolved.x;
    this.player.y = resolved.y;

    // Keep inside bounds
    this.player.x = Math.max(radius + 10, Math.min(this.map.width - radius - 10, this.player.x));
    this.player.y = Math.max(radius + 10, Math.min(this.map.height - radius - 10, this.player.y));
  }

  private handleShoot() {
    const weapon = this.player.weapons[this.player.currentWeaponIndex];
    const now = performance.now();

    // Check fire rate & reload
    if (this.player.reloadingUntil > now) return;
    if (now - this.player.lastShotTime < 1000 / weapon.fireRate) return;

    if (weapon.currentMag <= 0) {
      sounds.playEmptyClick();
      this.player.lastShotTime = now;
      this.reloadCurrentWeapon();
      return;
    }

    weapon.currentMag--;
    this.player.lastShotTime = now;
    this.stats.shotsFired += weapon.pellets;

    // Sound effect
    if (weapon.type === 'pistol') sounds.playPistolShot();
    else if (weapon.type === 'rifle') sounds.playRifleShot();
    else if (weapon.type === 'shotgun') sounds.playShotgunShot();
    else sounds.playRifleShot();

    // Gunshot noise alert
    this.alertEnemiesInRadius(this.player.x, this.player.y, weapon.noiseRadius);

    // Camera recoil kick
    this.cameraShake = Math.min(18, this.cameraShake + weapon.recoil * 1.2);

    // Muzzle flash particle
    const barrelDist = 24;
    const muzzleX = this.player.x + Math.cos(this.player.angle) * barrelDist;
    const muzzleY = this.player.y + Math.sin(this.player.angle) * barrelDist;

    this.particles.push({
      x: muzzleX,
      y: muzzleY,
      vx: 0,
      vy: 0,
      life: 0.05,
      maxLife: 0.05,
      color: '#fef08a',
      size: 16,
      type: 'muzzle',
    });

    // Eject brass casing
    const casingAngle = this.player.angle - Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    this.particles.push({
      x: this.player.x,
      y: this.player.y,
      vx: Math.cos(casingAngle) * (80 + Math.random() * 50),
      vy: Math.sin(casingAngle) * (80 + Math.random() * 50),
      life: 1.5,
      maxLife: 1.5,
      color: '#eab308',
      size: 3,
      type: 'casing',
      angle: Math.random() * Math.PI,
      angularVelocity: (Math.random() - 0.5) * 15,
    });

    // Spawn pellets / bullets
    for (let p = 0; p < weapon.pellets; p++) {
      const spread = (Math.random() - 0.5) * weapon.spread * (this.player.isSprinting ? 2.0 : 1.0);
      const bulletAngle = this.player.angle + spread;

      this.bullets.push({
        id: `bullet-${Date.now()}-${p}`,
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(bulletAngle) * weapon.bulletSpeed,
        vy: Math.sin(bulletAngle) * weapon.bulletSpeed,
        damage: weapon.damage,
        fromPlayer: true,
        distanceTraveled: 0,
        maxDistance: 950,
        color: '#fbbf24',
      });
    }

    this.callbacks.onPlayerUpdate(this.player);
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const stepDist = Math.hypot(b.vx, b.vy) * dt;
      const rayOrigin = { x: b.x, y: b.y };
      const rayDir = { x: b.vx / (stepDist / dt), y: b.vy / (stepDist / dt) };

      // Check wall intersection along continuous path
      let hitWall = false;
      let closestWallDist = stepDist;
      let wallHitPoint = { x: b.x + b.vx * dt, y: b.y + b.vy * dt };

      for (const seg of this.map.wallSegments) {
        const hit = raySegmentIntersection(rayOrigin, rayDir, seg);
        if (hit && hit.distance <= stepDist && hit.distance < closestWallDist) {
          closestWallDist = hit.distance;
          wallHitPoint = hit.point;
          hitWall = true;
        }
      }

      // Check entity collision
      if (b.fromPlayer) {
        let hitEnemy: Enemy | null = null;
        let enemyHitDist = closestWallDist;

        for (const enemy of this.enemies) {
          if (enemy.state === 'dead') continue;
          const distToEnemy = Math.hypot(enemy.x - b.x, enemy.y - b.y);
          if (distToEnemy < 18 && distToEnemy < enemyHitDist) {
            hitEnemy = enemy;
            enemyHitDist = distToEnemy;
          }
        }

        if (hitEnemy) {
          // Flesh hit!
          this.stats.shotsHit++;
          this.stats.damageDealt += b.damage;
          hitEnemy.health -= b.damage;

          sounds.playFleshHit();

          // Blood splatters
          this.spawnBlood(hitEnemy.x, hitEnemy.y, Math.atan2(b.vy, b.vx));

          // Damage float
          this.addCombatText(hitEnemy.x, hitEnemy.y - 12, `-${b.damage}`, '#ef4444');

          // Alert enemy & surrounding guards immediately
          hitEnemy.state = 'alert';
          hitEnemy.lastKnownPlayerPos = { x: this.player.x, y: this.player.y };
          this.alertEnemiesInRadius(hitEnemy.x, hitEnemy.y, 400);

          // Check kill
          if (hitEnemy.health <= 0) {
            hitEnemy.state = 'dead';
            this.stats.enemiesKilled++;
            sounds.playEnemyAlert();

            // Hitstop on kill!
            this.hitstopTimer = 0.055;
            this.cameraShake = 9;

            this.addCombatText(hitEnemy.x, hitEnemy.y - 28, 'TARGET DOWN', '#fbbf24');

            // Drop ammo or armor plate
            if (Math.random() < 0.6) {
              const currentW = this.player.weapons[this.player.currentWeaponIndex];
              currentW.reserveAmmo += currentW.magSize;
              this.addCombatText(this.player.x, this.player.y - 15, `+彈藥 (${currentW.name})`, '#38bdf8');
            }

            // Check if all hostiles cleared
            if (this.enemies.every((e) => e.state === 'dead')) {
              sounds.playVictory();
              setTimeout(() => this.callbacks.onVictory(), 1200);
            }
          }

          this.bullets.splice(i, 1);
          continue;
        }
      } else {
        // Bullet from enemy hitting player
        const distToPlayer = Math.hypot(this.player.x - b.x, this.player.y - b.y);
        if (distToPlayer < 16 && distToPlayer < closestWallDist) {
          this.damagePlayer(b.damage);
          this.bullets.splice(i, 1);
          continue;
        }
      }

      if (hitWall) {
        // Spark & ricochet sound
        sounds.playRicochet();
        this.spawnWallSparks(wallHitPoint.x, wallHitPoint.y);

        this.bullets.splice(i, 1);
        continue;
      }

      // Move bullet forward
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.distanceTraveled += stepDist;

      if (b.distanceTraveled >= b.maxDistance) {
        this.bullets.splice(i, 1);
      }
    }
  }

  private damagePlayer(amount: number) {
    sounds.playHurt();
    this.stats.damageTaken += amount;
    this.cameraShake = 14;

    // Armor absorbs 65% of damage
    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, amount * 0.65);
      this.player.armor -= absorbed;
      amount -= absorbed;
    }

    this.player.health = Math.max(0, this.player.health - amount);
    this.spawnBlood(this.player.x, this.player.y, Math.random() * Math.PI * 2);

    this.callbacks.onPlayerUpdate(this.player);

    if (this.player.health <= 0) {
      sounds.playDefeat();
      this.callbacks.onGameOver();
    }
  }

  private updateGrenades(dt: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.timer -= dt;

      // Friction
      g.vx *= 0.94;
      g.vy *= 0.94;

      const nextX = g.x + g.vx * dt;
      const nextY = g.y + g.vy * dt;

      // Bounce off walls
      if (this.checkWallCollision(nextX, g.y, 8)) {
        g.vx = -g.vx * 0.6;
        sounds.playRicochet();
      } else {
        g.x = nextX;
      }

      if (this.checkWallCollision(g.x, nextY, 8)) {
        g.vy = -g.vy * 0.6;
        sounds.playRicochet();
      } else {
        g.y = nextY;
      }

      // Detonation
      if (g.timer <= 0) {
        sounds.playExplosion();
        this.cameraShake = 22;

        // Shockwave particles
        for (let p = 0; p < 45; p++) {
          const angle = (p / 45) * Math.PI * 2;
          const spd = 120 + Math.random() * 220;
          this.particles.push({
            x: g.x,
            y: g.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 0.6 + Math.random() * 0.3,
            maxLife: 0.9,
            color: p % 2 === 0 ? '#f97316' : '#e2e8f0',
            size: 6 + Math.random() * 8,
            type: 'debris',
          });
        }

        // Damage enemies within radius with line-of-sight check
        for (const enemy of this.enemies) {
          if (enemy.state === 'dead') continue;
          const dist = Math.hypot(enemy.x - g.x, enemy.y - g.y);
          if (dist < g.radius) {
            if (hasClearLineOfSight({ x: g.x, y: g.y }, { x: enemy.x, y: enemy.y }, this.map.wallSegments)) {
              const falloff = 1 - dist / g.radius;
              const dmg = Math.round(g.damage * falloff);
              enemy.health -= dmg;
              this.spawnBlood(enemy.x, enemy.y, Math.atan2(enemy.y - g.y, enemy.x - g.x));
              this.addCombatText(enemy.x, enemy.y - 15, `-${dmg}`, '#f97316');

              if (enemy.health <= 0) {
                enemy.state = 'dead';
                this.stats.enemiesKilled++;
              }
            }
          }
        }

        // Player self-damage check
        const pDist = Math.hypot(this.player.x - g.x, this.player.y - g.y);
        if (pDist < g.radius && hasClearLineOfSight({ x: g.x, y: g.y }, this.player, this.map.wallSegments)) {
          const pDmg = Math.round(g.damage * (1 - pDist / g.radius) * 0.7);
          this.damagePlayer(pDmg);
        }

        this.grenades.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;

      const distToPlayer = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
      const angleToPlayer = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);

      // Field of view check (120 degree cone) & clear LOS
      let angleDiff = angleToPlayer - enemy.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      const inFov = Math.abs(angleDiff) < (Math.PI / 3) * 1.2 || distToPlayer < 75; // Peripherals or close range
      const canSeePlayer = inFov && distToPlayer < 520 && hasClearLineOfSight(enemy, this.player, this.map.wallSegments);

      if (canSeePlayer) {
        enemy.state = 'alert';
        enemy.lastKnownPlayerPos = { x: this.player.x, y: this.player.y };
        enemy.searchTimer = 5.0; // Keep hunting for 5s if lost sight

        // Smooth aim at player
        enemy.angle += angleDiff * Math.min(1.0, dt * 7);

        // Windup telegraph before firing (gives player tactical reaction time!)
        enemy.aimProgress = Math.min(1.0, enemy.aimProgress + dt * (enemy.type === 'scout' ? 2.4 : 1.8));

        if (enemy.aimProgress >= 1.0) {
          enemy.shootCooldown -= dt;
          if (enemy.shootCooldown <= 0) {
            this.enemyFire(enemy);
            enemy.shootCooldown = 1 / enemy.weapon.fireRate;
            enemy.aimProgress = 0.5; // Quick subsequent burst
          }
        }
      } else {
        // Player not currently visible
        enemy.aimProgress = Math.max(0, enemy.aimProgress - dt * 2);

        if (enemy.state === 'alert' && enemy.lastKnownPlayerPos) {
          // Hunt towards last known position
          const dx = enemy.lastKnownPlayerPos.x - enemy.x;
          const dy = enemy.lastKnownPlayerPos.y - enemy.y;
          const huntDist = Math.hypot(dx, dy);

          if (huntDist > 30) {
            const huntAngle = Math.atan2(dy, dx);
            enemy.angle += (huntAngle - enemy.angle) * dt * 4;
            const moveSpeed = enemy.type === 'scout' ? 140 : 95;
            this.moveEnemy(enemy, Math.cos(huntAngle) * moveSpeed * dt, Math.sin(huntAngle) * moveSpeed * dt);
          } else {
            // Reached last known pos, look around
            enemy.searchTimer -= dt;
            enemy.angle += dt * 1.5;
            if (enemy.searchTimer <= 0) {
              enemy.state = 'idle';
              enemy.lastKnownPlayerPos = undefined;
            }
          }
        } else {
          // Passive patrol or guard post
          enemy.state = 'patrol';
          if (enemy.patrolRoute.length > 0) {
            const target = enemy.patrolRoute[enemy.patrolIndex];
            const tdx = target.x - enemy.x;
            const tdy = target.y - enemy.y;
            const tdist = Math.hypot(tdx, tdy);

            if (tdist < 15) {
              enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrolRoute.length;
            } else {
              const patrolAngle = Math.atan2(tdy, tdx);
              enemy.angle = patrolAngle;
              this.moveEnemy(enemy, Math.cos(patrolAngle) * 50 * dt, Math.sin(patrolAngle) * 50 * dt);
            }
          }
        }
      }
    }
  }

  private moveEnemy(enemy: Enemy, dx: number, dy: number) {
    const radius = 13;
    enemy.x += dx;
    enemy.y += dy;
    const resolved = this.resolveWallCollisions(enemy.x, enemy.y, radius);
    enemy.x = resolved.x;
    enemy.y = resolved.y;
  }

  private enemyFire(enemy: Enemy) {
    if (enemy.weapon.type === 'shotgun') sounds.playShotgunShot();
    else if (enemy.weapon.type === 'rifle') sounds.playRifleShot();
    else sounds.playPistolShot();

    const barrelDist = 20;
    const muzzleX = enemy.x + Math.cos(enemy.angle) * barrelDist;
    const muzzleY = enemy.y + Math.sin(enemy.angle) * barrelDist;

    for (let p = 0; p < enemy.weapon.pellets; p++) {
      const spread = (Math.random() - 0.5) * enemy.weapon.spread;
      const angle = enemy.angle + spread;

      this.bullets.push({
        id: `ebullet-${Date.now()}-${p}`,
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(angle) * enemy.weapon.bulletSpeed,
        vy: Math.sin(angle) * enemy.weapon.bulletSpeed,
        damage: enemy.weapon.damage,
        fromPlayer: false,
        distanceTraveled: 0,
        maxDistance: 800,
        color: '#ef4444',
      });
    }

    // Muzzle flash
    this.particles.push({
      x: muzzleX,
      y: muzzleY,
      vx: 0,
      vy: 0,
      life: 0.05,
      maxLife: 0.05,
      color: '#f87171',
      size: 14,
      type: 'muzzle',
    });
  }

  private alertEnemiesInRadius(x: number, y: number, radius: number) {
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < radius) {
        enemy.state = 'alert';
        enemy.lastKnownPlayerPos = { x, y };
        enemy.searchTimer = 6.0;
      }
    }
  }

  private checkWallCollision(x: number, y: number, radius: number): boolean {
    const cellSize = this.map.cellSize;
    const minGridX = Math.max(0, Math.floor((x - radius) / cellSize));
    const maxGridX = Math.min(this.map.gridWidth - 1, Math.floor((x + radius) / cellSize));
    const minGridY = Math.max(0, Math.floor((y - radius) / cellSize));
    const maxGridY = Math.min(this.map.gridHeight - 1, Math.floor((y + radius) / cellSize));

    for (let gy = minGridY; gy <= maxGridY; gy++) {
      for (let gx = minGridX; gx <= maxGridX; gx++) {
        if (this.map.grid[gy][gx] === 1) {
          // AABB vs circle collision
          const closestX = Math.max(gx * cellSize, Math.min(x, (gx + 1) * cellSize));
          const closestY = Math.max(gy * cellSize, Math.min(y, (gy + 1) * cellSize));
          const distSq = (x - closestX) * (x - closestX) + (y - closestY) * (y - closestY);
          if (distSq < radius * radius) return true;
        }
      }
    }

    return false;
  }

  /**
   * Continuous circle-vs-box pushback and sliding resolution.
   * Completely eliminates getting stuck on walls or corners!
   */
  public resolveWallCollisions(px: number, py: number, radius: number): { x: number; y: number } {
    const cellSize = this.map.cellSize;
    let resX = px;
    let resY = py;

    // Run relaxation passes for corner handling
    for (let iter = 0; iter < 3; iter++) {
      const minGridX = Math.max(0, Math.floor((resX - radius - 1) / cellSize));
      const maxGridX = Math.min(this.map.gridWidth - 1, Math.floor((resX + radius + 1) / cellSize));
      const minGridY = Math.max(0, Math.floor((resY - radius - 1) / cellSize));
      const maxGridY = Math.min(this.map.gridHeight - 1, Math.floor((resY + radius + 1) / cellSize));

      for (let gy = minGridY; gy <= maxGridY; gy++) {
        for (let gx = minGridX; gx <= maxGridX; gx++) {
          if (this.map.grid[gy][gx] === 1) {
            const boxMinX = gx * cellSize;
            const boxMaxX = (gx + 1) * cellSize;
            const boxMinY = gy * cellSize;
            const boxMaxY = (gy + 1) * cellSize;

            const closestX = Math.max(boxMinX, Math.min(resX, boxMaxX));
            const closestY = Math.max(boxMinY, Math.min(resY, boxMaxY));

            const dx = resX - closestX;
            const dy = resY - closestY;
            const distSq = dx * dx + dy * dy;

            if (distSq < radius * radius) {
              if (distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const overlap = radius - dist;
                resX += (dx / dist) * overlap;
                resY += (dy / dist) * overlap;
              } else {
                // If center is completely inside wall cell, push to nearest edge
                const dLeft = Math.abs(resX - boxMinX);
                const dRight = Math.abs(boxMaxX - resX);
                const dTop = Math.abs(resY - boxMinY);
                const dBottom = Math.abs(boxMaxY - resY);
                const minD = Math.min(dLeft, dRight, dTop, dBottom);
                if (minD === dLeft) resX = boxMinX - radius - 1;
                else if (minD === dRight) resX = boxMaxX + radius + 1;
                else if (minD === dTop) resY = boxMinY - radius - 1;
                else resY = boxMaxY + radius + 1;
              }
            }
          }
        }
      }
    }

    return { x: resX, y: resY };
  }

  /**
   * Ensures the entity is placed in a clean, open room if the initial coordinates
   * overlap with a wall block.
   */
  private unstickPlayerIfColliding() {
    const radius = 14;
    // Step 1: try physics pushback
    const resolved = this.resolveWallCollisions(this.player.x, this.player.y, radius + 2);
    this.player.x = resolved.x;
    this.player.y = resolved.y;

    // Step 2: if still colliding, search outward in spiral for open clearance
    if (this.checkWallCollision(this.player.x, this.player.y, radius)) {
      const cellSize = this.map.cellSize;
      let found = false;

      for (let r = 1; r <= 30 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const candX = this.player.x + dx * cellSize;
            const candY = this.player.y + dy * cellSize;

            if (candX > 40 && candX < this.map.width - 40 && candY > 40 && candY < this.map.height - 40) {
              if (!this.checkWallCollision(candX, candY, radius + 4)) {
                this.player.x = candX;
                this.player.y = candY;
                found = true;
                break;
              }
            }
          }
        }
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.angularVelocity && p.angle != null) {
        p.angle += p.angularVelocity * dt;
      }

      if (p.life <= 0) {
        // If casing or blood, stamp to floor decals for persistent immersion!
        if (p.type === 'casing' || p.type === 'blood') {
          if (this.floorDecals.length < 300) {
            this.floorDecals.push({
              x: p.x,
              y: p.y,
              size: p.size,
              color: p.color,
              rotation: p.angle || 0,
            });
          }
        }
        this.particles.splice(i, 1);
      }
    }
  }

  private spawnBlood(x: number, y: number, impactAngle: number) {
    for (let i = 0; i < 9; i++) {
      const angle = impactAngle + (Math.random() - 0.5) * 1.2;
      const spd = 40 + Math.random() * 90;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.15 + Math.random() * 0.2,
        maxLife: 0.35,
        color: '#dc2626',
        size: 3 + Math.random() * 4,
        type: 'blood',
      });
    }
  }

  private spawnWallSparks(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.12 + Math.random() * 0.1,
        maxLife: 0.22,
        color: '#fef08a',
        size: 2,
        type: 'spark',
      });
    }
  }

  private addCombatText(x: number, y: number, text: string, color: string) {
    this.combatTexts.push({
      x,
      y,
      text,
      color,
      life: 0.9,
      vy: -40,
    });
  }

  private updateCombatTexts(dt: number) {
    for (let i = this.combatTexts.length - 1; i >= 0; i--) {
      const ct = this.combatTexts[i];
      ct.life -= dt;
      ct.y += ct.vy * dt;
      if (ct.life <= 0) {
        this.combatTexts.splice(i, 1);
      }
    }
  }

  private updateExploration() {
    const cellSize = this.map.cellSize;
    const px = Math.floor(this.player.x / cellSize);
    const py = Math.floor(this.player.y / cellSize);
    const radiusCells = 16;

    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        const gx = px + dx;
        const gy = py + dy;
        if (gx >= 0 && gx < this.map.gridWidth && gy >= 0 && gy < this.map.gridHeight) {
          if (dx * dx + dy * dy <= radiusCells * radiusCells) {
            this.exploredGrid[gy][gx] = true;
          }
        }
      }
    }
  }

  private checkCurrentRoom() {
    let closestRoom: TacticalRoom | null = null;
    let closestDist = 200;

    for (const room of this.map.rooms) {
      const dist = Math.hypot(this.player.x - room.x, this.player.y - room.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestRoom = room;
      }
    }

    if (closestRoom && closestRoom.name !== this.currentRoomName) {
      this.currentRoomName = closestRoom.name;
      this.callbacks.onRoomChange(closestRoom.name);
    }
  }

  // High Fidelity Tactical Rendering Pipeline
  private render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();

    // Camera shake offset
    const shakeX = (Math.random() - 0.5) * this.cameraShake * 1.5;
    const shakeY = (Math.random() - 0.5) * this.cameraShake * 1.5;

    ctx.translate(w / 2 - this.camera.x + shakeX, h / 2 - this.camera.y + shakeY);

    // 1. Draw Architectural Floor & Blueprint Grid
    this.renderFloor(ctx);

    // 2. Draw Floor Decals (spent casings, bullet marks, blood)
    this.renderDecals(ctx);

    // 3. Draw Tactical Objectives & Covers
    this.renderObjectivesAndCovers(ctx);

    // 4. Draw Characters (Enemies and Player)
    this.renderEntities(ctx);

    // 5. Draw Bullets & Grenades
    this.renderProjectiles(ctx);

    // 6. Draw Particles
    this.renderParticles(ctx);

    // 7. Dynamic Fog of War & Flashlight Lighting Cone
    this.renderLightingAndFog(ctx);

    // 8. Render Walls with High Contrast & Drop Shadows
    this.renderWalls(ctx);

    // 9. Floating Combat Texts & Aim Reticle
    this.renderFloatingText(ctx);

    ctx.restore();

    // 10. Screen-space HUD Reticle
    this.renderScreenCrosshair(ctx, this.mouseScreen.x, this.mouseScreen.y);
  }

  private renderFloor(ctx: CanvasRenderingContext2D) {
    // Blueprint navy base
    ctx.fillStyle = '#0b1329';
    ctx.fillRect(0, 0, this.map.width, this.map.height);

    // Subtle tactical coordinate grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const step = 80;

    for (let x = 0; x < this.map.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.map.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.map.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.map.width, y);
      ctx.stroke();
    }

    // Room Label Decals on floor
    ctx.fillStyle = 'rgba(71, 85, 105, 0.4)';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    for (const room of this.map.rooms) {
      ctx.fillText(`// [${room.name}]`, room.x, room.y);
    }
  }

  private renderDecals(ctx: CanvasRenderingContext2D) {
    for (const d of this.floorDecals) {
      ctx.fillStyle = d.color;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 1.8);
      ctx.restore();
    }
  }

  private renderObjectivesAndCovers(ctx: CanvasRenderingContext2D) {
    // Render Covers (Furniture, Desks, Sandbags)
    for (const c of this.map.covers) {
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeRect(c.x, c.y, c.w, c.h);

      // Diagonal cover stripes
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + c.w, c.y + c.h);
      ctx.stroke();
    }

    // Render High-value Objective (VIP / Intel)
    if (this.map.objective && !this.map.objective.completed) {
      const obj = this.map.objective;
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.15;

      // Glowing beacon circle
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 24 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.fill();

      // Core hostage icon
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(obj.label, obj.x, obj.y - 28);
    }
  }

  private renderEntities(ctx: CanvasRenderingContext2D) {
    // 1. Render Enemies
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') {
        // Dead body on floor
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.angle);
        ctx.fillStyle = '#374151';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.angle);

      // Enemy Body Color based on class
      const isHeavy = enemy.type === 'heavy';
      const bodyColor = isHeavy ? '#991b1b' : '#b91c1c';

      // Laser Sight if aiming at player
      if (enemy.aimProgress > 0.1) {
        ctx.save();
        ctx.strokeStyle = `rgba(239, 68, 68, ${enemy.aimProgress})`;
        ctx.lineWidth = isHeavy ? 2.5 : 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(500, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Torso & Shoulders
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, isHeavy ? 15 : 13, isHeavy ? 17 : 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gun Barrel
      ctx.fillStyle = '#111827';
      ctx.fillRect(8, -3, 16, 6);

      // Helmet / Head
      ctx.fillStyle = isHeavy ? '#1f2937' : '#450a0a';
      ctx.beginPath();
      ctx.arc(-2, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Health bar above enemy if damaged
      if (enemy.health < enemy.maxHealth) {
        const barW = 32;
        const barH = 4;
        const hpPercent = enemy.health / enemy.maxHealth;
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(enemy.x - barW / 2, enemy.y - 24, barW, barH);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(enemy.x - barW / 2, enemy.y - 24, barW * hpPercent, barH);
      }
    }

    // 2. Render Player
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.rotate(this.player.angle);

    // Laser Sight beam
    if (this.player.laserOn) {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(600, 0);
      ctx.stroke();

      // Laser dot
      ctx.beginPath();
      ctx.arc(600, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
    }

    // Tactical SWAT Player Torso
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // SWAT tactical vest plates
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, -8, 12, 16);

    // Hands & Weapon
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(12, 8, 4, 0, Math.PI * 2); // right hand
    ctx.arc(12, -8, 4, 0, Math.PI * 2); // left hand
    ctx.fill();

    // Weapon Barrel
    ctx.fillStyle = '#090d16';
    const weapon = this.player.weapons[this.player.currentWeaponIndex];
    const barrelLength = weapon.type === 'sniper' ? 28 : weapon.type === 'shotgun' ? 24 : 18;
    ctx.fillRect(10, -3, barrelLength, 6);

    // Suppressor if silenced
    if (weapon.silenced) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(10 + barrelLength, -4, 8, 8);
    }

    // Helmet with tactical night vision mount
    ctx.fillStyle = '#0369a1';
    ctx.beginPath();
    ctx.arc(-2, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D) {
    // Bullets
    for (const b of this.bullets) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.fromPlayer ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / 1000) * 18, b.y - (b.vy / 1000) * 18);
      ctx.stroke();
    }

    // Grenades
    for (const g of this.grenades) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'muzzle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderLightingAndFog(ctx: CanvasRenderingContext2D) {
    // Compute dynamic visibility polygon against walls
    const poly = computeVisibilityPolygon(
      this.player,
      this.map.wallSegments,
      this.player.flashlightOn ? 580 : 320
    );

    if (poly.length < 3) return;

    // Create dark shroud over the world
    ctx.save();

    // Mask unseen areas with tactical blueprint darkness
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = this.canvas.width;
    maskCanvas.height = this.canvas.height;
    const mctx = maskCanvas.getContext('2d')!;

    mctx.fillStyle = 'rgba(7, 12, 26, 0.88)';
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Carve out visible polygon from mask
    mctx.globalCompositeOperation = 'destination-out';
    mctx.save();
    mctx.translate(this.canvas.width / 2 - this.camera.x, this.canvas.height / 2 - this.camera.y);

    mctx.beginPath();
    mctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      mctx.lineTo(poly[i].x, poly[i].y);
    }
    mctx.closePath();
    mctx.fill();

    mctx.restore();

    // Draw darkness back onto main canvas
    ctx.drawImage(maskCanvas, -this.canvas.width / 2 + this.camera.x, -this.canvas.height / 2 + this.camera.y);

    ctx.restore();

    // Flashlight illuminated glow cone
    if (this.player.flashlightOn) {
      ctx.save();
      const grad = ctx.createRadialGradient(
        this.player.x,
        this.player.y,
        20,
        this.player.x + Math.cos(this.player.angle) * 350,
        this.player.y + Math.sin(this.player.angle) * 350,
        500
      );
      grad.addColorStop(0, 'rgba(240, 249, 255, 0.15)');
      grad.addColorStop(1, 'rgba(240, 249, 255, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(this.player.x, this.player.y);
      ctx.arc(this.player.x, this.player.y, 500, this.player.angle - 0.7, this.player.angle + 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderWalls(ctx: CanvasRenderingContext2D) {
    const cellSize = this.map.cellSize;

    // Draw Solid Wall Blocks with bevel
    for (let gy = 0; gy < this.map.gridHeight; gy++) {
      for (let gx = 0; gx < this.map.gridWidth; gx++) {
        if (this.map.grid[gy][gx] === 1) {
          const wx = gx * cellSize;
          const wy = gy * cellSize;

          // Wall fill
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(wx, wy, cellSize, cellSize);

          // Top highlight
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(wx, wy, cellSize, cellSize);
        }
      }
    }
  }

  private renderFloatingText(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';

    for (const ct of this.combatTexts) {
      ctx.fillStyle = ct.color;
      ctx.globalAlpha = Math.min(1.0, ct.life * 1.5);
      ctx.fillText(ct.text, ct.x, ct.y);
    }

    ctx.restore();
  }

  private renderScreenCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
    const weapon = this.player.weapons[this.player.currentWeaponIndex];
    const isReloading = this.player.reloadingUntil > performance.now();

    ctx.save();
    ctx.translate(sx, sy);

    if (isReloading) {
      // Reload spinner
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      const angle = (performance.now() * 0.008) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(0, 0, 14, angle, angle + Math.PI * 1.2);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RELOAD', 0, 26);
    } else {
      // Tactical dynamic reticle
      const gap = 8 + (this.player.isSprinting ? 8 : 0);
      const len = 7;

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;

      // Center dot
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      // Top
      ctx.beginPath();
      ctx.moveTo(0, -gap);
      ctx.lineTo(0, -gap - len);
      ctx.stroke();

      // Bottom
      ctx.beginPath();
      ctx.moveTo(0, gap);
      ctx.lineTo(0, gap + len);
      ctx.stroke();

      // Left
      ctx.beginPath();
      ctx.moveTo(-gap, 0);
      ctx.lineTo(-gap - len, 0);
      ctx.stroke();

      // Right
      ctx.beginPath();
      ctx.moveTo(gap, 0);
      ctx.lineTo(gap + len, 0);
      ctx.stroke();
    }

    ctx.restore();
  }
}
