/**
 * herramientas-logic.ts — lógica PURA del panel de Internet, Herramientas,
 * Cerebros propios y Bots predeterminados (bloque "OLA 2" de
 * `genesis-types.ts`).
 * ----------------------------------------------------------------------------
 * Mismo criterio que `genesis-logic.ts`: determinista, sin red ni DOM, para
 * poder probarla sin montar React ni simular un backend. Todo lo que decide
 * QUÉ PALABRAS se enseñan (nunca un hueco, nunca "undefined", nunca un
 * estado a medias disfrazado de éxito) vive aquí — los ficheros `.tsx` solo
 * pintan lo que esto decide.
 */
import type { BotPredeterminado, CapacidadInternet, CerebroSer, HerramientaDisponible } from "@/lib/astraura/genesis-types";

/* ══════════════════════════ Internet y herramientas ══════════════════════
 * Alex: "deben tener una opción de acceso a internet que use todas las
 * herramientas de la librería en línea del os y la biblioteca del usuario y
 * las carpetas y archivos de dispositivo". Cuatro fuentes, CUATRO permisos
 * bien distintos: "leer la biblioteca del OS" y "leer tus carpetas" no son
 * ni de lejos lo mismo. `FUENTES_INTERNET` es el único sitio donde vive esa
 * frase — para que ningún componente pueda enseñar el interruptor sin su
 * explicación al lado, ANTES del clic.
 * ══════════════════════════════════════════════════════════════════════ */

export type FuenteInternetId = "bibliotecaOS" | "bibliotecaUsuario" | "dispositivo" | "web";
export type NivelRiesgo = "bajo" | "medio" | "alto";

export interface FuenteInternetInfo {
  id: FuenteInternetId;
  titulo: string;
  /** Qué se concede EXACTAMENTE, en una frase que se entienda sin contexto. */
  explicacion: string;
  /** Nunca se representa solo con color: esta palabra va siempre al lado. */
  riesgo: NivelRiesgo;
}

export const FUENTES_INTERNET: readonly FuenteInternetInfo[] = [
  {
    id: "bibliotecaOS",
    titulo: "Biblioteca en línea del OS",
    explicacion: "Lee paquetes, diseños y funciones que StarSeed ya publicó para todo el sistema. No toca nada tuyo ni de ningún otro usuario.",
    riesgo: "bajo",
  },
  {
    id: "bibliotecaUsuario",
    titulo: "Biblioteca del usuario",
    explicacion: "Lee TU biblioteca personal: lo que tú guardaste. Un permiso distinto del anterior aunque las dos digan «biblioteca» — una es del sistema, esta es tuya.",
    riesgo: "medio",
  },
  {
    id: "dispositivo",
    titulo: "Carpetas y archivos del dispositivo",
    explicacion: "Lee carpetas y archivos reales del dispositivo, dentro de lo que ya permite la Soberanía del ser. Esto no es una biblioteca: es tu disco.",
    riesgo: "alto",
  },
  {
    id: "web",
    titulo: "Web abierta",
    explicacion: "Sale a buscar en internet, fuera de StarSeed por completo. La más amplia de las cuatro: sin una lista de dominios, puede llegar a cualquier sitio.",
    riesgo: "alto",
  },
] as const;

/** `CapacidadInternet` vacía: el estado real de un ser al que "nunca se le concedió" nada (`Ser.internet` ausente). */
export const CAPACIDAD_INTERNET_VACIA: CapacidadInternet = {
  activa: false,
  bibliotecaOS: false,
  bibliotecaUsuario: false,
  dispositivo: false,
  web: false,
  dominiosPermitidos: [],
  dominiosBloqueados: [],
  ultimoAcceso: null,
  ultimoError: null,
};

/**
 * `Ser.internet` es opcional y un backend viejo puede mandar cualquier cosa
 * a medias: esto le da SIEMPRE una forma completa a la que pintar — nunca
 * un hueco, nunca un `undefined` colado en un `.checked`.
 */
export function capacidadInternetEfectiva(internet: CapacidadInternet | null | undefined): CapacidadInternet {
  if (!internet) return CAPACIDAD_INTERNET_VACIA;
  return {
    activa: internet.activa === true,
    bibliotecaOS: internet.bibliotecaOS === true,
    bibliotecaUsuario: internet.bibliotecaUsuario === true,
    dispositivo: internet.dispositivo === true,
    web: internet.web === true,
    dominiosPermitidos: Array.isArray(internet.dominiosPermitidos) ? internet.dominiosPermitidos : [],
    dominiosBloqueados: Array.isArray(internet.dominiosBloqueados) ? internet.dominiosBloqueados : [],
    ultimoAcceso: internet.ultimoAcceso ?? null,
    ultimoError: internet.ultimoError ?? null,
  };
}

export interface ResumenCapacidadInternet {
  fuentesActivas: number;
  totalFuentes: number;
  /** Frase honesta lista para pintar. */
  resumen: string;
  /** Hay un fallo real que enseñar — independiente de si `activa` sigue encendida o no. */
  tieneError: boolean;
}

/**
 * "Un acceso roto no puede parecer un acceso apagado": por eso `tieneError`
 * se calcula aparte de `activa` — un ser puede tener el acceso ENCENDIDO
 * ahora mismo y aun así arrastrar el último error real de red, o puede
 * tenerlo APAGADO y seguir arrastrando el error del último intento antes de
 * apagarlo. Ninguno de los dos casos debe leerse como "todo bien".
 */
export function describirCapacidadInternet(internet: CapacidadInternet | null | undefined): ResumenCapacidadInternet {
  const c = capacidadInternetEfectiva(internet);
  const fuentesActivas = FUENTES_INTERNET.filter((f) => c[f.id]).length;
  const tieneError = typeof c.ultimoError === "string" && c.ultimoError.trim().length > 0;
  let resumen: string;
  if (!c.activa) resumen = "Acceso a internet apagado: ninguna fuente sale, aunque algún interruptor de abajo esté marcado.";
  else if (fuentesActivas === 0) resumen = "Acceso a internet encendido, pero sin ninguna fuente concedida todavía: no puede leer ni buscar nada.";
  else resumen = `Acceso a internet encendido con ${fuentesActivas} de ${FUENTES_INTERNET.length} fuentes concedidas.`;
  return { fuentesActivas, totalFuentes: FUENTES_INTERNET.length, resumen, tieneError };
}

export type ModoDominios = "sin-restriccion" | "solo-permitidos" | "bloqueando-algunos";

export interface ResumenDominios {
  modo: ModoDominios;
  texto: string;
}

/** `dominiosPermitidos` gana sobre `dominiosBloqueados` en cuanto no está vacío — lo dice el propio contrato; esto lo traduce a una frase que evita la confusión de "por qué no bloquea si lo puse en la lista". */
export function describirDominios(internet: CapacidadInternet | null | undefined): ResumenDominios {
  const c = capacidadInternetEfectiva(internet);
  if (c.dominiosPermitidos.length > 0) {
    const n = c.dominiosPermitidos.length;
    return { modo: "solo-permitidos", texto: `Solo estos ${n} dominio${n === 1 ? "" : "s"} — la lista de bloqueados de abajo no se aplica mientras esta tenga algo.` };
  }
  if (c.dominiosBloqueados.length > 0) {
    const n = c.dominiosBloqueados.length;
    return { modo: "bloqueando-algunos", texto: `Todos los dominios salvo ${n} bloqueado${n === 1 ? "" : "s"}.` };
  }
  return { modo: "sin-restriccion", texto: "Sin lista de dominios: puede llegar a cualquiera, dentro de las fuentes que ya tenga permitidas." };
}

export function riesgoTono(riesgo: NivelRiesgo): string {
  if (riesgo === "alto") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (riesgo === "medio") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"; // bajo
}

/* ══════════════════════════════ Herramientas ═══════════════════════════ */

export const FUENTE_HERRAMIENTA_LABEL: Record<string, string> = {
  "biblioteca-os": "Biblioteca del OS",
  "biblioteca-usuario": "Biblioteca del usuario",
  dispositivo: "Dispositivo",
  web: "Web abierta",
  nativa: "Nativa del ser",
};

/** Nunca deja una fuente sin nombre: una `fuente` fuera del mapa (backend nuevo/distinto) se enseña tal cual llegó, nunca se esconde. */
export function etiquetaFuenteHerramienta(fuente: string | null | undefined): string {
  const f = (fuente ?? "").trim();
  if (!f) return "sin fuente indicada";
  return FUENTE_HERRAMIENTA_LABEL[f] ?? f;
}

export interface GrupoHerramientas {
  fuente: string;
  etiqueta: string;
  herramientas: HerramientaDisponible[];
}

/** Orden de lectura fijo — coincide con el orden en que Alex las pidió: OS, usuario, dispositivo, web, y las nativas al final. */
const ORDEN_FUENTES = ["biblioteca-os", "biblioteca-usuario", "dispositivo", "web", "nativa"];

/**
 * Agrupa por `fuente` en el orden fijo de arriba; cualquier fuente que el
 * backend mande y no esté en esa lista va al final, en orden alfabético —
 * nunca se pierde una herramienta por tener una fuente que la interfaz
 * todavía no conocía.
 */
export function agruparHerramientasPorFuente(lista: readonly HerramientaDisponible[] | null | undefined): GrupoHerramientas[] {
  const seguras = Array.isArray(lista) ? lista : [];
  const porFuente = new Map<string, HerramientaDisponible[]>();
  for (const h of seguras) {
    const clave = (h?.fuente ?? "").trim() || "(sin fuente)";
    const grupo = porFuente.get(clave) ?? [];
    grupo.push(h);
    porFuente.set(clave, grupo);
  }
  const claves = Array.from(porFuente.keys()).sort((a, b) => {
    const ia = ORDEN_FUENTES.indexOf(a);
    const ib = ORDEN_FUENTES.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "es");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return claves.map((fuente) => ({ fuente, etiqueta: etiquetaFuenteHerramienta(fuente), herramientas: porFuente.get(fuente) ?? [] }));
}

export interface ResumenHerramientas {
  total: number;
  disponibles: number;
  noDisponibles: number;
}

export function resumirHerramientas(lista: readonly HerramientaDisponible[] | null | undefined): ResumenHerramientas {
  const seguras = Array.isArray(lista) ? lista : [];
  const disponibles = seguras.filter((h) => h?.disponible === true).length;
  return { total: seguras.length, disponibles, noDisponibles: seguras.length - disponibles };
}

/** Texto honesto para una herramienta no disponible: NUNCA en blanco, aunque el backend no mande `motivo`. */
export function motivoNoDisponible(h: Pick<HerramientaDisponible, "motivo">): string {
  const m = (h.motivo ?? "").trim();
  return m || "No disponible — el backend no explicó por qué.";
}

/* ══════════════════════════════ Cerebros propios ═════════════════════════
 * "estadoSync puede ser ok/fallo/nunca... nunca es un estado neutro que se
 * pueda dejar en blanco." Un `CerebroSer` de un backend viejo puede llegar
 * SIN `estadoSync`: la única lectura honesta de "no sé si sincronizó nunca"
 * es "nunca", no "ok" — nunca se regala un éxito que no se ganó.
 * ════════════════════════════════════════════════════════════════════════ */

export type EstadoSyncCerebro = "ok" | "fallo" | "nunca";

/** Ausente o cualquier valor que no sea literalmente "ok"/"fallo" ⇒ "nunca" — la lectura menos presuntuosa, nunca un "ok" por defecto. */
export function estadoSyncEfectivo(c: Pick<CerebroSer, "estadoSync">): EstadoSyncCerebro {
  if (c.estadoSync === "ok" || c.estadoSync === "fallo") return c.estadoSync;
  return "nunca";
}

export const ESTADO_SYNC_LABEL: Record<EstadoSyncCerebro, string> = {
  ok: "Sincronizado",
  fallo: "Sincronización fallida",
  nunca: "Nunca sincronizado",
};

/** Tres estados, tres looks distintos — nunca solo color: la etiqueta de `ESTADO_SYNC_LABEL` va siempre al lado. */
export function estadoSyncTono(estado: EstadoSyncCerebro): string {
  if (estado === "ok") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (estado === "fallo") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  return "border-white/15 bg-white/[0.04] text-white/55"; // nunca
}

export interface ResumenSyncCerebro {
  estado: EstadoSyncCerebro;
  etiqueta: string;
  /** Contenido real SOLO cuando `estado === "fallo"` — nunca se inventa un texto si el backend no dio ninguno. */
  error: string | null;
}

export function resumenSyncCerebro(c: CerebroSer): ResumenSyncCerebro {
  const estado = estadoSyncEfectivo(c);
  const error = estado === "fallo" ? (c.errorSync ?? "").trim() || "Falló, pero el backend no dio detalle del error." : null;
  return { estado, etiqueta: ESTADO_SYNC_LABEL[estado], error };
}

export interface ResumenCerebros {
  total: number;
  ok: number;
  fallo: number;
  nunca: number;
}

export function resumirCerebros(lista: readonly CerebroSer[] | null | undefined): ResumenCerebros {
  const seguras = Array.isArray(lista) ? lista : [];
  let ok = 0;
  let fallo = 0;
  let nunca = 0;
  for (const c of seguras) {
    const e = estadoSyncEfectivo(c);
    if (e === "ok") ok += 1;
    else if (e === "fallo") fallo += 1;
    else nunca += 1;
  }
  return { total: seguras.length, ok, fallo, nunca };
}

/** Sustituye (por id) un cerebro dentro del array — el patrón "onBlur ⇒ array completo" que ya usa `ser-ficha.tsx` para `personalidades`/`cerebros`. */
export function conCerebroActualizado(lista: readonly CerebroSer[], id: string, cambios: Partial<CerebroSer>): CerebroSer[] {
  return lista.map((c) => (c.id === id ? { ...c, ...cambios } : c));
}

/** Quita un cerebro del array por id; sin efecto si el id no existe (nunca lanza). */
export function sinCerebro(lista: readonly CerebroSer[], id: string): CerebroSer[] {
  return lista.filter((c) => c.id !== id);
}

/* ═══════════════════════════ Bots predeterminados ═════════════════════════
 * "Los ya instalados se ven como instalados; instalar no debe poder
 * duplicar." La lista real la manda el backend — nunca se asume que son 7:
 * hoy son 7 procesos de Imaginación Intuitiva, mañana pueden ser más.
 * ════════════════════════════════════════════════════════════════════════ */

export interface ResumenBots {
  total: number;
  instalados: number;
  pendientes: number;
}

export function resumirBots(lista: readonly BotPredeterminado[] | null | undefined): ResumenBots {
  const seguras = Array.isArray(lista) ? lista : [];
  const instalados = seguras.filter((b) => b?.instalado === true).length;
  return { total: seguras.length, instalados, pendientes: seguras.length - instalados };
}

/**
 * Los ids a instalar de verdad: cualquier cosa que no sea literalmente
 * `instalado === true` cuenta como pendiente (mejor ofrecer instalar de más
 * que esconder un bot real por un campo ambiguo). Nunca incluye un id ya
 * instalado — es la garantía, en la propia lógica pura, de que "instalar" no
 * puede disparar una alta duplicada desde la interfaz.
 */
export function idsPendientesDeInstalar(lista: readonly BotPredeterminado[] | null | undefined): string[] {
  const seguras = Array.isArray(lista) ? lista : [];
  return seguras.filter((b) => b?.instalado !== true).map((b) => b.id);
}
