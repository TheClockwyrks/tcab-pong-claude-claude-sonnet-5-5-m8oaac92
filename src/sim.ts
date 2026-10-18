// Carom — one frame of the match: the paddles, the serve, the ball, and scoring.
// Pure over the state: it reads nothing from the renderer or the engine.

import { BALL_R, FIELD_W, TRAIL_TIME, WIN_LEAD, WIN_SCORE } from "./constants";
import type { CueName } from "./constants";
import { CUES } from "./constants";
import type { BallState, CaromState, Side } from "./game";
import { advanceBall } from "./physics";
import type { Contacts } from "./physics";
import { movePaddles } from "./paddles";
import type { Held } from "./paddles";
import { parkAfterPoint, serve } from "./world";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

export interface Frame {
  state: CaromState;
  /** The cues this frame raises, each once, in a fixed order. */
  cues: CueName[];
}

/** Appends the ball's position to its trail and drops samples older than `TRAIL_TIME`. */
function withTrail(ball: BallState, t: number): BallState {
  const kept = ball.trail.filter((sample) => t - sample.t <= TRAIL_TIME);
  return { ...ball, trail: [...kept, { x: ball.x, y: ball.y, t }] };
}

function cuesFor(contacts: Contacts, scored: boolean): CueName[] {
  const cues: CueName[] = [];
  if (contacts.paddle) cues.push(CUES.paddleHit);
  if (contacts.wall) cues.push(CUES.wallBounce);
  if (contacts.obstacle) cues.push(CUES.obstacleBounce);
  if (scored) cues.push(CUES.score);
  return cues;
}

/** Whether the score is a finished match, and who won it. */
export function winnerOf(p1: number, p2: number): Side | null {
  if (p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD) return "left";
  if (p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD) return "right";
  return null;
}

/** Awards the point the ball's exit scored, and either ends the match or parks the ball. */
function scorePoint(state: CaromState, scorer: Side): CaromState {
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = winnerOf(score.p1, score.p2);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return parkAfterPoint(
    { ...state, score },
    scorer === "left" ? "right" : "left",
  );
}

/** Advances a `countdown` or `playing` screen by `dt` seconds. */
export function advanceMatch(state: View, held: Held, dt: number): Frame {
  if (state.screen !== "countdown" && state.screen !== "playing") {
    return { state: state as CaromState, cues: [] };
  }
  const paddles = movePaddles(state, held, dt);
  const moved: CaromState = { ...(state as CaromState), paddles };
  const ball = moved.ball;
  if (ball === null) return { state: moved, cues: [] };

  if (ball.held) {
    const holdTimer = ball.holdTimer - dt;
    if (holdTimer <= 0) {
      return {
        state: {
          ...moved,
          screen: "playing",
          ball: serve(ball, moved.receiver),
        },
        cues: [],
      };
    }
    const waiting = withTrail({ ...ball, holdTimer }, moved.simTime);
    return { state: { ...moved, ball: waiting }, cues: [] };
  }
  if (moved.screen === "countdown") {
    return {
      state: { ...moved, ball: withTrail(ball, moved.simTime) },
      cues: [],
    };
  }

  const flown = advanceBall(ball, moved, dt);
  const scorer: Side | null =
    flown.ball.x - BALL_R > FIELD_W
      ? "left"
      : flown.ball.x + BALL_R < 0
        ? "right"
        : null;
  const cues = cuesFor(flown.contacts, scorer !== null);
  if (scorer !== null) {
    return { state: scorePoint({ ...moved, ball: flown.ball }, scorer), cues };
  }
  return {
    state: { ...moved, ball: withTrail(flown.ball, moved.simTime) },
    cues,
  };
}
