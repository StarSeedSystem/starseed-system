import { describe, it, expect } from "vitest";
import { calculateSwipeOutcome, type SwipeInput } from "../swipe-utils";

describe("calculateSwipeOutcome", () => {
    it("returns correct outcome for upward drag exceeding 30% threshold", () => {
        const input: SwipeInput = {
            direction: "up",
            startPos: { x: 100, y: 500, time: 0 },
            currentPos: { x: 100, y: 300, time: 200 },
            containerSize: 500,
        };
        const outcome = calculateSwipeOutcome(input);
        expect(outcome.toward).toBe(200);
        expect(outcome.pct).toBe(0.4);
        expect(outcome.shouldClose).toBe(true);
        expect(outcome.signedOffset).toBe(-200);
    });

    it("returns shouldClose false when dragged less than 10%", () => {
        const input: SwipeInput = {
            direction: "up",
            startPos: { x: 100, y: 500, time: 0 },
            currentPos: { x: 100, y: 475, time: 500 },
            containerSize: 500,
        };
        const outcome = calculateSwipeOutcome(input);
        expect(outcome.toward).toBe(25);
        expect(outcome.pct).toBe(0.05);
        expect(outcome.shouldClose).toBe(false);
        expect(outcome.signedOffset).toBe(-25);
    });

    it("returns shouldClose true when velocity exceeds minVelocity threshold", () => {
        const input: SwipeInput = {
            direction: "up",
            startPos: { x: 100, y: 500, time: 0 },
            currentPos: { x: 100, y: 420, time: 100 },
            containerSize: 500,
            minVelocity: 0.3,
        };
        const outcome = calculateSwipeOutcome(input);
        expect(outcome.toward).toBe(80);
        expect(outcome.pct).toBe(0.16);
        expect(outcome.velocity).toBe(0.8);
        expect(outcome.shouldClose).toBe(true);
    });
});
