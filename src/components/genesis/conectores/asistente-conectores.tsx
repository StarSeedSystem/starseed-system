"use client";

/*
 * Asistente «Conectar Genesis» (Ola 1019G · architecture/genesis-conectores-abiertos.md).
 * Tres pasos: lo local del contexto (neuronas, servidores del cerebro, capa de Astraura que cabe)
 * con interruptores; lo gratis sugerido con «Vincular» a los enlaces oficiales en pestaña nueva y
 * campo de clave que se envía a la API y se borra (solo huella, nunca el valor); resumen por papel.
 */

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

export type TipoLocal = "neurona" | "cerebro" | "astraura";
export interface OpcionLocal { id: string; nombre: string; tipo: TipoLocal; detalle: string; }
export interface OpcionGratuita { id: string; nombre: string; enlaceAlta: string; enlaceClave: string; variableClave: string; limite: string | null; limitesVerificados?: boolean | null; }
export interface Papel { id: string; nombre: string; }
export interface Eslabon { nombre: string; motivo: string; }

export const PAPELES_DEFECTO: Papel[] = [
    { id: "escritor", nombre: "Escritor" }, { id: "revisor", nombre: "Revisor" }, { id: "chat", nombre: "Chat" }, { id: "vision", nombre: "Visión" },
];

/** Huella de una clave: los extremos recortados, nunca el valor completo. */
export function huellaDeClave(clave: string): string {
    const c = clave.trim();
    return c.length <= 8 ? "•".repeat(c.length || 1) : `${c.slice(0, 4)}…${c.slice(-4)}`;
}

/** Cadena por papel: locales activas primero, luego lo gratis vinculado; describe el motivo. */
export function cadenaPapel(papel: Papel, locales: OpcionLocal[], vinculadas: OpcionGratuita[]): Eslabon[] {
    const eslabones: Eslabon[] = [];
    for (const l of locales) eslabones.push({ nombre: l.nombre, motivo: `local primero (${l.tipo}): ${l.detalle}` });
    for (const g of vinculadas) eslabones.push({ nombre: g.nombre, motivo: "gratis vinculada: se usa cuando la local no puede" });
    if (eslabones.length === 0) eslabones.push({ nombre: `${papel.nombre}: sin medios`, motivo: "enciende un medio local o vincula una opción gratis" });
    return eslabones;
}

export interface PropsAsistente {
    locales: OpcionLocal[]; gratuitas: OpcionGratuita[]; papeles?: Papel[]; ambito?: string;
    /** Envía la clave a la bóveda del ámbito; devuelve huella o error, nunca la clave. */
    enviarClave: (idOpcion: string, clave: string) => Promise<{ ok: boolean; huella?: string; error?: string }>;
    /** Abre un enlace oficial en pestaña nueva; inyectable para las pruebas. */
    abrir?: (url: string) => void;
}

const GRUPOS: Array<[TipoLocal, string]> = [["neurona", "Neuronas de la cuenta"], ["cerebro", "Servidores del cerebro"], ["astraura", "Capa de Astraura que cabe"]];

export function AsistenteConectores({ locales, gratuitas, papeles = PAPELES_DEFECTO, ambito = "cuenta", enviarClave, abrir }: PropsAsistente) {
    const abrirEnlace = abrir ?? ((url: string) => { window.open(url, "_blank", "noopener"); });
    const [paso, setPaso] = useState(0);
    const [activas, setActivas] = useState<string[]>([]);
    const [huellas, setHuellas] = useState<Record<string, string>>({});
    const [borrador, setBorrador] = useState<Record<string, string>>({});
    const [aviso, setAviso] = useState<string | null>(null);
    const alternar = (id: string) => setActivas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
    const localesOn = locales.filter((o) => activas.includes(o.id));
    const vinculadas = gratuitas.filter((g) => Boolean(huellas[g.id]));
    const guardar = async (g: OpcionGratuita) => {
        const clave = (borrador[g.id] || "").trim(); if (!clave) return;
        const r = await enviarClave(g.id, clave).catch(() => ({ ok: false as const, huella: undefined as string | undefined, error: "no se pudo contactar la API" }));
        setAviso(r.ok ? `Clave de ${g.nombre} guardada en la bóveda del ámbito (variable ${g.variableClave}).` : `No se pudo guardar la clave de ${g.nombre} (${r.error || "error de la API"}).`);
        setHuellas((h) => (r.ok ? { ...h, [g.id]: r.huella || huellaDeClave(clave) } : h));
        setBorrador((b) => ({ ...b, [g.id]: "" })); // la clave se borra del campo SIEMPRE, caiga o no
    };
    const pasada = "cursor-pointer rounded-full px-3 py-1 text-xs transition";
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <p className="text-sm font-semibold text-white/90">Conectar Genesis</p>
            <p className="mt-0.5 text-xs text-white/50">Local más potente primero, gratis después y resumen por papel. Ámbito: {ambito}.</p>
            <nav className="mt-3 flex gap-2" aria-label="Pasos del asistente">
                {["Local", "Gratis", "Papeles"].map((nombre, i) => (
                    <button key={nombre} type="button" onClick={() => setPaso(i)} aria-current={paso === i} className={`${pasada} ${paso === i ? "bg-[#007FFF]/20 text-[#007FFF]" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>{nombre}</button>
                ))}
            </nav>
            {paso === 0 && (
                <div className="mt-3 space-y-2">
                    {GRUPOS.map(([tipo, titulo]) => (locales.some((o) => o.tipo === tipo) ? (
                        <div key={tipo}>
                            <p className="text-xs uppercase tracking-wider text-white/60">{titulo}</p>
                            <div className="mt-1 flex flex-wrap gap-2">{locales.filter((o) => o.tipo === tipo).map((o) => (
                                <button key={o.id} type="button" role="switch" aria-checked={activas.includes(o.id)} onClick={() => alternar(o.id)}
                                    className={`${pasada} border px-3 ${activas.includes(o.id) ? "border-[#39FF14]/60 bg-[#39FF14]/10 text-[#39FF14]" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"}`}>{o.nombre} · {o.detalle}</button>
                            ))}</div>
                        </div>
                    ) : null))}
                </div>
            )}
            {paso === 1 && (
                <div className="mt-3 space-y-3">
                    {gratuitas.map((g) => (
                        <div key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                            <p className="text-sm text-white/90">{g.nombre} <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">gratis</span> <span className="text-xs text-white/50">· Límite: {g.limite ?? "null → sin verificar"}{g.limite !== null && g.limitesVerificados === false ? " (sin verificar)" : ""}</span></p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => abrirEnlace(g.enlaceAlta)} className={`${pasada} bg-[#007FFF]/20 text-[#007FFF] hover:bg-[#007FFF]/30`}>Vincular <ArrowUpRight className="inline h-3 w-3" aria-hidden /></button>
                                <button type="button" onClick={() => abrirEnlace(g.enlaceClave)} className={`${pasada} bg-white/5 text-white/70 hover:bg-white/10`}>Página de la clave <ArrowUpRight className="inline h-3 w-3" aria-hidden /></button>
                                <input type="password" aria-label={`Clave de ${g.nombre}`} placeholder={g.variableClave} value={borrador[g.id] || ""} onChange={(e) => setBorrador((b) => ({ ...b, [g.id]: e.target.value }))}
                                    className="w-48 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/90 outline-none focus:border-[#007FFF]/60" />
                                <button type="button" disabled={!borrador[g.id]?.trim()} onClick={() => void guardar(g)} className={`${pasada} bg-white/10 text-white/90 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40`}>Guardar clave</button>
                                {huellas[g.id] && <span className="rounded-full bg-[#39FF14]/10 px-2 py-0.5 text-xs text-[#39FF14]" title={g.variableClave}>Clave vinculada · {huellas[g.id]}</span>}
                            </div>
                        </div>
                    ))}
                    {aviso && <p className="text-xs text-white/70" role="status">{aviso}</p>}
                </div>
            )}
            {paso === 2 && (
                <div className="mt-3 space-y-3">
                    {papeles.map((p) => {
                        const es = cadenaPapel(p, localesOn, vinculadas);
                        return (
                            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{p.nombre}</p>
                                <div className="mt-1 flex flex-wrap gap-2">{es.map((e, i) => <span key={i} title={e.motivo} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/85">{e.nombre}</span>)}</div>
                                <p className="mt-1 text-xs text-white/50">{es.map((e) => e.motivo).join(" → ")}</p>
                            </div>
                        );
                    })}                </div>
            )}
        </div>
    );
}