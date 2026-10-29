"use client";

/**
 * Panel de asignaciones por papel y director (Ola 1019G · GCA1019N).
 * Cadena ordenable, peldaño y motivo; en PoliGenesis democrático, guardar propone.
 */
import { useState } from "react";
import { GripVertical, Plus, RotateCcw, Trash2, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";

export type Peldano = 1 | 2 | 3 | 4 | 5 | 6;
export type ModoGobierno = "jerarquico" | "democratico";
export interface DetallePeldano { peldano: Peldano; etiqueta: string; motivo: string }
export interface FilaAsignaciones { clave: string; titulo: string; cadena: string[]; sugeridas: string[] }
export interface CambioAsignacion { accion: "aplicar" | "proponer"; clave: string; cadena: string[]; motivo: string }
export const ETIQUETA_PELDANO: Record<Peldano, string> = { 1: "local", 2: "local", 3: "malla", 4: "contenedor", 5: "gratis", 6: "pago" };
/** Manda el candidato medido; si no lo hay, el peldaño se deriva del catálogo. */
export function detallePeldano(opcion?: OpcionCatalogo, candidato?: { peldano: Peldano; motivo: string }): DetallePeldano {
    const peldano = candidato?.peldano ?? (!opcion ? 6 : opcion.tipo === "contenedor" ? 4 : opcion.privacidad === "local" ? 1 : opcion.gratis !== null ? 5 : 6);
    const motivos: Record<Peldano, string> = { 1: "Local: no sale de la cuenta ni de su cerebro.", 2: "Otro modelo local del contexto.", 3: "En la bolsa de la malla, nunca para lo privado.", 4: "Contenedor: corre los procesos de los agentes.", 5: "Gratis, límite sin verificar.", 6: "De pago: solo con el permiso y el tope del ámbito." };
    const motivo = candidato?.motivo ?? (peldano === 5 && opcion?.gratis?.nota ? `Gratis: ${opcion.gratis.nota}.` : motivos[peldano]);
    return { peldano, etiqueta: ETIQUETA_PELDANO[peldano], motivo };
}

/** Mueve un eslabón dentro de la cadena (arrastrar para ordenar). PURA. */
export function moverEnCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
    const copia = [...cadena];
    if (desde < 0 || hasta < 0 || desde >= copia.length || hasta >= copia.length || desde === hasta) return copia;
    const [movido] = copia.splice(desde, 1);
    copia.splice(hasta, 0, movido);
    return copia;
}

/** Añade al final sin duplicar ni aceptar ids vacíos. PURA. */
export const agregarACadena = (cadena: readonly string[], id: string): string[] => {
    const limpio = id.trim();
    return !limpio || cadena.includes(limpio) ? [...cadena] : [...cadena, limpio];
};

/** Quita un eslabón. PURA. */
export const quitarDeCadena = (cadena: readonly string[], id: string): string[] => cadena.filter((c) => c !== id);

/** Restaura la cadena sugerida sin mutar la original. PURA. */
export const restaurarSugeridas = (sugeridas: readonly string[]): string[] => [...new Set(sugeridas.map((id) => id.trim()).filter(Boolean))];

/** Decide qué hace «Guardar»: en PoliGenesis democrático se propone a votación. PURA. */
export function decidirGuardado(modo: ModoGobierno, clave: string, cadena: readonly string[]): CambioAsignacion {
    const democratico = modo === "democratico";
    const motivo = democratico ? "En PoliGenesis democrático se propone a votación en vez de aplicarse." : "Se guarda ahora en el ámbito.";
    return { accion: democratico ? "proponer" : "aplicar", clave, cadena: [...cadena], motivo };
}

export function AsignacionesPanel({ filas, catalogo, peldanos = {}, modoGobierno = "jerarquico", onGuardar }: {
    filas: readonly FilaAsignaciones[]; catalogo: readonly OpcionCatalogo[];
    peldanos?: Readonly<Record<string, { peldano: Peldano; motivo: string }>>;
    modoGobierno?: ModoGobierno; onGuardar?: (cambio: CambioAsignacion) => void | Promise<void>;
}) {
    const [cadenas, setCadenas] = useState<Record<string, string[]>>(() => Object.fromEntries(filas.map((f) => [f.clave, [...f.cadena]])));
    const [elegido, setElegido] = useState<Record<string, string>>({});
    const [arrastre, setArrastre] = useState<{ clave: string; indice: number } | null>(null);
    const [guardando, setGuardando] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const porId = new Map(catalogo.map((o) => [o.id, o]));
    const democratico = modoGobierno === "democratico";
    const cambiar = (clave: string, cadena: string[]) => setCadenas((prev) => ({ ...prev, [clave]: cadena }));
    const guardar = async (clave: string, cadena: string[]) => {
        const cambio = decidirGuardado(modoGobierno, clave, cadena);
        setGuardando(clave);
        try { await onGuardar?.(cambio); setAviso(cambio.motivo); } finally { setGuardando(null); }
    };

    return (
        <section className="space-y-3" aria-label="Asignaciones por papel y director" data-testid="asignaciones-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white/85">Asignaciones por papel y director</h2>
                <span className="text-[11px] text-white/50">{democratico ? "Guardar crea una propuesta para votar" : "Guardar aplica en el ámbito"}</span>
            </div>
            {aviso ? <p role="status" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">{aviso}</p> : null}
            <ul className="space-y-2">
                {filas.map((fila) => {
                    const cadena = cadenas[fila.clave] ?? [];
                    const disponibles = catalogo.filter((o) => !cadena.includes(o.id));
                    return (
                        <li key={fila.clave} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="min-w-0 flex-1 truncate text-sm text-white/90">{fila.titulo}</h3>
                                <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" disabled={guardando !== null} onClick={() => cambiar(fila.clave, restaurarSugeridas(fila.sugeridas))}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar sugeridas</Button>
                                <Button size="sm" className="h-8 gap-1 text-xs" disabled={guardando !== null} onClick={() => void guardar(fila.clave, cadena)} data-testid={`guardar-${fila.clave}`}>{democratico ? <Vote className="h-3.5 w-3.5" aria-hidden /> : null}{democratico ? "Proponer" : "Guardar"}</Button>
                            </div>
                            <ol className="space-y-1.5">
                                {cadena.map((id, indice) => {
                                    const opcion = porId.get(id);
                                    const detalle = detallePeldano(opcion, peldanos[id]);
                                    const nombre = opcion?.nombre ?? id;
                                    return (
                                        <li key={`${id}-${indice}`} draggable onDragStart={() => setArrastre({ clave: fila.clave, indice })} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastre?.clave === fila.clave) cambiar(fila.clave, moverEnCadena(cadena, arrastre.indice, indice)); setArrastre(null); }} className="flex cursor-grab items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5">
                                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                                            <span className="min-w-0 flex-1 truncate text-xs text-white/85">{nombre}<span className="ml-1 text-white/45">{detalle.motivo}</span></span>
                                            <span className="shrink-0 rounded-full border border-cyan-300/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">{detalle.etiqueta}</span>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" aria-label={`Quitar ${nombre}`} onClick={() => cambiar(fila.clave, quitarDeCadena(cadena, id))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
                                        </li>
                                    );
                                })}
                            </ol>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="sr-only" htmlFor={`catalogo-${fila.clave}`}>Añadir del catálogo a {fila.titulo}</label>
                                <select id={`catalogo-${fila.clave}`} value={elegido[fila.clave] ?? ""} onChange={(e) => setElegido((prev) => ({ ...prev, [fila.clave]: e.target.value }))} className="min-w-0 flex-1 cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/85">
                                    <option value="">Añadir del catálogo…</option>
                                    {disponibles.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                                </select>
                                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={!elegido[fila.clave]} onClick={() => { cambiar(fila.clave, agregarACadena(cadena, elegido[fila.clave] ?? "")); setElegido((prev) => ({ ...prev, [fila.clave]: "" })); }}><Plus className="h-3.5 w-3.5" aria-hidden /> Añadir</Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
