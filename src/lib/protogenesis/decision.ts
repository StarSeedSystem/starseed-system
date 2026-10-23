/**
 * ProtoGenesis · decisión del resultado y propuesta a MetaGenesis (PG1013D)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contrato: architecture/protogenesis.md §2 (paso 7) y §4.
 */
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "./encargo";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";

/** Modos en que puede quedar la decisión de una rama de encargo. */
export type ModoResultado = "aceptar" | "proponer-voto" | "proponer-metagenesis" | "sin-permiso";

/** Hash estable en 8 hex (djb2, paso a paso): mismo texto → mismo id, sin fechas ni azar. */
function hashEstable(texto: string): string {
  let hash = 5381;
  for (let i = 0; i < texto.length; i++) hash = (hash * 33 + texto.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Quién decide el resultado de la rama, según el nivel donde vive la molécula:
 * lo que toca fuera de la molécula (un átomo, un conversor o código del OS) lo
 * decide MetaGenesis; personal y perfil aceptan o no según si es el dueño;
 * grupo y pública heredan el gobierno de PoliGenesis con `decidirAplicacion`
 * (jerárquico: aplica quien gestiona; democrático: propuesta que se vota).
 */
export function decidirResultado(e: {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}): { modo: ModoResultado; motivo: string } {
  if (e.tocaFueraDeLaMolecula) {
    return { modo: "proponer-metagenesis", motivo: "Un átomo, un conversor o código del OS lo decide MetaGenesis" };
  }
  if (e.ambito === "personal" || e.ambito === "perfil") {
    return e.esDueno
      ? { modo: "aceptar", motivo: "Es el dueño del ámbito personal/perfil" }
      : { modo: "sin-permiso", motivo: "No es el dueño del ámbito personal/perfil" };
  }
  // grupo y pública: misma decisión, el gobierno lo pone PoliGenesis.
  const { modo, motivo } = decidirAplicacion(
    { tipo: "entidad", entidad: { tipo: "grupo", id: "", slug: "", nombre: "" } },
    rangoDeRol(e.rol ?? null),
    e.democratico ?? false,
  );
  if (modo === "proponer") return { modo: "proponer-voto", motivo };
  if (modo === "aplicar") return { modo: "aceptar", motivo };
  return { modo: "sin-permiso", motivo };
}

/**
 * Convierte lo que falta en una propuesta de tarea a MetaGenesis: id estable a
 * partir del encargo y de la falta, `archivos` vacío (los pone MetaGenesis) y
 * sin datos privados: la intención de un encargo personal no entra al prompt.
 */
export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: { tipo: "atomo" | "conversor" | "otro"; detalle: string },
): { id: string; titulo: string; archivos: string[]; depende: string[]; prompt: string } {
  const id = `PGM${hashEstable(JSON.stringify(encargo) + JSON.stringify(falta))}`;
  const faltaTexto = `Falta: ${falta.tipo} - ${falta.detalle}`;
  return {
    id,
    titulo: `Propuesta MetaGenesis para: ${encargo.intencion}`,
    archivos: [],
    depende: [],
    prompt: encargo.ambito === "personal" ? faltaTexto : `Intención: ${encargo.intencion}. ${faltaTexto}`,
  };
}
