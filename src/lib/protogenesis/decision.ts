/**
 * ProtoGenesis · decisión del resultado y propuesta a MetaGenesis (PG1013D)
 * Módulo puro: sin `node:*`, sin Supabase, sin `window`.
 * Contrato: architecture/protogenesis.md §2·7·8 y architecture/protomolecula.md §3·7·8.
 */

import type { Ambito } from "@/lib/protomolecula/tipos";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";
import type { Encargo } from "./encargo";

export type ModoDecision = "aceptar" | "proponer-voto" | "proponer-metagenesis" | "sin-permiso";

export interface DecisionResultado {
  modo: ModoDecision;
  motivo: string;
}

export interface ContextoDecision {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}

export interface FaltaParaMetaGenesis {
  tipo: "atomo" | "conversor" | "otro";
  detalle: string;
}

export interface PropuestaMetaGenesis {
  id: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  prompt: string;
}

/**
 * Quién decide el resultado del encargo, según el ámbito donde vive la molécula.
 * Lo que toca fuera de la molécula (átomo, conversor o código del OS) nunca se
 * aplica aquí: se convierte en propuesta de tarea para MetaGenesis.
 */
export function decidirResultado(e: ContextoDecision): DecisionResultado {
  if (e.tocaFueraDeLaMolecula) {
    return {
      modo: "proponer-metagenesis",
      motivo: "Un átomo, un conversor o código del OS lo decide MetaGenesis",
    };
  }

  if (e.ambito === "personal" || e.ambito === "perfil") {
    return e.esDueno
      ? { modo: "aceptar", motivo: "Es tu ámbito: tú aceptas el resultado." }
      : { modo: "sin-permiso", motivo: "Solo la persona dueña de este ámbito puede aceptar el resultado." };
  }

  const rango = rangoDeRol(e.rol ?? null);
  const democratico = e.democratico ?? false;
  const entidad = { tipo: "entidad" as const, entidad: { tipo: "grupo" as const, id: "", slug: "", nombre: "" } };
  const { modo, motivo } = decidirAplicacion(entidad, rango, democratico);

  if (modo === "aplicar") return { modo: "aceptar", motivo };
  if (modo === "proponer") return { modo: "proponer-voto", motivo };
  return { modo: "sin-permiso", motivo };
}

/** djb2: mismo texto, mismo id; independiente del orden de claves del objeto. */
function hashEstable(texto: string): string {
  let hash = 5381;
  for (let i = 0; i < texto.length; i++) {
    hash = ((hash << 5) + hash + texto.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Huella canónica del encargo y de lo que falta (campos explícitos, sin JSON.stringify). */
function huella(encargo: Encargo, falta: FaltaParaMetaGenesis): string {
  const criterios = encargo.criterios
    .map((c) => [c.tipo, String(c.valor ?? ""), c.texto].join(":"))
    .join("|");
  return [
    encargo.id,
    encargo.moleculaId,
    encargo.ambito,
    encargo.entidadId ?? "",
    encargo.intencion,
    criterios,
    encargo.autor.tipo,
    encargo.autor.id,
    encargo.origen,
    String(encargo.creadoEn),
    falta.tipo,
    falta.detalle,
  ].join("\u0001");
}

/**
 * Convierte lo que una molécula no sabe hacer en un borrador de tarea para
 * MetaGenesis. No se lanza sola y no lleva datos privados: en ámbito personal
 * solo viaja el tipo de lo que falta, nunca la intención.
 */
export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: FaltaParaMetaGenesis,
): PropuestaMetaGenesis {
  const id = `PGM${hashEstable(huella(encargo, falta))}`;
  const esPersonal = encargo.ambito === "personal";
  const titulo = esPersonal
    ? `Propuesta MetaGenesis: falta ${falta.tipo}`
    : `Propuesta MetaGenesis para ${encargo.intencion}`;
  const prompt = esPersonal
    ? `Falta: ${falta.tipo}`
    : `Intención: ${encargo.intencion}. Falta: ${falta.tipo} - ${falta.detalle}`;

  return { id, titulo, archivos: [], depende: [], prompt };
}
