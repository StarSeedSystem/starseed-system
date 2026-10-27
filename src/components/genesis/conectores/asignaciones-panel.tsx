"use client";

/* GENESIS · Panel de asignaciones por papel y director (Ola 1019G · GCA1019N,
   architecture/genesis-conectores-abiertos.md §6). Una fila por papel o director con su
   cadena: arrastrar para ordenar, añadir del catálogo o quitar, etiqueta de peldaño
   (local, malla, contenedor, gratis, pago) y motivo. En PoliGenesis democrático el padre
   recibe las filas y crea una propuesta; el panel no aplica nada por su cuenta. */

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sugeridas } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";

export type RangoAsignacion = "papel" | "director";

export interface FilaAsignacion {
  rango: RangoAsignacion;
  clave: string;
  cadena: string[];
}

export type PeldanoAsignacion = "local" | "malla" | "contenedor" | "gratis" | "pago";

const ETIQUETAS_CLAVE: Record<string, string> = {
  escritor: "Escritor", revisor: "Revisor", chat: "Chat", visión: "Visión", voz: "Voz",
  imagen: "Imagen", código: "Código", optimizador: "Optimizador", diseno: "Diseño",
  produccion: "Producción", nube: "Nube", medidores: "Medidores", aprendizaje: "Aprendizaje",
};

const ESTILO_PELDANO: Record<PeldanoAsignacion, string> = {
  local: "border-emerald-300/50 text-emerald-200",
  malla: "border-sky-300/50 text-sky-200",
  contenedor: "border-amber-300/50 text-amber-200",
  gratis: "border-violet-300/50 text-violet-200",
  pago: "border-rose-300/50 text-rose-200",
};

const claveUnica = (f: FilaAsignacion) => `${f.rango}:${f.clave}`;
const etiquetaClave = (c: string) => ETIQUETAS_CLAVE[c] ?? c;

/** Peldaño y motivo de una opción. PURO: solo mira lo verificado; nunca inventa un límite gratis. */
export function etiquetaPeldano(
  o: OpcionCatalogo,
  locales: ReadonlySet<string>,
  malla: ReadonlySet<string>,
): { peldano: PeldanoAsignacion; motivo: string } {
  if (locales.has(o.id) || o.privacidad === "local")
    return { peldano: "local", motivo: "Corre en una neurona o servidor del cerebro del ámbito." };
  if (malla.has(o.id))
    return { peldano: "malla", motivo: "Capacidad de un vecino de la malla; nunca para lo privado." };
  if (o.tipo === "contenedor")
    return { peldano: "contenedor", motivo: "Corre los procesos de los agentes del ámbito." };
  if (o.gratis !== null)
    return { peldano: "gratis", motivo: o.gratis.nota
      ? `Gratis según el catálogo: ${o.gratis.nota}`
      : "Gratis; su límite no consta y no se inventa." };
  return { peldano: "pago", motivo: "Se paga por uso: solo con el permiso y el tope del ámbito." };
}

/** Cadena sugerida por fila (§6): local de Astraura primero y después lo gratis del catálogo
    que cubre el papel; los directores no tienen papeles en el catálogo, solo el local. */
export function sugeridasPara(
  fila: Pick<FilaAsignacion, "rango" | "clave">,
  localesAstraura: readonly string[],
  catalogo: readonly OpcionCatalogo[],
): string[] {
  const porId = new Map(catalogo.map((o) => [o.id, o]));
  return sugeridas([...localesAstraura], [...catalogo]).filter((id) => {
    if (localesAstraura.includes(id)) return true;
    const o = porId.get(id);
    return fila.rango === "papel" && o !== undefined && o.papeles.includes(fila.clave as Papel);
  });
}

function reordenar(cadena: readonly string[], desde: number, hasta: number): string[] {
  const copia = [...cadena];
  const [id] = copia.splice(desde, 1);
  if (id === undefined) return [...cadena];
  copia.splice(hasta, 0, id);
  return copia;
}

export function AsignacionesPanel({
  filas: iniciales,
  catalogo,
  localesAstraura,
  idsMalla = [],
  modo,
  onGuardar,
  aviso,
}: {
  filas: FilaAsignacion[];
  catalogo: OpcionCatalogo[];
  localesAstraura: readonly string[];
  idsMalla?: readonly string[];
  /** "aplicar": guardar aplica. "proponer": PoliGenesis democrático, guarda como propuesta. */
  modo: "aplicar" | "proponer";
  /** Guardado inyectable: el padre aplica o crea la propuesta. Sin red ni Supabase aquí. */
  onGuardar?: (filas: FilaAsignacion[]) => Promise<void> | void;
  aviso?: (texto: string) => void;
}) {
  const locales = useMemo(() => new Set(localesAstraura), [localesAstraura]);
  const malla = useMemo(() => new Set(idsMalla), [idsMalla]);
  const porId = useMemo(() => new Map(catalogo.map((o) => [o.id, o])), [catalogo]);
  const sugeridasDeFila = useMemo(
    () => new Map(iniciales.map((f) => [claveUnica(f), sugeridasPara(f, localesAstraura, catalogo)])),
    [iniciales, localesAstraura, catalogo],
  );
  const [filas, setFilas] = useState(iniciales);
  const [arrastre, setArrastre] = useState<{ fila: string; i: number } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setFilas(iniciales), [iniciales]);

  const cambiar = (fk: string, cadena: string[]) =>
    setFilas((fs) => fs.map((f) => (claveUnica(f) === fk ? { ...f, cadena } : f)));
  const mover = (fk: string, desde: number, hasta: number) => setFilas((fs) =>
    fs.map((f) => (claveUnica(f) === fk ? { ...f, cadena: reordenar(f.cadena, desde, hasta) } : f)));
  const quitar = (fk: string, i: number) => setFilas((fs) =>
    fs.map((f) => (claveUnica(f) === fk ? { ...f, cadena: f.cadena.filter((_, x) => x !== i) } : f)));
  const restaurar = () => {
    setFilas((fs) => fs.map((f) => ({ ...f, cadena: [...(sugeridasDeFila.get(claveUnica(f)) ?? f.cadena)] })));
    aviso?.("Cadenas restauradas a las sugeridas del ámbito.");
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar?.(filas);
      aviso?.(modo === "proponer" ? "Propuesta creada: la entidad la vota en Decisiones." : "Asignaciones guardadas.");
    } catch {
      aviso?.("No se pudo guardar; inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section aria-label="Asignaciones por papel y director" className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-white/85">Asignaciones por papel y director</h3>
        <p className="text-[11px] text-white/45">{modo === "proponer" ? "Guardar crea una propuesta para votar." : "Se aplican al guardar."}</p>
        <Button type="button" variant="outline" className="cursor-pointer ml-auto gap-1" onClick={restaurar}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar sugeridas
        </Button>
        <Button type="button" className="cursor-pointer gap-1" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {modo === "proponer" ? "Guardar como propuesta" : "Guardar"}
        </Button>
      </header>
      <ul className="space-y-2">
        {filas.map((f) => {
          const fk = claveUnica(f);
          return (
            <li key={fk} data-testid="asignacion-fila" className="rounded-xl border border-white/10 p-2">
              <p className="text-xs text-white/60">{f.rango === "papel" ? "Papel" : "Director"} · {etiquetaClave(f.clave)}</p>
              <ul className="mt-1 flex flex-wrap items-start gap-1">
                {f.cadena.map((id, i) => {
                  const o = porId.get(id);
                  const meta = o ? etiquetaPeldano(o, locales, malla) : null;
                  const nombre = o?.nombre ?? id;
                  return (
                    <li
                      key={id}
                      data-testid={`asignacion-item-${id}`}
                      title={meta?.motivo ?? "No consta en el catálogo; no se inventa su información."}
                      draggable
                      onDragStart={() => setArrastre({ fila: fk, i })}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (arrastre && arrastre.fila === fk) mover(fk, arrastre.i, i); setArrastre(null); }}
                      className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-xs text-white/85"
                    >
                      <span className="font-medium">{nombre}</span>
                      <span className={`ml-1 rounded-full border px-1.5 text-[10px] ${meta ? ESTILO_PELDANO[meta.peldano] : "border-white/20 text-white/50"}`}>
                        {meta?.peldano ?? "sin datos"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar ${nombre}`}
                        className="cursor-pointer text-white/40 transition-colors duration-150 hover:text-white"
                        onClick={() => quitar(fk, i)}
                      >
                        <X className="inline h-3 w-3" aria-hidden />
                      </button>
                      <p className="text-[9px] text-white/45">{meta?.motivo ?? "No consta en el catálogo."}</p>
                    </li>
                  );
                })}
              </ul>
              <select
                aria-label={`Añadir del catálogo: ${f.rango} ${etiquetaClave(f.clave)}`}
                value=""
                className="mt-1 cursor-pointer rounded-lg border border-white/15 bg-black/30 p-1 text-xs text-white/85"
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) cambiar(fk, [...f.cadena, id]);
                }}
              >
                <option value="">Añadir del catálogo…</option>
                {catalogo.filter((o) => !f.cadena.includes(o.id)).map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
