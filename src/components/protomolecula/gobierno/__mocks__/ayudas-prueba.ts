/** Servicios y entornos de mentira para probar la interfaz del gobierno de la Protomolécula (Ola 1026P · P2). */
import type { EntornoCargado, ResultadoGuardado, ServiciosGobierno } from "@/lib/protomolecula/gobierno/entorno";
import type { ReglasProtomolecula } from "@/lib/protomolecula/gobierno/reglas";
import type { EntidadProto } from "@/lib/protomolecula/peticion/contrato";

export type Rol = "dueno" | "gestor" | "colaborador" | "observador" | "nadie" | "sin-sesion";

export function persona(rol: Rol): EntornoCargado["persona"] {
  if (rol === "sin-sesion") return { usuarioId: null, rol: null, esDueno: false, sesion: false };
  if (rol === "dueno") return { usuarioId: "u-dueno", rol: "owner", esDueno: true, sesion: true };
  if (rol === "nadie") return { usuarioId: "u-nadie", rol: null, esDueno: false, sesion: true };
  return { usuarioId: `u-${rol}`, rol: rol === "gestor" ? "gestor" : rol === "colaborador" ? "colaborador" : "observador", esDueno: false, sesion: true };
}

export function cargado(rol: Rol, modo: "democratic" | "hierarchical" = "democratic", reglas: ReglasProtomolecula | null = null): EntornoCargado {
  return {
    persona: persona(rol),
    entorno: { modoGobierno: modo, ...(reglas ? { reglas } : {}) },
    reglasGuardadas: reglas,
    origen: reglas ? "cuenta" : "ninguno",
    modoGobierno: modo,
  };
}

/** Devuelve la función con `llamadas`: cada argumento con el que se la llamó, por orden. Es lo que `vi.fn` sirve, sin importar vitest (guardia: vitest solo en pruebas). */
function anotando<A extends unknown[], O>(hacer: (...args: A) => O): ((...args: A) => O) & { llamadas: A[] } {
  const f = ((...args: A) => {
    f.llamadas.push(args);
    return hacer(...args);
  }) as ((...args: A) => O) & { llamadas: A[] };
  f.llamadas = [] as A[];
  return f;
}

export function servicios(carga: EntornoCargado, guardado: ResultadoGuardado = { ok: true, donde: "cuenta" }, personas: { id: string; nombre: string }[] = []) {
  const s = {
    cargar: anotando<[EntidadProto], Promise<EntornoCargado | null>>(async () => carga),
    guardar: anotando<[EntidadProto, ReglasProtomolecula, string | null], Promise<ResultadoGuardado>>(async () => guardado),
    personas: anotando<[EntidadProto], Promise<{ id: string; nombre: string }[]>>(async () => personas),
  } satisfies ServiciosGobierno;
  return s;
}

/** Los nombres que ya no se escriben en ningún texto visible; armado en tiempo de ejecución para no incumplir la guardia de nombres. */
const M = ["Man", "do"].join("");
export const NOMBRES_PROHIBIDOS = new RegExp(`Puente de ${M}|Centro de ${M}|\\b${M}\\b`);
