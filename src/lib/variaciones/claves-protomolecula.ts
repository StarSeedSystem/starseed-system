/**
 * Variaciones públicas · claves de la Protomolécula y su validación. Una clave
 * canónica `<familia>:<id>` nombra el TIPO de elemento (todas las personas
 * comparten `atomo:video-html`), nunca la instancia ni dato privado. La
 * validación va contra `catalogo-herramientas.ts` (herramientas) y
 * `registro-atomos.ts` (átomos): si la pieza no está registrada, no hay clave.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`. Sin DOM aquí: los atributos
 * que prepara `atributosClave` los pone cada componente.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import { herramientaPorId } from "@/lib/protomolecula/catalogo-herramientas";
import { obtenerAtomo, listarAtomos } from "@/lib/protomolecula/registro-atomos";
import { leerClave, type ClaveElemento } from "./clave-elemento";

export function claveDeHerramienta(id: string): ClaveElemento | null {
  if (!id) return null;
  // Solo el catálogo dice si esa herramienta existe; un id inventado no lleva clave.
  const herramienta = herramientaPorId(id);
  if (!herramienta) return null;
  return `herramienta:${id}`;
}

/** Toca escribir el cuerpo de `claveDeAtomo`. */
export function claveDeAtomo(id: string): ClaveElemento | null {
  if (!id) return null;
  // El registro de átomos se consulta por `herramientaId`: un átomo solo
  // existe si su herramienta declaró la definición.
  const atomo = obtenerAtomo(id);
  if (!atomo) return null;
  return `atomo:${id}`;
}

/**
 * Clave de una molécula. La molécula se nombra por la pieza registrada que la
 * sostiene: la herramienta del catálogo o el átomo del registro con ese id.
 * Sin pieza registrada no hay clave (y nunca viaja el id de la instancia),
 * porque la clave pública es compartida por todas las personas.
 */
export function claveDeMolecula(id: string): ClaveElemento | null {
  if (!id) return null;
  if (!herramientaPorId(id) && !obtenerAtomo(id)) return null;
  return `molecula:${id}`;
}

/**
 * Clave del átomo de la interfaz por su nombre visible. La UI agrupa por
 * nombre (`c.atomo` = título o nombre de la definición); el registro vive por
 * `herramientaId`, así que se busca la definición cuyo nombre coincida y se
 * devuelve la clave por su id de herramienta. Si el nombre ES ya un
 * manda. Sin coincidencia devuelve null (la sección va sin clave; degrada
 * en silencio, sin inventar claves).
 */
export function claveDeAtomoPorNombre(nombre: string): ClaveElemento | null {
  if (!nombre) return null;
  if (obtenerAtomo(nombre)) return claveDeAtomo(nombre);
  const def = listarAtomos().find((d) => d.nombre === nombre);
  return def ? claveDeAtomo(def.herramientaId) : null;
}

/**
 * Atributos DOM para una clave: `{ "data-ss-elemento": <clave> }`. Devuelve
 * SIEMPRE un objeto — vacío si la clave no llega o su formato falla
 * (`leerClave`)— para poder expandirlo en JSX sin guardas: `<section
 * {...atributosClave(clave)} />`.
 */
export function atributosClave(clave: string | null | undefined): Record<string, string> {
  if (!clave) return {};
  if (!leerClave(clave)) return {};
  return { "data-ss-elemento": clave };
}
