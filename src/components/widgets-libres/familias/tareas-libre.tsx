"use client";
/**
 * Tareas libres (Ola 383 · WL7, rediseño 2026-09-28) — una flor, sin contenedor. Cada tarea es
 * un pétalo esmeralda que se enciende en lima al completarla (acción real: `toggle` de
 * `useQuickTasks`, la misma lista del widget clásico, sincronizada con la cuenta). Sin tareas, un
 * capullo con un «+» que abre el campo para añadir la primera. micro/s = la flor · m/l/xl = flor +
 * lista; el campo de añadir aparece al tocar el «+».
 */
import * as React from "react";
import { Plus } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { useQuickTasks, type QuickTask } from "@/lib/tasks/quick-tasks";
import { Rotulo, disenoDe } from "./comun";

const ESMERALDA = "#10B981";
const LIMA = "#39FF14";

function Flor({ tareas, tam, onToggle, onMas, interactiva }: { tareas: QuickTask[]; tam: number; onToggle: (id: string) => void; onMas: () => void; interactiva: boolean }) {
    const petalos = tareas.slice(0, 8);
    const hechas = tareas.filter((t) => t.done).length;
    const vacia = petalos.length === 0;
    // Sin tareas, un capullo: cinco pétalos cerrados hacia arriba (no un molinillo de tres).
    const n = vacia ? 5 : petalos.length;
    const largo = tam * (vacia ? 0.34 : 0.42), ancho = tam * (vacia ? 0.15 : 0.18);
    return (
        <div className="relative" style={{ width: tam, height: tam }}>
            <svg width={tam} height={tam} viewBox={`${-tam / 2} ${-tam / 2} ${tam} ${tam}`} className="absolute inset-0 overflow-visible" role="group"
                aria-label={vacia ? "Sin tareas: añade la primera" : `Flor de tareas: ${hechas} de ${tareas.length} hechas`}>
                <g className={vacia ? "ss-respirar" : "ss-girar"} style={{ ["--ss-dur" as string]: vacia ? "6s" : "240s", transformOrigin: "0 0" }}>
                    {Array.from({ length: n }, (_, i) => {
                        const t = petalos[i];
                        const ang = vacia ? -52 + i * 26 : (i / n) * 360;
                        const accion = () => interactiva && t && onToggle(t.id);
                        return (
                            <g key={t?.id ?? i} transform={`rotate(${ang})`} role={interactiva && t ? "button" : undefined} tabIndex={interactiva && t ? 0 : undefined}
                                aria-label={t ? `${t.text}: ${t.done ? "hecha, pulsa para reabrir" : "pendiente, pulsa para completar"}` : undefined}
                                aria-pressed={t ? t.done : undefined} onClick={accion}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accion(); } }}
                                className={interactiva && t ? "cursor-pointer outline-none [&:focus-visible>ellipse]:stroke-white" : undefined}>
                                <ellipse rx={ancho / 2} ry={largo / 2} cy={vacia ? -largo / 2 : -largo / 2 - tam * 0.06}
                                    fill={t?.done ? LIMA : ESMERALDA} fillOpacity={t?.done ? 0.7 : 0.22}
                                    stroke={t?.done ? LIMA : "rgba(16,185,129,.55)"} strokeWidth={1.5}
                                    style={{ filter: t?.done ? `drop-shadow(0 0 6px ${LIMA}88)` : undefined, transition: "fill-opacity .4s, fill .4s" }} />
                            </g>
                        );
                    })}
                </g>
            </svg>
            {/* corazón: el contador, o el «+» cuando no hay tareas */}
            {vacia ? (
                <button type="button" onClick={onMas} aria-label="Añadir tarea"
                    className="ss-redondo absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white transition-transform hover:scale-110"
                    style={{ width: tam * 0.24, height: tam * 0.24, background: `${ESMERALDA}33`, boxShadow: `inset 0 0 0 1px ${ESMERALDA}88` }}>
                    <Plus style={{ width: tam * 0.1, height: tam * 0.1 }} />
                </button>
            ) : (
                <span className="ss-redondo absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-semibold tabular-nums text-white"
                    style={{ width: tam * 0.26, height: tam * 0.26, fontSize: Math.max(12, tam * 0.075), background: `${ESMERALDA}40`, boxShadow: `inset 0 0 0 1px ${ESMERALDA}99` }}>
                    {hechas}/{tareas.length}
                </span>
            )}
        </div>
    );
}

export function TareasLibre() {
    const { tasks, pending, add, toggle } = useQuickTasks();
    const [borrador, setBorrador] = React.useState("");
    const [anadiendo, setAnadiendo] = React.useState(false);
    const enviar = (e: React.FormEvent) => { e.preventDefault(); const t = borrador.trim(); if (t) { add(t); setBorrador(""); } };
    const campo = anadiendo && (
        <form onSubmit={enviar} className="ss-redondo flex w-full max-w-[15rem] items-center gap-1 rounded-full pl-3 pr-1" style={{ background: `${ESMERALDA}1f`, boxShadow: `inset 0 0 0 1px ${ESMERALDA}66` }}>
            <input autoFocus value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="Nueva tarea…" aria-label="Nueva tarea"
                onKeyDown={(e) => { if (e.key === "Escape") setAnadiendo(false); }}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-white placeholder:text-white/45 focus:outline-none" />
            <button type="submit" aria-label="Guardar tarea" className="ss-redondo grid size-7 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10"><Plus className="size-4" /></button>
        </form>
    );
    return (
        <WidgetLibre forma="ninguna" acento={ESMERALDA} acento2="#39FF14" etiqueta={`Tareas: ${pending.length} pendientes`} intensidad={0.3}>
            {({ clase, ancho, alto }) => {
                const { base: b, horizontal } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                const tam = Math.min(lado * (b === "micro" || b === "s" ? 0.78 : 0.62), 240);
                const flor = <Flor tareas={tasks} tam={tam} onToggle={toggle} onMas={() => setAnadiendo(true)} interactiva={b !== "micro"} />;
                if (b === "micro" || b === "s" || tasks.length === 0) {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-2">
                            {flor}
                            {tasks.length === 0 && b !== "micro" && !anadiendo && <span className="text-[12px] font-medium text-white/70">Añadir tarea</span>}
                            {campo}
                        </div>
                    );
                }
                return (
                    <div className={`flex h-full w-full items-center justify-center gap-4 p-2 ${horizontal || ancho > alto * 1.3 ? "flex-row" : "flex-col"}`}>
                        {flor}
                        <div className="flex min-w-0 max-w-[16rem] flex-1 flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <Rotulo>{pending.length ? `${pending.length} por hacer` : "todo hecho"}</Rotulo>
                                {!anadiendo && <button type="button" onClick={() => setAnadiendo(true)} aria-label="Añadir tarea" className="ss-redondo grid size-6 cursor-pointer place-items-center rounded-full text-emerald-200 hover:bg-white/10"><Plus className="size-4" /></button>}
                            </div>
                            <ul className="flex flex-col gap-1">
                                {pending.slice(0, b === "xl" ? 7 : 4).map((t) => (
                                    <li key={t.id}>
                                        <button type="button" onClick={() => toggle(t.id)} className="flex w-full cursor-pointer items-center gap-2 text-left text-[13px] text-white/80 hover:text-white">
                                            <span aria-hidden className="ss-redondo size-3 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${ESMERALDA}` }} />
                                            <span className="truncate">{t.text}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {campo}
                        </div>
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default TareasLibre;
