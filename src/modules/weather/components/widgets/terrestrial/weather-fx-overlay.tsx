'use client';

// ════════════════════════════════════════════════════════════════════════════
// WeatherFxOverlay — capa de clima en CSS puro (sin Framer Motion), pensada
// para sitios que quieren la misma sensación atmosférica que `WeatherScene`
// (weather-basic-widget.tsx) sin pagar su coste JS: climate-map, weather-panel,
// atmosphere-view, o cualquier futuro widget de clima.
//
// NO sustituye el motor `WeatherScene` existente (motion.div, muy elaborado) —
// convive con él. Este overlay es la versión ligera/CSS-only del mismo lenguaje
// visual, reutilizando `weather-effects.module.css`.
//
// Uso:
//   <div className="relative overflow-hidden rounded-3xl">
//     ...contenido...
//     <WeatherFxOverlay kind="rain" />
//   </div>
//
// El contenedor padre DEBE ser `position: relative; overflow: hidden` — este
// componente se posiciona en `inset-0` como capa decorativa (aria-hidden,
// pointer-events: none, nunca intercepta clicks).
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { cn } from '@/lib/utils';
import styles from './weather-effects.module.css';

export type WeatherFxKind = 'rain' | 'snow' | 'fog' | 'sun-rays' | 'none';

export function WeatherFxOverlay({
    kind,
    className,
}: {
    kind: WeatherFxKind;
    className?: string;
}) {
    if (kind === 'none') return null;

    return (
        <div className={cn(styles.scene, className)} aria-hidden>
            {kind === 'rain' && (
                <div className={styles.rain}>
                    {Array.from({ length: 14 }).map((_, i) => (
                        <span key={i} className={styles.rainDrop} />
                    ))}
                </div>
            )}
            {kind === 'snow' && (
                <>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <span key={i} className={styles.snowFlake} />
                    ))}
                </>
            )}
            {kind === 'fog' && (
                <>
                    <span className={styles.fogBank} />
                    <span className={styles.fogBank} />
                    <span className={styles.fogBank} />
                </>
            )}
            {kind === 'sun-rays' && (
                <div className={styles.sunRays}>
                    <span className={styles.sunRaysCone} />
                    <span className={styles.sunGlow} />
                </div>
            )}
        </div>
    );
}

export default WeatherFxOverlay;
