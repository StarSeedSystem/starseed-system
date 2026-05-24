"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { Application } from '@splinetool/runtime';

// Next.js dynamic import — SSR disabled to prevent hydration errors (COMMON_PROBLEMS.md #10)
// Package @splinetool/react-spline is ESM-only (no CJS "require" in exports)
// transpilePackages in next.config handles the ESM resolution
const Spline = dynamic(() => import('@splinetool/react-spline'), {
    ssr: false,
    loading: () => null, // We handle our own loading state
});

const LOAD_TIMEOUT_MS = 8000; // Fallback if CDN is slow (COMMON_PROBLEMS.md #3)

// Hardware detection — skip WebGL on low-end devices (PERFORMANCE.md)
function canRunWebGL(): boolean {
    if (typeof window === 'undefined') return false;

    const isMobile = window.innerWidth < 768;
    const isLowEnd = navigator.hardwareConcurrency <= 2;

    // WebGL support check
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return false;
    } catch {
        return false;
    }

    return !isMobile && !isLowEnd;
}

interface SplineUIWrapperProps {
    sceneUrl: string;
    className?: string;
    opacity?: number;
    interactive?: boolean;
    /** Callback with the Spline Application instance for runtime manipulation */
    onSceneLoad?: (app: Application) => void;
    /** CSS gradient fallback for low-end devices */
    fallbackGradient?: string;
}

/**
 * Production-ready Spline 3D wrapper for Next.js.
 * 
 * Features:
 * - Next.js SSR-safe dynamic import (@splinetool/react-spline/next)
 * - IntersectionObserver lazy loading (only loads when visible)
 * - Hardware detection with animated CSS gradient fallback
 * - 8s timeout with graceful degradation
 * - onSceneLoad callback for runtime scene manipulation
 * - Default scene cleanup (removes demo texts, zooms for abstract bg)
 */
export function SplineUIWrapper({
    sceneUrl,
    className,
    opacity = 1,
    interactive = false,
    onSceneLoad,
    fallbackGradient = 'linear-gradient(135deg, rgba(15,0,30,1) 0%, rgba(5,5,25,1) 40%, rgba(0,10,20,1) 100%)',
}: SplineUIWrapperProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const [canLoad, setCanLoad] = useState(false);

    // Check hardware capability on mount
    useEffect(() => {
        setCanLoad(canRunWebGL());
    }, []);

    // IntersectionObserver — only mount Spline when scrolled into view (PERFORMANCE.md #4)
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' } // Pre-load slightly before entering viewport
        );

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Timeout fallback — if Spline doesn't load in 8s, show gradient (COMMON_PROBLEMS.md #3)
    useEffect(() => {
        if (!isVisible || !canLoad || isLoaded) return;

        timeoutRef.current = setTimeout(() => {
            if (!isLoaded) {
                setHasFailed(true);
                console.warn('[SplineUIWrapper] Scene load timeout — showing CSS fallback');
            }
        }, LOAD_TIMEOUT_MS);

        return () => clearTimeout(timeoutRef.current);
    }, [isVisible, canLoad, isLoaded]);

    // Remove Spline DOM watermark elements (the "Built with Spline" badge)
    // Spline injects HTML elements after canvas load — we remove them aggressively
    const removeSplineWatermarks = useCallback((container: HTMLElement | null) => {
        if (!container) return;

        const killWatermarks = (root: HTMLElement | Document | ShadowRoot = document) => {
            // Spline injects an anchor with its brand logo inside and next to canvas containers
            const selectors = [
                'a[href*="spline.design"]',
                'a[href*="spline"]',
                'div[class*="logo"]',
                'div[class*="watermark"]',
                'a[target="_blank"][class*="spline"]',
                '[part*="logo"]',
                '#logo'
            ];

            selectors.forEach(sel => {
                try {
                    root.querySelectorAll(sel).forEach(el => {
                        (el as HTMLElement).style.display = 'none';
                        (el as HTMLElement).style.visibility = 'hidden';
                        (el as HTMLElement).style.opacity = '0';
                        (el as HTMLElement).style.pointerEvents = 'none';
                        el.parentNode?.removeChild(el);
                    });
                } catch { /* ignore */ }
            });

            // Also scan for any injected child anchor elements directly in the container
            if (container) {
                container.querySelectorAll('a').forEach(el => {
                    if (el.href?.includes('spline') || el.textContent?.toLowerCase().includes('spline')) {
                        (el as HTMLElement).style.display = 'none';
                        el.parentNode?.removeChild(el);
                    }
                });

                // CRITICAL: Penetrate shadow DOM if Spline is using Web Components
                const tryShadow = (el: Element) => {
                    if (el.shadowRoot) {
                        selectors.forEach(sel => {
                            el.shadowRoot?.querySelectorAll(sel).forEach(watermark => {
                                (watermark as HTMLElement).style.display = 'none';
                                watermark.parentNode?.removeChild(watermark);
                            });
                        });
                        // Remove generic anchors in shadow root
                        el.shadowRoot?.querySelectorAll('a').forEach(watermark => {
                            if ((watermark as HTMLAnchorElement).href?.includes('spline')) {
                                (watermark as HTMLElement).style.display = 'none';
                                watermark.parentNode?.removeChild(watermark);
                            }
                        });
                    }
                };

                tryShadow(container);
                container.querySelectorAll('*').forEach(tryShadow);
            }
        };

        // Run immediately
        killWatermarks();

        // Watch for late-injected elements
        const observer = new MutationObserver(() => killWatermarks());
        observer.observe(document.body, { childList: true, subtree: true });

        // Stop observing after 15s to avoid memory leaks
        setTimeout(() => observer.disconnect(), 15000);
    }, []);

    // Called when Spline scene finishes loading
    const handleLoad = useCallback((app: Application) => {
        clearTimeout(timeoutRef.current);
        setIsLoaded(true);

        // Default scene cleanup: remove demo text objects from the exported scene
        // This transforms the "Bento 3D" demo into a clean abstract liquid crystal background
        try {
            const demoTextNames = ['Liquid and dust', 'Bento 3D', 'Bento 3', 'Light mode', 'Dark mode', 'Text'];
            for (const name of demoTextNames) {
                const obj = app.findObjectByName(name);
                if (obj) {
                    obj.visible = false;
                }
            }

            // Zoom slightly for a more abstract, immersive background feel
            const camera = app.findObjectByName('Camera');
            if (camera) {
                camera.position.z *= 0.7; // 1.43x zoom
            }
        } catch (e) {
            // Scene may not have these objects — that's fine
            console.debug('[SplineUIWrapper] Scene cleanup:', e);
        }

        // Pass the app to parent for custom per-widget manipulation
        if (onSceneLoad) {
            onSceneLoad(app);
        }

        // Remove any "Built with Spline" DOM watermark elements injected by Spline runtime
        // We use requestAnimationFrame + small delay to ensure DOM is ready
        setTimeout(() => removeSplineWatermarks(containerRef.current), 200);
        setTimeout(() => removeSplineWatermarks(containerRef.current), 1000);
        setTimeout(() => removeSplineWatermarks(containerRef.current), 3000);
    }, [onSceneLoad, removeSplineWatermarks]);

    const showSpline = isVisible && canLoad && !hasFailed;
    const showFallback = !canLoad || hasFailed;

    return (
        <div
            ref={containerRef}
            className={cn(
                'absolute inset-0 z-0 overflow-hidden rounded-inherit',
                className
            )}
            style={{
                // Don't block clicks on content above (COMMON_PROBLEMS.md #7)
                pointerEvents: interactive ? 'auto' : 'none',
                // Reserved space to prevent CLS (PERFORMANCE.md)
                contain: 'strict',
            }}
        >
            {/* CSS gradient fallback — smooth fade out when Spline loads */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    background: fallbackGradient,
                    opacity: isLoaded ? 0 : 1,
                    transition: 'opacity 1.5s ease-out',
                    animation: 'none',
                }}
            />

            {/* Subtle animated shimmer for loading state */}
            {!isLoaded && !showFallback && isVisible && (
                <div className="absolute inset-0 z-[1] flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                </div>
            )}

            {/* Spline 3D Scene — only on capable devices, only when in viewport */}
            {showSpline && (
                <Spline
                    scene={sceneUrl}
                    onLoad={handleLoad}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 0,
                        opacity: isLoaded ? opacity : 0,
                        transition: 'opacity 0.6s ease-in-out',
                        pointerEvents: interactive ? 'auto' : 'none',
                        transform: 'scale(1.08) translateY(2%)',
                    }}
                />
            )}
        </div>
    );
}
