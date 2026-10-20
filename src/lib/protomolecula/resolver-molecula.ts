/**
 * Protomolécula · RESOLVER MOLÉCULA. De qué molécula parte una sesión: la pedida por id, la más reciente
 * del almacén que esté en la forma del núcleo, o una nueva. Un id que no existe NO se inventa: se dice.
 * Módulo sin React, sin `window` y sin Supabase (el almacén llega por parámetro).
 */
import { cargarMolecula, listarMoleculas, type AlmacenLocal } from "./almacen-moleculas";
import { esMoleculaValidaNucleo } from "./bloque-protomolecula";
import type { Molecula } from "./tipos";

export const TITULO_MOLECULA_NUEVA = "Mi primera molécula";
const MOTIVO_ANTIGUA = "Esta molécula está guardada en el formato antiguo y aún no se puede abrir (próximamente: pasar el almacén al núcleo de la Protomolécula).";

export function resolverMolecula(
  id: string | undefined,
  d: { almacen: AlmacenLocal | null; ahora: () => number; nuevoId: () => string },
): { ok: true; molecula: Molecula } | { ok: false; motivo: string } {
  if (id !== undefined) {
    if (!d.almacen) return { ok: false, motivo: "Este navegador no deja leer las moléculas guardadas en el aparato." };
    const m = cargarMolecula(d.almacen, id);
    if (m === null) return { ok: false, motivo: `No se pudo leer la molécula «${id}»: no está en este aparato o está dañada.` };
    return esMoleculaValidaNucleo(m) ? { ok: true, molecula: m } : { ok: false, motivo: MOTIVO_ANTIGUA };
  }
  if (d.almacen) {
    for (const r of listarMoleculas(d.almacen)) {
      const m = cargarMolecula(d.almacen, r.id);
      if (m !== null && esMoleculaValidaNucleo(m)) return { ok: true, molecula: m };
    }
  }
  const t = d.ahora();
  return { ok: true, molecula: { id: d.nuevoId(), titulo: TITULO_MOLECULA_NUEVA, ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: t, actualizadaEn: t } };
}

