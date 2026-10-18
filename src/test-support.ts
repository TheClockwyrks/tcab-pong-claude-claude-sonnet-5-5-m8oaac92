// Carom — helpers for the tests: the engine over an in-process canvas and a
// clock of the test's own, plus key and pointer delivery.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export type CaromEngine = Engine<CaromState, CaromDebugApi>;

export interface Rig {
  engine: CaromEngine;
  events: EventTarget;
  cues: string[];
  /** Advances `n` frames of `stepMs` each. */
  step(n: number): Promise<void>;
  /** Presses and releases `code` around one frame. */
  tap(code: string): Promise<void>;
  key(type: "keydown" | "keyup", code: string): void;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    extra?: Record<string, unknown>,
  ): void;
  /** Poses the state through the debug surface. */
  pose(
    change: (debug: CaromDebugApi, s: CaromEngine["state"]) => CaromState,
  ): void;
  snap(): ReturnType<CaromDebugApi["snapshot"]>;
}

/** A started engine with the field to itself; every frame is `stepMs` long. */
export async function makeRig(stepMs = 1000 / 60): Promise<Rig> {
  const events = new EventTarget();
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();

  const key = (type: "keydown" | "keyup", code: string): void => {
    events.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };
  return {
    engine,
    events,
    cues,
    step: (n) => engine.advance(n),
    key,
    async tap(code) {
      key("keydown", code);
      await engine.advance(1);
      key("keyup", code);
    },
    pointer(type, x, y, extra = {}) {
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          ...extra,
        }),
      );
    },
    pose: (change) => {
      engine.apply((s) => change(engine.debug, s));
    },
    snap: () => engine.debug.snapshot(engine.state),
  };
}

/** Starts a Versus match and runs the countdown out, leaving the ball in flight. */
export async function startServed(rig: Rig): Promise<void> {
  rig.pose((d, s) => d.setMode(s, "versus"));
  rig.pose((d, s) =>
    d.setScreen(d.setBallHoldTimer(d.spawnBall(s), 0), "countdown"),
  );
  await rig.step(1);
}
