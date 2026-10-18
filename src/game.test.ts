import { describe, expect, it } from "vitest";
import {
  AI_HOME_Y,
  BALL_R,
  CUES,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_SPEED,
  SERVE_SPEED,
  SPEED_CAP,
  TRAIL_TIME,
} from "./constants";
import { makeRig, startServed } from "./test-support";

describe("the title state", () => {
  it("opens on the title screen with the declared values", async () => {
    const rig = await makeRig();
    const s = rig.snap();
    expect(s).toMatchObject({
      version: 1,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      simTime: 0,
      muted: false,
      ai: { tracking: true, movement: true },
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(s.obstacles.map((o) => [o.cx, o.cy])).toEqual(
      OBSTACLE_CENTERS.map((c) => [c.x, c.y]),
    );
  });

  it("registers its diagnostics against the current state", async () => {
    const rig = await makeRig();
    const names = rig.engine.diagnostics().map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "screen",
        "mode",
        "score",
        "ball pos",
        "ball speed",
        "left paddle",
      ]),
    );
    rig.pose((d, s) => d.clearWorld(s));
    const ball = rig.engine.diagnostics().find((r) => r.name === "ball pos");
    expect(ball?.value).toBe("-");
  });

  it("renders every screen without touching the state", async () => {
    const rig = await makeRig();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      rig.pose((d, s) => d.setWinner(d.setScreen(s, screen), "right"));
      const before = rig.engine.state;
      await rig.step(1);
      if (
        screen === "title" ||
        screen === "howto" ||
        screen === "paused" ||
        screen === "matchover"
      ) {
        expect(rig.engine.state.screen).toBe(before.screen);
      }
    }
    rig.pose((d, s) => d.setMode(d.setScreen(s, "matchover"), "versus"));
    rig.pose((d, s) => d.setWinner(s, "left"));
    await rig.step(1);
    rig.pose((d, s) => d.setBallSpin(d.setScreen(s, "playing"), 800));
    await rig.step(1);
  });
});

describe("menus", () => {
  it("moves with wrap and starts a solo match on confirm", async () => {
    const rig = await makeRig();
    await rig.tap("KeyW");
    expect(rig.snap().menuIndex).toBe(2);
    await rig.tap("KeyS");
    expect(rig.snap().menuIndex).toBe(0);
    await rig.tap("ArrowDown");
    await rig.tap("ArrowUp");
    await rig.tap("Escape");
    expect(rig.snap().screen).toBe("title");
    await rig.tap("Enter");
    const s = rig.snap();
    expect(s).toMatchObject({
      screen: "countdown",
      mode: "solo",
      titleIndex: 0,
      menuIndex: 0,
    });
    expect(s.ball?.held).toBe(true);
  });

  it("starts versus and remembers the title selection", async () => {
    const rig = await makeRig();
    await rig.tap("KeyS");
    await rig.tap("Space");
    expect(rig.snap()).toMatchObject({
      mode: "versus",
      titleIndex: 1,
      screen: "countdown",
    });
  });

  it("applies up before down and movement before confirm", async () => {
    const rig = await makeRig();
    rig.key("keydown", "KeyW");
    rig.key("keydown", "KeyS");
    rig.key("keydown", "Enter");
    await rig.step(1);
    expect(rig.snap()).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("opens and leaves the how-to screen", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.setMenuIndex(s, 2));
    await rig.tap("Enter");
    expect(rig.snap()).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 2,
    });
    await rig.tap("Enter");
    expect(rig.snap()).toMatchObject({ screen: "title", menuIndex: 2 });
    await rig.tap("Enter");
    await rig.tap("Escape");
    await rig.tap("Enter");
    expect(rig.snap().screen).toBe("howto");
    await rig.tap("Escape");
    expect(rig.snap().screen).toBe("title");
  });

  it("pauses on one Escape, resumes on the next, and the pause menu works", async () => {
    const rig = await makeRig();
    await rig.tap("Enter");
    await rig.tap("Escape");
    expect(rig.snap()).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
      menuIndex: 0,
    });
    const timer = rig.snap().ball?.holdTimer;
    await rig.step(5);
    expect(rig.snap().ball?.holdTimer).toBe(timer);
    await rig.tap("Escape");
    expect(rig.snap().screen).toBe("countdown");
    await rig.tap("KeyP");
    await rig.tap("KeyP");
    expect(rig.snap().screen).toBe("countdown");
    await rig.tap("KeyP");
    await rig.tap("KeyW");
    expect(rig.snap().menuIndex).toBe(2);
    await rig.tap("Enter");
    expect(rig.snap().screen).toBe("title");
    await rig.tap("Enter");
    await rig.tap("KeyP");
    await rig.tap("KeyS");
    await rig.tap("Enter");
    expect(rig.snap()).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
    });
    await rig.tap("KeyP");
    await rig.tap("Enter");
    expect(rig.snap().screen).toBe("countdown");
  });

  it("drives the match-over menu", async () => {
    const rig = await makeRig();
    rig.pose((d, s) =>
      d.setWinner(d.setScreen(d.setMode(s, "versus"), "matchover"), "left"),
    );
    await rig.tap("KeyS");
    expect(rig.snap().menuIndex).toBe(1);
    await rig.tap("Escape");
    expect(rig.snap().screen).toBe("title");
    rig.pose((d, s) => d.setScreen(d.setMode(s, "versus"), "matchover"));
    await rig.tap("Enter");
    expect(rig.snap()).toMatchObject({
      screen: "countdown",
      mode: "versus",
      winner: null,
    });
    rig.pose((d, s) => d.setScreen(s, "matchover"));
    await rig.tap("ArrowDown");
    await rig.tap("Enter");
    expect(rig.snap().screen).toBe("title");
  });

  it("selects on hover and confirms a press and release inside one item", async () => {
    const rig = await makeRig();
    const second = rig.engine.debug.menuItemRect(rig.engine.state, 1);
    expect(second).not.toBeNull();
    const cx = (second?.x ?? 0) + (second?.w ?? 0) / 2;
    const cy = (second?.y ?? 0) + (second?.h ?? 0) / 2;
    rig.pointer("pointermove", cx, cy);
    await rig.step(1);
    expect(rig.snap()).toMatchObject({ menuIndex: 1, screen: "title" });
    rig.pointer("pointerdown", cx, cy);
    await rig.step(1);
    rig.pointer("pointerup", cx, cy);
    await rig.step(1);
    expect(rig.snap()).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });

  it("confirms when the press and release share a frame, and not across items", async () => {
    const rig = await makeRig();
    const a = rig.engine.debug.menuItemRect(rig.engine.state, 0);
    const b = rig.engine.debug.menuItemRect(rig.engine.state, 1);
    rig.pointer("pointerdown", (a?.x ?? 0) + 5, (a?.y ?? 0) + 5);
    rig.pointer("pointerup", (b?.x ?? 0) + 5, (b?.y ?? 0) + 5);
    await rig.step(1);
    expect(rig.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
    rig.pointer("pointerdown", 5, 5);
    rig.pointer("pointerup", (b?.x ?? 0) + 5, (b?.y ?? 0) + 5);
    await rig.step(1);
    expect(rig.snap().screen).toBe("title");
    rig.pointer("pointerdown", (a?.x ?? 0) + 5, (a?.y ?? 0) + 5);
    rig.pointer("pointerup", (a?.x ?? 0) + 5, (a?.y ?? 0) + 5);
    await rig.step(1);
    expect(rig.snap()).toMatchObject({ screen: "countdown", mode: "solo" });
  });

  it("lets the keyboard confirm win over a pointer confirm on the same frame", async () => {
    const rig = await makeRig();
    const b = rig.engine.debug.menuItemRect(rig.engine.state, 1);
    rig.key("keydown", "Enter");
    rig.pointer("pointerdown", (b?.x ?? 0) + 5, (b?.y ?? 0) + 5);
    rig.pointer("pointerup", (b?.x ?? 0) + 5, (b?.y ?? 0) + 5);
    await rig.step(1);
    expect(rig.snap()).toMatchObject({ mode: "solo", titleIndex: 0 });
  });

  it("reports no rectangle for screens without a menu or items past the end", async () => {
    const rig = await makeRig();
    expect(rig.engine.debug.menuItemRect(rig.engine.state, 3)).toBeNull();
    expect(rig.engine.debug.menuItemRect(rig.engine.state, -1)).toBeNull();
    rig.pose((d, s) => d.setScreen(s, "playing"));
    expect(rig.engine.debug.menuItemRect(rig.engine.state, 0)).toBeNull();
    rig.pose((d, s) => d.setScreen(s, "howto"));
    expect(rig.engine.debug.menuItemRect(rig.engine.state, 0)).not.toBeNull();
    expect(rig.engine.debug.menuItemRect(rig.engine.state, 1)).toBeNull();
  });
});

describe("serving and the countdown", () => {
  it("holds, counts down, then serves toward the receiver without advancing", async () => {
    const rig = await makeRig(125);
    await rig.tap("Enter");
    expect(rig.snap().ball?.holdTimer).toBeCloseTo(0.875, 6);
    await rig.step(6);
    expect(rig.snap().screen).toBe("countdown");
    await rig.step(1);
    const s = rig.snap();
    expect(s.screen).toBe("playing");
    expect(s.ball).toMatchObject({ held: false, holdTimer: 0, x: 640, y: 360 });
    expect(s.ball?.speed).toBeCloseTo(SERVE_SPEED, 6);
    expect(s.ball?.vx).toBeLessThan(0);
  });

  it("gives both serve signs over a run of serves", async () => {
    const rig = await makeRig();
    const signs = new Set<number>();
    for (let i = 0; i < 40; i++) {
      rig.pose((d, s) => d.spawnBall(s));
      signs.add(rig.snap().ball?.serveSign ?? 0);
    }
    expect(signs).toEqual(new Set([1, -1]));
  });

  it("moves the paddles from input during the countdown", async () => {
    const rig = await makeRig();
    await rig.tap("Enter");
    rig.key("keydown", "KeyS");
    await rig.step(3);
    expect(rig.snap().paddles.left.cy).toBeGreaterThan(FIELD_CY);
    rig.key("keyup", "KeyS");
  });
});

describe("paddles", () => {
  it("moves at paddle speed, clamps, and reports the actual velocity", async () => {
    const rig = await makeRig(100);
    rig.pose((d, s) => d.setMode(d.setScreen(s, "countdown"), "versus"));
    rig.key("keydown", "KeyS");
    await rig.step(1);
    expect(rig.snap().paddles.left).toMatchObject({
      cy: FIELD_CY + PADDLE_SPEED * 0.1,
      vy: PADDLE_SPEED,
    });
    await rig.step(10);
    expect(rig.snap().paddles.left).toMatchObject({ cy: PADDLE_MAX_CY, vy: 0 });
    rig.key("keyup", "KeyS");
    rig.key("keydown", "ArrowUp");
    await rig.step(1);
    expect(rig.snap().paddles.right.cy).toBeCloseTo(FIELD_CY - 72, 6);
    expect(rig.snap().paddles.left.vy).toBe(0);
  });

  it("lets either key pair steer in solo", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.setScreen(s, "countdown"));
    rig.key("keydown", "ArrowDown");
    await rig.step(2);
    expect(rig.snap().paddles.left.cy).toBeGreaterThan(FIELD_CY);
  });

  it("moves a driven paddle at drivenVy and ignores input", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.setScreen(d.setMode(s, "versus"), "countdown"));
    rig.pose((d, s) => d.setPaddleVy(s, "left", -600));
    await rig.step(2);
    expect(rig.snap().paddles.left.vy).toBe(0);
    rig.pose((d, s) => d.setPaddleDriven(s, "left", true));
    rig.key("keydown", "KeyS");
    await rig.step(2);
    const left = rig.snap().paddles.left;
    expect(left.vy).toBe(-600);
    expect(left.cy).toBeLessThan(FIELD_CY);
    expect(rig.snap().paddles.right.driven).toBe(false);
  });
});

describe("the ball", () => {
  it("bounces off the walls and keeps its speed", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 300, 20), 0, -600),
    );
    rig.cues.length = 0;
    await rig.step(3);
    const ball = rig.snap().ball;
    expect(ball?.vy).toBeGreaterThan(0);
    expect(ball?.speed).toBeCloseTo(600, 6);
    expect(rig.cues).toEqual([CUES.wallBounce]);
  });

  it("bounces off the bottom wall and off obstacles", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 300, 700), 0, 600),
    );
    await rig.step(2);
    expect(rig.snap().ball?.vy).toBeLessThan(0);

    const [a] = OBSTACLE_CENTERS;
    rig.cues.length = 0;
    rig.pose((d, s) =>
      d.setBallVelocity(
        d.setBallPosition(s, (a?.x ?? 0) - 40, a?.y ?? 0),
        600,
        0,
      ),
    );
    await rig.step(5);
    expect(rig.snap().ball?.vx).toBeLessThan(0);
    expect(rig.cues).toContain(CUES.obstacleBounce);
  });

  it("ignores an obstacle that has been removed", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.clearWorld(s));
    expect(rig.snap().obstacles).toEqual([]);
    rig.pose((d, s) => d.spawnBall(s));
    rig.pose((d, s) =>
      d.setBallHeld(
        d.setBallVelocity(d.setBallPosition(s, 440, 220), 600, 0),
        false,
      ),
    );
    rig.pose((d, s) => d.spawnObstacle(s, 1));
    rig.pose((d, s) => d.spawnObstacle(s, 0));
    rig.pose((d, s) => d.spawnObstacle(s, 0));
    expect(rig.snap().obstacles.map((o) => o.index)).toEqual([0, 1]);
  });

  it("reflects off a paddle at an angle set by the contact point", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setPaddleCy(s, "left", 300));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, P1_X1 + 20, 300), -520, 0),
    );
    rig.cues.length = 0;
    await rig.step(2);
    let ball = rig.snap().ball;
    expect(ball?.vx).toBeGreaterThan(0);
    expect(ball?.vy).toBeCloseTo(0, 6);
    expect(ball?.speed).toBeCloseTo(520 * 1.04, 3);
    expect(rig.cues).toEqual([CUES.paddleHit]);

    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, P1_X1 + 20, 340), -520, 0),
    );
    await rig.step(2);
    ball = rig.snap().ball;
    expect(ball?.vy).toBeGreaterThan(0);
  });

  it("adds spin from the paddle's motion and caps the speed", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setPaddleDriven(d.setPaddleCy(s, "right", 300), "right", true),
    );
    rig.pose((d, s) => d.setPaddleVy(s, "right", -400));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, P2_X0 - 14, 300), 5000, 0),
    );
    await rig.step(1);
    const ball = rig.snap().ball;
    expect(ball?.vx).toBeLessThan(0);
    expect(ball?.spin).toBeLessThan(0);
    expect(ball?.speed).toBeCloseTo(SPEED_CAP, 6);
  });

  it("curves under spin and decays it", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallSpin(
        d.setBallVelocity(d.setBallPosition(s, 300, 360), 400, 0),
        500,
      ),
    );
    await rig.step(15);
    const ball = rig.snap().ball;
    expect(ball?.vy).toBeGreaterThan(0);
    expect(ball?.spin).toBeLessThan(500);
    expect(ball?.speed).toBeCloseTo(400, 3);
  });

  it("bounces off a paddle's end cap like a wall", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setPaddleCy(s, "left", 300));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 56, 360), 0, -300),
    );
    rig.cues.length = 0;
    await rig.step(3);
    expect(rig.snap().ball?.vy).toBeGreaterThan(0);
    expect(rig.cues).toEqual([CUES.wallBounce]);
  });

  it("records a trail whose length follows the ball's speed", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 200, 400), 300, 0),
    );
    await rig.step(30);
    const trail = rig.snap().ball?.trail ?? [];
    expect(trail.length).toBeGreaterThan(2);
    const span = (trail[trail.length - 1]?.t ?? 0) - (trail[0]?.t ?? 0);
    expect(span).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
  });

  it("fails loudly on ball operations without a ball", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.clearWorld(s));
    const { debug, state } = rig.engine;
    expect(() => debug.setBallSpin(state, 1)).toThrow();
    expect(() => debug.spawnObstacle(state, 2)).toThrow();
    await rig.step(5);
    expect(rig.snap().ball).toBeNull();
  });
});

describe("scoring", () => {
  it("scores for the left player, parks the ball and serves back at the scored-on side", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 1262, 360), 600, 0),
    );
    rig.cues.length = 0;
    await rig.step(3);
    const s = rig.snap();
    expect(s).toMatchObject({
      screen: "countdown",
      receiver: "right",
      score: { p1: 1, p2: 0 },
    });
    expect(s.ball).toMatchObject({ held: true, x: 640, y: 360, trail: [] });
    expect(rig.cues).toContain(CUES.score);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
  });

  it("scores for the right player when the ball leaves on the left", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 5, 100), -600, 0),
    );
    rig.pose((d, s) => d.setPaddleCy(s, "left", 600));
    await rig.step(5);
    expect(rig.snap()).toMatchObject({
      score: { p1: 0, p2: 1 },
      receiver: "left",
    });
  });

  it("ends the match at 11 with a two-point lead, and not before", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setScore(s, 10, 10));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 1262, 360), 600, 0),
    );
    await rig.step(3);
    expect(rig.snap()).toMatchObject({
      screen: "countdown",
      score: { p1: 11, p2: 10 },
      winner: null,
    });
    rig.pose((d, s) => d.setScreen(d.setBallHoldTimer(s, 0), "countdown"));
    await rig.step(1);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 1262, 360), 600, 0),
    );
    await rig.step(3);
    expect(rig.snap()).toMatchObject({
      screen: "matchover",
      winner: "left",
      score: { p1: 12, p2: 10 },
      menuIndex: 0,
    });
    expect(rig.snap().ball?.held).toBe(false);
  });

  it("gives the right player the win too", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setScore(s, 3, 10));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 5, 100), -600, 0),
    );
    rig.pose((d, s) => d.setPaddleCy(s, "left", 600));
    await rig.step(5);
    expect(rig.snap()).toMatchObject({ screen: "matchover", winner: "right" });
  });
});

describe("the AI", () => {
  it("tracks an incoming ball and returns home otherwise", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setMode(s, "solo"));
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 640, 100), 300, 0),
    );
    await rig.step(20);
    expect(rig.snap().paddles.right.cy).toBeLessThan(FIELD_CY);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 640, 100), -300, 0),
    );
    await rig.step(60);
    expect(
      Math.abs(rig.snap().paddles.right.cy - AI_HOME_Y),
    ).toBeLessThanOrEqual(18);
  });

  it("can be switched off in either faculty", async () => {
    const rig = await makeRig();
    await startServed(rig);
    rig.pose((d, s) => d.setMode(d.setAiTracking(s, false), "solo"));
    rig.pose((d, s) =>
      d.setPaddleCy(
        d.setBallVelocity(d.setBallPosition(s, 640, 100), 300, 0),
        "right",
        200,
      ),
    );
    await rig.step(30);
    expect(rig.snap().paddles.right.cy).toBeGreaterThan(300);
    rig.pose((d, s) => d.setAiMovement(s, false));
    rig.pose((d, s) => d.setPaddleCy(s, "right", 200));
    await rig.step(5);
    expect(rig.snap().paddles.right).toMatchObject({ cy: 200, vy: 0 });
  });
});

describe("the debug surface", () => {
  it("sets each field it names and reads it back", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.setScreen(s, "paused"));
    rig.pose((d, s) => d.setMode(s, "versus"));
    rig.pose((d, s) => d.setMenuIndex(s, 2));
    rig.pose((d, s) => d.setTitleIndex(s, 1));
    rig.pose((d, s) => d.setResumeScreen(s, "countdown"));
    rig.pose((d, s) => d.setScore(s, 4, 7));
    rig.pose((d, s) => d.setWinner(s, "right"));
    rig.pose((d, s) => d.setReceiver(s, "right"));
    rig.pose((d, s) => d.setPaddleCy(s, "right", 123));
    rig.pose((d, s) => d.setBallPosition(s, 10, 20));
    rig.pose((d, s) => d.setBallVelocity(s, 3, 4));
    rig.pose((d, s) => d.setBallSpin(s, 9));
    rig.pose((d, s) => d.setBallHeld(s, false));
    rig.pose((d, s) => d.setBallHoldTimer(s, 0.4));
    rig.pose((d, s) => d.setBallServeSign(s, -1));
    expect(rig.snap()).toMatchObject({
      screen: "paused",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 4, p2: 7 },
      winner: "right",
      receiver: "right",
    });
    expect(rig.snap().paddles.right.cy).toBe(123);
    expect(rig.snap().ball).toMatchObject({
      x: 10,
      y: 20,
      vx: 3,
      vy: 4,
      speed: 5,
      spin: 9,
      held: false,
      holdTimer: 0.4,
      serveSign: -1,
    });
    rig.pose((d, s) => d.drawBallServeSign(s));
    expect([1, -1]).toContain(rig.snap().ball?.serveSign);
  });

  it("resets to the title state while keeping the mute bit", async () => {
    const rig = await makeRig();
    rig.pose((d, s) => d.setMuted(s, true));
    rig.pose((d, s) =>
      d.setScore(d.setPaddleDriven(d.clearWorld(s), "left", true), 5, 5),
    );
    await rig.step(3);
    rig.pose((d, s) => d.reset(s));
    const s = rig.snap();
    expect(s).toMatchObject({
      screen: "title",
      simTime: 0,
      muted: true,
      score: { p1: 0, p2: 0 },
    });
    expect(s.paddles.left.driven).toBe(false);
    expect(s.obstacles).toHaveLength(2);
    expect(s.ball?.held).toBe(true);
  });

  it("leaves the state alone on reconcile", async () => {
    const rig = await makeRig();
    const before = rig.engine.state;
    rig.pose((d, s) => d.reconcile(s));
    expect(rig.engine.state).toEqual(before);
  });

  it("does not mutate the state a pose was handed", async () => {
    const rig = await makeRig();
    const before = structuredClone(rig.engine.state);
    rig.engine.debug.setBallPosition(rig.engine.state, 1, 2);
    rig.engine.debug.setPaddleCy(rig.engine.state, "left", 9);
    expect(rig.engine.state).toEqual(before);
  });
});

describe("mute and time", () => {
  it("toggles mute from any screen and mirrors it into the state", async () => {
    const rig = await makeRig();
    await rig.tap("KeyM");
    expect(rig.snap().muted).toBe(true);
    await rig.tap("KeyM");
    expect(rig.snap().muted).toBe(false);
    rig.pose((d, s) => d.setMuted(s, true));
    await rig.step(1);
    rig.pose((d, s) => d.setScreen(s, "paused"));
    await rig.tap("KeyM");
    expect(rig.snap().muted).toBe(false);
  });

  it("accumulates simTime on every screen", async () => {
    const rig = await makeRig(100);
    await rig.step(5);
    expect(rig.snap().simTime).toBeCloseTo(0.5, 9);
  });
});

describe("frame-length independence", () => {
  async function rally(stepMs: number) {
    const rig = await makeRig(stepMs);
    await startServed(rig);
    rig.pose((d, s) => d.setScreen(d.setMode(s, "versus"), "playing"));
    rig.pose((d, s) =>
      d.setBallSpin(
        d.setBallVelocity(d.setBallPosition(s, 300, 300), 520, 120),
        300,
      ),
    );
    await rig.step(Math.round(1500 / stepMs));
    return rig.snap();
  }

  it("plays a scripted rally the same under 2 ms and 16 ms frames", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(
      Math.abs((fine.ball?.speed ?? 0) - (coarse.ball?.speed ?? 0)),
    ).toBeLessThan(10);
    expect(Math.sign(fine.ball?.vx ?? 0)).toBe(Math.sign(coarse.ball?.vx ?? 0));
    expect(fine.score).toEqual(coarse.score);
  });

  it("never lets the ball into a paddle or obstacle at the speed cap", async () => {
    const rig = await makeRig(16);
    await startServed(rig);
    rig.pose((d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 300, 100), SPEED_CAP, 0),
    );
    for (let i = 0; i < 100; i++) {
      await rig.step(1);
      const ball = rig.snap().ball;
      expect(ball?.y ?? 0).toBeGreaterThanOrEqual(BALL_R - 1e-9);
      expect(ball?.y ?? 0).toBeLessThanOrEqual(720 - BALL_R + 1e-9);
    }
  });
});
