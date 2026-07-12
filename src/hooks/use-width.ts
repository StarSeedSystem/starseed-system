import { useState, useEffect, useRef, useCallback } from 'react';

export function useWidth() {
    const [width, setWidth] = useState<number>(1200); // Default width
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Guarda de delta (>1px): los informes subpíxel del observer
                // (zoom, scrollbars, redondeos de layout) no deben re-acomodar
                // toda la rejilla (react-grid-layout) ni realimentar bucles de
                // medición → re-layout → medición. (Bug "glitcheo en loop".)
                const w = entry.contentRect.width;
                setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
            }
        });

        observer.observe(element);

        // Initial measure
        const w0 = element.getBoundingClientRect().width;
        setWidth((prev) => (Math.abs(prev - w0) < 1 ? prev : w0));

        return () => {
            observer.disconnect();
        };
    }, []);

    return { width, containerRef };
}
