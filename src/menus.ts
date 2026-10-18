// Carom — the menus: their items and hit regions, and how keyboard, pointer and
// touch move through them.

import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import type { CaromState, Screen } from "./game";
import { startMatch, toTitle } from "./world";
import type { PointerSample } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";

type View = DeepReadonly<CaromState>;

/** The single item of the how-to screen. */
export const HOWTO_ITEMS = ["BACK TO MENU"] as const;

export interface ItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ITEM_W = 360;
const ITEM_H = 54;
const ITEM_PITCH = 68;
const ITEM_X = (1280 - ITEM_W) / 2;

/** Top of the first item on each menu screen. */
const MENU_TOP: Partial<Record<Screen, number>> = {
  title: 330,
  howto: 620,
  paused: 290,
  matchover: 430,
};

/** The items the menu on `screen` offers, empty for screens without one. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    default:
      return [];
  }
}

/** The hit region of item `index` on `screen`, or `null` when there is no such item. */
export function itemRect(screen: Screen, index: number): ItemRect | null {
  const top = MENU_TOP[screen];
  const count = menuItems(screen).length;
  if (top === undefined || !Number.isInteger(index)) return null;
  if (index < 0 || index >= count) return null;
  return { x: ITEM_X, y: top + index * ITEM_PITCH, w: ITEM_W, h: ITEM_H };
}

/** The index of the item whose region holds `(x, y)`, or `-1`. */
function itemAt(screen: Screen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let i = 0; i < count; i++) {
    const r = itemRect(screen, i);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return i;
    }
  }
  return -1;
}

/** What the menus read from the engine in one frame. */
export interface MenuInput {
  pressed(name: string): boolean;
  pointerSamples(): PointerSample[];
}

function wrap(index: number, count: number): number {
  return (index + count) % count;
}

/** Confirms the item at `menuIndex` of the menu `state.screen` shows. */
function activate(state: View): CaromState {
  const index = state.menuIndex;
  switch (state.screen) {
    case "title":
      if (index < 0 || index >= TITLE_ITEMS.length) return state as CaromState;
      if (index === 2) {
        return {
          ...(state as CaromState),
          titleIndex: index,
          screen: "howto",
          menuIndex: 0,
        };
      }
      return startMatch(
        { ...state, titleIndex: index },
        index === 0 ? "solo" : "versus",
      );
    case "howto":
      return index === 0 ? toTitle(state) : (state as CaromState);
    case "paused":
      if (index === 0) {
        return { ...(state as CaromState), screen: state.resumeScreen };
      }
      if (index === 1) return startMatch(state, state.mode);
      return index === 2 ? toTitle(state) : (state as CaromState);
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      return index === 1 ? toTitle(state) : (state as CaromState);
    default:
      return state as CaromState;
  }
}

/** Keyboard on a menu screen. Returns the next state. */
function keyboard(state: View, input: MenuInput): CaromState {
  const up = input.pressed("p1-up") || input.pressed("p2-up");
  const down = input.pressed("p1-down") || input.pressed("p2-down");
  const confirm = input.pressed("confirm");
  const back = input.pressed("back");
  const pause = input.pressed("pause");
  const count = menuItems(state.screen).length;
  const moved = up || down;
  const base = state as CaromState;

  if (state.screen === "howto") {
    return confirm || back ? toTitle(state) : base;
  }
  if (state.screen === "paused" && (pause || back)) {
    return { ...base, screen: state.resumeScreen };
  }
  if (moved) {
    const menuIndex = up
      ? wrap(state.menuIndex - 1, count)
      : wrap(state.menuIndex + 1, count);
    return { ...base, menuIndex };
  }
  if (confirm) return activate(state);
  if (back && state.screen === "matchover") return toTitle(state);
  return base;
}

/** Pointer and touch on a menu screen, applied after the frame's keyboard edges. */
function pointer(state: View, input: MenuInput): CaromState {
  let next = state as CaromState;
  const anchors = new Map(state.pointerAnchors.map((a) => [a.id, a.item]));

  for (const sample of input.pointerSamples()) {
    if (sample.button !== null && sample.button !== "primary") continue;
    const item = itemAt(next.screen, sample.x, sample.y);
    if (item >= 0) next = { ...next, menuIndex: item };
    if (sample.type === "down") {
      anchors.set(sample.id, item);
    } else if (sample.type === "up") {
      const pressedOn = anchors.get(sample.id);
      anchors.delete(sample.id);
      if (item >= 0 && pressedOn === item) return activate(next);
    }
  }
  const pointerAnchors = [...anchors]
    .filter(([, item]) => item >= 0)
    .map(([id, item]) => ({ id, item }));
  return { ...next, pointerAnchors };
}

/**
 * One frame of input on the screen the update began on: pause toggling during a
 * match, and keyboard then pointer on a menu.
 */
export function readInput(state: View, input: MenuInput): CaromState {
  const { screen } = state;
  if (screen === "countdown" || screen === "playing") {
    const pause = input.pressed("pause");
    return pause
      ? {
          ...(state as CaromState),
          resumeScreen: screen,
          screen: "paused",
          menuIndex: 0,
        }
      : (state as CaromState);
  }

  const afterKeys = keyboard(state, input);
  // A confirm or a resume from the keyboard ends the frame's menu input.
  if (afterKeys.screen !== screen) return { ...afterKeys, pointerAnchors: [] };
  const afterPointer = pointer(afterKeys, input);
  return afterPointer.screen === screen
    ? afterPointer
    : { ...afterPointer, pointerAnchors: [] };
}
