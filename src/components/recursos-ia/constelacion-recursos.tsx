"use client";

/**
 * Constelación de recursos — la malla de la cuenta dibujada como una retícula cristalina SiO2:
 * cada neurona es un hexágono de silicio, sus procesadores giran en el anillo interior y sus
 * almacenes son satélites con un arco de llenado (ocupado/total). En el anillo exterior, lo que
 * no es de una neurona: Biblioteca, cerebros, servidores, nube y servidores comunales.
 * Los enlaces se dibujan por vía y la topología elegida resalta los flujos «pesos → procesador»
 * y «procesador → neuronas que lo usan» (trazo animado; quieto con `prefers-reduced-motion`).
 * En pantallas chicas la misma información pasa a una lista apilada.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import { Hexagon, Orbit } from "lucide-react";

import { Bar, LABEL, SUB } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { cuantizacionesPara, dispositivoDeProcesador } from "@/lib/recursos-ia/cuantizacion-hf";
import type { ConfigTopologia, InventarioRecursos, MedioAlmacen, NeuronaRecursos, PlanRecursos, Procesador, Via } from "@/lib/recursos-ia/tipos";
import {
    FOCO,
    FuenteBadge,
    ICONO_ALMACEN,
    ICONO_PROCESADOR,
    LETRA_PROCESADOR,
    Linea,
    NOMBRE_ACELERADOR,
    NOMBRE_TIPO_ALMACEN,
    NOMBRE_TIPO_PROCESADOR,
    TRAZO_VIA,
    TRINITY,
    colorLlenado,
    fmtGb,
    fmtLibre,
    fraccionOcupada,
    nombreVia,
    tonoBarra,
} from "./piezas";

/* ── Geometría ─────────────────────────────────────────────────────────────── */

const HEX_R = 40;
const PROC_ORB = 58;
const PROC_R = 9;
const ALM_ORB = 98;
const ALM_R = 10;
const PISTA_R = 14;
const SUELTO_R = 13;
const MARGEN = 64;

type Punto = { x: number; y: number };

interface Colocado<T> extends Punto {
    item: T;
    angulo: number;
}

interface Geometria {
    caja: { x: number; y: number; w: number; h: number };
    neuronas: Colocado<NeuronaRecursos>[];
    procesadores: Colocado<Procesador>[];
    almacenes: Colocado<MedioAlmacen>[];
    sueltos: Colocado<{ tipo: "almacen"; a: MedioAlmacen } | { tipo: "procesador"; p: Procesador }>[];
    pos: Map<string, Punto>;
    /** Radio visual de cada nodo (para que los flujos acaben en su borde, no debajo). */
    radio: Map<string, number>;
    /** Centro de la neurona dueña de cada procesador/almacén (flujos internos en órbita). */
    duena: Map<string, Punto>;
}

const rad = (g: number) => (g * Math.PI) / 180;

function abanico(n: number, centro: number, paso: number, maximo: number): number[] {
    if (n <= 0) return [];
    const p = n > 1 ? Math.min(paso, maximo / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => centro + (i - (n - 1) / 2) * p);
}

export function calcularGeometria(inv: InventarioRecursos): Geometria {
    const esta = inv.neuronas.find((n) => n.esEsta) ?? inv.neuronas[0];
    const otras = inv.neuronas.filter((n) => n !== esta);
    const m = otras.length;
    const cuerda = 2 * (ALM_ORB + PISTA_R + 16);
    const rx = m === 0 ? 0 : Math.max(220, m > 1 ? cuerda / (2 * Math.sin(Math.PI / m)) : 230);
    const ry = m <= 2 ? 0 : Math.max(200, rx * 0.66);

    const neuronas: Colocado<NeuronaRecursos>[] = [];
    if (esta) neuronas.push({ item: esta, x: 0, y: 0, angulo: 90 });
    otras.forEach((n, i) => {
        const ang = m === 1 ? 0 : m === 2 ? i * 180 : -90 + (i * 360) / m;
        neuronas.push({ item: n, x: rx * Math.cos(rad(ang)), y: ry * Math.sin(rad(ang)), angulo: ang });
    });

    const procesadores: Colocado<Procesador>[] = [];
    const almacenes: Colocado<MedioAlmacen>[] = [];
    for (const c of neuronas) {
        const central = c.x === 0 && c.y === 0;
        const haciaProc = central ? -90 : c.angulo + 180;
        const haciaAlm = central ? 90 : c.angulo;
        abanico(c.item.procesadores.length, haciaProc, 34, central ? 160 : 120).forEach((ang, i) => {
            procesadores.push({ item: c.item.procesadores[i], x: c.x + PROC_ORB * Math.cos(rad(ang)), y: c.y + PROC_ORB * Math.sin(rad(ang)), angulo: ang });
        });
        abanico(c.item.almacenes.length, haciaAlm, 32, central ? 200 : 150).forEach((ang, i) => {
            almacenes.push({ item: c.item.almacenes[i], x: c.x + ALM_ORB * Math.cos(rad(ang)), y: c.y + ALM_ORB * Math.sin(rad(ang)), angulo: ang });
        });
    }

    const listaSueltos: Geometria["sueltos"][number]["item"][] = [
        ...inv.almacenesSueltos.map((a) => ({ tipo: "almacen" as const, a })),
        ...inv.procesadoresSueltos.map((p) => ({ tipo: "procesador" as const, p })),
    ];
    const s = listaSueltos.length;
    const rxo = m === 0 ? 230 : rx + 150;
    const ryo = m === 0 ? 180 : Math.max(ry + 130, 200);
    // Ángulos de las neuronas del anillo: los nodos exteriores se apartan de ellas para no
    // pisar sus satélites ni sus etiquetas.
    const angNeuronas = neuronas.slice(1).map((c) => c.angulo);
    const apartar = (ang: number) => {
        for (const t of angNeuronas) {
            let d = ((ang - t + 540) % 360) - 180;
            if (Math.abs(d) < 30) return t + (d >= 0 ? 30 : -30);
        }
        return ang;
    };
    const sueltos: Geometria["sueltos"] = listaSueltos.map((item, i) => {
        const ang = apartar(-90 + (360 / Math.max(1, s)) * (i + 0.5));
        const escalon = s > 10 && i % 2 === 1 ? 46 : 0;
        return { item, x: (rxo + escalon) * Math.cos(rad(ang)), y: (ryo + escalon * 0.8) * Math.sin(rad(ang)), angulo: ang };
    });

    const pos = new Map<string, Punto>();
    const radio = new Map<string, number>();
    const duena = new Map<string, Punto>();
    const centro = new Map(neuronas.map((c) => [c.item.id, c as Punto]));
    neuronas.forEach((c) => {
        pos.set(`n:${c.item.id}`, c);
        radio.set(`n:${c.item.id}`, HEX_R + 4);
    });
    procesadores.forEach((c) => {
        pos.set(`p:${c.item.id}`, c);
        radio.set(`p:${c.item.id}`, PROC_R + 3);
        const n = centro.get(c.item.neuronaId);
        if (n) duena.set(`p:${c.item.id}`, n);
    });
    almacenes.forEach((c) => {
        pos.set(`a:${c.item.id}`, c);
        radio.set(`a:${c.item.id}`, PISTA_R + 3);
        const n = c.item.neuronaId ? centro.get(c.item.neuronaId) : undefined;
        if (n) duena.set(`a:${c.item.id}`, n);
    });
    sueltos.forEach((c) => {
        const k = c.item.tipo === "almacen" ? `a:${c.item.a.id}` : `p:${c.item.p.id}`;
        pos.set(k, c);
        radio.set(k, SUELTO_R + 5);
    });

    const todos: Punto[] = [...neuronas, ...procesadores, ...almacenes, ...sueltos];
    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const minX = Math.min(0, ...xs) - MARGEN - 30;
    const maxX = Math.max(0, ...xs) + MARGEN + 30;
    const minY = Math.min(0, ...ys) - MARGEN;
    const maxY = Math.max(0, ...ys) + MARGEN;
    return { caja: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, neuronas, procesadores, almacenes, sueltos, pos, radio, duena };
}

/* ── Flujos de la topología ────────────────────────────────────────────────── */

export interface Flujo {
    clave: string;
    de: string;
    a: string;
    tipo: "pesos" | "uso";
}

export function calcularFlujos(inv: InventarioRecursos, plan: PlanRecursos | null, topologia: ConfigTopologia | null): Flujo[] {
    const out = new Map<string, Flujo>();
    const add = (de: string, a: string, tipo: Flujo["tipo"]) => {
        if (de === a) return;
        const clave = `${tipo}:${de}>${a}`;
        if (!out.has(clave)) out.set(clave, { clave, de, a, tipo });
    };
    const esta = inv.neuronas.find((n) => n.esEsta) ?? inv.neuronas[0];
    const reparte = topologia?.topologia === "servidor-propio" || topologia?.topologia === "comunal";
    for (const s of plan?.sugerencias ?? []) {
        add(`a:${s.almacen.id}`, `p:${s.procesador.id}`, "pesos");
        const usuarias = reparte ? inv.neuronas : esta ? [esta] : [];
        for (const n of usuarias) if (n.id !== s.procesador.neuronaId) add(`p:${s.procesador.id}`, `n:${n.id}`, "uso");
    }
    if (topologia?.topologia === "servidor-propio" && topologia.servidorNeuronaId) {
        const servidor = inv.neuronas.find((n) => n.id === topologia.servidorNeuronaId);
        const proc = servidor?.procesadores.find((p) => p.tipo === "gpu") ?? servidor?.procesadores[0];
        if (servidor && proc) for (const n of inv.neuronas) if (n.id !== servidor.id) add(`p:${proc.id}`, `n:${n.id}`, "uso");
    }
    return [...out.values()];
}

/**
 * Trazo de un flujo: dentro de una misma neurona gira por su órbita (no cruza el hexágono);
 * entre nodos distintos es una curva suave. En ambos casos empieza y acaba en el borde del nodo.
 */
export function trazoFlujo(geo: Pick<Geometria, "pos" | "radio" | "duena">, de: string, a: string): string | null {
    const p0 = geo.pos.get(de);
    const p1 = geo.pos.get(a);
    if (!p0 || !p1) return null;
    const r0 = geo.radio.get(de) ?? 0;
    const r1 = geo.radio.get(a) ?? 0;
    const c0 = geo.duena.get(de);
    const c1 = geo.duena.get(a);
    if (c0 && c1 && c0 === c1) {
        const ang = (p: Punto) => Math.atan2(p.y - c0.y, p.x - c0.x);
        const dist = (p: Punto) => Math.hypot(p.x - c0.x, p.y - c0.y);
        const t0 = ang(p0);
        let d = ang(p1) - t0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const ra = dist(p0);
        const rb = dist(p1);
        const media = (ra + rb) / 2 + 14;
        // Recorta el principio y el final por el radio de cada nodo (en ángulo sobre la órbita).
        const inicio = Math.sign(d) * Math.min(Math.abs(d) * 0.3, r0 / media);
        const fin = d - Math.sign(d) * Math.min(Math.abs(d) * 0.3, r1 / media);
        const pasos = 24;
        const puntos: string[] = [];
        for (let i = 0; i <= pasos; i++) {
            const f = i / pasos;
            const t = t0 + inicio + (fin - inicio) * f;
            const r = ra + (rb - ra) * f + Math.sin(Math.PI * f) * (media - (ra + rb) / 2);
            puntos.push(`${(c0.x + r * Math.cos(t)).toFixed(1)} ${(c0.y + r * Math.sin(t)).toFixed(1)}`);
        }
        return `M ${puntos.join(" L ")}`;
    }
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const ux = (p1.x - p0.x) / L;
    const uy = (p1.y - p0.y) / L;
    return curva({ x: p0.x + ux * r0, y: p0.y + uy * r0 }, { x: p1.x - ux * r1, y: p1.y - uy * r1 });
}

function curva(a: Punto, b: Punto): string {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = 0.14;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function hexagono(cx: number, cy: number, r: number): string {
    return Array.from({ length: 6 }, (_, i) => {
        const a = rad(60 * i - 90);
        return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
}

const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function viaDeNeurona(n: NeuronaRecursos): Via {
    return n.vias.find((v) => v !== "local") ?? "internet";
}

/* ── Componente ────────────────────────────────────────────────────────────── */

type Seleccion = { tipo: "neurona"; id: string } | { tipo: "procesador"; id: string } | { tipo: "almacen"; id: string } | null;

export function ConstelacionRecursos({
    inv,
    plan,
    topologia,
}: {
    inv: InventarioRecursos;
    plan: PlanRecursos | null;
    topologia: ConfigTopologia | null;
}) {
    const geo = useMemo(() => calcularGeometria(inv), [inv]);
    const flujos = useMemo(() => calcularFlujos(inv, plan, topologia), [inv, plan, topologia]);
    const [sel, setSel] = useState<Seleccion>(null);
    const [foco, setFoco] = useState<string>("");
    const esta = geo.neuronas[0];

    const nodo = (clave: string, s: NonNullable<Seleccion>, etiqueta: string) => ({
        role: "button" as const,
        tabIndex: 0,
        "aria-label": etiqueta,
        "aria-pressed": sel?.tipo === s.tipo && sel.id === s.id,
        className: "cursor-pointer outline-none",
        onClick: () => setSel((v) => (v?.tipo === s.tipo && v.id === s.id ? null : s)),
        onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSel((v) => (v?.tipo === s.tipo && v.id === s.id ? null : s));
            }
        },
        onFocus: () => setFoco(clave),
        onBlur: () => setFoco((f) => (f === clave ? "" : f)),
    });
    const activo = (clave: string, s: NonNullable<Seleccion>) => foco === clave || (sel?.tipo === s.tipo && sel.id === s.id);

    const enlace = (a: Punto, b: Punto, via: Via, clave: string, opacidad = 0.55) => {
        const t = TRAZO_VIA[via];
        return (
            <line
                key={clave}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={t.color}
                strokeWidth={t.ancho}
                strokeDasharray={t.guiones}
                strokeLinecap="round"
                opacity={opacidad}
                data-via={via}
            />
        );
    };

    const { caja } = geo;
    return (
        <div data-testid="constelacion-recursos" className="flex flex-col gap-3">
            {/* Vista de constelación (pantallas medianas y grandes) */}
            <div className="hidden overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(0,127,255,0.10),rgba(0,0,0,0.25)_70%)] md:block">
                <svg
                    role="group"
                    aria-label="Constelación de recursos de tus neuronas"
                    viewBox={`${caja.x.toFixed(0)} ${caja.y.toFixed(0)} ${caja.w.toFixed(0)} ${caja.h.toFixed(0)}`}
                    className="mx-auto block h-auto max-h-[min(72vh,680px)] w-full"
                    style={{ maxWidth: `${Math.round(caja.w * 1.1)}px` }}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <title>Constelación de recursos de tus neuronas</title>
                    <style>{`
                        .ria-flujo { animation: ria-flujo 1.8s linear infinite; }
                        @keyframes ria-flujo { to { stroke-dashoffset: -24; } }
                        @media (prefers-reduced-motion: reduce) { .ria-flujo { animation: none; } }
                        .ria-nodo { transition: opacity 200ms ease, transform 200ms ease; }
                    `}</style>
                    <defs>
                        {/* Retícula SiO2: hexágonos de silicio con oxígenos en los vértices. */}
                        <pattern id="ria-reticula" width="52" height="90" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
                            <path d="M26 0 L52 15 L52 45 L26 60 L0 45 L0 15 Z M26 60 L26 90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            {[
                                [26, 0],
                                [52, 15],
                                [52, 45],
                                [26, 60],
                                [0, 45],
                                [0, 15],
                            ].map(([x, y]) => (
                                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="rgba(0,127,255,0.18)" />
                            ))}
                        </pattern>
                        <radialGradient id="ria-silicio" cx="50%" cy="38%" r="70%">
                            <stop offset="0%" stopColor="rgba(0,127,255,0.32)" />
                            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
                        </radialGradient>
                        <marker id="ria-flecha-pesos" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M0 0 L10 5 L0 10 z" fill={TRINITY.horizon} />
                        </marker>
                        <marker id="ria-flecha-uso" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M0 0 L10 5 L0 10 z" fill={TRINITY.zenith} />
                        </marker>
                    </defs>
                    <rect x={caja.x} y={caja.y} width={caja.w} height={caja.h} fill="url(#ria-reticula)" />

                    {/* Órbitas y enlaces (detrás de los nodos) */}
                    <g aria-hidden="true">
                        {geo.neuronas.map((c) => (
                            <g key={`orb-${c.item.id}`}>
                                <circle cx={c.x} cy={c.y} r={PROC_ORB} fill="none" stroke="rgba(255,255,255,0.06)" />
                                <circle cx={c.x} cy={c.y} r={ALM_ORB} fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" />
                            </g>
                        ))}
                        {esta && geo.neuronas.slice(1).map((c) => enlace(esta, c, viaDeNeurona(c.item), `en-${c.item.id}`))}
                        {esta &&
                            geo.sueltos.map((c) => {
                                const via = c.item.tipo === "almacen" ? c.item.a.via : c.item.p.via;
                                return enlace(esta, c, via, `es-${c.angulo}`, 0.32);
                            })}
                    </g>

                    {/* Flujos de la topología elegida */}
                    <g aria-hidden="true" data-testid="flujos">
                        {flujos.map((f) => {
                            const d = trazoFlujo(geo, f.de, f.a);
                            if (!d) return null;
                            const color = f.tipo === "pesos" ? TRINITY.horizon : TRINITY.zenith;
                            return (
                                <path
                                    key={f.clave}
                                    d={d}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeDasharray="6 6"
                                    strokeLinecap="round"
                                    opacity={0.85}
                                    className="ria-flujo"
                                    markerEnd={`url(#ria-flecha-${f.tipo})`}
                                    data-flujo={f.tipo}
                                />
                            );
                        })}
                    </g>

                    {/* Neuronas: hexágonos de silicio */}
                    {geo.neuronas.map((c) => {
                        const n = c.item;
                        const clave = `n:${n.id}`;
                        const s = { tipo: "neurona", id: n.id } as const;
                        const on = activo(clave, s);
                        return (
                            <g key={clave} {...nodo(clave, s, `Neurona ${n.nombre}${n.esEsta ? " (esta)" : ""}${n.online ? ", en línea" : ", sin conexión"}`)}>
                                <title>{`${n.nombre}${n.esEsta ? " · esta neurona" : ""} · ${n.procesadores.length} procesadores · ${n.almacenes.length} almacenes`}</title>
                                <polygon
                                    className="ria-nodo"
                                    points={hexagono(c.x, c.y, HEX_R + (on ? 3 : 0))}
                                    fill="url(#ria-silicio)"
                                    stroke={n.esEsta ? TRINITY.zenith : n.online ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)"}
                                    strokeWidth={on ? 2.6 : n.esEsta ? 1.8 : 1.2}
                                    opacity={n.online ? 1 : 0.55}
                                />
                                {on && <polygon points={hexagono(c.x, c.y, HEX_R + 8)} fill="none" stroke={TRINITY.zenith} strokeOpacity={0.55} strokeWidth={1.2} />}
                                <text x={c.x} y={c.y - 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="rgba(255,255,255,0.92)">
                                    {corto(n.nombre, 12)}
                                </text>
                                <text x={c.x} y={c.y + 13} textAnchor="middle" fontSize="9.5" fill={n.esEsta ? "#7fb8ff" : n.online ? "rgba(167,243,208,0.9)" : "rgba(255,255,255,0.45)"}>
                                    {n.esEsta ? "esta neurona" : n.online ? "en línea" : "sin conexión"}
                                </text>
                            </g>
                        );
                    })}

                    {/* Procesadores en el anillo interior */}
                    {geo.procesadores.map((c) => {
                        const p = c.item;
                        const clave = `p:${p.id}`;
                        const s = { tipo: "procesador", id: p.id } as const;
                        const on = activo(clave, s);
                        const neurona = geo.neuronas.find((x) => x.item.id === p.neuronaId);
                        return (
                            <g key={clave} {...nodo(clave, s, `Procesador ${p.nombre}${typeof p.ramGb === "number" ? `, ${fmtGb(p.ramGb)} de RAM` : ""}`)}>
                                <title>{`${NOMBRE_TIPO_PROCESADOR[p.tipo]} · ${p.nombre}${typeof p.ramGb === "number" ? ` · ${fmtGb(p.ramGb)} RAM` : ""}`}</title>
                                {neurona && <line x1={neurona.x} y1={neurona.y} x2={c.x} y2={c.y} stroke="rgba(255,255,255,0.14)" aria-hidden="true" />}
                                <circle
                                    className="ria-nodo"
                                    cx={c.x}
                                    cy={c.y}
                                    r={PROC_R + (on ? 2 : 0)}
                                    fill="rgba(0,10,30,0.9)"
                                    stroke={p.tipo === "cpu" ? TRINITY.zenith : p.tipo === "gpu" ? TRINITY.horizon : TRINITY.logic}
                                    strokeWidth={on ? 2.4 : 1.4}
                                    opacity={p.disponible ? 1 : 0.45}
                                />
                                <text x={c.x} y={c.y + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="rgba(255,255,255,0.9)" aria-hidden="true">
                                    {LETRA_PROCESADOR[p.tipo]}
                                </text>
                            </g>
                        );
                    })}

                    {/* Almacenes satélite con arco de llenado */}
                    {geo.almacenes.map((c) => {
                        const a = c.item;
                        const clave = `a:${a.id}`;
                        const s = { tipo: "almacen", id: a.id } as const;
                        const on = activo(clave, s);
                        const neurona = geo.neuronas.find((x) => x.item.id === a.neuronaId);
                        const lx = Math.cos(rad(c.angulo));
                        const ly = Math.sin(rad(c.angulo));
                        return (
                            <g key={clave} {...nodo(clave, s, `Almacén ${a.etiqueta}, ${fmtLibre(a)}`)}>
                                <title>{`${NOMBRE_TIPO_ALMACEN[a.tipo]} · ${a.etiqueta} · ${fmtLibre(a)}`}</title>
                                {neurona && <line x1={neurona.x} y1={neurona.y} x2={c.x} y2={c.y} stroke="rgba(255,255,255,0.1)" aria-hidden="true" />}
                                <ArcoLlenado x={c.x} y={c.y} a={a} on={on} />
                                <text
                                    x={c.x + lx * 26}
                                    y={c.y + ly * 26 + 3}
                                    textAnchor={Math.abs(lx) < 0.3 ? "middle" : lx > 0 ? "start" : "end"}
                                    fontSize="10"
                                    fill="rgba(255,255,255,0.72)"
                                    aria-hidden="true"
                                >
                                    {typeof a.libreGb === "number" ? fmtGb(a.libreGb) : "?"}
                                </text>
                            </g>
                        );
                    })}

                    {/* Anillo exterior: cuenta, cerebros, servidores y comunes */}
                    {geo.sueltos.map((c) => {
                        const esAlm = c.item.tipo === "almacen";
                        const id = esAlm ? (c.item as { a: MedioAlmacen }).a.id : (c.item as { p: Procesador }).p.id;
                        const etiqueta = esAlm ? (c.item as { a: MedioAlmacen }).a.etiqueta : (c.item as { p: Procesador }).p.nombre;
                        const clave = `${esAlm ? "a" : "p"}:${id}`;
                        const s = { tipo: esAlm ? "almacen" : "procesador", id } as NonNullable<Seleccion>;
                        const on = activo(clave, s);
                        const debajo = c.y >= 0;
                        return (
                            <g key={`s-${clave}`} {...nodo(clave, s, `${esAlm ? "Almacén" : "Servidor"} ${etiqueta}`)}>
                                <title>{etiqueta}</title>
                                {esAlm ? (
                                    <>
                                        <rect
                                            className="ria-nodo"
                                            x={c.x - SUELTO_R}
                                            y={c.y - SUELTO_R}
                                            width={SUELTO_R * 2}
                                            height={SUELTO_R * 2}
                                            rx={6}
                                            fill="rgba(0,10,30,0.85)"
                                            stroke={on ? TRINITY.zenith : "rgba(255,255,255,0.4)"}
                                            strokeWidth={on ? 2.2 : 1.2}
                                        />
                                        <ArcoLlenado x={c.x} y={c.y} a={(c.item as { a: MedioAlmacen }).a} on={false} soloArco radio={SUELTO_R + 4} />
                                    </>
                                ) : (
                                    <polygon
                                        className="ria-nodo"
                                        points={`${c.x},${c.y - SUELTO_R - 2} ${c.x + SUELTO_R + 2},${c.y} ${c.x},${c.y + SUELTO_R + 2} ${c.x - SUELTO_R - 2},${c.y}`}
                                        fill="rgba(0,10,30,0.85)"
                                        stroke={on ? TRINITY.logic : TRINITY.logicSuave}
                                        strokeWidth={on ? 2.2 : 1.3}
                                    />
                                )}
                                <text x={c.x} y={c.y + (debajo ? SUELTO_R + 16 : -SUELTO_R - 8)} textAnchor="middle" fontSize="10.5" fill="rgba(255,255,255,0.8)" aria-hidden="true">
                                    {corto(etiqueta, 16)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <Leyenda hayFlujos={flujos.length > 0} />

            {/* Detalle del nodo elegido */}
            {sel && <DetalleNodo inv={inv} sel={sel} alCerrar={() => setSel(null)} />}

            {/* Lista apilada (pantallas chicas) */}
            <ListaApilada inv={inv} />
        </div>
    );
}

function ArcoLlenado({ x, y, a, on, soloArco, radio = PISTA_R }: { x: number; y: number; a: MedioAlmacen; on: boolean; soloArco?: boolean; radio?: number }) {
    const ocupada = fraccionOcupada(a);
    const c = 2 * Math.PI * radio;
    return (
        <g>
            {!soloArco && (
                <circle cx={x} cy={y} r={ALM_R + (on ? 2 : 0)} fill="rgba(0,10,30,0.9)" stroke={on ? TRINITY.zenith : "rgba(255,255,255,0.45)"} strokeWidth={on ? 2.2 : 1} className="ria-nodo" />
            )}
            <circle cx={x} cy={y} r={radio} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} strokeDasharray={ocupada === null ? "2 3" : undefined} />
            {ocupada !== null && (
                <circle
                    cx={x}
                    cy={y}
                    r={radio}
                    fill="none"
                    stroke={colorLlenado(a)}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={`${(ocupada * c).toFixed(1)} ${c.toFixed(1)}`}
                    transform={`rotate(-90 ${x} ${y})`}
                    data-ocupado={ocupada.toFixed(2)}
                />
            )}
        </g>
    );
}

function Leyenda({ hayFlujos }: { hayFlujos: boolean }) {
    const vias: Via[] = ["malla-local", "red-starseed", "antena", "internet"];
    return (
        <ul className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-white/60 md:flex" aria-label="Leyenda de la constelación">
            {vias.map((v) => {
                const t = TRAZO_VIA[v];
                return (
                    <li key={v} className="flex items-center gap-1.5">
                        <svg width="26" height="6" aria-hidden="true">
                            <line x1="1" y1="3" x2="25" y2="3" stroke={t.color} strokeWidth={t.ancho + 0.4} strokeDasharray={t.guiones} strokeLinecap="round" />
                        </svg>
                        {nombreVia(v)}
                    </li>
                );
            })}
            {hayFlujos && (
                <>
                    <li className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-6 rounded bg-[#39FF14]" aria-hidden="true" /> pesos → procesador
                    </li>
                    <li className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-6 rounded bg-[#007FFF]" aria-hidden="true" /> procesador → neuronas
                    </li>
                </>
            )}
            <li className="flex items-center gap-1.5">
                <span className="font-code text-white/75">C · G · N · W · S</span> CPU, GPU, NPU, WebGPU, servidor
            </li>
        </ul>
    );
}

function Dato({ k, v }: { k: string; v?: string | number | null }) {
    if (v === undefined || v === null || v === "") return null;
    return (
        <div className="min-w-0">
            <dt className={LABEL}>{k}</dt>
            <dd className="truncate text-[11px] text-white/85" title={String(v)}>
                {v}
            </dd>
        </div>
    );
}

function DetalleNodo({ inv, sel, alCerrar }: { inv: InventarioRecursos; sel: NonNullable<Seleccion>; alCerrar: () => void }) {
    const neurona = sel.tipo === "neurona" ? inv.neuronas.find((n) => n.id === sel.id) : undefined;
    const proc = sel.tipo === "procesador" ? [...inv.neuronas.flatMap((n) => n.procesadores), ...inv.procesadoresSueltos].find((p) => p.id === sel.id) : undefined;
    const alm = sel.tipo === "almacen" ? [...inv.neuronas.flatMap((n) => n.almacenes), ...inv.almacenesSueltos].find((a) => a.id === sel.id) : undefined;
    const titulo = neurona?.nombre ?? proc?.nombre ?? alm?.etiqueta ?? "";
    // Cuantización según el dispositivo (transformers docs @ 50e35cc): los métodos que admite este
    // procesador, de mejor soporte a parcial. Sin dispositivo (navegador, NPU) no hay sugerencia.
    const dispositivo = proc ? dispositivoDeProcesador(proc) : undefined;
    const cuantiza = dispositivo
        ? cuantizacionesPara(dispositivo)
              .slice(0, 2)
              .map((x) => `${x.nombre} en ${x.bitsMin}–${x.bitsMax} bits${x.soporte[dispositivo] === "parcial" ? " (parcial)" : ""}`)
              .join(" · ") || undefined
        : undefined;
    return (
        <section aria-live="polite" aria-label={`Detalle de ${titulo}`} className={cn(SUB, "hidden p-3 md:block")}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-white/90">
                    <Hexagon className="h-3.5 w-3.5 shrink-0 text-[#007FFF]" aria-hidden="true" />
                    <Linea>{titulo}</Linea>
                </p>
                <button type="button" onClick={alCerrar} className={cn("cursor-pointer rounded-md px-2 py-1 text-[10px] text-white/60 transition-colors duration-200 hover:text-white", FOCO)}>
                    Cerrar detalle
                </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
                {neurona && (
                    <>
                        <Dato k="Estado" v={neurona.online ? "en línea" : "sin conexión"} />
                        <Dato k="Tipo" v={neurona.tipo} />
                        <Dato k="Vías" v={neurona.vias.map(nombreVia).join(" · ")} />
                        <Dato k="Procesadores" v={neurona.procesadores.map((p) => p.nombre).join(" · ") || "ninguno detectado"} />
                        <Dato k="Almacenes" v={neurona.almacenes.map((a) => a.etiqueta).join(" · ") || "ninguno detectado"} />
                        <Dato
                            k="Libre en total"
                            v={fmtGb(neurona.almacenes.reduce((s, a) => s + (typeof a.libreGb === "number" ? a.libreGb : 0), 0))}
                        />
                    </>
                )}
                {proc && (
                    <>
                        <Dato k="Tipo" v={NOMBRE_TIPO_PROCESADOR[proc.tipo]} />
                        <Dato k="Sistema" v={[proc.so, proc.arquitectura].filter(Boolean).join(" · ")} />
                        <Dato k="RAM" v={typeof proc.ramGb === "number" ? `${fmtGb(proc.ramGb)}${typeof proc.ramLibreGb === "number" ? ` (${fmtGb(proc.ramLibreGb)} libres)` : ""}${proc.memoriaUnificada ? " · unificada" : ""}` : undefined} />
                        <Dato k="VRAM" v={typeof proc.vramGb === "number" ? fmtGb(proc.vramGb) : undefined} />
                        <Dato k="Núcleos" v={proc.nucleos} />
                        <Dato k="Aceleradores" v={proc.aceleradores.map((a) => NOMBRE_ACELERADOR[a] ?? a).join(" · ") || "ninguno"} />
                        <Dato k="Runtimes" v={proc.runtimes.join(" · ") || "ninguno"} />
                        <Dato k="Herramientas" v={proc.herramientas?.join(" · ") || "ninguna"} />
                        <Dato k="Cuantización sugerida" v={cuantiza} />
                        <Dato k="Vía" v={nombreVia(proc.via)} />
                        <Dato k="Prestable" v={proc.prestable ? "sí" : "no"} />
                    </>
                )}
                {alm && (
                    <>
                        <Dato k="Tipo" v={NOMBRE_TIPO_ALMACEN[alm.tipo]} />
                        <Dato k="Espacio" v={fmtLibre(alm)} />
                        <Dato k="Ruta" v={alm.ruta} />
                        <Dato k="Lectura" v={typeof alm.lecturaMBs === "number" ? `${alm.lecturaMBs} MB/s` : undefined} />
                        <Dato k="Disco" v={[alm.tipoDisco, alm.conexion].filter(Boolean).join(" · ")} />
                        <Dato k="Vía" v={nombreVia(alm.via)} />
                        <Dato k="Privacidad" v={alm.privado ? "privado (no sale de la cuenta)" : "compartido"} />
                        <Dato k="Disponible" v={alm.disponible ? "sí" : "no ahora"} />
                    </>
                )}
            </dl>
            {(proc || alm) && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/50">
                    Fuente: <FuenteBadge fuente={(proc ?? alm)!.fuente} />
                    {(proc ?? alm)!.fuente === "estimado" && "no se pudo medir: es una estimación"}
                </p>
            )}
        </section>
    );
}

function FilaAlmacen({ a }: { a: MedioAlmacen }) {
    const Icono = ICONO_ALMACEN[a.tipo];
    const ocupada = fraccionOcupada(a);
    return (
        <li className="flex flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
                <Icono className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
                <Linea className="flex-1 text-[11px] text-white/85">{a.etiqueta}</Linea>
                <FuenteBadge fuente={a.fuente} />
            </div>
            <p className="text-[10px] text-white/55">
                {NOMBRE_TIPO_ALMACEN[a.tipo]} · {fmtLibre(a)} · {nombreVia(a.via)}
            </p>
            {ocupada !== null && <Bar value={ocupada * 100} tone={tonoBarra(a)} />}
        </li>
    );
}

function FilaProcesador({ p }: { p: Procesador }) {
    const Icono = ICONO_PROCESADOR[p.tipo];
    return (
        <li className="flex flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
                <Icono className="h-3.5 w-3.5 shrink-0 text-[#7fb8ff]" aria-hidden="true" />
                <Linea className="flex-1 text-[11px] text-white/85">{p.nombre}</Linea>
                <FuenteBadge fuente={p.fuente} />
            </div>
            <p className="text-[10px] text-white/55">
                {[NOMBRE_TIPO_PROCESADOR[p.tipo], typeof p.ramGb === "number" ? `${fmtGb(p.ramGb)} RAM` : null, p.aceleradores.map((a) => NOMBRE_ACELERADOR[a] ?? a).join(", ") || null]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
        </li>
    );
}

function ListaApilada({ inv }: { inv: InventarioRecursos }) {
    return (
        <div className="flex flex-col gap-2 md:hidden" data-testid="constelacion-lista">
            {inv.neuronas.map((n) => (
                <section key={n.id} className={cn(SUB, "p-3")} aria-label={`Neurona ${n.nombre}`}>
                    <p className="mb-2 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-white/90">
                        <Hexagon className={cn("h-3.5 w-3.5 shrink-0", n.esEsta ? "text-[#007FFF]" : "text-white/55")} aria-hidden="true" />
                        <Linea className="flex-1">{n.nombre}</Linea>
                        <span className="shrink-0 text-[10px] font-normal text-white/55">{n.esEsta ? "esta neurona" : n.online ? "en línea" : "sin conexión"}</span>
                    </p>
                    {n.procesadores.length > 0 && <ul className="mb-2 flex flex-col gap-1.5">{n.procesadores.map((p) => <FilaProcesador key={p.id} p={p} />)}</ul>}
                    {n.almacenes.length > 0 && <ul className="flex flex-col gap-2">{n.almacenes.map((a) => <FilaAlmacen key={a.id} a={a} />)}</ul>}
                    {!n.esEsta && <p className="mt-2 text-[10px] text-white/45">Se llega por {n.vias.filter((v) => v !== "local").map(nombreVia).join(", ") || "internet"}.</p>}
                </section>
            ))}
            {(inv.almacenesSueltos.length > 0 || inv.procesadoresSueltos.length > 0) && (
                <section className={cn(SUB, "p-3")} aria-label="Cuenta, cerebros y servidores">
                    <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-white/90">
                        <Orbit className="h-3.5 w-3.5 text-[#FFBF00]" aria-hidden="true" /> Cuenta, cerebros y servidores
                    </p>
                    <ul className="flex flex-col gap-2">
                        {inv.almacenesSueltos.map((a) => (
                            <FilaAlmacen key={a.id} a={a} />
                        ))}
                        {inv.procesadoresSueltos.map((p) => (
                            <FilaProcesador key={p.id} p={p} />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
