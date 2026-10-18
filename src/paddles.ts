// Carom — paddle movement: input, the AI, the debug driver, and the shared integration.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import type { CaromState, PaddleState, Side } from "./game";
import { clamp } from "./physics";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

/** The held movement actions, as `1` while held and `0` otherwise. */
export interface Held {
  readonly p1Up: number;
  readonly p1Down: number;
  readonly p2Up: number;
  readonly p2Down: number;
}

/**
 * Sets `vy` and integrates it: the clamped step, with `vy` replaced by the velocity
 * the paddle actually travelled when the clamp bit.
 */
export function integrate(
  paddle: DeepReadonly<PaddleState>,
  vy: number,
  dt: number,
): PaddleState {
  const raw = paddle.cy + vy * dt;
  const next = clamp(raw, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actual = next !== raw && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...(paddle as PaddleState), cy: next, vy: actual };
}

/** The AI's velocity for this frame, from the rule in `specs/modes/single-player.md`. */
export function aiVelocity(state: View, dt: number): number {
  const { ai, ball, screen } = state;
  const cy = state.paddles.right.cy;
  if (!ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && screen === "playing" && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

function velocityFor(side: Side, state: View, held: Held, dt: number): number {
  const paddle = state.paddles[side];
  if (paddle.driven) return paddle.drivenVy;
  if (side === "left") {
    const solo = state.mode === "solo";
    const up = solo ? Math.max(held.p1Up, held.p2Up) : held.p1Up;
    const down = solo ? Math.max(held.p1Down, held.p2Down) : held.p1Down;
    return (down - up) * PADDLE_SPEED;
  }
  if (state.mode === "solo") return aiVelocity(state, dt);
  return (held.p2Down - held.p2Up) * PADDLE_SPEED;
}

/** Moves both paddles for one frame. */
export function movePaddles(
  state: View,
  held: Held,
  dt: number,
): CaromState["paddles"] {
  return {
    left: integrate(
      state.paddles.left,
      velocityFor("left", state, held, dt),
      dt,
    ),
    right: integrate(
      state.paddles.right,
      velocityFor("right", state, held, dt),
      dt,
    ),
  };
}
