import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "./encargo";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";

/**
 * Calcula un hash estable de una cadena.
 * Implementación simple de djb2 para producir un hash de 32 bits.
 * Luego convertimos a hexadecimal y tomamos los primeros 8 caracteres.
 */
function hashEstable(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  // Convertir a hexadecimal y asegurar 8 caracteres (rellenar con ceros si es necesario)
  const hex = hash >>> 0; // Convertir a entero sin signo de 32 bits
  return hex.toString(16).padStart(8, "0");
}

export function decidirResultado(
  e: {
    ambito: Ambito;
    esDueno: boolean;
    rol?: string | null;
    democratico?: boolean;
    tocaFueraDeLaMolecula: boolean;
  }
): { modo: "aceptar" | "proponer-voto" | "proponer-metagenesis" | "sin-permiso"; motivo: string } {
  // Si toca fuera de la molécula → proponer a MetaGenesis
  if (e.tocaFueraDeLaMolecula) {
    return {
      modo: "proponer-metagenesis",
      motivo: "Un átomo, un conversor o código del OS lo decide MetaGenesis",
    };
  }

  // Ámbitos personal o perfil → aceptar solo si es dueño
  if (e.ambito === "personal" || e.ambito === "perfil") {
    if (e.esDueno) {
      return { modo: "aceptar", motivo: "Es el dueño del ámbito personal/perfil" };
    } else {
      return {
        modo: "sin-permiso",
        motivo: "No es el dueño del ámbito personal/perfil",
      };
    }
  }

  // Ámbito grupo → decidir según decidirAplicacion
  if (e.ambito === "grupo") {
    const rango = rangoDeRol(e.rol ?? null);
    const democratico = e.democratico ?? false;
    const { modo, motivo } = decidirAplicacion(
      { tipo: "entidad", entidad: { tipo: "grupo", id: "", slug: "", nombre: "" } },
      rango,
      democratico
    );
    // Mapear los modos de decidirAplicacion a nuestros modos
    if (modo === "aplicar") {
      return { modo: "aceptar", motivo };
    } else if (modo === "proponer") {
      return { modo: "proponer-voto", motivo };
    } else {
      // modo: "sin-permiso"
      return { modo: "sin-permiso", motivo };
    }
  }

  // Ámbito pública → tratar como grupo
  if (e.ambito === "publica") {
    const rango = rangoDeRol(e.rol ?? null);
    const democratico = e.democratico ?? false;
    const { modo, motivo } = decidirAplicacion(
      { tipo: "entidad", entidad: { tipo: "grupo", id: "", slug: "", nombre: "" } },
      rango,
      democratico
    );
    if (modo === "aplicar") {
      return { modo: "aceptar", motivo };
    } else if (modo === "proponer") {
      return { modo: "proponer-voto", motivo };
    } else {
      return { modo: "sin-permiso", motivo };
    }
  }

  // Por defecto, sin permiso (no debería llegar aquí)
  return {
    modo: "sin-permiso",
    motivo: "Ámbito no reconocido",
  };
}

export function propuestaMetaGenesis(
  encargo: Encargo,
  falta: { tipo: "atomo" | "conversor" | "otro"; detalle: string }
): {
  id: string;
  titulo: string;
  archivos: string[];
  depende: string[];
  prompt: string;
} {
  // Crear un string estable a partir del encargo y la falta
  const estable =
    encargo.id +
    encargo.moleculaId +
    encargo.ambito +
    encargo.intencion +
    JSON.stringify(encargo.criterios) +
    JSON.stringify(encargo.autor) +
    encargo.origen +
    encargo.creadoEn +
    falta.tipo +
    falta.detalle;
  const hash8 = hashEstable(estable);
  const id = `PGM${hash8}`;

  // El prompt NO incluye la intención si el ámbito es 'personal'
  let prompt = "";
  if (encargo.ambito === "personal") {
    prompt = `Falta: ${falta.tipo} - ${falta.detalle}`;
  } else {
    prompt = `Intención: ${encargo.intencion}. Falta: ${falta.tipo} - ${falta.detalle}`;
  }

  return {
    id,
    titulo: `Propuesta MetaGenesis para ${encargo.intencion}`,
    archivos: [], // Los pone MetaGenesis
    depende: [],
    prompt,
  };
}