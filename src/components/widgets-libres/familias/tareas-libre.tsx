"use client";
/**
 * Tareas libres (Ola 383 · WL7) — una flor. Cada tarea es un pétalo que se enciende al
 * completarla (la acción real: `toggle` de `useQuickTasks`, la misma lista que el widget
 * clásico, sincronizada con la cuenta). micro = completadas/total en el corazón · s = la flor
 * (cada pétalo se toca) · m = flor + lista · l/xl = + añadir una tarea al vuelo.
 */
import * as React from "react";
import { Plus } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { useQuickTasks, type QuickTask } from "@/lib/tasks/quick-tasks";
import { Rotulo, disenoDe } from "./comun";

const VERDE = "#39FF14";

function Flor({ tareas, tam, onToggle, interactiva }: { tareas: QuickTask[]; tam: number; onToggle: (id: string) => void; interactiva: boolean }) {
    const petalos = tareas.slice(0, 12);
    const n = Math.max(petalos.length, 1), largo = tam * 0.3, ancho = Math.max(6, (tam * 1.6) / (n + 3));
    const hechas = tareas.filter((t) => t.done).length;
    return (
        <svg width={tam} height={tam} viewBox={`${-tam / 2} ${-tam / 2} ${tam} ${tam}`} className="overflow-visible" role="group" aria-label={`Flor de tareas: ${hechas} de ${tareas.length} completadas`}>
            <g className="ss-girar" style={{ ["--ss-dur" as string]: "240s", transformOrigin: "0 0" }}>
                {/* Sin tareas: la flor en espera, seis pétalos fantasma que respiran. */}
                {petalos.length === 0 && Array.from({ length: 6 }, (_, i) => (
                    <ellipse key={i} transform={`rotate(${i * 60})`} rx={tam * 0.07} ry={largo / 2} cy={-largo / 2 - tam * 0.08}
                        fill={VERDE} fillOpacity={0.05} stroke={`${VERDE}55`} strokeDasharray="3 4" />
                ))}
                {petalos.map((t, i) => {
                    const ang = (i / n) * 360;
                    const accion = () => interactiva && onToggle(t.id);
                    return (
                        <g key={t.id} transform={`rotate(${ang})`} role={interactiva ? "button" : undefined} tabIndex={interactiva ? 0 : undefined}
                            aria-label={interactiva ? `${t.text}: ${t.done ? "hecha, pulsa para reabrir" : "pendiente, pulsa para completar"}` : undefined}
                            aria-pressed={interactiva ? t.done : undefined} onClick={accion}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accion(); } }}
                            className={interactiva ? "cursor-pointer outline-none [&:focus-visible>ellipse]:stroke-white" : undefined}>
                            <ellipse rx={ancho / 2} ry={largo / 2} cy={-largo / 2 - tam * 0.08}
                                fill={t.done ? VERDE : "#ffffff"} fillOpacity={t.done ? 0.75 : 0.1}
                                stroke={t.done ? "#d9ffcc" : `${VERDE}66`} strokeWidth={1.2}
                                style={{ filter: t.done ? `drop-shadow(0 0 6px ${VERDE})` : undefined, transition: "fill-opacity .4s, fill .4s" }} />
                        </g>
                    );
                })}
            </g>
            <circle r={tam * 0.1} fill="#FFBF00" fillOpacity={0.85} className="ss-respirar" style={{ transformOrigin: "0 0" }} />
            <text textAnchor="middle" dy="0.35em" fontSize={tam * 0.08} fill="#1a1147" fontWeight={700}>{hechas}/{tareas.length}</text>
        </svg>
    );
}

export function TareasLibre() {
    const { tasks, pending, add, toggle } = useQuickTasks();
    const [borrador, setBorrador] = React.useState("");
    const per = personalidadDe("TASKS_QUICK");
    const enviar = (e: React.FormEvent) => { e.preventDefault(); const t = borrador.trim(); if (t) { add(t); setBorrador(""); } };
    return (
        <WidgetLibre forma={per.forma} acento={per.acento} acento2="#10B981" etiqueta={`Tareas: ${pending.length} pendientes`} intensidad={0.3}>
            {({ clase, ancho, alto }) => {
                const { base: b, horizontal } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                if (b === "micro" || b === "s") {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-1">
                            <Flor tareas={tasks} tam={lado * (b === "micro" ? 0.8 : 0.72)} onToggle={toggle} interactiva={b === "s"} />
                            {tasks.length === 0 && b === "s" && <span className="text-[11px] text-white/70">Sin tareas</span>}
                        </div>
                    );
                }
                const conCampo = b === "l" || b === "xl";
                return (
                    <div className={`flex h-full w-full items-center justify-center gap-3 p-2 ${horizontal || ancho > alto * 1.3 ? "flex-row" : "flex-col"}`}>
                        <Flor tareas={tasks} tam={Math.min(lado * 0.62, 220)} onToggle={toggle} interactiva />
                        <div className="flex min-w-0 max-w-[16rem] flex-1 flex-col gap-1.5">
                            <Rotulo color="#bbf7d0">{pending.length ? `${pending.length} por hacer` : tasks.length ? "todo hecho" : "Sin tareas"}</Rotulo>
                            <ul className="flex flex-col gap-1">
                                {pending.slice(0, b === "xl" ? 7 : 4).map((t) => (
                                    <li key={t.id}>
                                        <button type="button" onClick={() => toggle(t.id)} className="flex w-full cursor-pointer items-center gap-2 text-left text-xs text-white/85 hover:text-white">
                                            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${VERDE}` }} />
                                            <span className="truncate">{t.text}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {conCampo && (
                                <form onSubmit={enviar} className="flex items-center gap-1 rounded-full pl-3 pr-1" style={{ background: `radial-gradient(120% 200% at 10% 50%, ${VERDE}22, transparent)` }}>
                                    <input value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="Nueva tarea…" aria-label="Nueva tarea"
                                        className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none" />
                                    <button type="submit" aria-label="Añadir tarea" className="grid size-6 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10"><Plus className="size-3.5" /></button>
                                </form>
                            )}
                        </div>
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default TareasLibre;
