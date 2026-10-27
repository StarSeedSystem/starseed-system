"use client";

/*
 * AsignacionesPanel — una fila por papel y por director (Ola 1019G, contrato §2 y §6): cadena
 * ordenable (arrastrar o flechas), añadir del catálogo y quitar, con peldaño (local, malla,
 * contenedor, gratis, pago) y motivo. «Restaurar sugeridas» vuelve a la propuesta del ámbito;
 * en PoliGenesis democrático guardar crea una PROPUESTA. Lo exportado es puro; el guardado
 * entra por `onGuardar`, que decide el ámbito.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Director, Preferencias } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";

export type Peldano = "local" | "malla" | "contenedor" | "gratis" | "pago";
export type ClaveAsignacion = Papel | Director;
export type ModoGuardado = "aplicar" | "propuesta";
export const TEXTO_PELDANO: Record<Peldano, string> = { local: "Local", malla: "Malla", contenedor: "Contenedor", gratis: "Gratis", pago: "De pago" };
export interface EslabonAsignacion { id: string; nombre: string; peldano: Peldano; motivo: string }
export interface FilaAsignacion { clave: ClaveAsignacion; tipo: "papel" | "director"; etiqueta: string; cadena: EslabonAsignacion[]; respaldo: string[]; preferencias: Preferencias }
export interface EntradaAsignacion { clave: ClaveAsignacion; tipo: FilaAsignacion["tipo"]; cadena?: string[]; respaldo?: string[]; preferencias?: Partial<Preferencias> }

const ACENTOS: Record<string, string> = { visión: "Visión", código: "Código", diseno: "Diseño", produccion: "Producción" };
export const etiquetaDe = (clave: ClaveAsignacion): string => ACENTOS[clave] ?? clave.charAt(0).toUpperCase() + clave.slice(1);
/** Clave única de la fila: «papel:» y «director:» no se pisan (chat es las dos cosas). */
export const idFila = (f: Pick<FilaAsignacion, "tipo" | "clave">): string => `${f.tipo}:${f.clave}`;

/** Peldaño de una opción del catálogo. La malla se marca aparte: no viene del catálogo. */
export function peldanoDe(o: Pick<OpcionCatalogo, "tipo" | "privacidad" | "gratis">, enMalla = false): Peldano {
    if (o.tipo === "contenedor") return "contenedor";
    if (enMalla) return "malla";
    return o.privacidad === "local" ? "local" : o.gratis ? "gratis" : "pago";
}
/** Motivo legible de cada peldaño; no se inventan límites ni se nombra ninguna clave. */
export function motivoDe(p: Peldano): string {
    return p === "local" ? "En tu cuenta o en un servidor de tu cerebro; lo privado no sale." : p === "malla" ? "Vecino de la malla con capacidad pública y confianza." : p === "contenedor" ? "Corre los procesos del agente sin ocupar tu aparato." : p === "gratis" ? "Cuenta gratuita del ámbito, con su límite verificado." : "De pago, solo con el permiso y el tope del ámbito.";
}
export interface PropsAsignacionesPanel { filas: FilaAsignacion[]; catalogo: OpcionCatalogo[]; sugeridas?: Record<string, readonly string[]>; democratico?: boolean; onGuardar?: (filas: FilaAsignacion[], modo: ModoGuardado) => Promise<{ ok: boolean; motivo?: string } | void> | void }

/** Mueve una pieza dentro de una lista; fuera de rango o sin cambio devuelve una copia. */
export function mover<T>(lista: readonly T[], desde: number, hasta: number): T[] {
    if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
    const copia = [...lista]; const [pieza] = copia.splice(desde, 1); copia.splice(hasta, 0, pieza); return copia;
}

/** Un papel solo ve lo que lo sirve (o lo genérico); un director ve el catálogo entero. */
export function opcionesPara(tipo: FilaAsignacion["tipo"], clave: ClaveAsignacion, catalogo: OpcionCatalogo[]): OpcionCatalogo[] {
    return tipo === "director" ? catalogo : catalogo.filter((o) => o.papeles.length === 0 || o.papeles.includes(clave as Papel));
}
/** Convierte ids en eslabones con nombre, peldaño y motivo; descarta los que no están. */
export function eslabonesDe(ids: readonly string[], catalogo: OpcionCatalogo[], enMalla: ReadonlySet<string> = new Set()): EslabonAsignacion[] {
    const porId = new Map(catalogo.map((o) => [o.id, o]));
    return ids.flatMap((id) => { const o = porId.get(id); if (!o) return []; const peldano = peldanoDe(o, enMalla.has(id)); return [{ id, nombre: o.nombre, peldano, motivo: motivoDe(peldano) }]; });
}
/** Cadena sugerida, sin duplicados y validada contra el catálogo vigente. */
export function restaurarCadena(sugerida: readonly string[], catalogo: OpcionCatalogo[]): string[] {
    const validos = new Set(catalogo.map((o) => o.id)); const vistos = new Set<string>();
    return sugerida.filter((id) => { if (!validos.has(id) || vistos.has(id)) return false; vistos.add(id); return true; });
}

export const modoGuardado = (democratico: boolean): ModoGuardado => (democratico ? "propuesta" : "aplicar");

/** Una fila por papel o director, en el orden recibido, con sus eslabones ya resueltos. */
export function construirFilas(entradas: EntradaAsignacion[], catalogo: OpcionCatalogo[], enMalla: ReadonlySet<string> = new Set()): FilaAsignacion[] {
    return entradas.map((e) => ({ clave: e.clave, tipo: e.tipo, etiqueta: etiquetaDe(e.clave), cadena: eslabonesDe(e.cadena ?? [], catalogo, enMalla), respaldo: [...(e.respaldo ?? [])], preferencias: { localPrimero: true, privacidad: "local", presupuesto: null, ...e.preferencias } }));
}

export function AsignacionesPanel({ filas: iniciales, catalogo, sugeridas = {}, democratico = false, onGuardar }: PropsAsignacionesPanel) {
    const [filas, setFilas] = useState<FilaAsignacion[]>(iniciales);
    const [arrastre, setArrastre] = useState<{ fila: string; indice: number } | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const modo = modoGuardado(democratico);
    const cambiar = (fila: string, fn: (f: FilaAsignacion) => FilaAsignacion) => setFilas((fs) => fs.map((f) => (idFila(f) === fila ? fn(f) : f)));
    const conSugeridas = (f: FilaAsignacion): FilaAsignacion => ({ ...f, cadena: eslabonesDe(restaurarCadena(sugeridas[idFila(f)] ?? [], catalogo), catalogo) });
    const guardar = async () => {
        setGuardando(true); setAviso(null);
        try {
            const r = await onGuardar?.(filas, modo);
            setAviso(r && !r.ok ? (r.motivo ?? "No se pudo guardar.") : modo === "propuesta" ? "Propuesta creada: la entidad la vota antes de aplicarse." : "Asignaciones guardadas.");
        } catch { setAviso("No se pudo guardar: revisa la conexión."); } finally { setGuardando(false); }
    };
    return (
        <section className="space-y-3" aria-label="Asignaciones por papel y por director">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="cursor-pointer gap-1.5" onClick={() => setFilas((fs) => fs.map(conSugeridas))}><RotateCcw className="h-4 w-4" aria-hidden /> Restaurar sugeridas</Button>
                <Button type="button" className="cursor-pointer gap-1.5" disabled={guardando} onClick={() => void guardar()}><Save className="h-4 w-4" aria-hidden /> {modo === "propuesta" ? "Crear propuesta" : "Guardar"}</Button>
            </div>
            {aviso ? <p role="status" className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-2 text-xs text-emerald-50">{aviso}</p> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filas.map((f) => (
                    <section key={idFila(f)} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <h3 className="truncate text-sm font-semibold text-white/85">{f.etiqueta} <span className="ml-1 text-[11px] font-normal text-white/45">{f.tipo}</span></h3>
                        <ol className="space-y-1.5" aria-label={`Cadena de ${f.etiqueta}`}>
                            {f.cadena.length === 0 ? <li className="rounded-lg border border-dashed border-white/15 p-2 text-xs text-white/45">Sin candidatos: añade uno del catálogo o restaura las sugeridas.</li> : f.cadena.map((e, i) => (
                                <li key={e.id} draggable onDragStart={() => setArrastre({ fila: idFila(f), indice: i })} onDragOver={(ev) => ev.preventDefault()} onDrop={() => { if (arrastre?.fila === idFila(f)) cambiar(idFila(f), (x) => ({ ...x, cadena: mover(x.cadena, arrastre.indice, i) })); setArrastre(null); }} className="flex cursor-grab items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
                                    <GripVertical className="h-4 w-4 shrink-0 text-white/35" aria-hidden />
                                    <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5 text-sm text-white/90"><span className="truncate">{e.nombre}</span><span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-100">{TEXTO_PELDANO[e.peldano]}</span></span><span className="block text-[11px] text-white/45">{e.motivo}</span></span>
                                    <button type="button" aria-label={`Subir ${e.nombre}`} disabled={i === 0} onClick={() => cambiar(idFila(f), (x) => ({ ...x, cadena: mover(x.cadena, i, i - 1) }))} className="h-9 w-9 cursor-pointer rounded-full text-white/55 hover:text-white disabled:opacity-30"><ArrowUp className="mx-auto h-4 w-4" aria-hidden /></button>
                                    <button type="button" aria-label={`Bajar ${e.nombre}`} disabled={i === f.cadena.length - 1} onClick={() => cambiar(idFila(f), (x) => ({ ...x, cadena: mover(x.cadena, i, i + 1) }))} className="h-9 w-9 cursor-pointer rounded-full text-white/55 hover:text-white disabled:opacity-30"><ArrowDown className="mx-auto h-4 w-4" aria-hidden /></button>
                                    <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => cambiar(idFila(f), (x) => ({ ...x, cadena: x.cadena.filter((y) => y.id !== e.id) }))} className="h-9 w-9 cursor-pointer rounded-full text-white/55 hover:text-rose-200"><X className="mx-auto h-4 w-4" aria-hidden /></button>
                                </li>
                            ))}
                        </ol>
                        <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const form = ev.currentTarget; const id = String(new FormData(form).get("opcion") ?? ""); if (id) cambiar(idFila(f), (x) => ({ ...x, cadena: eslabonesDe(x.cadena.some((y) => y.id === id) ? x.cadena.map((y) => y.id) : [...x.cadena.map((y) => y.id), id], catalogo) })); form.reset(); }}>
                            <label className="sr-only" htmlFor={`asignar-${idFila(f)}`}>Añadir del catálogo a {f.etiqueta}</label>
                            <select id={`asignar-${idFila(f)}`} name="opcion" defaultValue="" className="h-9 min-w-0 flex-1 cursor-pointer rounded-full border border-white/15 bg-black/30 px-3 text-xs text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                                <option value="">Añadir del catálogo…</option>
                                {opcionesPara(f.tipo, f.clave, catalogo).filter((o) => !f.cadena.some((e) => e.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                            </select>
                            <button type="submit" aria-label={`Añadir a ${f.etiqueta}`} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 text-white/70 hover:border-emerald-300/50 hover:text-white"><Plus className="h-4 w-4" aria-hidden /></button>
                        </form>
                    </section>
                ))}
            </div>
        </section>
    );
}
