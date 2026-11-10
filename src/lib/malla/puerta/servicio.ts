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
  ambitoDePuerta, // PTA1110B
  type AjusteGrupo, // PTA1110B
  guardarAjustesPuerta,
  leerAjustesPuerta,
  type AjustesPuerta,
  type EstadoPropio,
  type Solicitante,
} from "@/lib/malla/puerta/politica";
import { crearGestorPuerta, type ActividadSesion, type AuditoriaPuerta, type CarrilVista, type GestorPuerta, type InfoGrande, type MetaVecino, type Pregunta, type ResumenCompartiendo, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";
import { AvisosRuta, type AvisoRuta } from "@/lib/malla/puerta/actividad"; // PTA1110A
import { DecisorRol, textoCambioRol, type RolMalla } from "@/lib/malla/puerta/roles"; // PTA1110B
import { nodosIaPorMalla, type NodoIaMalla } from "@/lib/malla/puerta/ia"; // PTA1110A
import { carrilPermitido, type EleccionGrande } from "@/lib/malla/puerta/politica"; // PTA1110A
import { registrarRespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";
import { activarModoLocal, atenderEntradas, crearAbrirTcpLocal, leerIaLocal, leerSubredesLocales, postLocalPorDefecto, puertaLocalDisponible, respaldoFetchLocal, sondaPropiaNode, type HandleAtencion, type PostLocal } from "@/lib/malla/puerta/puente-local";
// PTA1108B: el webview, el navegador de la app y las descargas de Rust salen por el proxy local de la puerta.
import { crearSincroProxy, puenteProxyPorDefecto, textoVia, type PuenteProxy, type SincroProxy } from "@/lib/malla/puerta/proxy-nativo";

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
  /** PTA1110B · Con qué ámbito pide (grupo, pública, otra cuenta) y por qué se pregunta. */
  ambito?: "mias" | "grupo" | "otras" | "publica";
  grupo?: string;
  motivo?: "otra-cuenta" | "datos-moviles" | "puerto";
}

export interface EstadoServicioPuerta {
  /** El servicio corre. */
  activo: boolean;
  /** Hay lado de Node (app nativa): sin él, esta neurona no puede ser puerta ni usar el túnel TLS. */
  nativo: boolean;
  conInternet: boolean;
  puertas: PuertaVista[];
  /** «Internet por …» cuando hay un túnel propio abierto. */
  internetPor: { nombre: string; enlace: string; saltos: number; /** PTA1110B · primer salto de la cadena (si hay saltos) */ vecino?: string } | null;
  compartiendo: Array<ResumenCompartiendo & { nombre: string }>;
  auditoria: AuditoriaPuerta[];
  bytesHoy: { mias: number; otras: number };
  preguntas: PreguntaPendiente[];
  ajustes: AjustesPuerta;
  /** Puerto del proxy HTTP local cuando el modo «salir por la malla» está encendido (para el navegador de la app). */
  proxyLocal: number | null;
  /** PTA1108C · Capas que ESTA neurona alcanza y podría ofrecer (se anuncian solo las que el dueño comparte). */
  capasPropias: CapaPuerta[];
  /** PTA1110A · Procesos que pasan por esta neurona (propios y ajenos): tipo, host, bytes, velocidad, carril. Sin contenido. */
  actividad: ActividadSesion[];
  /** PTA1110A · Capacidad medida de cada carril con tráfico. */
  carriles: CarrilVista[];
  /** PTA1110A · Velocidad (bytes/s) del carril por el que sale esta neurona, si sale por la malla. */
  bytesPorSegundo: number | null;
  /** PTA1110A · Últimos avisos de cambio de ruta (sin repeticiones). */
  avisos: AvisoRuta[];
  /** PTA1110A · «Usar el internet de mis neuronas: Preguntar» espera respuesta. */
  preguntaUso: { nombre: string; /** PTA1110B · id de la neurona y ámbito (otra cuenta / grupo) para nombrarla con su identidad y recordar la respuesta */ id?: string; ambito?: "mias" | "grupo" | "otras" } | null;
  /** PTA1110A · Descarga grande por un carril lento: espera la elección del usuario. */
  preguntaGrande: (InfoGrande & { nombre: string }) | null;
  /** PTA1110A · IA de otras neuronas de mi cuenta alcanzable por la malla (para el router de Astraura). */
  iaPorMalla: NodoIaMalla[];
  /** PTA1110B · Papel actual: comparte su salida («puerta»), usa la de otra («usuaria») o ninguna («sola»). */
  rol: RolMalla | null;
  /** PTA1110B · La salida propia es una red medida (datos móviles) y cuántos bytes se sirvieron hoy por ella. */
  movil: { medida: boolean; bytesHoy: number };
  /** PTA1110B · Ámbito con el que se usa la puerta elegida (para mostrar «Internet por: … (mi neurona / grupo / pública)»). */
  ambitoUso: "mias" | "grupo" | "otras" | "publica" | null;
}

const VACIO: EstadoServicioPuerta = {
  activo: false, nativo: false, conInternet: true, puertas: [], internetPor: null, compartiendo: [], auditoria: [],
  bytesHoy: { mias: 0, otras: 0 }, preguntas: [], ajustes: AJUSTES_PUERTA_POR_DEFECTO, proxyLocal: null, capasPropias: [],
  actividad: [], carriles: [], bytesPorSegundo: null, avisos: [], preguntaUso: null, preguntaGrande: null, iaPorMalla: [],
  rol: null, movil: { medida: false, bytesHoy: 0 }, ambitoUso: null,
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

/** PTA1110A · Sonda de la salida PROPIA hecha por Node (no por el webview): un TCP directo al Supabase del OS (o a 1.1.1.1:443). */
async function sondearSalidaNode(post: PostLocal, previa: SondaSalida): Promise<SondaSalida> {
  let host = "1.1.1.1";
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    /* se usa el de respaldo */
  }
  const r = await sondaPropiaNode(post, host, 443);
  // Node no contestó (sin lado de Node): se conserva lo que ya se sabía en vez de inventar un corte.
  if (r === null) return previa;
  return { conInternet: r.ok, latenciaMs: r.ms };
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

/**
 * PTA1110B · Ajusta (o crea) un grupo o comunidad: «Compartir internet con este grupo» / «Usar el de este grupo» y los miembros
 * que esta neurona conoce (la lista que guardó cuando hubo red; sin prueba criptográfica offline todavía, ver §5.3).
 * Lo llaman las páginas de grupos y comunidades; la tarjeta «Internet compartido» lo lista.
 */
export function configurarGrupo(id: string, parche: Partial<AjusteGrupo>): void {
  if (!id || id.length > 80) return;
  cambiarAjustesPuerta((a) => {
    const previo: AjusteGrupo = a.grupos[id] ?? { compartir: "preguntar", usar: "preguntar", miembros: [], topes: { bytesDia: 500 * 1024 * 1024, bateriaMin: 0.3, permitirRedMedida: false, maxTuneles: 6 } };
    return { ...a, grupos: { ...a.grupos, [id]: { ...previo, ...parche, miembros: [...new Set(parche.miembros ?? previo.miembros)].slice(0, 500) } } };
  });
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

/* ── PTA1110A · Actividad de la malla, preguntas y diagnóstico ── */
const avisosRuta = new AvisosRuta();
let usoSesion: "desconocido" | "si" | "no" = "desconocido";
let resUso: ((ok: boolean) => void) | null = null;
let resGrande: ((r: { eleccion: Exclude<EleccionGrande, "preguntar">; recordar: boolean }) => void) | null = null;

/** «Usar el internet de mis neuronas: Preguntar» — respuesta del usuario. */
export function responderUso(permitir: boolean): void {
  // PTA1110B: una neurona de otra cuenta se recuerda por su id (revocable en la tarjeta); mías y grupos valen para la sesión.
  const p = estado.preguntaUso;
  if (p?.ambito === "otras" && p.id) {
    const id = p.id;
    cambiarAjustesPuerta((a) => ({ ...a, usoOtrasRecordadas: { ...a.usoOtrasRecordadas, [id]: permitir ? "permitir" : "denegar" } }));
  }
  usoSesion = permitir ? "si" : "no";
  resUso?.(permitir);
  resUso = null;
  publicar({ preguntaUso: null });
}

/** Descarga grande por un carril lento: continuar / esperar un carril más rápido / solo con Wi‑Fi. */
export function responderGrande(eleccion: Exclude<EleccionGrande, "preguntar">, recordar: boolean): void {
  resGrande?.({ eleccion, recordar });
  resGrande = null;
  publicar({ preguntaGrande: null });
}

export const pausarActividad = (id: string): void => gestorVivo?.pausar(id);
export const reanudarActividad = (id: string): void => gestorVivo?.reanudar(id);
export const cancelarActividad = (id: string): void => gestorVivo?.cancelar(id);

/** Una línea en `enlaces.log` (la app nativa la copia a ~/Library/Logs/app.starseed.os/enlaces.log). Nunca lanza. */
function registrarPuerta(texto: string): void {
  try {
    const linea = `${new Date().toISOString()} web puerta - - ${texto}`;
    void import("@/lib/nativa/puente").then(({ puenteNativo }) => puenteNativo().llamar("ble_registro_anexar", { lineas: [linea] })).catch(() => undefined);
  } catch {
    /* sin registro */
  }
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
  /** PTA1108B · Para pruebas: el puente con la app nativa (`null` = web, sin sincronía). Por defecto, el real. */
  puenteProxy?: PuenteProxy | null;
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
  let fallosSonda = 0; // PTA1110A
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
      // PTA1108B · Con lado de Node, el puerto del proxy local se le dice a la app nativa (no-op en la web).
      const sincroProxy: SincroProxy | null = nativo ? crearSincroProxy(op.puenteProxy !== undefined ? op.puenteProxy : puenteProxyPorDefecto()) : null;
      if (sincroProxy) bajas.push(() => void sincroProxy.detener());
      const gestorTabla = new TablaPuertas(() => Date.now(), yo);
      const estadoPropio = (): EstadoPropio => ({ conInternet: sonda.conInternet, ...fisico });
      const decisor = new DecisorRol(); // PTA1110B: papeles que cambian solos, sin parpadeo

      const gestor = crearGestorPuerta({
        transporte,
        tabla: gestorTabla,
        ajustes: () => aj,
        cambiarAjustes: cambiarAjustesPuerta,
        estado: estadoPropio,
        anuncioPropio: () => {
          const e = estadoPropio();
          // PTA1110B: también si solo se ofrece a algún grupo o a la capa pública.
          const comparteAlguien = aj.misNeuronas || aj.otrasCuentas !== "nunca" || aj.publica.ofrecer || Object.values(aj.grupos).some((g) => g.compartir !== "nunca");
          if (!nativo) return null;
          // PTA1108C: además de internet, las capas privadas que el dueño comparte (aunque esta neurona no tenga internet).
          const detalle = capasAnunciables(aj, capasDetectadas);
          const capas: CapaSalida[] = e.conInternet && comparteAlguien ? ["internet"] : [];
          if (!capas.length && !detalle.length) return null;
          return crearAnuncioPropio({ id: yo, uid: miCuenta ?? undefined, capas, detalle, latenciaMs: sonda.latenciaMs, estado: e, op: aj.publica.ofrecer, f: transporte.enviarBin ? ["cap", "bin"] : ["cap"], ahora: Date.now() });
        },
        capasPropias: () => capasDetectadas, // PTA1108C
        hostsStarSeed: () => hostsStarSeed(), // PTA1110A
        miCuenta: () => miCuenta, // PTA1110B
        usoConfirmado: () => usoSesion === "si", // PTA1110B: grupos en «Preguntar»
        alGrande: (info) =>
          new Promise((res) => {
            resGrande = res;
            publicar({ preguntaGrande: { ...info, nombre: nombres(info.id) } });
            registrarPuerta(`grande ${info.tipo} ${info.host} ${Math.round(info.kbps)} kb/s: se pregunta`);
          }),
        abrirTcp: nativo ? crearAbrirTcpLocal(post) : undefined,
        preguntar: (s: Solicitante, host: string, motivo?: "otra-cuenta" | "datos-moviles" | "puerto") =>
          new Promise<Pregunta>((res) => {
            const id = `${s.id}:${Date.now()}`;
            const p: PreguntaPendiente = { id, de: s.id, nombre: nombres(s.id), host, ambito: s.ambito, ...(s.grupo ? { grupo: aj.grupos[s.grupo]?.nombre ?? s.grupo } : {}), motivo: motivo ?? (host.includes(":") ? "puerto" : "otra-cuenta") };
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
          internetPor: propio ? { nombre: nombres(propio.puerta), enlace: propio.enlace, saltos: propio.saltos, ...(propio.saltos > 0 && propio.vecino ? { vecino: nombres(propio.vecino) } : {}) } : null,
          compartiendo: gestor.compartiendo().map((c) => ({ ...c, nombre: nombres(c.de) })),
          auditoria: gestor.auditoria().slice(-20).reverse(),
          bytesHoy: { mias: gestor.bytesHoy("mias"), otras: gestor.bytesHoy("otras") },
          capasPropias: capasDetectadas,
          // PTA1110A
          actividad: gestor.actividad(),
          carriles: gestor.carriles(),
          bytesPorSegundo: velocidadDeRuta(propio?.puerta),
          iaPorMalla: nodosIaPorMalla(puertas),
          // PTA1110B
          rol: decisor.actual(),
          movil: { medida: fisico.medida, bytesHoy: gestor.bytesHoyMovil() },
          ambitoUso: propio ? ambitoUsoDe(propio.puerta) : null,
        });
        sincronizarProxy(); // PTA1108B
      };
      const ctxAmbito = () => ({ miCuenta, vecinoMismaCuenta: (id: string) => meta(id).mismaCuenta });
      const ambitoUsoDe = (puerta: string): "mias" | "grupo" | "otras" | "publica" | null => {
        const e = gestorTabla.candidatas().find((x) => x.anuncio.id === puerta);
        return e ? ambitoDePuerta(aj, e, ctxAmbito()).ambito : null;
      };
      /** PTA1110A · bytes/s medidos en el carril hacia la puerta por la que sale esta neurona. */
      const velocidadDeRuta = (puerta: string | undefined): number | null => {
        if (!puerta) return null;
        const entrada = gestorTabla.candidatas().find((e) => e.anuncio.id === puerta);
        const c = entrada ? gestor.carriles().find((x) => x.vecino === entrada.vecino) : undefined;
        return c && c.kbps > 0 ? c.kbps * 125 : null;
      };
      const hostsStarSeed = (): string[] => {
        try {
          return process.env.NEXT_PUBLIC_SUPABASE_URL ? [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname] : [];
        } catch {
          return [];
        }
      };
      // PTA1108B · Cada vez que el proxy arranca, para o cambia la puerta que usa (neurona o vía), la app nativa lo sabe.
      const sincronizarProxy = (): void => {
        if (!sincroProxy) return;
        const e = estadoPuerta();
        if (e.proxyLocal == null) {
          void sincroProxy.sincronizar({ puerto: null });
          return;
        }
        const mejor = e.internetPor ?? e.puertas[0] ?? null;
        void sincroProxy.sincronizar({ puerto: e.proxyLocal, neurona: mejor?.nombre ?? null, via: mejor ? textoVia(mejor.enlace, mejor.saltos) : null });
      };

      // Salida propia, estado físico y modo «salir por la malla» (solo con lado de Node).
      const ciclo = async (): Promise<void> => {
        if (!vivo) return;
        // PTA1110A · La salida PROPIA se mide desde Node (un TCP directo): una sonda del webview saldría por el proxy de la malla
        // en cuanto este estuviera encendido, «vería internet» y apagaría el modo (parpadeo). Con histéresis: hacen falta
        // 2 fallos seguidos para dar la salida por perdida; un acierto basta para darla por vuelta.
        const medida = op.sonda ? await op.sonda() : nativo ? await sondearSalidaNode(post, sonda) : await sondearSalida();
        if (medida.conInternet) {
          fallosSonda = 0;
          sonda = medida;
        } else if (++fallosSonda >= 2 || !sonda.conInternet) {
          sonda = medida;
        }
        fisico = await leerEstadoFisico();
        // PTA1108C: capas que esta neurona alcanza (servidores propios, LAN, routers).
        try {
          capasDetectadas = detectarCapas(await fuentesCapasReales({ vecinosLan: () => cacheVecinosLan, subredes: nativo ? () => leerSubredesLocales(post) : undefined, iaLocal: nativo ? () => leerIaLocal(post) : undefined /* PTA1110A */ }));
          cacheVecinosLan = await vecinosLanReales();
        } catch {
          /* sin capas: solo internet */
        }
        await refrescar();
        // PTA1110A · solo por los carriles permitidos; «Usar el internet de mis neuronas»: Automático / Preguntar / Nunca.
        // PTA1110B: además, solo las puertas cuyo ÁMBITO deja usar el usuario (mías, grupos con «Usar», públicas si «Usar puertas públicas»).
        const evaluadas = gestorTabla.candidatas({ filtro: (e) => carrilPermitido(aj, e.tipoEnlace, e.enlace) }).map((e) => ({ e, r: ambitoDePuerta(aj, e, ctxAmbito()) })).filter((x) => x.r.permitido);
        const candidatas = evaluadas.map((x) => x.e);
        if (sonda.conInternet) usoSesion = "desconocido";
        // Papel: recuperar la salida propia es inmediato; perderla espera la permanencia (sin parpadeos).
        const rolNuevo = decisor.observar({ conInternet: sonda.conInternet, hayPuertas: candidatas.length > 0 }, Date.now());
        if (rolNuevo.cambio) {
          registrarPuerta(`rol: ${textoCambioRol(rolNuevo.cambio, rolNuevo.antes)}`);
          // Dejó de ser puerta: lo que servía hacia fuera se corta YA y las vecinas borran su ruta (fallo rápido, ruta nueva).
          if (rolNuevo.antes === "puerta") gestor.salidaPerdida();
          else if (rolNuevo.cambio === "a-puerta") gestor.anunciar();
        }
        let usar = nativo && aj.usarPuertas && aj.modoUso !== "nunca" && rolNuevo.rol !== "puerta" && candidatas.length > 0;
        const pregunta = evaluadas.find((x) => x.r.preguntar);
        if (usar && pregunta && usoSesion !== "si" && evaluadas.every((x) => x.r.preguntar)) {
          usar = false;
          if (usoSesion === "desconocido" && !resUso) {
            const nombre = nombres(pregunta.e.anuncio.id);
            publicar({ preguntaUso: { nombre, id: pregunta.e.anuncio.id, ambito: pregunta.r.ambito === "publica" ? undefined : pregunta.r.ambito } });
            void new Promise<boolean>((res) => (resUso = res));
          }
        }
        if (usar !== modoLocal) {
          const r = await activarModoLocal(post, usar);
          if (r) {
            modoLocal = usar;
            publicar({ proxyLocal: r.activo ? r.proxy : null });
            registrarPuerta(usar ? `modo malla encendido (sin salida propia; ${candidatas.length} puerta(s))` : "modo malla apagado");
          }
        }
        refrescarVista();
        // PTA1110A · Aviso de cambio de ruta: uno por cambio real, sin bucles (ver AvisosRuta).
        const e = estadoPuerta();
        const aviso = avisosRuta.observar({ conInternet: sonda.conInternet, por: e.internetPor ? { nombre: e.internetPor.nombre, enlace: e.internetPor.enlace } : null, hayPuertas: candidatas.length > 0 });
        if (aviso) {
          publicar({ avisos: [...estadoPuerta().avisos, aviso].slice(-5) });
          registrarPuerta(`ruta: ${aviso.texto}`);
          try {
            window.dispatchEvent(new CustomEvent("starseed:puerta-aviso", { detail: aviso }));
          } catch {
            /* sin eventos */
          }
        }
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
                  const puerto = Number(u.port || (u.protocol === "http:" ? 80 : 443)); // PTA1110A: http también
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
      // PTA1110A: más a menudo mientras no hay salida propia (se quiere entrar en modo malla en segundos, no en medio minuto).
      let relojCiclo: ReturnType<typeof setTimeout> | null = null;
      const siguiente = (): void => {
        if (!vivo) return;
        relojCiclo = setTimeout(() => void ciclo().finally(siguiente), sonda.conInternet ? 8000 : 4000);
      };
      siguiente();
      bajas.push(() => relojCiclo && clearTimeout(relojCiclo));
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
    resUso = null; // PTA1110A
    resGrande = null;
    usoSesion = "desconocido";
    void activarModoLocal(post, false);
    publicar({ ...VACIO, ajustes: aj });
  };
  return parar;
}

/** Cantidad de puertas vivas (para chips pequeños). */
export const hayPuertas = (): boolean => estado.puertas.length > 0;
export type { AnuncioPuerta };
