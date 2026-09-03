import { describe, expect, it } from "vitest";

import { moveInPlan } from "../app/plan";

describe("moving a task inside a plan", () => {
  it("swaps a task with the one above it", () => {
    expect(moveInPlan(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps a task with the one below it", () => {
    expect(moveInPlan(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("leaves the first task where it is, because nothing is above it", () => {
    expect(moveInPlan(["a", "b"], "a", "up")).toEqual(["a", "b"]);
  });

  it("leaves the last task where it is, because nothing is below it", () => {
    expect(moveInPlan(["a", "b"], "b", "down")).toEqual(["a", "b"]);
  });

  it("leaves a plan that does not hold the task alone", () => {
    expect(moveInPlan(["a", "b"], "c", "up")).toEqual(["a", "b"]);
  });
});

describe("promoting a task to the top of a plan", () => {
  it("puts the task first and shifts down everything it passed", () => {
    expect(moveInPlan(["a", "b", "c"], "c", "top")).toEqual(["c", "a", "b"]);
  });

  it("leaves the task already on top where it is", () => {
    expect(moveInPlan(["a", "b"], "a", "top")).toEqual(["a", "b"]);
  });

  it("leaves a plan that does not hold the task alone", () => {
    expect(moveInPlan(["a", "b"], "c", "top")).toEqual(["a", "b"]);
  });
});
