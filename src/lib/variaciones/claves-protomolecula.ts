// src/lib/variaciones/claves-protomolecula.ts
/**
 * Protomolécula · claves «Variaciones públicas» del lienzo y del panel.
 *
 * Los componentes del lienzo universal y de la Protomolécula llevan en el DOM su
 * clave canónica (`data-ss-elemento`) para que el clic derecho abra las variaciones
 * públicas de ese elemento. La clave nombra el TIPO de elemento — todas las personas
 * comparten `herramienta:photocraft` — nunca la instancia ni datos privados.
 *
 * Contrato: architecture/variaciones-publicas.md §2 (clave común) y §5 (familia
 * Protomolécula: herramientas, átomos y moléculas). Nada se pone en el DOM sin
 * validar: cada generador comprueba la existencia del elemento en su registro.
 */
import type { ClaveElemento } from "./clave-elemento";
import { leerClave } from "./clave-elemento";
import { CATALOGO_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";

/** Clave de una herramienta de la Protomolécula */
export function claveDeHerramienta(id: string): ClaveElemento | null {
  const limpia = id.trim();
  if (!limpia || !CATALOGO_PROTOMOLECULA.some((h) => h.id === limpia)) return null;
  return leerClave(`herramienta:${limpia}`);
}

/** Clave de un átomo de la Protomolécula */
export function claveDeAtomo(id: string): ClaveElemento | null {
  const limpia = id.trim();
  if (!limpia || !obtenerAtomo(limpia)) return null;
  return leerClave(`atomo:${limpia}`);
}

/** Clave de una molécula: un id válido debe existir como herramienta o como átomo */
export function claveDeMolecula(id: string): ClaveElemento | null {
  const limpia = id.trim();
  if (!limpia) return null;
  const existe =
    CATALOGO_PROTOMOLECULA.some((h) => h.id === limpia) || !!obtenerAtomo(limpia);
  if (!existe) return null;
  return leerClave(`molecula:${limpia}`);
}

/** Atributos DOM que los componentes colocan con la clave de un elemento */
export function atributosClave(clave: ClaveElemento | null): Record<string, string> | null {
  const valida = clave === null ? null : leerClave(clave);
  if (!valida) return null;
  return { "data-ss-elemento": valida };
}
