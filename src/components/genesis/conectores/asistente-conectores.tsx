"use client";

/** GENESIS · Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §2–§3).
 *  Tres pasos: 1) lo local del contexto (neuronas, servidores del cerebro, capa de Astraura) con interruptores;
 *  2) lo gratis por vincular, con el enlace oficial y la clave (va UNA vez a la API y se borra del campo);
 *  3) resumen por papel con la cadena elegida y su motivo. Red y bóveda inyectables; el VALOR de una clave no se
 *  registra, muestra ni devuelve jamás: solo nombres de variables de entorno. */

import { createElement, useState } from "react";
import { Brain, Cpu, KeyRound, ListChecks, Loader2, Plug, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";

export type AmbitoTipo = "cuenta" | "grupo" | "pagina";

/** Candidato LOCAL del contexto: neurona, servidor del cerebro o capa de Astraura que cabe. */
export interface LocalDelContexto { id: string; nombre: string; clase: "neurona" | "cerebro" | "astraura"; papeles: Papel[]; detalle: string; encendido: boolean; }
/** Cuerpo para la API de la bóveda: el valor viaja una vez y nunca se registra ni se muestra. */
export interface VinculoClave { ambitoTipo: AmbitoTipo; ambitoNombre: string; opcionId: string; variable: string | null; clave: string; }
/** Cadena elegida para un papel, con su porqué (paso 3). */
export interface ResumenPapel { papel: Papel; elegido: string | null; motivo: string; }

export interface PropsAsistenteConectar { ambitoTipo: AmbitoTipo; ambitoNombre: string; papeles: readonly Papel[]; locales: readonly LocalDelContexto[]; gratis: readonly Sugerencia[]; alEncenderLocal?(id: string, encendido: boolean): void; enviarClave?(cuerpo: VinculoClave): Promise<boolean>; }

/** Puro: gana lo local encendido; después lo gratis sugerido; sin nada, «sin opción». */
export function resumenPorPapel(papeles: readonly Papel[], locales: readonly LocalDelContexto[], encendidos: ReadonlySet<string>, gratis: readonly Sugerencia[]): ResumenPapel[] {
    return papeles.map((papel) => {
        const local = locales.find((l) => encendidos.has(l.id) && l.papeles.includes(papel));
        if (local) return { papel, elegido: local.nombre, motivo: `Local (${local.clase}): ${local.detalle}` };
        const sugerida = gratis.find((g) => g.papeles.includes(papel));
        if (sugerida) return { papel, elegido: sugerida.nombre, motivo: sugerida.motivo };
        return { papel, elegido: null, motivo: "Sin opción todavía: activa lo local o vincula una clave gratis." };
    });
}

/** Envío por defecto a la API de la bóveda del ámbito. Nunca almacena, muestra ni registra el valor. */
export async function enviarVinculoPorDefecto(cuerpo: VinculoClave): Promise<boolean> {
    try {
        return (await fetch("/api/genesis/conectores/claves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })).ok;
    } catch {
        return false;
    }
}

const ICONO_LOCAL = { neurona: Radar, cerebro: Brain, astraura: Cpu } as const;
const BTN_PILA = "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors duration-200";
const PILA = (si: boolean) => (si ? "border-emerald-300/60 bg-emerald-500/15 text-white" : "border-white/15 text-white/65 hover:border-white/30");

export function AsistenteConectores({ ambitoTipo, ambitoNombre, papeles, locales, gratis, alEncenderLocal, enviarClave = enviarVinculoPorDefecto }: PropsAsistenteConectar) {
    const [paso, setPaso] = useState<1 | 2 | 3>(1); const [encendidos, setEncendidos] = useState<ReadonlySet<string>>(() => new Set(locales.filter((l) => l.encendido).map((l) => l.id)));
    const [vinculadas, setVinculadas] = useState<ReadonlySet<string>>(() => new Set()); const [claves, setClaves] = useState<Record<string, string>>({});
    const [enviando, setEnviando] = useState<string | null>(null); const [aviso, setAviso] = useState<string | null>(null);
    const alternar = (id: string) => {
        const encendido = !encendidos.has(id);
        setEncendidos((s) => { const n = new Set(s); if (encendido) n.add(id); else n.delete(id); return n; });
        alEncenderLocal?.(id, encendido);
    };

    /** La clave viaja UNA vez a la bóveda; el campo se borra cuando el almacén confirma; el fallo nunca registra el valor. */
    const guardar = async (id: string) => {
        const valor = (claves[id] ?? "").trim();
        if (!valor) { setAviso("Pega la clave en el campo antes de enviarla."); return; }
        setEnviando(id);
        const ok = await enviarClave({ ambitoTipo, ambitoNombre, opcionId: id, variable: gratis.find((g) => g.id === id)?.variables[0] ?? null, clave: valor });
        setEnviando(null);
        if (!ok) { setAviso("No se pudo guardar la clave en la bóveda del ámbito. Inténtalo otra vez."); return; }
        setAviso(null); setClaves((c) => { const n = { ...c }; delete n[id]; return n; }); setVinculadas((s) => new Set(s).add(id));
    };

    return (
        <section className="space-y-4" data-testid="asistente-conectores">
            <nav className="flex flex-wrap items-center gap-2" aria-label="Pasos del asistente">
                {([[1, "Local", Plug], [2, "Gratis por vincular", KeyRound], [3, "Resumen", ListChecks]] as const).map(
                    ([n, nombre, Icono]) => (
                        <button key={n} type="button" data-testid={`asistente-paso-${n}`} aria-current={paso === n} onClick={() => setPaso(n)} className={cn(BTN_PILA, PILA(paso === n))}>
                            <Icono className="mr-1 inline h-3.5 w-3.5" aria-hidden /> {nombre}
                        </button>
                    ))}
            </nav>
            {aviso ? <p data-testid="asistente-aviso" role="alert" className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-2 text-xs text-amber-100">{aviso}</p> : null}
            {paso === 1 ? (
                <ul className="space-y-2">
                    {locales.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            {createElement(ICONO_LOCAL[l.clase], { className: "h-4 w-4 text-emerald-300", "aria-hidden": true })}
                            <p className="min-w-0 flex-1 truncate text-sm">{l.nombre} <span className="text-xs text-muted-foreground">· {l.detalle}</span></p>
                            <button type="button" role="switch" aria-checked={encendidos.has(l.id)} data-testid={`asistente-local-${l.id}`} onClick={() => alternar(l.id)} className={cn(BTN_PILA, PILA(encendidos.has(l.id)))}>{encendidos.has(l.id) ? "Encendido" : "Apagado"}</button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {paso === 2 ? (
                <ul className="space-y-2">
                    {gratis.map((s) => (
                        <li key={s.id} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="min-w-0 truncate text-sm">{s.nombre} <span className="text-xs text-muted-foreground">· {s.limite ? `Gratis: ${s.limite.nota}` : "Límite sin verificar"}</span></p>
                            <div className="flex items-center gap-2">
                                <input data-testid={`asistente-clave-${s.id}`} type="password" autoComplete="off" value={claves[s.id] ?? ""} onChange={(e) => setClaves((c) => ({ ...c, [s.id]: e.target.value }))} placeholder={`Pega tu clave ${s.variables[0] ?? ""}`.trim()} className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs" />
                                <a href={s.enlaceClave ?? s.enlaceAlta ?? "#"} target="_blank" rel="noopener noreferrer" data-testid={`asistente-vincular-${s.id}`} className={cn(BTN_PILA, "bg-white/5 text-white")}>Vincular</a>
                                <button type="button" data-testid={`asistente-guardar-${s.id}`} disabled={enviando === s.id} onClick={() => void guardar(s.id)} className={cn(BTN_PILA, PILA(true), "disabled:opacity-50")}>
                                    {enviando === s.id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-label="Enviando" /> : vinculadas.has(s.id) ? "Guardada" : "Guardar en la bóveda"}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
            {paso === 3 ? (
                <ul className="space-y-2">
                    {resumenPorPapel(papeles, locales, encendidos, gratis).map((r) => (
                        <li key={r.papel} data-testid={`asistente-resumen-${r.papel}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-sm">{r.papel}: {r.elegido ?? "sin opción"}</p>
                            <p className="text-xs text-muted-foreground">{r.motivo}</p>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
