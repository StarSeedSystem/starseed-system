"use client";

/**
 * «Topología de tu IA»: cinco formas de repartir la IA de un perfil, grupo o comunidad entre
 * sus neuronas y servidores (SOP §2). La sugerida por el OS va marcada; al elegir una se guarda
 * con `fijarTopologia` (lo hace el panel) y aparecen sus controles.
 */

import { ArrowUp, Check, Hexagon, RadioTower, Server, Sparkles, Split, TriangleAlert, Usb, UsersRound, type LucideIcon } from "lucide-react";

import { Field, LABEL, SELECT, SUB } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { destinoDeIA } from "@/lib/recursos-ia/enrutado";
import type { Asignacion } from "@/lib/recursos-ia/tipos";
import {
    CAPACIDADES,
    NOMBRE_CAPACIDAD,
    NOMBRE_TOPOLOGIA,
    VIAS,
    type Capacidad,
    type ConfigTopologia,
    type InventarioRecursos,
    type MedioAlmacen,
    type Topologia,
    type Via,
} from "@/lib/recursos-ia/tipos";
import { FOCO, TEXTO_TOPOLOGIA, fmtGb, fmtLibre, nombreNeurona, nombreVia, todosLosAlmacenes, todosLosProcesadores } from "./piezas";

export const ORDEN_TOPOLOGIAS: Topologia[] = ["cada-neurona", "servidor-propio", "almacen-externo", "fragmentada", "comunal"];

const ICONO_TOPOLOGIA: Record<Topologia, LucideIcon> = {
    "cada-neurona": Hexagon,
    "servidor-propio": Server,
    "almacen-externo": Usb,
    fragmentada: Split,
    comunal: UsersRound,
};

const TIPOS_EXTERNOS = new Set(["disco-externo", "servidor-externo", "nube", "carpeta-cerebro", "biblioteca"]);

export function almacenesExternos(inv: InventarioRecursos): MedioAlmacen[] {
    return todosLosAlmacenes(inv).filter((a) => TIPOS_EXTERNOS.has(a.tipo));
}

/** La neurona más capaz (en línea, más RAM): la candidata natural a servidor propio. */
export function neuronaMasCapaz(inv: InventarioRecursos): string | undefined {
    const ram = (id: string) => Math.max(0, ...(inv.neuronas.find((n) => n.id === id)?.procesadores.map((p) => (p.ramGb ?? 0) + (p.vramGb ?? 0)) ?? [0]));
    return [...inv.neuronas].sort((a, b) => Number(b.online) - Number(a.online) || ram(b.id) - ram(a.id))[0]?.id;
}

/** La configuración al pasar a otra topología, con valores por defecto sensatos. */
export function configPara(t: Topologia, actual: ConfigTopologia, inv: InventarioRecursos, sugerida?: ConfigTopologia | null): ConfigTopologia {
    const c: ConfigTopologia = { ...actual, topologia: t };
    if (t === "servidor-propio" && !c.servidorNeuronaId) c.servidorNeuronaId = sugerida?.servidorNeuronaId ?? neuronaMasCapaz(inv);
    if (t === "almacen-externo" && !c.almacenExternoId) c.almacenExternoId = sugerida?.almacenExternoId ?? almacenesExternos(inv)[0]?.id;
    if (!c.vias?.length) c.vias = sugerida?.vias?.length ? sugerida.vias : ["local", "malla-local", "red-starseed"];
    return c;
}

export function SeccionTopologia({
    inv,
    actual,
    asignaciones,
    sugerida,
    guardada,
    alGuardar,
}: {
    inv: InventarioRecursos;
    actual: ConfigTopologia;
    asignaciones: Record<string, Asignacion>;
    sugerida: ConfigTopologia | null;
    /** true si la persona ya eligió una (si no, se ve la sugerida sin guardar). */
    guardada: boolean;
    alGuardar: (c: ConfigTopologia) => void;
}) {
    const elegida = actual.topologia;
    return (
        <div className="flex flex-col gap-3">
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Topologías">
                {ORDEN_TOPOLOGIAS.map((t) => {
                    const Icono = ICONO_TOPOLOGIA[t];
                    const on = elegida === t;
                    const esSugerida = sugerida?.topologia === t;
                    return (
                        <li key={t} className="min-w-0">
                            <button
                                type="button"
                                aria-pressed={on}
                                data-testid={`topologia-${t}`}
                                onClick={() => alGuardar(configPara(t, actual, inv, sugerida))}
                                className={cn(
                                    "flex h-full w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left backdrop-blur-xl transition-all duration-200",
                                    on
                                        ? "border-[#007FFF]/60 bg-[#007FFF]/[0.12] shadow-[0_0_24px_-12px_#007FFF]"
                                        : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]",
                                    FOCO,
                                )}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <Icono className={cn("h-4 w-4 shrink-0", on ? "text-[#7fb8ff]" : "text-white/60")} aria-hidden="true" />
                                    <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-white/90">{NOMBRE_TOPOLOGIA[t]}</span>
                                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-[#39FF14]" aria-label="elegida" />}
                                </span>
                                <span className="flex flex-wrap gap-1">
                                    {esSugerida && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[#39FF14]/45 bg-[#10B981]/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-emerald-100">
                                            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" /> sugerida
                                        </span>
                                    )}
                                    {on && !guardada && (
                                        <span className="inline-flex items-center rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] leading-none text-white/60">sin guardar</span>
                                    )}
                                </span>
                                <span className="text-[11px] leading-snug text-white/70">{TEXTO_TOPOLOGIA[t].que}</span>
                                <span className="text-[10px] leading-snug text-white/45">{TEXTO_TOPOLOGIA[t].cuando}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className={cn(SUB, "flex flex-col gap-3 p-3")} data-testid="controles-topologia">
                {elegida === "servidor-propio" && <ControlServidor inv={inv} actual={actual} alGuardar={alGuardar} />}
                {elegida === "almacen-externo" && <ControlAlmacenExterno inv={inv} actual={actual} alGuardar={alGuardar} />}
                {elegida === "fragmentada" && <ControlFragmentada inv={inv} actual={actual} alGuardar={alGuardar} />}
                {elegida === "comunal" && (
                    <p className="text-[11px] leading-snug text-white/70">
                        {actual.alcance.tipo === "perfil"
                            ? "Cambia el alcance a un grupo o una comunidad (arriba) para usar sus servidores compartidos."
                            : `Servidores compartidos visibles: ${inv.procesadoresSueltos.length}. Lo privado del grupo solo usa servidores del grupo dueño.`}
                    </p>
                )}
                {elegida === "cada-neurona" && (
                    <p className="text-[11px] leading-snug text-white/70">Cada neurona elige sus modelos según su procesador y su disco. Las vías de abajo sirven para pedir ayuda a otra si una no puede.</p>
                )}
                <ControlVias actual={actual} alGuardar={alGuardar} />
                <DestinoAIa inv={inv} plan={actual} asignaciones={asignaciones} />
            </div>
        </div>
    );
}

/** A dónde va la IA de cada capacidad con la topología elegida (RIA1023C · `destinoDeIA`). */
function DestinoAIa({ inv, plan, asignaciones }: { inv: InventarioRecursos; plan: ConfigTopologia; asignaciones: Record<string, Asignacion> }) {
    return (
        <div className="flex flex-col gap-1.5" data-testid="destino-ia">
            <p className={LABEL}>A qué servidor va la IA de cada capacidad</p>
            <ul className="flex flex-col gap-1">
                {CAPACIDADES.map((c) => {
                    const d = destinoDeIA(plan, asignaciones, inv, c);
                    return (
                        <li
                            key={c}
                            className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[10px] leading-snug text-white/60"
                            data-testid={`destino-${c}`}
                        >
                            <span className="text-[11px] font-medium text-white/85">{NOMBRE_CAPACIDAD[c]}</span>
                            <span>{nombreVia(d.via)}{d.neuronaId ? ` · ${nombreNeurona(inv, d.neuronaId) || d.neuronaId}` : ""}</span>
                            {d.baseUrl && <span className="font-code text-white/80">{d.baseUrl}</span>}
                            {!d.baseUrl && d.neuronaId && d.via !== "local" && <span> · dirección por anunciar</span>}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function ControlServidor({ inv, actual, alGuardar }: { inv: InventarioRecursos; actual: ConfigTopologia; alGuardar: (c: ConfigTopologia) => void }) {
    return (
        <Field label="Neurona servidora" hint="Procesa la IA de todas tus neuronas. Las demás le mandan las peticiones por las vías permitidas.">
            <select
                aria-label="Neurona servidora"
                className={SELECT}
                value={actual.servidorNeuronaId ?? ""}
                onChange={(e) => alGuardar({ ...actual, servidorNeuronaId: e.target.value || undefined })}
            >
                <option value="">Elige una neurona…</option>
                {inv.neuronas.map((n) => {
                    const ram = Math.max(0, ...n.procesadores.map((p) => p.ramGb ?? 0));
                    return (
                        <option key={n.id} value={n.id}>
                            {n.nombre} · {ram ? `${fmtGb(ram)} RAM` : "RAM sin medir"} · {n.online ? "en línea" : "sin conexión"}
                        </option>
                    );
                })}
            </select>
        </Field>
    );
}

function ControlAlmacenExterno({ inv, actual, alGuardar }: { inv: InventarioRecursos; actual: ConfigTopologia; alGuardar: (c: ConfigTopologia) => void }) {
    const lista = almacenesExternos(inv);
    const elegido = lista.find((a) => a.id === actual.almacenExternoId);
    const procesa = elegido?.neuronaId ? nombreNeurona(inv, elegido.neuronaId) : "";
    return (
        <Field label="Almacenamiento de los modelos" hint={procesa ? `Procesa ${procesa}, la neurona donde está conectado.` : "Si es un disco, procesa la neurona donde lo conectas."}>
            <select
                aria-label="Almacenamiento externo"
                className={SELECT}
                value={actual.almacenExternoId ?? ""}
                onChange={(e) => alGuardar({ ...actual, almacenExternoId: e.target.value || undefined })}
            >
                <option value="">{lista.length ? "Elige un almacenamiento…" : "Ninguno detectado: decláralo abajo"}</option>
                {lista.map((a) => (
                    <option key={a.id} value={a.id}>
                        {a.etiqueta} · {fmtLibre(a)}
                    </option>
                ))}
            </select>
            {elegido && (elegido.tipo === "nube" || elegido.tipo === "biblioteca" || elegido.tipo === "carpeta-cerebro") && (
                <span className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-100/90">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#FFBF00]" aria-hidden="true" />
                    Desde aquí se copian los pesos a la neurona antes de usarlos: los modelos que leen el disco en cada token necesitan un disco local rápido.
                </span>
            )}
        </Field>
    );
}

function ControlFragmentada({ inv, actual, alGuardar }: { inv: InventarioRecursos; actual: ConfigTopologia; alGuardar: (c: ConfigTopologia) => void }) {
    const procesadores = todosLosProcesadores(inv);
    const fijar = (c: Capacidad, procesaEn: string) => {
        const por = { ...(actual.porCapacidad ?? {}) };
        const previo = por[c] ?? {};
        if (procesaEn) por[c] = { ...previo, procesaEn };
        else {
            const { procesaEn: _fuera, ...resto } = previo;
            if (Object.keys(resto).length) por[c] = resto;
            else delete por[c];
        }
        alGuardar({ ...actual, porCapacidad: por });
    };
    return (
        <div className="flex flex-col gap-2">
            <p className={LABEL}>Dónde procesa cada capacidad</p>
            <ul className="grid gap-2 sm:grid-cols-2">
                {CAPACIDADES.map((c) => (
                    <li key={c} className="min-w-0">
                        <label className="flex min-w-0 flex-col gap-1">
                            <span className="truncate text-[11px] text-white/80" title={NOMBRE_CAPACIDAD[c]}>
                                {NOMBRE_CAPACIDAD[c]}
                            </span>
                            <select aria-label={`Procesador para ${NOMBRE_CAPACIDAD[c]}`} className={SELECT} value={actual.porCapacidad?.[c]?.procesaEn ?? ""} onChange={(e) => fijar(c, e.target.value)}>
                                <option value="">Automático</option>
                                {procesadores.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nombre}
                                        {nombreNeurona(inv, p.neuronaId) ? ` · ${nombreNeurona(inv, p.neuronaId)}` : ""}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ControlVias({ actual, alGuardar }: { actual: ConfigTopologia; alGuardar: (c: ConfigTopologia) => void }) {
    const activas: Via[] = ["local", ...actual.vias.filter((v) => v !== "local")];
    const resto = VIAS.filter((v) => !activas.includes(v));
    const guardar = (vias: Via[]) => alGuardar({ ...actual, vias });
    const subir = (i: number) => {
        const v = [...activas];
        [v[i - 1], v[i]] = [v[i], v[i - 1]];
        guardar(v);
    };
    return (
        <div className="flex flex-col gap-1.5">
            <p className={LABEL}>Vías permitidas, en orden de preferencia</p>
            <ol className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap" aria-label="Vías activas">
                {activas.map((v, i) => (
                    <li key={v} className="flex min-w-0 items-center gap-1 rounded-lg border border-[#007FFF]/40 bg-[#007FFF]/10 py-0.5 pl-2 pr-0.5 text-[11px] text-sky-100 max-sm:min-h-10">
                        <span className="font-code text-[10px] text-white/50">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{nombreVia(v)}</span>
                        {v === "local" ? (
                            <span className="px-1.5 text-[9px] text-white/45">siempre</span>
                        ) : (
                            <>
                                {i > 1 && (
                                    <button type="button" aria-label={`Subir ${nombreVia(v)}`} onClick={() => subir(i)} className={cn("cursor-pointer rounded p-1 text-white/60 transition-colors duration-200 hover:text-white max-sm:min-h-9", FOCO)}>
                                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-label={`Quitar ${nombreVia(v)}`}
                                    onClick={() => guardar(activas.filter((x) => x !== v))}
                                    className={cn("cursor-pointer rounded px-1.5 py-1 text-[10px] text-white/60 transition-colors duration-200 hover:text-rose-100 max-sm:min-h-9", FOCO)}
                                >
                                    quitar
                                </button>
                            </>
                        )}
                    </li>
                ))}
                {resto.map((v) => (
                    <li key={v} className="min-w-0">
                        <button
                            type="button"
                            onClick={() => guardar([...activas, v])}
                            className={cn(
                                "flex w-full cursor-pointer items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-white/60 transition-colors duration-200 hover:border-white/35 hover:text-white/85 max-sm:min-h-9 sm:w-auto",
                                FOCO,
                            )}
                        >
                            {v === "antena" && <RadioTower className="h-3 w-3 shrink-0" aria-hidden="true" />}+ {nombreVia(v)}
                        </button>
                    </li>
                ))}
            </ol>
            {activas.includes("antena") && (
                <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-100/90" data-testid="aviso-antena">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#FFBF00]" aria-hidden="true" />
                    Antena: solo mensajes y decisiones, nunca pesos. Su ancho de banda no alcanza para mover modelos ni archivos grandes.
                </p>
            )}
        </div>
    );
}
