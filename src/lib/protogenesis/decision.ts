/**
 * ProtoGenesis PG1013D · quién decide el resultado y propuesta a MetaGenesis.
 * Contrato: `architecture/protogenesis.md` §2.7 y §4. Módulo PURO: sin React,
 * sin red, sin `node:*`.
 *
 * La decisión hereda el gobierno del nivel donde vive la molécula (§1):
 * personal/perfil → la persona dueña acepta con dos toques; grupo/pública →
 * nivel jerárquico aplica quien gestiona y democrático convierte el resultado
 * en propuesta de voto (`decidirAplicacion` de Genesis); un átomo nuevo, un
 * conversor o código del OS → propuesta de tarea a MetaGenesis. Nada se
 * aplica desde aquí sin esa decisión.
 */
import type { Encargo } from "./encargo";
import type { Ambito } from "@/lib/protomolecula/tipos";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";

export type ModoResultado = "aceptar" | "proponer-voto" | "proponer-metagenesis" | "sin-permiso";

export interface ResultadoDecision {
  modo: ModoResultado;
  motivo: string;
}

export interface EntradaDecision {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}

/** Grupo y pública comparten regla: el rango del rol manda (mapa de PoliGenesis). */
function decidirEntidad(rol: string | null, democratico: boolean): ResultadoDecision {
  const { modo, motivo } = decidirAplicacion(
    { tipo: "entidad", entidad: { tipo: "grupo", id: "", slug: "", nombre: "" } },
    rangoDeRol(rol),
    democratico,
  );
  if (modo === "aplicar") return { modo: "aceptar", motivo };
  if (modo === "proponer") return { modo: "proponer-voto", motivo };
  return { modo: "sin-permiso", motivo };
}

/** Quién decide el resultado según el ámbito y si lo propuesto sale de la molécula. */
export function decidirResultado(e: EntradaDecision): ResultadoDecision {
  // Un átomo nuevo, un conversor o código del OS lo decide MetaGenesis, nunca aquí.
  if (e.tocaFueraDeLaMolecula) {
    return { modo: "proponer-metagenesis", motivo: "Un átomo, un conversor o código del OS lo decide MetaGenesis" };
  }
  if (e.ambito === "personal" || e.ambito === "perfil") {
    return e.esDueno
      ? { modo: "aceptar", motivo: "Es tu molécula: la persona dueña acepta con dos toques." }
      : { modo: "sin-permiso", motivo: "Solo la persona dueña acepta en su ámbito personal o de perfil." };
  }
  if (e.ambito === "grupo" || e.ambito === "publica") {
    return decidirEntidad(e.rol ?? null, e.democratico ?? false);
  }
  return { modo: "sin-permiso", motivo: "Ámbito no reconocido." };
}

/** Hash djb2 estable: el mismo encargo con la misma falta da siempre el mismo id. */
function hashEstable(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const NOMBRE_FALTA: Record<"atomo" | "conversor" | "otro", string> = {
  atomo: "un átomo",
  conversor: "un conversor",
  otro: "algo",
};

export type PropuestaMetaGenesis = {
  id: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  prompt: string;
};

/**
 * Convierte «lo que la molécula no sabe hacer» en un borrador de tarea para el
 * Diseñador de olas de MetaGenesis (§4). Los archivos los pone MetaGenesis.
 * En ámbito personal el título y el prompt NO llevan la intención ni el
 * detalle (datos privados): solo el tipo de lo que falta.
 */
export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: { tipo: "atomo" | "conversor" | "otro"; detalle: string },
): PropuestaMetaGenesis {
  const semilla = JSON.stringify([
    encargo.id, encargo.moleculaId, encargo.ambito, encargo.intencion,
    encargo.criterios, encargo.autor, encargo.origen, encargo.creadoEn,
    falta.tipo, falta.detalle,
  ]);
  const id = `PGM${hashEstable(semilla)}`;
  const privado = encargo.ambito === "personal";
  const prompt = privado
    ? `Falta: ${falta.tipo} (lo proyecta MetaGenesis).`
    : `Intención: ${encargo.intencion}. Falta: ${falta.tipo} — ${falta.detalle}.`;
  const titulo = privado
    ? `Propuesta MetaGenesis: falta ${NOMBRE_FALTA[falta.tipo]}`
    : `Propuesta MetaGenesis: ${encargo.intencion}`;
  return { id, titulo, archivos: [], depende: [], prompt };
}
