import { WallSegment, Point } from './types';

export interface RayHit {
  point: Point;
  distance: number;
  angle: number;
}

/**
 * Computes 2D Line of Sight polygon against wall segments using radial raycasting.
 */
export function computeVisibilityPolygon(
  origin: Point,
  wallSegments: WallSegment[],
  maxRadius: number = 550,
  fovAngle?: number, // if defined, restricts to a cone in radians
  facingAngle?: number
): Point[] {
  // Gather unique angles towards all segment endpoints + subtle offsets
  const angles: number[] = [];

  for (const seg of wallSegments) {
    const p1 = { x: seg.x1, y: seg.y1 };
    const p2 = { x: seg.x2, y: seg.y2 };

    const a1 = Math.atan2(p1.y - origin.y, p1.x - origin.x);
    const a2 = Math.atan2(p2.y - origin.y, p2.x - origin.x);

    // Add ray directly at corner and slight offsets around corners to project past them
    angles.push(a1 - 0.0001, a1, a1 + 0.0001);
    angles.push(a2 - 0.0001, a2, a2 + 0.0001);
  }

  // Also cast rays uniformly around the circle
  const stepCount = 64;
  for (let i = 0; i < stepCount; i++) {
    angles.push((i / stepCount) * Math.PI * 2 - Math.PI);
  }

  // Filter angles if within FOV cone
  let validAngles = angles;
  if (fovAngle != null && facingAngle != null) {
    const halfFov = fovAngle / 2;
    validAngles = angles.filter((a) => {
      let diff = a - facingAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      return Math.abs(diff) <= halfFov + 0.08;
    });

    // Ensure boundary rays are included
    validAngles.push(facingAngle - halfFov, facingAngle + halfFov);
  }

  // Cast each ray against all wall segments
  const hits: RayHit[] = [];

  for (const angle of validAngles) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let closestDist = maxRadius;
    let hitPoint: Point = {
      x: origin.x + dir.x * maxRadius,
      y: origin.y + dir.y * maxRadius,
    };

    for (const seg of wallSegments) {
      const hit = raySegmentIntersection(origin, dir, seg);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        hitPoint = hit.point;
      }
    }

    hits.push({
      point: hitPoint,
      distance: closestDist,
      angle: normalizeAngle(angle),
    });
  }

  // Sort hits counterclockwise around origin to form a clean convex/concave polygon
  hits.sort((a, b) => a.angle - b.angle);

  return hits.map((h) => h.point);
}

/**
 * Fast ray-segment intersection.
 */
export function raySegmentIntersection(
  rayOrigin: Point,
  rayDir: Point,
  seg: WallSegment
): { point: Point; distance: number } | null {
  const x1 = seg.x1;
  const y1 = seg.y1;
  const x2 = seg.x2;
  const y2 = seg.y2;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Solving: rayOrigin + t * rayDir = (x1, y1) + u * (dx, dy)
  const denom = rayDir.x * dy - rayDir.y * dx;
  if (Math.abs(denom) < 1e-6) return null; // parallel

  const ox = x1 - rayOrigin.x;
  const oy = y1 - rayOrigin.y;

  const t = (ox * dy - oy * dx) / denom;
  const u = (ox * rayDir.y - oy * rayDir.x) / denom;

  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      point: {
        x: rayOrigin.x + t * rayDir.x,
        y: rayOrigin.y + t * rayDir.y,
      },
      distance: t,
    };
  }

  return null;
}

/**
 * Checks if line of sight between two points is clear (no wall obstruction).
 */
export function hasClearLineOfSight(p1: Point, p2: Point, wallSegments: WallSegment[]): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const totalDist = Math.hypot(dx, dy);
  if (totalDist < 1) return true;

  const dir = { x: dx / totalDist, y: dy / totalDist };

  for (const seg of wallSegments) {
    const hit = raySegmentIntersection(p1, dir, seg);
    if (hit && hit.distance < totalDist - 1) {
      return false; // Obstructed by wall
    }
  }

  return true;
}

function normalizeAngle(a: number): number {
  while (a < -Math.PI) a += Math.PI * 2;
  while (a >= Math.PI) a -= Math.PI * 2;
  return a;
}
