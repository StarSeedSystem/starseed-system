'use client';

// ════════════════════════════════════════════════════════════════
// ClockDateWidget — Reloj + Fecha, con esfera analógica opcional y
// zonas horarias adicionales. Dato real (hora del sistema), vivo
// (tick cada segundo), tamaño-adaptativo: S = hora grande, M = hora +
// fecha, L/XL = + zonas horarias adicionales.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { Clock, CalendarDays, Watch, Globe2, Plus, X } from 'lucide-react';
import { WidgetShell } from '../kit';
import type { DashboardWidget } from '../dashboard-types';

const ACCENT = '#FFBF00'; // Logic (Este) — orden, sistema, tiempo

const ZONE_PRESETS: { id: string; label: string }[] = [
    { id: 'local', label: 'Este dispositivo' },
    { id: 'UTC', label: 'UTC' },
    { id: 'Europe/Madrid', label: 'Madrid' },
    { id: 'Europe/London', label: 'Londres' },
    { id: 'America/New_York', label: 'Nueva York' },
    { id: 'America/Los_Angeles', label: 'Los Ángeles' },
    { id: 'America/Mexico_City', label: 'Ciudad de México' },
    { id: 'America/Bogota', label: 'Bogotá' },
    { id: 'Asia/Tokyo', label: 'Tokio' },
    { id: 'Australia/Sydney', label: 'Sídney' },
];

function zoneLabel(id: string): string {
    return ZONE_PRESETS.find((z) => z.id === id)?.label ?? id;
}

function partsFor(date: Date, tz: string | undefined): { h: number; m: number; s: number; weekday: string; day: string } {
    try {
        const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, ...(tz && tz !== 'local' ? { timeZone: tz } : {}) };
        const fmt = new Intl.DateTimeFormat('es-ES', opts);
        const parts = fmt.formatToParts(date);
        const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
        const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long', ...(tz && tz !== 'local' ? { timeZone: tz } : {}) }).format(date);
        const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', ...(tz && tz !== 'local' ? { timeZone: tz } : {}) }).format(date);
        return { h: get('hour'), m: get('minute'), s: get('second'), weekday, day };
    } catch {
        return { h: date.getHours(), m: date.getMinutes(), s: date.getSeconds(), weekday: '', day: '' };
    }
}

function AnalogFace({ h, m, s, accent }: { h: number; m: number; s: number; accent: string }) {
    const hourAngle = ((h % 12) + m / 60) * 30;
    const minAngle = (m + s / 60) * 6;
    const secAngle = s * 6;
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full max-w-[9rem] max-h-[9rem]">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={2} />
            {Array.from({ length: 12 }).map((_, i) => {
                const a = (i * 30 * Math.PI) / 180;
                const x1 = 50 + Math.sin(a) * 40, y1 = 50 - Math.cos(a) * 40;
                const x2 = 50 + Math.sin(a) * 45, y2 = 50 - Math.cos(a) * 45;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={0.35} strokeWidth={i % 3 === 0 ? 2 : 1} />;
            })}
            <line x1="50" y1="50" x2={50 + Math.sin((hourAngle * Math.PI) / 180) * 24} y2={50 - Math.cos((hourAngle * Math.PI) / 180) * 24} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
            <line x1="50" y1="50" x2={50 + Math.sin((minAngle * Math.PI) / 180) * 34} y2={50 - Math.cos((minAngle * Math.PI) / 180) * 34} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <line x1="50" y1="50" x2={50 + Math.sin((secAngle * Math.PI) / 180) * 38} y2={50 - Math.cos((secAngle * Math.PI) / 180) * 38} stroke={accent} strokeWidth={1} strokeLinecap="round" />
            <circle cx="50" cy="50" r="2.6" fill={accent} />
        </svg>
    );
}

export function ClockDateWidget({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, any>) => void }) {
    const [now, setNow] = useState<Date | null>(null);
    const [mode, setMode] = useState<'digital' | 'analog'>(widget?.settings?.clockMode === 'analog' ? 'analog' : 'digital');
    const [zones, setZones] = useState<string[]>(Array.isArray(widget?.settings?.clockZones) ? widget!.settings.clockZones : []);
    const [pickerOpen, setPickerOpen] = useState(false);

    useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    function persist(patch: Record<string, any>) {
        onUpdateSettings?.(patch);
    }
    function toggleMode() {
        const next = mode === 'digital' ? 'analog' : 'digital';
        setMode(next);
        persist({ clockMode: next });
    }
    function addZone(id: string) {
        if (!id || zones.includes(id)) { setPickerOpen(false); return; }
        const next = [...zones, id].slice(0, 4);
        setZones(next);
        persist({ clockZones: next });
        setPickerOpen(false);
    }
    function removeZone(id: string) {
        const next = zones.filter((z) => z !== id);
        setZones(next);
        persist({ clockZones: next });
    }

    const local = useMemo(() => (now ? partsFor(now, undefined) : null), [now]);

    return (
        <WidgetShell
            title="Reloj y Fecha"
            subtitle={local ? local.weekday.charAt(0).toUpperCase() + local.weekday.slice(1) : undefined}
            icon={mode === 'analog' ? Watch : Clock}
            accent={ACCENT}
            live
            actions={
                <div className="relative flex items-center gap-1">
                    <button type="button" onClick={toggleMode} title={mode === 'digital' ? 'Ver esfera analógica' : 'Ver hora digital'}
                        className="grid place-items-center size-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                        {mode === 'digital' ? <Watch className="size-3.5" /> : <Clock className="size-3.5" />}
                    </button>
                    <button type="button" onClick={() => setPickerOpen((v) => !v)} title="Añadir zona horaria"
                        className="grid place-items-center size-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                        <Plus className="size-3.5" />
                    </button>
                    {pickerOpen && (
                        <div className="absolute right-0 top-7 z-30 w-44 rounded-xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl p-1 max-h-52 overflow-auto custom-scrollbar">
                            {ZONE_PRESETS.filter((z) => z.id !== 'local').map((z) => (
                                <button key={z.id} type="button" onClick={() => addZone(z.id)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5">
                                    <Globe2 className="size-3 opacity-60" /> {z.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            }
        >
            {(size) => {
                if (!now || !local) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const showZones = zones.length > 0 && size.vTier !== 'micro' && size.vTier !== 'compact';

                const digitalHero = (
                    <div className="flex items-baseline gap-1 justify-center tabular-nums">
                        <span className={micro ? 'text-2xl font-black' : 'text-4xl @sm:text-5xl font-black tracking-tight'} style={{ color: ACCENT }}>
                            {String(local.h).padStart(2, '0')}:{String(local.m).padStart(2, '0')}
                        </span>
                        {!micro && <span className="text-sm font-bold text-muted-foreground/50">{String(local.s).padStart(2, '0')}</span>}
                    </div>
                );

                return (
                    <div className="h-full flex flex-col gap-2 pt-1">
                        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5">
                            {mode === 'analog' && !micro ? (
                                <div className="flex-1 min-h-0 w-full grid place-items-center text-foreground/80">
                                    <AnalogFace h={local.h} m={local.m} s={local.s} accent={ACCENT} />
                                </div>
                            ) : digitalHero}
                            {!micro && (
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/70">
                                    <CalendarDays className="size-3" />
                                    <span className="capitalize">{local.day}</span>
                                </div>
                            )}
                        </div>

                        {showZones && (
                            <div className="shrink-0 flex flex-col gap-1 max-h-24 overflow-auto custom-scrollbar">
                                {zones.map((z) => {
                                    const p = partsFor(now, z);
                                    return (
                                        <div key={z} className="group flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-white/[0.02] px-2 py-1">
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 truncate">
                                                <Globe2 className="size-2.5 shrink-0" /> {zoneLabel(z)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <span className="text-[11px] font-black tabular-nums" style={{ color: ACCENT }}>{String(p.h).padStart(2, '0')}:{String(p.m).padStart(2, '0')}</span>
                                                <button type="button" onClick={() => removeZone(z)} title="Quitar zona" className="opacity-0 group-hover:opacity-100 grid place-items-center size-4 rounded text-muted-foreground/50 hover:text-rose-400 transition-all cursor-pointer">
                                                    <X className="size-3" />
                                                </button>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default ClockDateWidget;
