// Carom — the ball's flight: sub-stepped integration, spin, and every collision.

import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_HH,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { Rect } from "./constants";
import type { BallState, CaromState } from "./game";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

/** Which kinds of contact a frame raised; each sounds at most once per frame. */
export interface Contacts {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
}

type Face = "left" | "right" | "top" | "bottom";

/** The ball's mutable working copy inside one frame's sub-steps. */
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Circle against axis-aligned rectangle: the face the ball struck, with the ball
 * placed `BALL_R` off it, or `null` when the ball does not overlap the rectangle.
 */
function strikeFace(body: Body, rect: Rect): Face | null {
  const left = body.x - (rect.x0 - BALL_R);
  const right = rect.x1 + BALL_R - body.x;
  const top = body.y - (rect.y0 - BALL_R);
  const bottom = rect.y1 + BALL_R - body.y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;

  const depth = Math.min(left, right, top, bottom);
  let face: Face = "bottom";
  if (depth === left) face = "left";
  else if (depth === right) face = "right";
  else if (depth === top) face = "top";

  switch (face) {
    case "left":
      body.x = rect.x0 - BALL_R;
      break;
    case "right":
      body.x = rect.x1 + BALL_R;
      break;
    case "top":
      body.y = rect.y0 - BALL_R;
      break;
    case "bottom":
      body.y = rect.y1 + BALL_R;
      break;
  }
  return face;
}

/** Reverses the velocity component normal to `face` if it points into the face. */
function reflectOffFace(body: Body, face: Face): void {
  if (face === "left" && body.vx > 0) body.vx = -body.vx;
  else if (face === "right" && body.vx < 0) body.vx = -body.vx;
  else if (face === "top" && body.vy > 0) body.vy = -body.vy;
  else if (face === "bottom" && body.vy < 0) body.vy = -body.vy;
}

function resolveWalls(body: Body): boolean {
  if (body.y - BALL_R < 0 && body.vy < 0) {
    body.y = BALL_R;
    body.vy = -body.vy;
    return true;
  }
  if (body.y + BALL_R > FIELD_H && body.vy > 0) {
    body.y = FIELD_H - BALL_R;
    body.vy = -body.vy;
    return true;
  }
  return false;
}

/** The paddle bounce: angle from the contact point, speed-up, and spin from motion. */
function bouncePaddle(
  body: Body,
  paddleCy: number,
  paddleVy: number,
  dir: 1 | -1,
): void {
  const offset = clamp((body.y - paddleCy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(body.vx, body.vy) * SPEED_MULT, SPEED_CAP);
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.spin = clamp(
    body.spin + paddleVy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  body.x = dir === 1 ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

/** Resolves the ball against one paddle; returns which kind of contact it raised. */
function resolvePaddle(
  body: Body,
  x0: number,
  x1: number,
  cy: number,
  vy: number,
  dir: 1 | -1,
  contacts: Contacts,
): void {
  const face = strikeFace(body, {
    x0,
    x1,
    y0: cy - PADDLE_HALF,
    y1: cy + PADDLE_HALF,
  });
  if (face === null) return;
  if (face === "left" || face === "right") {
    bouncePaddle(body, cy, vy, dir);
    contacts.paddle = true;
  } else {
    reflectOffFace(body, face);
    contacts.wall = true;
  }
}

function resolveObstacle(
  body: Body,
  cx: number,
  cy: number,
  contacts: Contacts,
): void {
  const face = strikeFace(body, {
    x0: cx - OBSTACLE_HW,
    x1: cx + OBSTACLE_HW,
    y0: cy - OBSTACLE_HH,
    y1: cy + OBSTACLE_HH,
  });
  if (face === null) return;
  reflectOffFace(body, face);
  contacts.obstacle = true;
}

/** One sub-step of `h` seconds: spin, decay, advance, then every collision in order. */
function subStep(body: Body, state: View, h: number, contacts: Contacts): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > 0) {
    const angle = (body.spin / speed) * h;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vx = body.vx * cos - body.vy * sin;
    body.vy = body.vx * sin + body.vy * cos;
    body.vx = vx;
  }
  body.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
  body.x += body.vx * h;
  body.y += body.vy * h;

  if (resolveWalls(body)) contacts.wall = true;
  const { left, right } = state.paddles;
  resolvePaddle(body, P1_X0, P1_X1, left.cy, left.vy, 1, contacts);
  resolvePaddle(body, P2_X0, P2_X1, right.cy, right.vy, -1, contacts);
  for (const obstacle of state.obstacles) {
    resolveObstacle(body, obstacle.cx, obstacle.cy, contacts);
  }
}

/**
 * Advances a flying ball by `dt` seconds in `n` sub-steps, against the paddles and
 * obstacles of `state`. The trail is left to the caller.
 */
export function advanceBall(
  ball: DeepReadonly<BallState>,
  state: View,
  dt: number,
): { ball: BallState; contacts: Contacts } {
  const body: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const contacts: Contacts = { paddle: false, wall: false, obstacle: false };
  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) subStep(body, state, h, contacts);
  return {
    ball: { ...(ball as BallState), ...body },
    contacts,
  };
}
