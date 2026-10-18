// Carom — drawing. Everything is shapes and text on the canvas; nothing is loaded.
// Rendering reads the state and draws it, and changes nothing.

import {
  BALL_R,
  FIELD_CX,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  PADDLE_H,
  PADDLE_W,
  P1_X0,
  P2_X0,
  TITLE_TEXT,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { CaromState } from "./game";
import { itemRect, menuItems } from "./menus";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;
type Ctx = CanvasRenderingContext2D;

export const BACKGROUND = "#0a0e1a";

const LEFT_COLOR = "#3de6ff";
const RIGHT_COLOR = "#ff5c9a";
const OBSTACLE_COLOR = "#ffb724";
const BALL_COLOR = "#fffbe6";
const TEXT_COLOR = "#e8eefc";
const DIM_COLOR = "#7d8bb0";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const MODE_LABELS = { solo: "SOLO · VS CPU", versus: "VERSUS · 2 PLAYERS" };

const HOWTO_LINES = [
  "W / S move the left paddle. In Versus, ↑ / ↓ move the right one.",
  "In Solo, either pair of keys steers you against the CPU.",
  "Enter or Space confirms. P or Esc pauses. M mutes.",
  "",
  "SPIN: a paddle that is moving when it strikes the ball bends the",
  "ball's flight afterward. Move down as you hit and it curves down;",
  "move up and it curves up. The spin fades over about a second.",
  "",
  "Strike off-center to angle the shot. Every hit speeds the ball up.",
  "Two bars stand in the middle of the field: bank shots off them,",
  "and bend your spin around them.",
  "",
  `First to ${WIN_SCORE}, leading by ${WIN_LEAD}, wins.`,
];

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glowRect(
  ctx: Ctx,
  rect: { x: number; y: number; w: number; h: number },
  color: string,
  radius: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fill();
  ctx.restore();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = "bold",
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function drawNet(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = "rgba(125, 139, 176, 0.35)";
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, FIELD_H);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: Ctx, ball: NonNullable<View["ball"]>): void {
  const { trail } = ball;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const points = [...trail.map((s) => ({ x: s.x, y: s.y })), ball];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const k = i / (points.length - 1);
    ctx.strokeStyle = `rgba(255, 251, 230, ${(0.08 + 0.4 * k).toFixed(3)})`;
    ctx.lineWidth = BALL_R * 2 * (0.25 + 0.75 * k);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = BALL_COLOR;
  ctx.shadowColor = BALL_COLOR;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Spin: an arc around the ball that turns the way the flight is bending.
  const strength = Math.min(1, Math.abs(ball.spin) / 600);
  if (strength > 0.05) {
    const sweep = Math.PI * 1.2 * strength;
    const start = ball.spin > 0 ? 0 : Math.PI;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 251, 230, ${(0.3 + 0.5 * strength).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 7, start, start + sweep);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFurniture(ctx: Ctx, state: View): void {
  drawNet(ctx);
  for (const o of state.obstacles) {
    glowRect(
      ctx,
      {
        x: o.cx - OBSTACLE_W / 2,
        y: o.cy - OBSTACLE_H / 2,
        w: OBSTACLE_W,
        h: OBSTACLE_H,
      },
      OBSTACLE_COLOR,
      6,
    );
  }
  const { left, right } = state.paddles;
  glowRect(
    ctx,
    { x: P1_X0, y: left.cy - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H },
    LEFT_COLOR,
    7,
  );
  glowRect(
    ctx,
    { x: P2_X0, y: right.cy - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H },
    RIGHT_COLOR,
    7,
  );
  if (state.ball) drawBall(ctx, state.ball);
}

function drawHud(ctx: Ctx, state: View): void {
  text(ctx, String(state.score.p1), FIELD_CX - 90, 56, 64, LEFT_COLOR);
  text(ctx, String(state.score.p2), FIELD_CX + 90, 56, 64, RIGHT_COLOR);
  text(ctx, MODE_LABELS[state.mode], FIELD_CX, FIELD_H - 24, 18, DIM_COLOR);
}

function veil(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(6, 9, 18, ${alpha})`;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawMenu(ctx: Ctx, state: View): void {
  const items = menuItems(state.screen);
  items.forEach((label, i) => {
    const rect = itemRect(state.screen, i);
    if (!rect) return;
    const selected = i === state.menuIndex;
    ctx.save();
    if (selected) {
      ctx.fillStyle = LEFT_COLOR;
      ctx.shadowColor = LEFT_COLOR;
      ctx.shadowBlur = 20;
    } else {
      ctx.fillStyle = "rgba(125, 139, 176, 0.14)";
    }
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.restore();
    text(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      26,
      selected ? BACKGROUND : TEXT_COLOR,
    );
  });
}

function drawTitle(ctx: Ctx, state: View): void {
  veil(ctx, 0.55);
  ctx.save();
  ctx.shadowColor = LEFT_COLOR;
  ctx.shadowBlur = 36;
  text(ctx, TITLE_TEXT, FIELD_CX, 170, 128, TEXT_COLOR);
  ctx.restore();
  text(
    ctx,
    "A PADDLE DUEL WHERE SPIN BENDS THE BALL",
    FIELD_CX,
    252,
    20,
    DIM_COLOR,
  );
  drawMenu(ctx, state);
  text(
    ctx,
    "W / S or ↑ / ↓ to choose · Enter to confirm",
    FIELD_CX,
    640,
    18,
    DIM_COLOR,
  );
}

function drawHowTo(ctx: Ctx, state: View): void {
  veil(ctx, 0.82);
  text(ctx, "HOW TO PLAY", FIELD_CX, 90, 52, TEXT_COLOR);
  HOWTO_LINES.forEach((line, i) => {
    text(ctx, line, FIELD_CX, 170 + i * 31, 21, TEXT_COLOR, "center", "normal");
  });
  drawMenu(ctx, state);
}

function drawCountdown(ctx: Ctx, state: View): void {
  const ball = state.ball;
  const fraction = ball ? Math.max(0, ball.holdTimer) / HOLD_TIME : 0;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 251, 230, 0.55)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    FIELD_CX,
    360,
    38,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * fraction,
  );
  ctx.stroke();
  ctx.restore();
  text(ctx, "GET READY", FIELD_CX, 250, 34, TEXT_COLOR);
}

function drawPaused(ctx: Ctx, state: View): void {
  veil(ctx, 0.6);
  text(ctx, "PAUSED", FIELD_CX, 190, 72, TEXT_COLOR);
  drawMenu(ctx, state);
}

function drawMatchOver(ctx: Ctx, state: View): void {
  veil(ctx, 0.68);
  const left = state.winner === "left";
  const who =
    state.mode === "solo"
      ? left
        ? "YOU WIN"
        : "CPU WINS"
      : left
        ? "PLAYER ONE WINS"
        : "PLAYER TWO WINS";
  const color = left ? LEFT_COLOR : RIGHT_COLOR;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  text(ctx, who, FIELD_CX, 190, 76, color);
  ctx.restore();
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    296,
    64,
    TEXT_COLOR,
  );
  text(ctx, "FINAL SCORE", FIELD_CX, 350, 18, DIM_COLOR);
  drawMenu(ctx, state);
}

/** Draws the whole frame for `state` in logical field units. */
export function drawGame(ctx: Ctx, state: View): void {
  drawFurniture(ctx, state);
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowTo(ctx, state);
      return;
    default:
      drawHud(ctx, state);
  }
  if (state.screen === "countdown") drawCountdown(ctx, state);
  else if (state.screen === "paused") drawPaused(ctx, state);
  else if (state.screen === "matchover") drawMatchOver(ctx, state);
}
