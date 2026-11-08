/**
 * puerta/servicio — arranca la puerta de internet compartida con el transporte real (PTA1108A · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3.
 *
 * Une: ajustes (`politica`), detección de salida propia, anuncio por TODOS los enlaces abiertos, tramas por el
 * transporte universal (`enviarMensaje` / `alRecibirMensaje`, canal «puerta»), el lado de Node (`puente-local`) y el
 * `fetch` de respaldo. Todo con carga perezosa: nada de esto pesa hasta que `iniciarPuertaMalla()` corre.
 *
 * Interruptor de emergencia: `localStorage["starseed.malla.puerta.activo"] = "0"` o NEXT_PUBLIC_PUERTA_MALLA=0.
 */

import { CANAL_PUERTA, TablaPuertas, crearAnuncioPropio, puntuarPuerta, type AnuncioPuerta, type CapaSalida } from "@/lib/malla/puerta/tabla";
import { capaDeDestino, capasAnunciables, destinoNecesitaCapa, detectarCapas, type CapaPuerta, type TipoCapa } from "@/lib/malla/puerta/capas"; // PTA1108C
import { fuentesCapasReales, vecinosLanReales } from "@/lib/malla/puerta/capas-fuentes"; // PTA1108C
import {
  AJUSTES_PUERTA_POR_DEFECTO,
  guardarAjustesPuerta,
  leerAjustesPuerta,
  type AjustesPuerta,
  type EstadoPropio,
  type Solicitante,
} from "@/lib/malla/puerta/politica";
import { crearGestorPuerta, type AuditoriaPuerta, type GestorPuerta, type MetaVecino, type Pregunta, type ResumenCompartiendo, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";
import { registrarRespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";
import { activarModoLocal, atenderEntradas, crearAbrirTcpLocal, leerSubredesLocales, postLocalPorDefecto, puertaLocalDisponible, respaldoFetchLocal, type HandleAtencion, type PostLocal } from "@/lib/malla/puerta/puente-local";

export const CLAVE_INTERRUPTOR_PUERTA = "starseed.malla.puerta.activo";

export interface PuertaVista {
  id: string;
  nombre: string;
  enlace: string;
  saltos: number;
  puntuacion: number;
  medida: boolean;
  /** PTA1108C · Capas (servidores propios, LAN, routers) que esa puerta ofrece, con su calidad. */
  capas: CapaPuerta[];
}

export interface PreguntaPendiente {
  id: string;
  de: string;
  nombre: string;
  host: string;
}

export interface EstadoServicioPuerta {
  /** El servicio corre. */
  activo: boolean;
  /** Hay lado de Node (app nativa): sin él, esta neurona no puede ser puerta ni usar el túnel TLS. */
  nativo: boolean;
  conInternet: boolean;
  puertas: PuertaVista[];
  /** «Internet por …» cuando hay un túnel propio abierto. */
  internetPor: { nombre: string; enlace: string; saltos: number } | null;
  compartiendo: Array<ResumenCompartiendo & { nombre: string }>;
  auditoria: AuditoriaPuerta[];
  bytesHoy: { mias: number; otras: number };
  preguntas: PreguntaPendiente[];
  ajustes: AjustesPuerta;
  /** Puerto del proxy HTTP local cuando el modo «salir por la malla» está encendido (para el navegador de la app). */
  proxyLocal: number | null;
  /** PTA1108C · Capas que ESTA neurona alcanza y podría ofrecer (se anuncian solo las que el dueño comparte). */
  capasPropias: CapaPuerta[];
}

const VACIO: EstadoServicioPuerta = {
  activo: false, nativo: false, conInternet: true, puertas: [], internetPor: null, compartiendo: [], auditoria: [],
  bytesHoy: { mias: 0, otras: 0 }, preguntas: [], ajustes: AJUSTES_PUERTA_POR_DEFECTO, proxyLocal: null, capasPropias: [],
};

let estado: EstadoServicioPuerta = VACIO;
const oyentes = new Set<() => void>();
function publicar(parche: Partial<EstadoServicioPuerta>): void {
  estado = { ...estado, ...parche };
  for (const cb of Array.from(oyentes)) cb();
}
export const estadoPuerta = (): EstadoServicioPuerta => estado;
export function suscribirPuerta(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

/* ── Salida propia ── */
export interface SondaSalida {
  conInternet: boolean;
  latenciaMs: number | null;
}

/** Comprueba la salida con una petición ligera (opaca, sin cookies) al propio Supabase del OS. */
export async function sondearSalida(fetchCrudo: typeof fetch = fetch, ahora: () => number = () => Date.now()): Promise<SondaSalida> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { conInternet: false, latenciaMs: null };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return { conInternet: typeof navigator === "undefined" ? true : navigator.onLine !== false, latenciaMs: null };
  const t0 = ahora();
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const temporizador = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
  try {
    await fetchCrudo(`${base.replace(/\/$/, "")}/auth/v1/health`, { method: "GET", mode: "no-cors", cache: "no-store", credentials: "omit", ...(ctl ? { signal: ctl.signal } : {}) });
    return { conInternet: true, latenciaMs: Math.max(1, ahora() - t0) };
  } catch {
    return { conInternet: false, latenciaMs: null };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function leerEstadoFisico(): Promise<Pick<EstadoPropio, "bateria" | "cargando" | "medida">> {
  let bateria: number | null = null;
  let cargando = false;
  try {
    const b = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.();
    if (b) {
      bateria = b.level;
      cargando = b.charging;
    }
  } catch {
    /* sin API de batería: se da por suficiente */
  }
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  const medida = c?.type === "cellular" || c?.saveData === true;
  return { bateria, cargando, medida };
}

function interruptorEncendido(): boolean {
  if (process.env.NEXT_PUBLIC_PUERTA_MALLA === "0") return false;
  try {
    return localStorage.getItem(CLAVE_INTERRUPTOR_PUERTA) !== "0";
  } catch {
    return true;
  }
}

/* ── Arranque ── */
let parar: (() => void) | null = null;
let gestorVivo: GestorPuerta | null = null;
let aj: AjustesPuerta = AJUSTES_PUERTA_POR_DEFECTO;
const preguntas = new Map<string, { p: PreguntaPendiente; res: (d: Pregunta) => void }>();

export function responderPregunta(id: string, d: Pregunta): void {
  const e = preguntas.get(id);
  if (!e) return;
  preguntas.delete(id);
  e.res(d);
  publicar({ preguntas: [...preguntas.values()].map((x) => x.p) });
}

/** Cambia ajustes (los guarda y los aplica en caliente). */
export function cambiarAjustesPuerta(f: (a: AjustesPuerta) => AjustesPuerta): void {
  aj = f(aj);
  guardarAjustesPuerta(aj);
  publicar({ ajustes: aj });
  gestorVivo?.anunciar();
}

/** PTA1108C · Permiso explícito (o su retirada) de capas privadas para UNA neurona de otra cuenta. */
export function permitirCapasANeurona(id: string, tipos: TipoCapa[]): void {
  cambiarAjustesPuerta((a) => {
    const resto = { ...a.capasPorNeurona };
    if (tipos.length) resto[id] = [...new Set(tipos)];
    else delete resto[id];
    return { ...a, capasPorNeurona: resto };
  });
}

export const pararDeCompartir = (): void => gestorVivo?.detenerCompartir();
export const revocarVecina = (id: string): void => gestorVivo?.revocar(id);

export interface OpcionesServicio {
  post?: PostLocal;
  /** Para pruebas: sustituye al transporte real. */
  transporte?: TransportePuerta;
  esNativo?: boolean;
  sonda?: () => Promise<SondaSalida>;
  yo?: string;
}

/** Arranca la puerta. Devuelve la función que la detiene. Nunca lanza. */
export function iniciarPuertaMalla(op: OpcionesServicio = {}): () => void {
  if (parar) return parar;
  if (typeof window === "undefined" || !interruptorEncendido()) return () => undefined;
  let vivo = true;
  const bajas: Array<() => void> = [];
  let sonda: SondaSalida = { conInternet: typeof navigator === "undefined" || navigator.onLine !== false, latenciaMs: null };
  let fisico: Pick<EstadoPropio, "bateria" | "cargando" | "medida"> = { bateria: null, cargando: false, medida: false };
  let handle: HandleAtencion | null = null;
  let modoLocal = false;
  let capasDetectadas: CapaPuerta[] = []; // PTA1108C
  let cacheVecinosLan: string[] = []; // PTA1108C
  const post = op.post ?? postLocalPorDefecto();
  aj = leerAjustesPuerta();
  publicar({ activo: true, ajustes: aj });

  void (async () => {
    try {
      const universal = op.transporte ? null : await import("@/lib/malla/transporte-universal");
      const sync = op.transporte ? null : await import("@/lib/malla/sincronizacion-neuronas-motor");
      const ident = op.transporte ? null : await import("@/lib/network/identidad-dispositivo");
      if (!vivo) return;
      const yo = op.yo ?? ident?.identidadDispositivo().syncDeviceId ?? "";
      if (!yo && !op.transporte) return;
      const nombres = (id: string): string => sync?.vinculosDeNeuronas().find((v) => v.sync === id)?.nombre ?? id.slice(0, 8);
      let miCuenta: string | null = null;
      void sync?.cuentaDeEstaNeurona().then((c) => (miCuenta = c));

      const enlaces = async () => (universal ? (await universal.enlacesDisponibles()).filter((e) => e.abierto && e.alcanza.syncDeviceId && ["local", "nativo", "ble", "cuenta"].includes(e.tipo)) : []);
      let cacheEnlaces: Awaited<ReturnType<typeof enlaces>> = [];
      const refrescar = async (): Promise<void> => {
        cacheEnlaces = await enlaces();
      };
      await refrescar();
      const meta = (vecino: string): MetaVecino => {
        const e = cacheEnlaces.filter((x) => x.alcanza.syncDeviceId === vecino).sort((a, b) => (a.tipo === "ble" ? 1 : 0) - (b.tipo === "ble" ? 1 : 0))[0];
        const v = sync?.vinculosDeNeuronas().find((x) => x.sync === vecino);
        // Misma cuenta: por la malla de la cuenta, o por un vínculo que YO recordé con la misma cuenta (huella guardada).
        const mismaCuenta = cacheEnlaces.some((x) => x.alcanza.syncDeviceId === vecino && x.tipo === "cuenta") || (!!v && v.recordado && !!miCuenta && v.cuenta === miCuenta);
        return { mismaCuenta, tipoEnlace: e?.tipo ?? "local", etiqueta: e?.etiqueta ?? "enlace" };
      };

      const transporte: TransportePuerta =
        op.transporte ??
        ({
          yo: () => yo,
          vecinos: () => [...new Set(cacheEnlaces.map((e) => e.alcanza.syncDeviceId as string))],
          tamTrozo: (v) => (cacheEnlaces.some((e) => e.alcanza.syncDeviceId === v && e.tipo === "ble") && !cacheEnlaces.some((e) => e.alcanza.syncDeviceId === v && e.tipo !== "ble") ? 4096 : 8192),
          async enviar(vecino, t) {
            // Por un enlace directo concreto: el relé del servidor no sirve para un túnel (y sin internet no existe).
            const e = cacheEnlaces.filter((x) => x.alcanza.syncDeviceId === vecino).sort((a, b) => (a.tipo === "ble" ? 1 : 0) - (b.tipo === "ble" ? 1 : 0))[0];
            const r = await universal!.enviarMensaje(e ? { enlaceId: e.id, syncDeviceId: vecino } : { syncDeviceId: vecino }, CANAL_PUERTA, t);
            return r.ok;
          },
          alRecibir(cb) {
            return universal!.alRecibirMensaje(CANAL_PUERTA, (m) => {
              const v = m.origen.syncDeviceId;
              if (v && m.cuerpo && typeof m.cuerpo === "object") cb(v, m.cuerpo as Trama, meta(v));
            });
          },
        } satisfies TransportePuerta);

      const nativo = op.esNativo ?? (await puertaLocalDisponible(post));
      publicar({ nativo });
      const gestorTabla = new TablaPuertas(() => Date.now(), yo);
      const estadoPropio = (): EstadoPropio => ({ conInternet: sonda.conInternet, ...fisico });

      const gestor = crearGestorPuerta({
        transporte,
        tabla: gestorTabla,
        ajustes: () => aj,
        cambiarAjustes: cambiarAjustesPuerta,
        estado: estadoPropio,
        anuncioPropio: () => {
          const e = estadoPropio();
          const comparteAlguien = aj.misNeuronas || aj.otrasCuentas !== "nunca";
          if (!nativo) return null;
          // PTA1108C: además de internet, las capas privadas que el dueño comparte (aunque esta neurona no tenga internet).
          const detalle = capasAnunciables(aj, capasDetectadas);
          const capas: CapaSalida[] = e.conInternet && comparteAlguien ? ["internet"] : [];
          if (!capas.length && !detalle.length) return null;
          return crearAnuncioPropio({ id: yo, uid: miCuenta ?? undefined, capas, detalle, latenciaMs: sonda.latenciaMs, estado: e, ahora: Date.now() });
        },
        capasPropias: () => capasDetectadas, // PTA1108C
        abrirTcp: nativo ? crearAbrirTcpLocal(post) : undefined,
        preguntar: (s: Solicitante, host: string) =>
          new Promise<Pregunta>((res) => {
            const id = `${s.id}:${Date.now()}`;
            const p: PreguntaPendiente = { id, de: s.id, nombre: nombres(s.id), host };
            preguntas.set(id, { p, res });
            publicar({ preguntas: [...preguntas.values()].map((x) => x.p) });
            setTimeout(() => responderPregunta(id, "denegar"), 28_000);
          }),
      });
      gestorVivo = gestor;
      gestor.iniciar();
      bajas.push(() => gestor.detener());

      const refrescarVista = (): void => {
        const puertas = gestorTabla.candidatas().map((e) => ({
          id: e.anuncio.id, nombre: nombres(e.anuncio.id), enlace: e.enlace, saltos: e.anuncio.saltos, puntuacion: Math.round(puntuarPuerta(e)), medida: e.anuncio.medida, capas: e.anuncio.detalle ?? [],
        }));
        const propio = gestor.tunelesPropios()[0];
        publicar({
          puertas,
          conInternet: sonda.conInternet,
          internetPor: propio ? { nombre: nombres(propio.puerta), enlace: propio.enlace, saltos: propio.saltos } : null,
          compartiendo: gestor.compartiendo().map((c) => ({ ...c, nombre: nombres(c.de) })),
          auditoria: gestor.auditoria().slice(-20).reverse(),
          bytesHoy: { mias: gestor.bytesHoy("mias"), otras: gestor.bytesHoy("otras") },
          capasPropias: capasDetectadas,
        });
      };

      // Salida propia, estado físico y modo «salir por la malla» (solo con lado de Node).
      const ciclo = async (): Promise<void> => {
        if (!vivo) return;
        sonda = op.sonda ? await op.sonda() : await sondearSalida();
        fisico = await leerEstadoFisico();
        // PTA1108C: capas que esta neurona alcanza (servidores propios, LAN, routers).
        try {
          capasDetectadas = detectarCapas(await fuentesCapasReales({ vecinosLan: () => cacheVecinosLan, subredes: nativo ? () => leerSubredesLocales(post) : undefined }));
          cacheVecinosLan = await vecinosLanReales();
        } catch {
          /* sin capas: solo internet */
        }
        await refrescar();
        const usar = nativo && aj.usarPuertas && !sonda.conInternet && gestorTabla.candidatas().length > 0;
        if (usar !== modoLocal) {
          const r = await activarModoLocal(post, usar);
          if (r) {
            modoLocal = usar;
            publicar({ proxyLocal: r.activo ? r.proxy : null });
          }
        }
        refrescarVista();
        gestor.anunciar();
      };
      if (nativo) {
        handle = atenderEntradas(post, gestor, () => refrescarVista());
        bajas.push(() => handle?.detener());
        bajas.push(
          registrarRespaldoFetch(
            respaldoFetchLocal(post, {
              activo: () => aj.usarPuertas,
              hayPuertas: () => gestorTabla.candidatas().length > 0,
              sinSalida: () => !sonda.conInternet,
              // PTA1108C: destino privado que ESTA neurona no alcanza y que alguna puerta ofrece como capa.
              requiereCapa: (url) => {
                try {
                  const u = new URL(url);
                  const puerto = Number(u.port || 443);
                  if (!destinoNecesitaCapa(u.hostname) || capaDeDestino(capasDetectadas, u.hostname, puerto)) return false;
                  return gestorTabla.capaParaDestino(u.hostname, puerto) !== null;
                } catch {
                  return false;
                }
              },
            }),
          ),
        );
      }
      await ciclo();
      const reloj = setInterval(() => void ciclo(), 8000);
      bajas.push(() => clearInterval(reloj));
      const alRed = (): void => void ciclo();
      window.addEventListener("online", alRed);
      window.addEventListener("offline", alRed);
      bajas.push(() => {
        window.removeEventListener("online", alRed);
        window.removeEventListener("offline", alRed);
      });
    } catch {
      /* sin puerta: la malla sigue como siempre */
    }
  })();

  parar = () => {
    vivo = false;
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* nada */
      }
    }
    gestorVivo = null;
    parar = null;
    for (const e of preguntas.values()) e.res("denegar");
    preguntas.clear();
    void activarModoLocal(post, false);
    publicar({ ...VACIO, ajustes: aj });
  };
  return parar;
}

/** Cantidad de puertas vivas (para chips pequeños). */
export const hayPuertas = (): boolean => estado.puertas.length > 0;
export type { AnuncioPuerta };
