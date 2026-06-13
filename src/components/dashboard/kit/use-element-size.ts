'use client';

// ════════════════════════════════════════════════════════════════
// useElementSize — ResizeObserver-based size + density "tier"
// ----------------------------------------------------------------
// Container queries handle most adaptation in CSS, but widgets also
// need JS-level decisions (how many list rows, whether to draw a
// graph, label verbosity). This hook returns the measured box plus a
// coarse `tier` so a widget can branch its content density to fit
// ANY dimension without overflow.
// ════════════════════════════════════════════════════════════════

import { useLayoutEffect, useRef, useState } from "react";

export type SizeTier = "micro" | "compact" | "regular" | "expanded";

export interface ElementSize {
    width: number;
    height: number;
    tier: SizeTier;        // derived from width
    vTier: SizeTier;       // derived from height
    /** true when the box is wider than tall by a clear margin */
    landscape: boolean;
}

function tierFor(px: number): SizeTier {
    if (px < 200) return "micro";
    if (px < 340) return "compact";
    if (px < 560) return "regular";
    return "expanded";
}

export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T | null>(null);
    const [size, setSize] = useState<ElementSize>({
        width: 0,
        height: 0,
        tier: "regular",
        vTier: "regular",
        landscape: true,
    });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const update = (w: number, h: number) => {
            setSize((prev) => {
                if (Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1) return prev;
                return {
                    width: w,
                    height: h,
                    tier: tierFor(w),
                    vTier: tierFor(h),
                    landscape: w >= h * 1.15,
                };
            });
        };

        update(el.clientWidth, el.clientHeight);

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const cr = entry.contentRect;
                update(cr.width, cr.height);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return { ref, size } as const;
}
