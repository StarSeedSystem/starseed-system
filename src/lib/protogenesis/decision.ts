/**
 * ProtoGenesis · decisión del nivel donde vive la molécula (PG1013D).
 * Módulo puro: sin `node:*`, sin Supabase, sin `window`.
 * Contrato: architecture/protogenesis.md §2.7 y §4, architecture/protomolecula.md §3·8.
 * Tipos de la Protomolécula de `protomolecula/tipos.ts`; PoliGenesis aporta
 * `decidirAplicacion` y `rangoDeRol` de `genesis/operaciones.ts`.
 */
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "./encargo";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";

export type ModoDecision = "aceptar" | "proponer-voto" | "proponer-metagenesis" | "sin-permiso";

/** djb2 de 32 bits → 8 dígitos hexadecimales, estable sin `node:crypto`. */
function hashOcho(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Mapea `decidirAplicacion` (PoliGenesis) al modo de ProtoGenesis: jerarquía
 * aplicante → aceptar; democrática → propuesta que se vota; sin rango → sin permiso.
 */
function modoDeEntidad(
  rol: string | null | undefined,
  democratico: boolean,
): { modo: ModoDecision; motivo: string } {
  const { modo, motivo } = decidirAplicacion(
    // Ámbito de entidad de ejemplo: `decidirAplicacion` solo distingue persona/entidad.
    { tipo: "entidad", entidad: { tipo: "grupo", id: "", slug: "", nombre: "" } },
    rangoDeRol(rol ?? null),
    democratico,
  );
  if (modo === "aplicar") return { modo: "aceptar", motivo };
  if (modo === "proponer") return { modo: "proponer-voto", motivo };
  return { modo: "sin-permiso", motivo };
}

/** Decidir quién manda en el resultado del encargo (protogenesis.md §2.7). */
export function decidirResultado(e: {
  ambito: Ambito;
  esDueno: boolean;
  rol?: string | null;
  democratico?: boolean;
  tocaFueraDeLaMolecula: boolean;
}): { modo: ModoDecision; motivo: string } {
  // Lo que no es de la molécula (un átomo, un conversor, código del OS) lo decide MetaGenesis.
  if (e.tocaFueraDeLaMolecula) {
    return {
      modo: "proponer-metagenesis",
      motivo: "un átomo, un conversor o código del OS lo decide MetaGenesis",
    };
  }
  // Personal y perfil: acepta la persona y solo ella (hereda las reglas de Genesis).
  if (e.ambito === "personal" || e.ambito === "perfil") {
    return e.esDueno
      ? { modo: "aceptar", motivo: "Es tu molécula: aceptas el resultado con dos toques." }
      : { modo: "sin-permiso", motivo: "No es tu molécula: solo la persona que encargó puede aceptar." };
  }
  // Grupo y pública heredan el gobierno de la entidad (jerárquico o democrático).
  if (e.ambito === "grupo" || e.ambito === "publica") return modoDeEntidad(e.rol, e.democratico ?? false);
  return { modo: "sin-permiso", motivo: "Ámbito no reconocido." };
}

/**
 * Propuesta de tarea de desarrollo para MetaGenesis (protogenesis.md §4):
 * lo que la molécula no sabe hacer se convierte en un borrador de tarea,
 * que lanza una persona y nunca se lanza sola.
 */
export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: { tipo: "atomo" | "conversor" | "otro"; detalle: string },
): { id: string; titulo: string; archivos: string[]; depende: string[]; prompt: string } {
  const estable =
    encargo.id + encargo.moleculaId + encargo.ambito + encargo.intencion +
    JSON.stringify(encargo.criterios) + JSON.stringify(encargo.autor) +
    encargo.origen + String(encargo.creadoEn) + falta.tipo + falta.detalle;
  // id estable del encargo y de lo que falta: PGM + 8 caracteres del hash.
  const id = `PGM${hashOcho(estable)}`;
  // MetaGenesis nunca ve el contenido de lo personal: sin intención, solo el tipo de lo que falta.
  const personal = encargo.ambito === "personal";
  const titulo = personal ? `Propuesta MetaGenesis: falta ${falta.tipo}` : `Propuesta MetaGenesis: ${encargo.intencion}`;
  const prompt = personal
    ? `Falta: ${falta.tipo} — ${falta.detalle}`
    : `Intención: ${encargo.intencion}. Falta: ${falta.tipo} — ${falta.detalle}`;
  return { id, titulo, archivos: [], depende: [], prompt };
}