import { describe, it, expect } from "vitest";
import type { PostBlock } from "@/lib/creation/post-blocks";

// Import the function from the component. Note: the component is a client component,
// but the function is pure and does not use React hooks or browser APIs.
// We hope it works in the Vitest environment (which is jsdom or node).
import { blockHasContent } from "@/components/creation/lienzo-composer";

describe("blockHasContent for protomolecula block", () => {
  it("returns false for undefined code", () => {
    const block: PostBlock = { id: "1", type: "protomolecula" };
    expect(blockHasContent(block)).toBe(false);
  });
});