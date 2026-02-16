"use client";

import { useCallback } from "react";

export function usePreviewSync() {
    /**
     * Scrolls the preview container to the specified element ID.
     * @param elementId The ID of the element within the preview to scroll to.
     * @param offset Top offset in pixels (default: 24).
     */
    const scrollToPreview = useCallback((elementId: string, offset: number = 24) => {
        // Find the scrollable container
        const container = document.getElementById("canvas-preview-container");
        if (!container) {
            return;
        }

        // Find the target element inside the preview
        const target = document.getElementById(elementId);
        if (!target) {
            return;
        }

        // Calculate the target position relative to the container
        // We need to account for the container's current scroll position
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();

        // Calculate the relative position from the top of the container
        const relativeTop = targetRect.top - containerRect.top;

        // Current scroll position
        const currentScroll = container.scrollTop;

        // Target scroll position
        const targetScroll = currentScroll + relativeTop - offset;

        container.scrollTo({
            top: targetScroll,
            behavior: "smooth"
        });
    }, []);

    return { scrollToPreview };
}
