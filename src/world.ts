// Carom — building and re-building the world: the title-screen state, parking
// the ball, serving it, and starting a match.

import {
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  SERVE_ANGLE,
  SERVE_SPEED,
} from "./constants";
import type {
  BallState,
  CaromState,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

/** Draws a serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting to be served. */
export function parkedBall(): BallState {
  return {
    x: 640,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new Error(`Carom: no obstacle with index ${index}`);
  }
  return { index, cx: center.x, cy: center.y };
}

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): readonly ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest in the middle of the field, handed to nobody. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on, and the one a reset returns to. */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    pointerAnchors: [],
  };
}

/** Back to the title: everything restored but the title selection, the clock and the mute bit. */
export function toTitle(state: View): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

/** Starts a match in `mode`, as the title, the pause menu and the match-over menu all do. */
export function startMatch(state: View, mode: View["mode"]): CaromState {
  return {
    ...(state as CaromState),
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    pointerAnchors: [],
  };
}

/** Parks the ball after a point; the serve will travel toward `receiver`. */
export function parkAfterPoint(state: View, receiver: Side): CaromState {
  return {
    ...(state as CaromState),
    receiver,
    ball: parkedBall(),
    screen: "countdown",
  };
}

/** Serves a held ball toward `receiver`, leaving its `serveSign` as it is. */
export function serve(
  ball: DeepReadonly<BallState>,
  receiver: Side,
): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...(ball as BallState),
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}
