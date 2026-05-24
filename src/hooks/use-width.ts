import { useState, useEffect, useRef, useCallback } from 'react';

export function useWidth() {
    const [width, setWidth] = useState<number>(1200); // Default width
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect.width directly
                setWidth(entry.contentRect.width);
            }
        });

        observer.observe(element);

        // Initial measure
        setWidth(element.getBoundingClientRect().width);

        return () => {
            observer.disconnect();
        };
    }, []);

    return { width, containerRef };
}
