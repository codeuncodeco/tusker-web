/**
 * The page a request was for. With single fetch, a client-side submit or link
 * goes to the page's data address, `/me.data`, and a redirect or a path check
 * built from that address misses the page. See #219.
 */

import { describe, expect, it } from "vitest";

import { pageAddress, pageOf } from "../app/paths";

describe("the page a request came from", () => {
  it("is the page itself for a request to its data address", () => {
    expect(pageOf("/me.data")).toBe("/me");
    expect(pageOf("/o/acme/board.data")).toBe("/o/acme/board");
  });

  it("is the root for a request to the root's data address, by either name", () => {
    expect(pageOf("/_root.data")).toBe("/");
    expect(pageOf("/_.data")).toBe("/");
  });

  it("is the path as it came for a plain request", () => {
    expect(pageOf("/me")).toBe("/me");
    expect(pageOf("/o/acme/board")).toBe("/o/acme/board");
  });
});

describe("the address a request came from", () => {
  it("is the page and its query", () => {
    expect(pageAddress("https://tusker.test/t/1?from=%2Fme")).toBe("/t/1?from=%2Fme");
    expect(pageAddress("https://tusker.test/t/1")).toBe("/t/1");
  });

  it("drops the data address and the single-fetch query", () => {
    expect(pageAddress("https://tusker.test/t/1.data?from=%2Fme&_routes=routes%2Ftask")).toBe(
      "/t/1?from=%2Fme",
    );
    expect(pageAddress("https://tusker.test/t/1.data?_routes=routes%2Ftask")).toBe("/t/1");
  });
});
