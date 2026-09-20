/**
 * Utilidades puras para el cálculo de gestos de deslizamiento (swipe).
 */

export type SwipeDirection = "up" | "left" | "right";

export interface Point2D {
    x: number;
    y: number;
    time: number;
}

export interface SwipeInput {
    direction: SwipeDirection;
    startPos: Point2D;
    currentPos: Point2D;
    containerSize: number;
    thresholdPct?: number;
    minVelocity?: number;
}

export interface SwipeOutcome {
    toward: number;
    pct: number;
    velocity: number;
    shouldClose: boolean;
    signedOffset: number;
}

export function calculateSwipeOutcome(input: SwipeInput): SwipeOutcome {
    const { direction, startPos, currentPos, containerSize } = input;
    const thresholdPct = input.thresholdPct ?? 0.3;
    const minVelocity = input.minVelocity ?? 0.3;

    let delta = 0;
    if (direction === "up") {
        delta = startPos.y - currentPos.y;
    } else if (direction === "left") {
        delta = startPos.x - currentPos.x;
    } else if (direction === "right") {
        delta = currentPos.x - startPos.x;
    }

    const toward = Math.max(0, delta);
    const timeElapsed = Math.max(1, currentPos.time - startPos.time);
    const velocity = toward / timeElapsed;
    const validSize = Math.max(1, containerSize);
    const pct = toward / validSize;
    const minDistanceForVelocity = Math.min(100, validSize * 0.15);
    const shouldClose = pct >= thresholdPct || (velocity >= minVelocity && toward >= minDistanceForVelocity);

    let signedOffset = 0;
    if (direction === "up" || direction === "left") {
        signedOffset = -toward;
    } else {
        signedOffset = toward;
    }

    return {
        toward,
        pct,
        velocity,
        shouldClose,
        signedOffset,
    };
}
