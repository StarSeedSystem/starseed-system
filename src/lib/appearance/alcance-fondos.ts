/**
 * alcance-fondos — alcance CON HERENCIA del fondo (Ola 1018F · FSH1018H · architecture/fondos-shaders.md §3):
 * cuenta › perfil › app › página › sección, y la entidad (grupo, página, comunidad, publicación, mensaje)
 * manda dentro de su vista. Lo más concreto gana. PURO: no toca localStorage, Supabase ni el contexto de
 * apariencia (que no se toca); quien llama resuelve sus mapas y pasa el set de cada ámbito.
 */
import type { SetFondo } from "./sets-fondo";

/** Los ámbitos del fondo: amplía `BackgroundScopeMode` (src/context/appearance-context, intocado)
 *  con app, sección y entidad. */
export type AmbitoFondo = "cuenta" | "perfil" | "app" | "pagina" | "seccion" | "entidad";

export interface ConfigFondo {
  /** El fondo de toda la cuenta (el de siempre). */
  cuenta?: SetFondo | null;
  /** Set por perfil: `perfilId` → set. */
  perfil?: Record<string, SetFondo>;
  /** Set por app: `appId` → set. */
  apps?: Record<string, SetFondo>;
  /** Set por ruta de página: `ruta` → set. Una ruta hija hereda por prefijo (la más larga gana). */
  paginas?: Record<string, SetFondo>;
  /** Set por sección dentro de la app o la página: `seccionId` → set. */
  secciones?: Record<string, SetFondo>;
  /** Set por entidad: id de la entidad (grupo, página, comunidad, publicación, mensaje) → set. */
  entidad?: Record<string, SetFondo>;
}

export interface ContextoFondo {
  perfilId?: string | null;
  appId?: string | null;
  ruta?: string | null;
  seccionId?: string | null;
  /** Id de la entidad que se ve (grupo, página, comunidad, publicación, mensaje): mientras su vista está activa, su set manda. */
  entidad?: string | null;
}

export type FondoResuelto = { set: SetFondo; de: AmbitoFondo } | { set: null; de: null };

/** Si `ruta` es la clave o una hija de ella (misma herencia por prefijo que el contexto de apariencia). */
export function paginaCoincide(ruta: string, clave: string): boolean {
  return ruta === clave || (clave !== "/" && ruta.startsWith(clave + "/"));
}

/** El set de página más concreto: el prefijo más largo que casa con la ruta. */
export function setDePagina(paginas: Record<string, SetFondo> | undefined, ruta: string): SetFondo | undefined {
  let ganadora: string | null = null;
  let mejor = -1;
  for (const clave of Object.keys(paginas ?? {})) {
    if (paginaCoincide(ruta, clave) && clave.length > mejor) {
      mejor = clave.length;
      ganadora = clave;
    }
  }
  return ganadora !== null ? paginas?.[ganadora] : undefined;
}

/**
 * Resuelve el fondo EFECTIVO para un contexto: de lo más general a lo más concreto
 * (cuenta → perfil → app → página → sección → entidad). Cada nivel solo pisa al
 * anterior si tiene set propio; la entidad, mientras se ve su vista, gana a todos.
 */
export function fondoEfectivo(config: ConfigFondo, contexto: ContextoFondo): FondoResuelto {
  let resuelto: { set: SetFondo; de: AmbitoFondo } | null = null;
  const toma = (candidato: SetFondo | undefined, ambito: AmbitoFondo): void => {
    if (candidato) resuelto = { set: candidato, de: ambito };
  };
  if (config.cuenta) toma(config.cuenta, "cuenta");
  if (contexto.perfilId) toma(config.perfil?.[contexto.perfilId], "perfil");
  if (contexto.appId) toma(config.apps?.[contexto.appId], "app");
  if (contexto.ruta) toma(setDePagina(config.paginas, contexto.ruta), "pagina");
  if (contexto.seccionId) toma(config.secciones?.[contexto.seccionId], "seccion");
  // La entidad manda dentro de su vista: último eslabón, nunca lo pisa nadie.
  if (contexto.entidad) toma(config.entidad?.[contexto.entidad], "entidad");
  return resuelto ?? { set: null, de: null };
}
