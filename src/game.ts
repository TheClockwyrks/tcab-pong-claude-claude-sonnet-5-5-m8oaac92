// Carom — the game: the state it holds and the three functions the engine drives.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import type { CueName } from "./constants";
import { createDebugApi } from "./debug";
import { readInput } from "./menus";
import { advanceMatch } from "./sim";
import { BACKGROUND as FIELD_BACKGROUND, drawGame } from "./render";
import { titleState } from "./world";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/** Where a pointer or touch contact landed on a menu item, until it lifts. */
export interface PointerAnchor {
  readonly id: number;
  readonly item: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /**
   * Menu presses still down, by pointer. A confirm needs the press and the
   * release inside one item, and the two can arrive on different frames.
   */
  readonly pointerAnchors: readonly PointerAnchor[];
}

/** What `snapshot` reports: the declared state in plain values, plus the ball's speed. */
export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: Record<
    Side,
    { cy: number; vy: number; drivenVy: number; driven: boolean }
  >;
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    spin: number;
    held: boolean;
    holdTimer: number;
    serveSign: 1 | -1;
    trail: { x: number; y: number; t: number }[];
  } | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

type View = DeepReadonly<CaromState>;

/** The debug and automation surface `specs/instrumentation.md` fixes. */
export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: View): CaromState;
  spawnBall(state: View): CaromState;
  spawnObstacle(state: View, index: number): CaromState;
  reset(state: View): CaromState;
  reconcile(state: View): CaromState;

  setScreen(state: View, screen: Screen): CaromState;
  setMode(state: View, mode: Mode): CaromState;
  setMenuIndex(state: View, index: number): CaromState;
  setTitleIndex(state: View, index: number): CaromState;
  setResumeScreen(state: View, screen: "countdown" | "playing"): CaromState;

  setScore(state: View, p1: number, p2: number): CaromState;
  setWinner(state: View, side: Side | null): CaromState;
  setReceiver(state: View, side: Side): CaromState;

  setPaddleCy(state: View, side: Side, cy: number): CaromState;
  setPaddleVy(state: View, side: Side, vy: number): CaromState;
  setPaddleDriven(state: View, side: Side, driven: boolean): CaromState;

  setBallPosition(state: View, x: number, y: number): CaromState;
  setBallVelocity(state: View, vx: number, vy: number): CaromState;
  setBallSpin(state: View, spin: number): CaromState;
  setBallHeld(state: View, held: boolean): CaromState;
  setBallHoldTimer(state: View, seconds: number): CaromState;
  setBallServeSign(state: View, sign: 1 | -1): CaromState;
  drawBallServeSign(state: View): CaromState;

  setAiTracking(state: View, enabled: boolean): CaromState;
  setAiMovement(state: View, enabled: boolean): CaromState;

  setMuted(state: View, muted: boolean): CaromState;

  snapshot(state: View): CaromSnapshot;
  menuItemRect(
    state: View,
    index: number,
  ): { x: number; y: number; w: number; h: number } | null;
}

/** The field background, which the engine clears the canvas to each frame. */
export const BACKGROUND = FIELD_BACKGROUND;

const CUE_SPECS: Record<
  CueName,
  Parameters<InitApi<CaromState>["audio"]["define"]>[1]
> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 440,
    freqTo: 330,
    durationMs: 70,
    gain: 0.15,
  },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 220,
    freqTo: 180,
    durationMs: 60,
    gain: 0.2,
  },
  [CUES.obstacleBounce]: {
    wave: "sawtooth",
    freq: 620,
    freqTo: 760,
    durationMs: 80,
    gain: 0.1,
  },
  [CUES.score]: {
    wave: "sine",
    freq: 330,
    freqTo: 880,
    durationMs: 260,
    gain: 0.22,
  },
};

function diagnostic(
  api: InitApi<CaromState>,
  name: string,
  source: (state: View) => string | number | boolean,
): void {
  api.diagnostics.register(name, source);
}

const fixed = (value: number): string => value.toFixed(1);

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const action of ACTIONS) {
      api.input.register(action, { keys: [...BINDINGS[action]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }

    diagnostic(api, "screen", (s) => s.screen);
    diagnostic(api, "mode", (s) => s.mode);
    diagnostic(api, "score", (s) => `${s.score.p1} - ${s.score.p2}`);
    diagnostic(api, "ball pos", (s) =>
      s.ball ? `${fixed(s.ball.x)}, ${fixed(s.ball.y)}` : "-",
    );
    diagnostic(api, "ball vel", (s) =>
      s.ball ? `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}` : "-",
    );
    diagnostic(api, "ball speed", (s) =>
      s.ball ? fixed(Math.hypot(s.ball.vx, s.ball.vy)) : "-",
    );
    diagnostic(api, "ball spin", (s) => (s.ball ? fixed(s.ball.spin) : "-"));
    diagnostic(
      api,
      "left paddle",
      (s) => `${fixed(s.paddles.left.cy)} @ ${fixed(s.paddles.left.vy)}`,
    );
    diagnostic(
      api,
      "right paddle",
      (s) => `${fixed(s.paddles.right.cy)} @ ${fixed(s.paddles.right.vy)}`,
    );

    return [titleState(false), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): CaromState {
    // The mute bit is the runtime's; the state carries its readable copy, and a
    // pose of the copy reaches the runtime here, exactly as the action does.
    const muted = api.input.pressed("mute") ? !state.muted : state.muted;
    if (api.audio.muted() !== muted) api.audio.setMuted(muted);

    const clocked: View = { ...state, simTime: state.simTime + dt, muted };
    const read = readInput(clocked, api.input);
    const value = (name: string): number => api.input.value(name);
    const frame = advanceMatch(
      read,
      {
        p1Up: value("p1-up"),
        p1Down: value("p1-down"),
        p2Up: value("p2-up"),
        p2Down: value("p2-down"),
      },
      dt,
    );
    for (const cue of frame.cues) api.audio.play(cue);
    return frame.state;
  },

  render(state: View, api: RenderApi): void {
    drawGame(api.ctx, state);
  },
};
