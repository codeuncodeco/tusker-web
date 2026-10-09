import { describe, expect, it } from "vitest";

import { moveInPlan, placeInPlan } from "../app/plan";

describe("moving a task inside a plan", () => {
  it("swaps a task with the one above it", () => {
    expect(moveInPlan([1, 2, 3], 2, "up")).toEqual([2, 1, 3]);
  });

  it("swaps a task with the one below it", () => {
    expect(moveInPlan([1, 2, 3], 2, "down")).toEqual([1, 3, 2]);
  });

  it("leaves the first task where it is, because nothing is above it", () => {
    expect(moveInPlan([1, 2], 1, "up")).toEqual([1, 2]);
  });

  it("leaves the last task where it is, because nothing is below it", () => {
    expect(moveInPlan([1, 2], 2, "down")).toEqual([1, 2]);
  });

  it("leaves a plan that does not hold the task alone", () => {
    expect(moveInPlan([1, 2], 3, "up")).toEqual([1, 2]);
  });
});

describe("promoting a task to the top of a plan", () => {
  it("puts the task first and shifts down everything it passed", () => {
    expect(moveInPlan([1, 2, 3], 3, "top")).toEqual([3, 1, 2]);
  });

  it("leaves the task already on top where it is", () => {
    expect(moveInPlan([1, 2], 1, "top")).toEqual([1, 2]);
  });

  it("leaves a plan that does not hold the task alone", () => {
    expect(moveInPlan([1, 2], 3, "top")).toEqual([1, 2]);
  });
});

describe("sinking a task to the foot of a plan", () => {
  it("puts the task last and shifts up everything it passed", () => {
    expect(moveInPlan([1, 2, 3], 1, "bottom")).toEqual([2, 3, 1]);
  });

  it("leaves the task already at the foot where it is", () => {
    expect(moveInPlan([1, 2], 2, "bottom")).toEqual([1, 2]);
  });

  it("leaves a plan that does not hold the task alone", () => {
    expect(moveInPlan([1, 2], 3, "bottom")).toEqual([1, 2]);
  });
});

describe("placing a dragged task in a plan", () => {
  it("puts the task above the one it was dropped on", () => {
    expect(placeInPlan([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(placeInPlan([1, 2, 3], 1, 3)).toEqual([2, 1, 3]);
  });

  it("puts the task last when the drop names no task", () => {
    expect(placeInPlan([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it("puts the task last when the task named is not in the plan", () => {
    expect(placeInPlan([1, 2, 3], 1, 26)).toEqual([2, 3, 1]);
  });

  it("answers with the same array when nothing moves", () => {
    const order = [1, 2, 3];
    expect(placeInPlan(order, 2, 3)).toBe(order);
    expect(placeInPlan(order, 3, null)).toBe(order);
    expect(placeInPlan(order, 2, 2)).toBe(order);
  });

  it("leaves a plan that does not hold the task alone", () => {
    const order = [1, 2];
    expect(placeInPlan(order, 26, 1)).toBe(order);
  });
});
