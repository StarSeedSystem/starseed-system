import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isReducedMotion } from "../prm";

describe("debug", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        if (typeof window !== "undefined") {
            (window as any).matchMedia = vi.fn().mockImplementation((q: string) => ({
                matches: q === "(prefers-reduced-motion: reduce)" ? true : false,
                media: q,
            }));
        }
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("x", () => {
        console.log("matchMedia calls before:", (window as any).matchMedia.mock.calls);
        const res = isReducedMotion();
        console.log("matchMedia calls after:", (window as any).matchMedia.mock.calls);
        console.log("isReducedMotion():", res);
        expect(res).toBe(true);
    });
});
