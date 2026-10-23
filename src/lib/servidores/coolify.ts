/**
 * Servidores · Cliente COOLIFY en SOLO LECTURA (Ola 1020U · tarea CLF1020A). Solo las rutas verificadas el
 * 2026-10-20 en la referencia de Coolify: `GET {url}/api/v1/teams/current` (sonda: de qué equipo es el token)
 * y `GET {url}/api/v1/servers`. Autenticación `Authorization: Bearer <token>` con el valor entero tal cual
 * (id|secreto), leído en el medio que llama por el NOMBRE de la variable de entorno: jamás claves en el código,
 * en un error ni en un registro. `fetch` y el reloj INYECTADOS, `redirect: "manual"` (un 3xx no saca la llamada
 * de la instancia) y tope de tiempo. NADA de desplegar, arrancar ni parar: esas rutas aún no están verificadas,
 * y lo no verificado se dice como tal (dentro cuando se comprueben en la referencia de la API).
 */
/** Credenciales de una instancia: `url` de la instancia y `token` del valor entero (id|secreto) solo en memoria. */
export interface CredencialesCoolify { url: string; token: string }

export interface PeticionCoolify { method: "GET"; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }
export interface RespuestaCoolifyFetch { ok: boolean; status: number; headers: { get(nombre: string): string | null }; text(): Promise<string> }
export type FetchCoolify = (url: string, init: PeticionCoolify) => Promise<RespuestaCoolifyFetch>
export interface RelojCoolify { ahora(): number; tras(ms: number): { promesa: Promise<void>; cancelar(): void } }
/** `registrar` recibe una línea que JAMÁS contiene el token. */
export interface OpcionesCoolify { reloj?: RelojCoolify; registrar?: (linea: string) => void }

/** Equipo al que pertenece el token; cada campo que no venga queda `null` («sin dato»). */
export interface EquipoCoolify { id: number | string | null; nombre: string | null; descripcion: string | null }
/** Servidor del equipo, con lo que la API enviara; lo ausente queda `null` («sin dato»). */
export interface ServidorCoolify { id: number | string | null; uuid: string | null; nombre: string | null; ip: string | null; descripcion: string | null;
  esProxy: boolean | null; esLocalhost: boolean | null; equipoId: number | string | null }

export type FalloCoolify = "credenciales" | "tiempo" | "red" | "http" | "datos";
export type ResultadoCoolify<T> =
  | { ok: true; estado: number; datos: T; ms: number }
  | { ok: false; fallo: FalloCoolify; motivo: string; estado: number | null; ms: number };

export const TIEMPO_MS = 15_000;
const TIEMPO_SONDEO_MS = 6_000;

export const RELOJ: RelojCoolify = { ahora: () => Date.now(), tras: (ms) => { let id: ReturnType<typeof setTimeout> | undefined;
  return { promesa: new Promise<void>((r) => (id = setTimeout(r, ms))), cancelar: () => clearTimeout(id) }; } };

/** Motivo en español si las credenciales no valen; `null` si valen. Nunca repite el valor del token. */
export function validarCredenciales(c: CredencialesCoolify): string | null {
  let base: URL;
  try { base = new URL(c.url); } catch { return "La URL de la instancia no es una URL válida."; }
  if (base.protocol !== "http:" && base.protocol !== "https:") return "La URL de la instancia debe empezar por http(s).";
  if (!base.hostname) return "La URL de la instancia no tiene un servidor (dominio o IP).";
  if (base.username || base.password) return "La URL no debe llevar usuario ni clave: el token va aparte, entero (id|secreto), en su variable de entorno.";
  if (!c.token) return "Falta el token de la integración: léelo en el medio que llama por el NOMBRE de su variable de entorno.";
  return null;
}

const OBJETO = (x: unknown): x is Record<string, unknown> => (typeof x === "object" && x !== null && !Array.isArray(x));
const TEXTO = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const NUMID = (x: unknown): number | string | null =>
  ((typeof x === "number" && Number.isFinite(x)) ? x : (typeof x === "string" && x.trim() ? x : null));

/** Traduce el motivo de cada estado, tal como se comprobó el 2026-10-20 en la referencia. */
const MOTIVO_ESTADO: Readonly<Record<number, string>> = Object.freeze({
  401: "Token inválido: comprueba el valor entero id|secreto de la integración.",
  403: "Sin permiso o tu IP no está en la lista permitida: un administrador debe añadirla.",
  404: "Un administrador debe encender la API de Coolify.",
});

type Llamado = { ok: true; estado: number; datos: unknown; ms: number } | Extract<ResultadoCoolify<unknown>, { ok: false }>;

async function pedir(c: CredencialesCoolify, ruta: string, f: FetchCoolify, o: OpcionesCoolify, tiempoMs: number): Promise<Llamado> {
  const reloj = o.reloj ?? RELOJ, t0 = reloj.ahora();
  const tapar = (s: string) => (c.token ? s.split(c.token).join("•••") : s);
  const fallo = (falloTipo: FalloCoolify, motivo: string, estado: number | null): Llamado => {
    o.registrar?.(tapar(`${ruta} · ${estado ?? "—"} · ${falloTipo}: ${motivo}`));
    return { ok: false, fallo: falloTipo, motivo: tapar(motivo), estado, ms: reloj.ahora() - t0 };
  };
  const malo = validarCredenciales(c);
  if (malo) return fallo("credenciales", malo, null);
  const base = new URL(c.url);
  const prefijo = base.pathname === "/" ? "" : base.pathname.replace(/\/+$/, "");
  const url = new URL(base.origin + prefijo + ruta);
  const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${c.token}` };
  const ctl = new AbortController(), plazo = reloj.tras(tiempoMs);
  const tiempo = plazo.promesa.then(() => { ctl.abort(); return "tiempo" as const; });
  try {
    const r = await Promise.race([f(url.toString(), { method: "GET", headers, redirect: "manual", signal: ctl.signal }), tiempo]);
    if (r === "tiempo") return fallo("tiempo", `La instancia no respondió en ${tiempoMs / 1000} s.`, null);
    const estado = r.status;
    const predefinido = MOTIVO_ESTADO[estado];
    if (predefinido) return fallo("http", predefinido, estado);
    const leido = await Promise.race([r.text(), tiempo]);
    if (leido === "tiempo") return fallo("tiempo", `La instancia no terminó de responder en ${tiempoMs / 1000} s.`, estado);
    if (estado < 200 || estado >= 300) return fallo("http", `La instancia respondió ${estado}: ${tapar(leido).slice(0, 160)}`, estado);
    let datos: unknown;
    try { datos = JSON.parse(leido); } catch { return fallo("datos", "La respuesta no es JSON válido (¿es la instancia de Coolify correcta?).", estado); }
    o.registrar?.(tapar(`${ruta} · ${estado} · ok en ${reloj.ahora() - t0} ms`));
    return { ok: true, estado, datos, ms: reloj.ahora() - t0 };
  } catch {
    return ctl.signal.aborted ? fallo("tiempo", `La instancia no respondió en ${tiempoMs / 1000} s.`, null)
      : fallo("red", "La instancia no contesta (¿está apagado el panel o caído el túnel?).", null);
  } finally { plazo.cancelar(); }
}

/** Sonda verificada el 2026-10-20: `GET /api/v1/teams/current` dice de qué equipo es el token. */
export async function sondear(c: CredencialesCoolify, f: FetchCoolify, o: OpcionesCoolify = {}): Promise<ResultadoCoolify<EquipoCoolify>> {
  const r = await pedir(c, "/api/v1/teams/current", f, o, TIEMPO_SONDEO_MS);
  if (!r.ok) return r;
  if (!OBJETO(r.datos)) return { ok: false, fallo: "datos", motivo: "La sonda no devolvió el equipo del token (¿otra instancia?).", estado: r.estado, ms: r.ms };
  const d = r.datos;
  return { ok: true, estado: r.estado, ms: r.ms, datos: { id: NUMID(d.id), nombre: TEXTO(d.name ?? d.nombre), descripcion: TEXTO(d.description ?? d.descripcion) } };
}

/** Verificada el 2026-10-20: `GET /api/v1/servers`; mapea solo lo que venga, lo que falte es «sin dato». */
export async function listarServidores(c: CredencialesCoolify, f: FetchCoolify, o: OpcionesCoolify = {}): Promise<ResultadoCoolify<ServidorCoolify[]>> {
  const r = await pedir(c, "/api/v1/servers", f, o, TIEMPO_MS);
  if (!r.ok) return r;
  if (!Array.isArray(r.datos)) return { ok: false, fallo: "datos", motivo: "La respuesta no trae la lista de servidores (¿API distinta a la verificada?).", estado: r.estado, ms: r.ms };
  return { ok: true, estado: r.estado, ms: r.ms, datos: r.datos.filter(OBJETO).map(mapearServidor) };
}

function mapearServidor(d: Record<string, unknown>): ServidorCoolify {
  const BOOL = (x: unknown): boolean | null => ((typeof x === "boolean") ? x : null);
  return {
    id: NUMID(d.id), uuid: TEXTO(d.uuid), nombre: TEXTO(d.name ?? d.nombre), ip: TEXTO(d.ip),
    descripcion: TEXTO(d.description ?? d.descripcion), esProxy: BOOL(d.is_proxy), esLocalhost: BOOL(d.is_localhost),
    equipoId: NUMID(d.team_id),};
}
