# Carom

A top-down paddle duel that runs entirely in the browser. Two paddles face each
other across a dark field while a ball ricochets between them, off the top and
bottom walls, and off two obstacles in the middle. You score when the ball passes
the far edge behind your opponent's paddle.

Carom's twist is **spin**: a paddle that is moving when it strikes the ball bends
the ball's flight afterward — down if the paddle was moving down, up if it was
moving up — and the bend fades over about a second. With two obstacles in the
middle of the field, every rally becomes a bank-shot puzzle. First to 11 points,
leading by at least 2, wins.

Play **Solo** against the CPU or **Versus** with a friend on the same keyboard.
Everything is drawn in code on a canvas; the game ships no art or audio files.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the address Vite prints. Press the backtick key (`` ` ``) in the game to
toggle the engine's debug overlay.

## Production build

```sh
npm run build
```

This type-checks and writes the static site to `dist/`, ready to be served as-is
from the root of any static file server (`npm run preview` serves it locally).

## Controls

| Action                    | Keys                      |
| ------------------------- | ------------------------- |
| Left paddle up / down     | `W` / `S`                 |
| Right paddle up / down    | `↑` / `↓` (Versus)        |
| Menus: move / confirm     | `W` `S` `↑` `↓` / `Enter` or `Space` |
| Pause and resume          | `P` or `Esc`              |
| Back (menus)              | `Esc`                     |
| Mute                      | `M`                       |

In Solo either pair of movement keys steers your paddle. Menus also respond to the
mouse, and touchscreens get on-screen sliders for each paddle.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --check
npm test            # vitest with coverage
```

## Layout

- `src/game.ts` — the state, the debug surface type, and the engine hooks.
- `src/sim.ts`, `src/physics.ts`, `src/paddles.ts` — the render-free simulation.
- `src/menus.ts` — menu items, hit regions, keyboard, pointer and touch input.
- `src/world.ts` — title state, parking, serving, starting a match.
- `src/debug.ts` — the debug and automation surface.
- `src/render.ts` — all drawing.
- `showcase/` — the store-page description, carousel and media.
