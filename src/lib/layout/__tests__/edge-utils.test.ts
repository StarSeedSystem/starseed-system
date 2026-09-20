import { describe, it, expect } from "vitest";
import { detectEdgeGesture } from "../edge-utils";

describe("detectEdgeGesture", () => {
    const width = 375;
    const height = 812;

    it("detects horizon gesture between 8px and 20px from left edge", () => {
        const edge = detectEdgeGesture({ x: 10, y: 300, width, height });
        expect(edge).toBe("horizon");
    });

    it("ignores left gesture when x < 8px for iOS system back gesture compatibility", () => {
        const edge = detectEdgeGesture({ x: 5, y: 300, width, height });
        expect(edge).toBeNull();
    });

    it("detects logic gesture within 20px of right edge", () => {
        const edge = detectEdgeGesture({ x: 360, y: 300, width, height });
        expect(edge).toBe("logic");
    });

    it("detects zenith gesture within 20px of top edge", () => {
        const edge = detectEdgeGesture({ x: 100, y: 10, width, height });
        expect(edge).toBe("zenith");
    });

    it("detects anchor gesture within 20px of bottom edge", () => {
        const edge = detectEdgeGesture({ x: 100, y: 800, width, height });
        expect(edge).toBe("anchor");
    });

    it("returns null for touches in screen center", () => {
        const edge = detectEdgeGesture({ x: 180, y: 400, width, height });
        expect(edge).toBeNull();
    });
});
