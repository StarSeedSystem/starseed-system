'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Vista previa translúcida de snap de ventanas
// ----------------------------------------------------------------
// Overlay cristal que aparece MIENTRAS se arrastra una ventana cerca de
// un borde/esquina de pantalla, mostrando dónde quedará encajada si se
// suelta ahí (mitad izquierda/derecha/superior, o cuarto de esquina).
// Puramente presentacional: el lienzo le pasa la zona activa (o null).
// ════════════════════════════════════════════════════════════════

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { SnapZone } from "./desktop-window-snap";
import { snapPreviewRect } from "./desktop-window-snap";

export function DesktopSnapPreview({
    zone, topInset, accent,
}: {
    zone: SnapZone | null;
    topInset: number;
    accent: string;
}): React.ReactElement {
    const reduced = useReducedMotion();
    const [vw, setVw] = React.useState(1280);
    const [vh, setVh] = React.useState(800);

    React.useEffect(() => {
        const update = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    return (
        <AnimatePresence>
            {zone && (
                <motion.div
                    key={zone}
                    aria-hidden
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: reduced ? 0.08 : 0.16 }}
                    style={(() => {
                        const r = snapPreviewRect(zone, vw, vh, topInset);
                        return { left: r.x, top: r.y, width: r.w, height: r.h };
                    })()}
                    className="pointer-events-none absolute z-[70] rounded-2xl border-2"
                >
                    <div
                        className="h-full w-full rounded-2xl backdrop-blur-sm"
                        style={{
                            background: `color-mix(in srgb, ${accent} 16%, transparent)`,
                            borderColor: `color-mix(in srgb, ${accent} 70%, transparent)`,
                            boxShadow: `0 0 40px -6px color-mix(in srgb, ${accent} 55%, transparent), inset 0 0 0 2px color-mix(in srgb, ${accent} 40%, transparent)`,
                        }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
