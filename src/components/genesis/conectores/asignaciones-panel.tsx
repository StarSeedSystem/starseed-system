"use client";
/**
 * GENESIS · Panel de asignaciones por papel y por director (Ola 1019G · §6 de genesis-conectores-abiertos.md).
 * Una fila por papel o director con su cadena: arrastrar para ordenar, añadir del catálogo, quitar, etiqueta
 * del peldaño (local, malla, contenedor, gratis, pago) con su motivo y botón «Restaurar sugeridas». En PoliGenesis
 * democrático, guardar crea una propuesta (onGuardar recibe las filas; el padre aplica o propone a votación).
 * PURO aquí: sin red, Supabase ni reloj; nunca valores de claves, solo nombres de variables.
 */
import { useState } from "react";
import type { OpcionCatalogo, Privacidad } from "@/lib/genesis/conectores/catalogo-opciones";

export type Peldano = "local" | "malla" | "contenedor" | "gratis" | "pago";

export type CandidatoAsignacion = { id: string; nombre: string; peldano: Peldano; motivo: string };

export type FilaAsignacion = { clave: string; etiqueta: string; cadena: CandidatoAsignacion[] };

/** Mínimo de opción del catálogo que necesita el panel; `OpcionCatalogo` lo cumple tal cual. */
export type EntradaCatalogo = { id: string; nombre: string; tipo: OpcionCatalogo["tipo"]; gratis?: { nota: string } | null; privacidad?: Privacidad; deMalla?: boolean };

const ETIQUETA_PELDANO: Record<Peldano, string> = { local: "Local", malla: "Malla", contenedor: "Contenedor", gratis: "Gratis", pago: "Pago" };

const MOTIVO_PELDANO: Record<Peldano, string> = {
  local: "Está en las neuronas o servidores del cerebro del ámbito: lo más potente y privado va primero.",
  malla: "Vecino de la malla con capacidad pública: nunca para lo privado.",
  contenedor: "Contenedor del ámbito para los procesos de los agentes.",
  gratis: "Servicio gratuito en la nube, con la cuenta que el ámbito vinculó.",
  pago: "De pago: solo el permiso y el tope del ámbito lo permiten.",
}
/** Peldaño de una opción: si el catálogo no lo trae, se deduce (malla y contenedor primero, luego local, gratis o pago). */
export function peldanoDe(op: EntradaCatalogo): Peldano {
  if (op.deMalla) return "malla";
  if (op.tipo === "contenedor") return "contenedor";
  if (op.privacidad === "local") return "local";
  return op.gratis == null ? "pago" : "gratis";
}
export function candidatoDe(op: EntradaCatalogo): CandidatoAsignacion {
  const p = peldanoDe(op);
  return { id: op.id, nombre: op.nombre, peldano: p, motivo: MOTIVO_PELDANO[p] };
}
/** Copia profunda de las sugeridas: «Restaurar sugeridas» sin compartir referencias con el padre. */
export function conSugeridas(sugeridas: FilaAsignacion[]): FilaAsignacion[] {
  return sugeridas.map((f) => ({ ...f, cadena: f.cadena.map((c) => ({ ...c })) }));
}
/** Añade una opción del catálogo al final de la cadena de un papel, sin duplicados. */
export function anadirA(filas: FilaAsignacion[], clave: string, op: EntradaCatalogo): FilaAsignacion[] {
  return filas.map((f) =>
    f.clave === clave && !f.cadena.some((c) => c.id === op.id) ? { ...f, cadena: [...f.cadena, candidatoDe(op)] } : f,
  );
}
/** Quita una opción de la cadena de un papel, por id. */
export function quitarDe(filas: FilaAsignacion[], clave: string, id: string): FilaAsignacion[] {
  return filas.map((f) => (f.clave === clave ? { ...f, cadena: f.cadena.filter((c) => c.id !== id) } : f));
}
/** Mueve una opción dentro de la cadena de un papel, de la posición `desde` a la `hasta`. */
export function moverEn(filas: FilaAsignacion[], clave: string, desde: number, hasta: number): FilaAsignacion[] {
  return filas.map((f) => {
    if (f.clave !== clave) return f;
    const cadena = [...f.cadena];
    const [item] = cadena.splice(desde, 1);
    if (item) cadena.splice(Math.max(0, Math.min(cadena.length, hasta)), 0, item);
    return { ...f, cadena };
  });
}

const BTN = "cursor-pointer rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 transition-colors duration-150 hover:border-emerald-300/50 hover:text-white";

export function PanelAsignaciones({ filas: iniciales, sugeridas, catalogo, democrata = false, onGuardar }: {
  filas: FilaAsignacion[]; sugeridas: FilaAsignacion[]; catalogo: EntradaCatalogo[]; democrata?: boolean; onGuardar?: (filas: FilaAsignacion[]) => void;
}) {
  const [filas, setFilas] = useState(iniciales);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [arrastrando, setArrastrando] = useState<{ clave: string; desde: number } | null>(null);
  const soltar = (clave: string, hasta: number) => {
    if (arrastrando?.clave === clave) setFilas((fs) => moverEn(fs, clave, arrastrando.desde, hasta));
    setArrastrando(null);
  };
  return (
    <section aria-label="Asignaciones por papel y director" className="space-y-3">
      {filas.map((fila) => (
        <div key={fila.clave} data-testid="asignaciones-fila" className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <h3 className="text-sm font-semibold text-white/85">{fila.etiqueta}</h3>
          <ol className="mt-2 space-y-1">
            {fila.cadena.map((c, i) => (
              <li key={c.id} draggable data-testid={`candidato-${c.id}`} className="flex cursor-grab items-start gap-2 rounded-lg bg-white/[0.04] p-2 text-xs"
                onDragStart={() => setArrastrando({ clave: fila.clave, desde: i })} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(fila.clave, i)}
              >
                <span data-testid={`peldano-${c.id}`} title={c.motivo} className="rounded-full border border-white/15 px-2 py-0.5 text-white/70">{ETIQUETA_PELDANO[c.peldano]}</span>
                <div className="min-w-0 flex-1">
                  <span className="text-white/85">{c.nombre}</span>
                  <p className="text-white/50">{c.motivo}</p>
                </div>
                <button type="button" className={BTN} aria-label={`Quitar ${c.nombre} de ${fila.etiqueta}`} onClick={() => setFilas((fs) => quitarDe(fs, fila.clave, c.id))}>Quitar</button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex items-center gap-2">
            <select id={`anadir-${fila.clave}`} data-testid={`anadir-${fila.clave}`}
              className="cursor-pointer min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-1 text-xs text-white/80"
              value={seleccion[fila.clave] ?? ""} onChange={(e) => setSeleccion((s) => ({ ...s, [fila.clave]: e.target.value }))}>
              <option value="">Elegir opción del catálogo…</option>
              {catalogo.filter((o) => !fila.cadena.some((c) => c.id === o.id)).map((o) => (<option key={o.id} value={o.id}>{o.nombre}</option>))}
            </select>
            <button type="button" className={BTN} data-testid={`boton-anadir-${fila.clave}`} disabled={!seleccion[fila.clave]}
              onClick={() => {
                const op = catalogo.find((o) => o.id === seleccion[fila.clave]);
                if (op) { setFilas((fs) => anadirA(fs, fila.clave, op)); setSeleccion((s) => ({ ...s, [fila.clave]: "" })); }
              }}
            >
              Añadir
            </button>
          </div>
        </div>
      ))}
      <footer className="flex gap-2">
        <button type="button" className={BTN} data-testid="asignaciones-restaurar" onClick={() => setFilas(conSugeridas(sugeridas))}>Restaurar sugeridas</button>
        <button type="button" className={BTN} data-testid="asignaciones-guardar" onClick={() => onGuardar?.(filas)}>{democrata ? "Proponer a votación" : "Guardar"}</button>
      </footer>
    </section>
  );
}