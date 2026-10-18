// Carom — the debug and automation surface (`specs/instrumentation.md`).
// Every operation is a pose or a reading in the shape of `update`: it takes the
// current state and returns the next one, or what it read.

import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Side,
} from "./game";
import { itemRect } from "./menus";
import {
  allObstacles,
  drawServeSign,
  obstacleAt,
  parkedBall,
  titleState,
} from "./world";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

/** The ball, or a loud failure when the field carries none. */
function requireBall(state: View, operation: string): DeepReadonly<BallState> {
  if (state.ball === null) {
    throw new Error(`Carom: ${operation} needs a ball, and the field has none`);
  }
  return state.ball;
}

function withBall(
  state: View,
  operation: string,
  change: Partial<BallState>,
): CaromState {
  const ball = requireBall(state, operation);
  return {
    ...(state as CaromState),
    ball: { ...(ball as BallState), ...change },
  };
}

function withPaddle(
  state: View,
  side: Side,
  change: Partial<CaromState["paddles"]["left"]>,
): CaromState {
  return {
    ...(state as CaromState),
    paddles: {
      ...(state.paddles as CaromState["paddles"]),
      [side]: { ...state.paddles[side], ...change },
    },
  };
}

function snapshot(state: View): CaromSnapshot {
  const { ball } = state;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { ...state.ai },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  const set =
    <K extends keyof CaromState>(key: K) =>
    (state: View, value: CaromState[K]): CaromState => ({
      ...(state as CaromState),
      [key]: value,
    });

  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (state) => ({
      ...(state as CaromState),
      ball: null,
      obstacles: [],
    }),
    spawnBall: (state) => ({ ...(state as CaromState), ball: parkedBall() }),
    spawnObstacle: (state, index) => {
      const placed = obstacleAt(index);
      const others = state.obstacles.filter((o) => o.index !== index);
      return {
        ...(state as CaromState),
        obstacles: [...others, placed].sort((a, b) => a.index - b.index),
      };
    },
    reset: (state) => {
      const fresh = titleState(state.muted);
      return { ...fresh, ball: parkedBall(), obstacles: allObstacles() };
    },
    // Nothing here is stored as a copy of something else, so there is nothing to rewrite.
    reconcile: (state) => state as CaromState,

    setScreen: set("screen"),
    setMode: set("mode"),
    setMenuIndex: set("menuIndex"),
    setTitleIndex: set("titleIndex"),
    setResumeScreen: set("resumeScreen"),

    setScore: (state, p1, p2) => ({
      ...(state as CaromState),
      score: { p1, p2 },
    }),
    setWinner: set("winner"),
    setReceiver: set("receiver"),

    setPaddleCy: (state, side, cy) => withPaddle(state, side, { cy }),
    setPaddleVy: (state, side, vy) => withPaddle(state, side, { drivenVy: vy }),
    setPaddleDriven: (state, side, driven) =>
      withPaddle(state, side, { driven }),

    setBallPosition: (state, x, y) =>
      withBall(state, "setBallPosition", { x, y }),
    setBallVelocity: (state, vx, vy) =>
      withBall(state, "setBallVelocity", { vx, vy }),
    setBallSpin: (state, spin) => withBall(state, "setBallSpin", { spin }),
    setBallHeld: (state, held) => withBall(state, "setBallHeld", { held }),
    setBallHoldTimer: (state, seconds) =>
      withBall(state, "setBallHoldTimer", { holdTimer: seconds }),
    setBallServeSign: (state, sign) =>
      withBall(state, "setBallServeSign", { serveSign: sign }),
    drawBallServeSign: (state) =>
      withBall(state, "drawBallServeSign", { serveSign: drawServeSign() }),

    setAiTracking: (state, enabled) => ({
      ...(state as CaromState),
      ai: { ...state.ai, tracking: enabled },
    }),
    setAiMovement: (state, enabled) => ({
      ...(state as CaromState),
      ai: { ...state.ai, movement: enabled },
    }),

    setMuted: set("muted"),

    snapshot,
    menuItemRect: (state, index) => itemRect(state.screen, index),
  };
}
