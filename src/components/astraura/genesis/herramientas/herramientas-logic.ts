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
import type {
  BotPredeterminado, CapacidadInternet, CerebroSer, HerramientaDisponible,
  PaqueteBibliotecaUsuario, ResultadoSincronizacion, Ser, ViaSincronizacion,
} from "@/lib/astraura/genesis-types";

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

/* ══════════════════════ Cierre de deudas: biblioteca del usuario ══════════
 * "Hoy GET /api/genesis/herramientas marca la biblioteca del usuario como
 * no disponible, y es honesto: vive en localStorage y desde el backend no
 * hay forma de leerla." Esto deja de ser cierto en cuanto el OS deposita —
 * lo de aquí es la traducción PURA de paquetes reales a lo mínimo que el
 * backend pide, y el vocabulario de estado del propio depósito. Leer la
 * biblioteca de verdad (localStorage) es cosa de `herramientas-lista.tsx`.
 * ════════════════════════════════════════════════════════════════════════ */

/** Fases honestas del depósito — nunca un booleano suelto que no dice ni cuántos ni cuándo. */
export type EstadoDeposito =
  | { fase: "inactivo" }
  | { fase: "vacio" }
  | { fase: "depositando" }
  | { fase: "ok"; recibidos: number; descartados: number; en: number }
  | { fase: "error"; error: string; en: number };

/**
 * Traduce paquetes reales de la biblioteca (`LibraryPackage`, de
 * `@/lib/library/packages` — aceptado aquí por estructura, no por import: un
 * `LibraryPackage` real encaja sin problema, y así esta función sigue
 * siendo trivial de testear con literales sueltos) al cuerpo mínimo que el
 * backend espera — nunca el `payload`/`tags`/versión completos, que no le
 * hacen falta y son más superficie que exponer. Pura: no lee `localStorage`,
 * solo transforma lo que ya se le entrega. Descarta silenciosamente
 * cualquier entrada sin `id`/`name` reales — nunca manda un paquete que no
 * podría depositarse.
 */
export function paquetesDeLibreria(
  libs: readonly { id: string; kind?: string | null; name: string; description?: string | null }[] | null | undefined,
): PaqueteBibliotecaUsuario[] {
  const seguros = Array.isArray(libs) ? libs : [];
  return seguros
    .filter((p) => typeof p?.id === "string" && p.id.trim().length > 0 && typeof p?.name === "string" && p.name.trim().length > 0)
    .map((p) => ({
      id: p.id,
      kind: p.kind || undefined,
      name: p.name,
      description: (p.description ?? "").trim() || undefined,
    }));
}

/**
 * Huella de contenido estable — para no volver a depositar EXACTAMENTE lo
 * mismo cuando `subscribeLibrary` dispara por un cambio ajeno a "mine"
 * (instalar algo del catálogo del OS también toca `starseed.library.*` y
 * dispararía el mismo evento). No es criptográfica: solo hace falta que dos
 * listas distintas casi siempre den huellas distintas.
 */
export function huellaPaquetes(paquetes: readonly PaqueteBibliotecaUsuario[]): string {
  return JSON.stringify(paquetes.map((p) => [p.id, p.kind ?? "", p.name, p.description ?? ""]));
}

/** Frase honesta del estado del depósito — SIN fecha (el componente la añade con `fmtTs`/`fmtAgo`, igual que el resto del OS). */
export function describirDeposito(estado: EstadoDeposito): string {
  if (estado.fase === "inactivo") return "";
  if (estado.fase === "vacio") return "Tu biblioteca no tiene paquetes propios todavía: nada que depositar.";
  if (estado.fase === "depositando") return "Depositando tu biblioteca en el backend…";
  if (estado.fase === "error") return `No se pudo depositar tu biblioteca: ${estado.error}`;
  const desc = estado.descartados > 0 ? `, ${estado.descartados} descartado${estado.descartados === 1 ? "" : "s"}` : "";
  return `Biblioteca depositada: ${estado.recibidos} paquete${estado.recibidos === 1 ? "" : "s"} recibido${estado.recibidos === 1 ? "" : "s"}${desc}.`;
}

/* ══════════════════════ Cierre de deudas: sincronizar cerebros ════════════
 * "El resultado real de un «sincronizar ahora» puede ser: éxito por
 * Supabase, con R2 fallando por detrás. Enséñalo tal cual — qué vía
 * funcionó y cuál no. Un check verde a secas escondería que la mitad del
 * mecanismo está rota." Esta sección construye ese desglose de forma seria
 * (nunca revienta con una forma inesperada del backend) y sin adivinar.
 * ════════════════════════════════════════════════════════════════════════ */

/** Cualquier `vias` que no sea un array usable ⇒ ninguna — nunca revienta un `.map()`; cada entrada se sanea por su cuenta. */
export function viasSeguras(vias: readonly ViaSincronizacion[] | null | undefined): ViaSincronizacion[] {
  if (!Array.isArray(vias)) return [];
  return vias.map((v) => ({
    medio: typeof v?.medio === "string" && v.medio.trim() ? v.medio.trim() : "medio sin nombre",
    ok: v?.ok === true,
    error: typeof v?.error === "string" && v.error.trim() ? v.error : null,
  }));
}

export interface ResumenVias {
  vias: ViaSincronizacion[];
  /** Cuántas vías de verdad funcionaron. */
  okCount: number;
  /** Al menos una vía falló — independiente de si el resultado GLOBAL es `ok` (el caso de hoy: Supabase salva, R2 sigue roto). */
  algunaFalla: boolean;
  /** Frase honesta lista para pintar, ej. "supabase ok · r2 con fallo". Vacía si no hay vías que desglosar. */
  texto: string;
}

export function resumirVias(vias: readonly ViaSincronizacion[] | null | undefined): ResumenVias {
  const seguras = viasSeguras(vias);
  const okCount = seguras.filter((v) => v.ok).length;
  const algunaFalla = seguras.some((v) => !v.ok);
  const texto = seguras.map((v) => `${v.medio} ${v.ok ? "ok" : "con fallo"}`).join(" · ");
  return { vias: seguras, okCount, algunaFalla, texto };
}

/** Nunca deja `cerebrosPropios` como `undefined`/forma rara tras una respuesta del backend: siempre un array usable. */
export function cerebrosPropiosSeguros(ser: Pick<Ser, "cerebrosPropios"> | null | undefined): CerebroSer[] {
  return Array.isArray(ser?.cerebrosPropios) ? (ser.cerebrosPropios as CerebroSer[]) : [];
}

/** Resumen de un `ResultadoSincronizacion` global (el de "todos"), con el mismo desglose por vía que un cerebro individual. */
export interface ResumenResultadoGlobal {
  vias: ResumenVias;
  cerebrosTocados: number;
  en: number;
}

export function resumirResultadoGlobal(r: ResultadoSincronizacion): ResumenResultadoGlobal {
  return { vias: resumirVias(r.vias), cerebrosTocados: Number.isFinite(r.cerebrosTocados) ? r.cerebrosTocados : 0, en: r.en };
}
