"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

interface FloatingMenuButtonProps {
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
}

export function FloatingMenuButton({ isOpen, onToggle, className }: FloatingMenuButtonProps) {
    const { config, updateSection } = useAppearance();
    const {
        fabPosition,
        fabSide,
        fabOffsetX,
        fabOffsetY,
        fabVerticalPosition,
        hapticFeedback,
        autoHideOnScroll,
        showOnDesktop,
        swipeToOpen,
        gestureThreshold
    } = config.mobile;

    const buttonRef = useRef<HTMLButtonElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [position, setPosition] = useState({ x: fabOffsetX, y: fabOffsetY });
    const [isHidden, setIsHidden] = useState(false);
    const [isMobile, setIsMobile] = useState(true);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);
    const pointerIdRef = useRef<number | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const justHandledPointerRef = useRef(false);
    const lastScrollY = useRef(0);

    // Update position when config changes
    useEffect(() => {
        setPosition({ x: fabOffsetX, y: fabOffsetY });
    }, [fabOffsetX, fabOffsetY]);

    // Detect if mobile viewport
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Auto-hide on scroll
    useEffect(() => {
        if (!autoHideOnScroll) {
            setIsHidden(false);
            return;
        }

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const scrollDiff = currentScrollY - lastScrollY.current;

            // Hide when scrolling down, show when scrolling up
            if (scrollDiff > 10) {
                setIsHidden(true);
            } else if (scrollDiff < -10) {
                setIsHidden(false);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [autoHideOnScroll]);

    // Swipe to open gesture detection
    useEffect(() => {
        if (!swipeToOpen || !isMobile) return;

        let startX = 0;
        let startY = 0;

        const handleTouchStart = (e: TouchEvent) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = endX - startX;
            const diffY = Math.abs(endY - startY);

            // Only trigger if horizontal swipe is significant and not too vertical
            if (diffY < 50 && Math.abs(diffX) > gestureThreshold) {
                // Swipe from edge to open
                if ((fabSide === 'right' && startX > window.innerWidth - 30 && diffX < 0) ||
                    (fabSide === 'left' && startX < 30 && diffX > 0)) {
                    if (!isOpen) {
                        onToggle();
                    }
                }
            }
        };

        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [swipeToOpen, gestureThreshold, fabSide, isOpen, onToggle, isMobile]);

    // Prevent selectstart when selection mode is active
    useEffect(() => {
        if (!isSelecting) return;
        const preventSelect = (e: Event) => e.preventDefault();
        window.addEventListener("selectstart", preventSelect);
        return () => window.removeEventListener("selectstart", preventSelect);
    }, [isSelecting]);

    // Haptic feedback helper
    const triggerHaptic = useCallback(() => {
        if (hapticFeedback && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
    }, [hapticFeedback]);

    const LONG_PRESS_MS = 260;
    const TAP_SLOP_PX = 10;

    // Pointer handlers supporting tap, drag, long-press selection mode, pointer capture & cancel
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        // iOS text selection / context callout prevention
        e.preventDefault();

        const pointerId = e.pointerId;
        pointerIdRef.current = pointerId;

        // Set pointer capture so move events are received even outside element
        if (typeof e.currentTarget.setPointerCapture === "function") {
            try {
                e.currentTarget.setPointerCapture(pointerId);
            } catch {
                // Ignore if pointer capture fails
            }
        }

        dragStartPos.current = { x: e.clientX, y: e.clientY };
        hasMoved.current = false;

        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }

        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }

        longPressTimer.current = setTimeout(() => {
            if (!hasMoved.current) {
                setIsSelecting(true);
                triggerHaptic();
            }
        }, LONG_PRESS_MS);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (pointerIdRef.current === null || e.pointerId !== pointerIdRef.current) return;

        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        const moveDistance = Math.hypot(dx, dy);

        if (moveDistance > TAP_SLOP_PX) {
            hasMoved.current = true;
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }

        if (fabPosition === 'draggable' && hasMoved.current && !isSelecting) {
            setIsDragging(true);
            const buttonSize = 56;
            const newX = Math.max(8, Math.min(window.innerWidth - buttonSize - 8, e.clientX - dragOffset.x));
            const newY = Math.max(8, Math.min(window.innerHeight - buttonSize - 8, e.clientY - dragOffset.y));
            setPosition({ x: newX, y: newY });
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (pointerIdRef.current !== null && e.pointerId === pointerIdRef.current) {
            if (typeof e.currentTarget.releasePointerCapture === "function") {
                try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                    // Ignore
                }
            }
        }

        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (isDragging && fabPosition === 'draggable') {
            updateSection('mobile', {
                fabOffsetX: position.x,
                fabOffsetY: position.y
            });
            triggerHaptic();
        } else if (!hasMoved.current && !isSelecting) {
            justHandledPointerRef.current = true;
            triggerHaptic();
            onToggle();
            setTimeout(() => {
                justHandledPointerRef.current = false;
            }, 100);
        }

        setIsDragging(false);
        setIsSelecting(false);
        pointerIdRef.current = null;
    };

    const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (pointerIdRef.current !== null && e.pointerId === pointerIdRef.current) {
            if (typeof e.currentTarget.releasePointerCapture === "function") {
                try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                    // Ignore
                }
            }
        }

        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        setIsDragging(false);
        setIsSelecting(false);
        hasMoved.current = false;
        pointerIdRef.current = null;
    };

    const handleClick = () => {
        if (justHandledPointerRef.current) {
            return;
        }
        triggerHaptic();
        onToggle();
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Get position styles
    const getPositionStyles = (): React.CSSProperties => {
        if (fabPosition === 'draggable') {
            return {
                left: position.x,
                top: position.y,
                right: 'auto',
                bottom: 'auto'
            };
        }

        // Fixed position based on fabSide and fabVerticalPosition
        const styles: React.CSSProperties = {
            [fabSide]: 16
        };

        // Vertical position
        switch (fabVerticalPosition) {
            case 'top':
                styles.top = 120; // Below potential header
                break;
            case 'center':
                styles.top = '50%';
                styles.transform = 'translateY(-50%)';
                break;
            case 'bottom':
            default:
                styles.bottom = 16;
                break;
        }

        return styles;
    };

    // Don't render if on desktop and showOnDesktop is false
    if (!isMobile && !showOnDesktop) {
        return null;
    }

    return (
        <button
            ref={buttonRef}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleContextMenu}
            data-selecting={isSelecting ? "true" : undefined}
            className={cn(
                "fixed z-50 flex items-center justify-center",
                "w-14 h-14 rounded-full",
                "bg-primary/90 text-primary-foreground",
                "shadow-lg shadow-primary/25",
                "backdrop-blur-xl border border-white/20",
                "transition-all duration-300 ease-out",
                "hover:scale-110 hover:shadow-xl",
                "active:scale-95",
                "touch-none select-none",
                isDragging && "scale-110 shadow-2xl cursor-grabbing",
                isSelecting && "scale-110 ring-2 ring-primary animate-pulse",
                fabPosition === 'draggable' && !isDragging && "cursor-grab",
                isOpen && "rotate-90 bg-destructive/90",
                isHidden && "translate-y-20 opacity-0 pointer-events-none",
                className
            )}
            style={{
                ...getPositionStyles(),
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
            }}
            aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
        >
            <div className="relative w-6 h-6">
                <Menu
                    className={cn(
                        "absolute inset-0 w-6 h-6 transition-all duration-300",
                        isOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
                    )}
                />
                <X
                    className={cn(
                        "absolute inset-0 w-6 h-6 transition-all duration-300",
                        isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
                    )}
                />
            </div>

            {/* Drag indicator ring */}
            {fabPosition === 'draggable' && (
                <div className={cn(
                    "absolute inset-0 rounded-full border-2 border-dashed border-white/30",
                    "transition-opacity duration-300",
                    isDragging ? "opacity-100 animate-pulse" : "opacity-0"
                )} />
            )}
        </button>
    );
}
