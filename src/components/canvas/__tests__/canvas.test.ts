"use client";

import { describe, it, expect } from "vitest";
import { BLOCK_KINDS } from "@/lib/canvas/canvas";

describe("Canvas BLOCK_KINDS", () => {
  it("debe tener un item de protomolecula", () => {
    const protomoleculaKind = BLOCK_KINDS.find((k) => k.kind === "protomolecula");
    expect(protomoleculaKind).toBeDefined();
    expect(protomoleculaKind?.label).toBe("Protomolécula");
    expect(protomoleculaKind?.category).toBe("herramientas");
    expect(protomoleculaKind?.icon).toBe("Sparkles");
    expect(protomoleculaKind?.blurb).toContain("creación y edición");
  });
});
