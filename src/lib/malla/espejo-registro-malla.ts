/**
 * espejo-registro-malla — BAP1127D · el espejo del registro del enlace por CUALQUIER transporte, solo hacia la dirección.
 * Generaliza el espejo del Bluetooth (registro-enlace-ble.ts) al transporte universal. Emite solo si «Diagnóstico de pruebas»
 * está encendido y solo al par con rol «director»; recibe solo si «Recibir diagnóstico (dirección)» está encendido.
 * Núcleo puro arriba; los efectos (localStorage, nativo, timer) abajo. Nada por Supabase.
 */
import { acotarBytes, colapsarRepetidas, lineasPosteriores, marcaDeLinea, tocaEspejoContinuo, unirRegistros, type RegistroNativoBle } from "@/lib/malla/registro-enlace-ble";

export const CANAL_ESPEJO = "registro.espejo";
export const MAX_BYTES_ESPEJO = 16 * 1024;
export const CADA_MS_ESPEJO = 15_000;
export const CLAVE_EMITIR = "starseed.pruebas.diagnostico.v1";
export const CLAVE_RECIBIR = "starseed.pruebas.recibir-diagnostico.v1";
export const COMANDO_ANEXAR_ESPEJO = "registro_espejo_anexar";

export interface MensajeEspejo { t: "registro.espejo"; desde: string; l: string[] }
export interface ParEspejo { syncDeviceId?: string; nombre: string; rol?: string }

const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const RE_IPV6 = /(?<![0-9a-z])(?:[0-9a-f]{1,4}:){1,7}:?[0-9a-f]{0,4}(?::[0-9a-f]{1,4})*|::[0-9a-f:]+/gi;
const RE_RUTA = /(?:\/Users\/[^\s/]+|\/home\/[^\s/]+|[A-Za-z]:\\Users\\[^\s\\]+)(?:[\\/][^\s]*)?/g;
const RE_CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RE_CLAVE = /[A-Za-z0-9+/_-]{24,}={0,2}/g;

/** Quita de una línea lo que no debe salir del aparato: IP, rutas de usuario, correos y claves o tokens. Puro. */
export function sanearLinea(linea: string): string {
  return linea
    .replace(RE_CORREO, "‹correo›")
    .replace(RE_RUTA, "‹ruta›")
    .replace(RE_IPV4, "‹ip›")
    .replace(RE_IPV6, (m) => (/^\d{1,2}:\d{2}(:\d{2})?$/.test(m) ? m : "‹ip›"))
    .replace(RE_CLAVE, (m) => (/[A-Za-z]/.test(m) && /\d/.test(m) ? "‹clave›" : m));
}

/** El par al que se manda el espejo: el primero con rol «director», o null (sin director no se envía). Puro. */
export function elegirDirector(pares: readonly ParEspejo[]): ParEspejo | null {
  return pares.find((p) => p.rol === "director" && !!p.syncDeviceId) ?? null;
}

/** Arma el mensaje: solo líneas nuevas, sin las ya espejadas «(nombre) …», colapsadas, saneadas y ≤16 KB. null si no hay nada. Puro. */
export function armarEspejo(lineas: readonly string[], desde: string | null, yaVistas?: ReadonlySet<string>): MensajeEspejo | null {
  const propias = lineas.filter((l) => !l.startsWith("("));
  const nuevas = colapsarRepetidas(lineasPosteriores(propias, desde, yaVistas)).map(sanearLinea);
  if (!nuevas.length) return null;
  let l = acotarBytes(nuevas, MAX_BYTES_ESPEJO - 64 - 3 * nuevas.length); // el JSON añade comillas y coma por línea
  while (l.length > 1 && new TextEncoder().encode(JSON.stringify(l)).length > MAX_BYTES_ESPEJO - 64) l = l.slice(1);
  const ultima = [...l].reverse().map(marcaDeLinea).find((m): m is string => !!m);
  return { t: "registro.espejo", desde: ultima ?? desde ?? "", l };
}

/** ¿Toca emitir ahora? Interruptor, director presente y suelo de 15 s por par. Puro. */
export function tocaEmitir(p: { activo: boolean; director: ParEspejo | null; ahora: number; ultimo: number | undefined }): boolean {
  if (!p.activo || !p.director) return false;
  return tocaEspejoContinuo({ ahora: p.ahora, ultimo: p.ultimo, cadaMs: CADA_MS_ESPEJO, bytesVoz: 0, bytesVideo: 0, bytesDatos: 0, maxDatos: 0 });
}

/** Valida lo recibido: tipo conocido, receptor encendido y emisor de la MISMA cuenta. Devuelve las líneas con «(par) ». Puro. */
export function leerEspejo(cuerpo: unknown, p: { recibir: boolean; esMismaCuenta: boolean; nombre: string }): string[] | null {
  if (!p.recibir || !p.esMismaCuenta || typeof cuerpo !== "object" || cuerpo === null) return null;
  const c = cuerpo as { t?: unknown; l?: unknown };
  if (c.t !== CANAL_ESPEJO || !Array.isArray(c.l)) return null;
  const nombre = p.nombre.replace(/[()\n\r]/g, "").slice(0, 60) || "aparato";
  const lineas = c.l.filter((x): x is string => typeof x === "string" && !x.startsWith("(")).slice(0, 400);
  return lineas.length ? lineas.map((x) => `(${nombre}) ${sanearLinea(x).slice(0, 2000)}`) : null;
}

function interruptor(clave: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}
export const emisionEncendida = (): boolean => interruptor(CLAVE_EMITIR);
export const recepcionEncendida = (): boolean => interruptor(CLAVE_RECIBIR);
export function fijarInterruptor(clave: typeof CLAVE_EMITIR | typeof CLAVE_RECIBIR, v: boolean): void {
  try {
    window.localStorage.setItem(clave, v ? "1" : "0");
  } catch {
    /* sin almacenamiento: sigue apagado */
  }
}

/** Arranca emisión (cada 15 s al director) y recepción (comando nativo). Devuelve la baja. Efectos: solo en la app. */
export function iniciarEspejoRegistro(): () => void {
  let ultimoEnvio: number | undefined;
  let ultimaMarca: string | null = null;
  const vistas = new Set<string>();
  const pares = async (): Promise<ParEspejo[]> => (await import("@/lib/network/malla-neuronas")).snapshotMallaNeuronas().misDispositivos.map((f) => ({ syncDeviceId: f.syncDeviceId, nombre: f.nombre, rol: f.ficha?.rol }));
  const tick = async () => {
    const director = elegirDirector(await pares());
    if (!tocaEmitir({ activo: emisionEncendida(), director, ahora: Date.now(), ultimo: ultimoEnvio }) || !director) return;
    const { puenteNativo } = await import("@/lib/nativa/puente");
    const r = await puenteNativo().llamar<RegistroNativoBle[]>("ble_registro");
    const msg = armarEspejo(unirRegistros([], r.ok && Array.isArray(r.valor) ? r.valor : []), ultimaMarca, vistas);
    if (!msg) return;
    ultimoEnvio = Date.now();
    const { enviarMensaje } = await import("@/lib/malla/transporte-universal");
    const res = await enviarMensaje({ syncDeviceId: director.syncDeviceId }, CANAL_ESPEJO, msg);
    if (res.ok) {
      ultimaMarca = msg.desde || ultimaMarca;
      msg.l.forEach((x) => vistas.add(x));
    }
  };
  const timer = setInterval(() => void tick().catch(() => undefined), CADA_MS_ESPEJO);
  let baja = () => {};
  void import("@/lib/malla/transporte-universal").then(({ alRecibirMensaje }) => {
    baja = alRecibirMensaje(CANAL_ESPEJO, (m) => {
      void (async () => {
        const par = (await pares()).find((p) => p.syncDeviceId && p.syncDeviceId === m.origen.syncDeviceId);
        const lineas = leerEspejo(m.cuerpo, { recibir: recepcionEncendida(), esMismaCuenta: !!par, nombre: par?.nombre ?? "" });
        if (!lineas) return;
        const { puenteNativo } = await import("@/lib/nativa/puente");
        await puenteNativo().llamar(COMANDO_ANEXAR_ESPEJO, { aparato: par?.nombre ?? "aparato", lineas });
      })().catch(() => undefined);
    });
  });
  return () => { clearInterval(timer); baja(); };
}
