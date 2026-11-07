"use client";

/**
 * red-local-nativa-motor — el enlace `nativo:<ip>` y la señalización WebRTC por el canal local (2026-11-07 · MLT1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/datos-por-la-malla.md` §6. Lo puro (saludo, ligaduras, tramas, ritmo,
 * máquina de estados) está en `red-local-nativa.ts` y `senal-nativa.ts`; aquí se envía, se recibe y
 * se recuerda, con TODO lo del mundo inyectado (las pruebas montan dos apps en memoria).
 *
 *   · Cada 15 s mira el canal (`malla_local_estado`) y SALUDA (`nl.hola` firmado) a las neuronas
 *     vinculadas que su faro oye; quien recibe un saludo válido contesta y las dos quedan LIGADAS.
 *   · Una cola por IP con dos clases: `control` (mensajes del transporte universal, saludos, señales)
 *     pasa delante de `datos` (archivos, en orden estricto). Cada trama espera el acuse de la otra app;
 *     6 fallos seguidos → ese aparato se da por caído 30 s (y se dice).
 *   · Lo que llega de una IP ligada va a sus oyentes de siempre: `tu.*` al transporte universal,
 *     `archivo.*` al motor de archivos (que SIEMPRE pregunta). De una IP sin ligadura, nada.
 *   · Cada 5 s, por cada ligadura con WebRTC en los dos lados y sin enlace local abierto, la máquina de
 *     `senal-nativa.ts` decide: la neurona de id menor ofrece (`nl.sen` firmado), la otra responde, y
 *     el enlace WebRTC de siempre (`emparejar-sin-internet.ts`) queda en el registro: por él van
 *     llamadas, pantalla y flujos. A cada SDP recibido se le añaden candidatos con la IP real.
 */

import {
  CAIDA_MS,
  FALLOS_PARA_CAIDA,
  LIMITES_CANAL_ANTERIOR,
  PREFIJO_SESION_NATIVA,
  PUERTO_CANAL_NATIVO,
  aceptarHola,
  armarTrama,
  candidatosConIp,
  claseDeTexto,
  desempaquetarLote,
  destinosHola,
  enlacesNativos,
  esperaTrasFallo,
  holaNativa,
  idEnlaceNativo,
  ipLocal,
  leerHola,
  leerLimites,
  ligaduraDeIp,
  ligaduraDeNeurona,
  ligar,
  maxTextoPorTrama,
  nuevaCubeta,
  podarLigaduras,
  tomarFicha,
  type Cubeta,
  type LimitesCanal,
  type Ligadura,
  type QuienNativo,
  type VecinoMinimo,
  type VinculoMinimo,
} from "./red-local-nativa";
import { SENAL_INICIAL, leerSenal, pasoSenal, quienOfrece, type AccionSenal, type EstadoSenal, type EventoSenal, type SenalNativa } from "./senal-nativa";
import type { EnlaceDisponible } from "./eleccion-enlace";
import type { CanalArchivos } from "@/lib/network/archivos-malla";

/* ══════════════════════════ Dependencias (inyectables) ══════════════════════════ */

export interface EstadoCanalNativo {
  escuchando: boolean;
  vecinos: VecinoMinimo[];
  /** Lo que admite el oyente de ESTA app (null: app anterior, no lo dice → se anuncia nada). */
  limites: LimitesCanal | null;
}

/** Una conexión WebRTC en curso (la de `ofrecerPorCanal` / `responderPorCanal`). */
export interface ConexionSenal {
  sdp: string;
  /** Solo quien ofrece: aplica la respuesta. */
  completar?(sdp: string): Promise<{ ok: boolean; motivo?: string }>;
  cancelar(): void;
  alCambiar(cb: (e: "abierta" | "cerrada" | "fallida", motivo?: string) => void): () => void;
}

export type ResultadoConexion = ({ ok: true } & ConexionSenal) | { ok: false; motivo: string };

export interface DepsRedNativa {
  ahora(): number;
  dormir(ms: number): Promise<void>;
  /** «nativo-xxxxxxxxxxxx». */
  nuevaSesion(): string;
  estado(): Promise<EstadoCanalNativo | null>;
  enviar(ip: string, puerto: number, json: string): Promise<{ ok: true; ms: number } | { ok: false; motivo: string }>;
  yo(): Promise<QuienNativo | null>;
  vinculos(): VinculoMinimo[];
  firmar(cuerpo: unknown): Promise<unknown | null>;
  verificar(sobre: unknown): Promise<{ cuerpo: unknown; huella?: string; valido: boolean }>;
  webrtc(): boolean;
  /** ¿Hay ya un enlace local WebRTC abierto con esa neurona (por QR o por este canal)? */
  enlaceLocalCon(neurona: string): boolean;
  ofrecer(o: { sesion: string; nombre: string; nombreRemoto?: string }): Promise<ResultadoConexion>;
  responder(o: { sesion: string; sdp: string; nombre: string; nombreRemoto?: string }): Promise<ResultadoConexion>;
  /** Un `tu.*` de una IP ligada → transporte universal (sin acuse propio: ya acusó la app). */
  entregarTransporte(texto: string, origen: { enlaceId: string; etiqueta: string; syncDeviceId?: string }): void;
  /** Un `archivo.*` de una IP ligada → motor de archivos (que siempre pregunta). */
  entregarArchivo(canal: CanalArchivos, texto: string, etiquetaOrigen: string): void;
}

export interface ResultadoEnvioNativo {
  ok: boolean;
  /** Ida y vuelta medida (conectar + trama + acuse de la otra app). */
  ms?: number;
  motivo?: string;
}

export interface InstantaneaRedNativa {
  escuchando: boolean;
  ligaduras: Ligadura[];
  senales: Record<string, EstadoSenal>;
  caidas: Record<string, number>;
  /** Por qué se rechazó el último saludo (para el panel; null si ninguno). */
  ultimoRechazo: string | null;
}

export interface RedNativa {
  /** Mira el canal, saluda a las vinculadas y da un paso a la señalización. */
  refrescar(): Promise<void>;
  ticSenales(): Promise<void>;
  enlaces(): EnlaceDisponible[];
  /** Manda un texto (objeto JSON) a esa IP por su cola; se resuelve con el acuse de la otra app. */
  enviarTexto(ip: string, texto: string, puerto?: number): Promise<ResultadoEnvioNativo>;
  /** Canal del motor de archivos hacia esa IP (cola `datos`, con su ocupación como freno). */
  canalArchivos(ip: string): CanalArchivos;
  /** Entrada de lo que llegó por el canal local desde `ip` (lo no ligado se ignora). */
  recibir(cuerpo: string, ip: string): Promise<void>;
  colaBytes(ip: string): number;
  instantanea(): InstantaneaRedNativa;
  suscribir(cb: () => void): () => void;
}

/* ══════════════════════════ Motor ══════════════════════════ */

/** Tope de lo encolado en `datos` por IP: el motor de archivos ve la cola ×4 y frena a ~256 KiB. */
export const MAX_COLA_DATOS = 4 * 1024 * 1024;
export const FACTOR_FRENO_ARCHIVOS = 4;

interface Item {
  texto: string;
  fin(r: ResultadoEnvioNativo): void;
}

interface Cola {
  puerto: number;
  control: Item[];
  datos: Item[];
  bytesDatos: number;
  bombeando: boolean;
  cubeta: Cubeta | null;
  claveLimites: string;
  fallos: number;
}

const nadaQueHacer = () => undefined;

export function crearRedNativa(deps: DepsRedNativa): RedNativa {
  let ligaduras: Ligadura[] = [];
  let escuchando = false;
  let vecinos: VecinoMinimo[] = [];
  let misLimites: LimitesCanal | null = null;
  let ultimoRechazo: string | null = null;
  const ultimoHola: Record<string, number> = {};
  const caidas: Record<string, number> = {};
  const rtt: Record<string, number> = {};
  const colas = new Map<string, Cola>();
  const canales = new Map<string, CanalArchivos>();
  const senales = new Map<string, EstadoSenal>();
  const conexiones = new Map<string, { neurona: string; conx: ConexionSenal; baja: () => void }>();
  const ofertas = new Map<string, string>();
  const respuestas = new Map<string, string>();
  const oyentes = new Set<() => void>();

  const avisar = () => {
    for (const f of Array.from(oyentes)) {
      try {
        f();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const puertoDe = (ip: string): number => {
    const l = ligaduraDeIp(ligaduras, ip, deps.ahora());
    if (l) return l.puerto;
    const v = vecinos.find((x) => x.ip === ip);
    return v && v.puerto >= 1024 ? v.puerto : PUERTO_CANAL_NATIVO;
  };

  const cola = (ip: string, puerto?: number): Cola => {
    let c = colas.get(ip);
    if (!c) {
      c = { puerto: puerto ?? puertoDe(ip), control: [], datos: [], bytesDatos: 0, bombeando: false, cubeta: null, claveLimites: "", fallos: 0 };
      colas.set(ip, c);
    } else if (puerto) {
      c.puerto = puerto;
    }
    return c;
  };

  const caido = (ip: string) => (caidas[ip] ?? 0) > deps.ahora();

  async function bombear(ip: string): Promise<void> {
    const c = colas.get(ip);
    if (!c || c.bombeando) return;
    c.bombeando = true;
    try {
      while (c.control.length || c.datos.length) {
        const fuente = c.control.length ? c.control : c.datos;
        const lig = ligaduraDeIp(ligaduras, ip, deps.ahora());
        const lim = lig?.limites ?? LIMITES_CANAL_ANTERIOR;
        const trama = armarTrama(
          fuente.map((i) => i.texto),
          maxTextoPorTrama(lim),
        );
        if (!trama.cuerpo) {
          for (const i of fuente.splice(0, Math.max(1, trama.usados))) {
            if (fuente === c.datos) c.bytesDatos -= i.texto.length;
            i.fin({ ok: false, motivo: trama.motivo ?? "no se pudo armar la trama" });
          }
          continue;
        }
        // Ritmo: nunca más del 90 % de lo que el limitador del otro deja pasar.
        const clave = `${lim.porVentana}/${lim.ventanaMs}`;
        if (!c.cubeta || c.claveLimites !== clave) {
          c.cubeta = nuevaCubeta(lim, deps.ahora());
          c.claveLimites = clave;
        }
        for (;;) {
          const f = tomarFicha(c.cubeta, deps.ahora());
          c.cubeta = f.cubeta;
          if (!f.esperaMs) break;
          await deps.dormir(f.esperaMs);
        }
        const n = trama.usados;
        let r: Awaited<ReturnType<DepsRedNativa["enviar"]>>;
        try {
          r = await deps.enviar(ip, lig?.puerto ?? c.puerto, trama.cuerpo);
        } catch {
          r = { ok: false, motivo: "la app nativa no respondió" };
        }
        if (r.ok) {
          const hechos = fuente.splice(0, n);
          if (fuente === c.datos) for (const i of hechos) c.bytesDatos -= i.texto.length;
          rtt[ip] = r.ms;
          c.fallos = 0;
          for (const i of hechos) i.fin({ ok: true, ms: r.ms });
          continue;
        }
        c.fallos += 1;
        if (c.fallos >= FALLOS_PARA_CAIDA) {
          caidas[ip] = deps.ahora() + CAIDA_MS;
          c.fallos = 0;
          c.bytesDatos = 0;
          const motivo = `La app de ${ip} no acusa recibo (${r.motivo}); se reintenta en ${Math.round(CAIDA_MS / 1000)} s.`;
          for (const i of [...c.control.splice(0), ...c.datos.splice(0)]) i.fin({ ok: false, motivo });
          avisar();
          break;
        }
        await deps.dormir(esperaTrasFallo(c.fallos));
      }
    } finally {
      c.bombeando = false;
    }
  }

  function encolar(ip: string, texto: string, puerto?: number): Promise<ResultadoEnvioNativo> {
    const ipOk = ipLocal(ip);
    if (!ipOk) return Promise.resolve({ ok: false, motivo: `«${ip}» no es de esta red local.` });
    if (caido(ipOk)) return Promise.resolve({ ok: false, motivo: "Ese aparato no acusa recibo ahora; se reintenta en unos segundos." });
    const c = cola(ipOk, puerto);
    return new Promise((fin) => {
      const item: Item = { texto, fin };
      if (claseDeTexto(texto) === "datos") {
        c.datos.push(item);
        c.bytesDatos += texto.length;
      } else {
        c.control.push(item);
      }
      // La bomba arranca en la siguiente microtarea: lo encolado seguido (trozos de un archivo) sale junto.
      void Promise.resolve().then(() => bombear(ipOk));
    });
  }

  function canalArchivos(ip: string): CanalArchivos {
    let canal = canales.get(ip);
    if (!canal) {
      canal = {
        enviar: (t) => {
          const c = cola(ip);
          if (caido(ip) || c.bytesDatos + t.length > MAX_COLA_DATOS) return false;
          void encolar(ip, t);
          return true;
        },
        bufferedAmount: () => (colas.get(ip)?.bytesDatos ?? 0) * FACTOR_FRENO_ARCHIVOS,
        alMensaje: () => nadaQueHacer,
      };
      canales.set(ip, canal);
    }
    return canal;
  }

  async function firmarYEnviar(ip: string, puerto: number | undefined, t: "nl.hola" | "nl.sen", cuerpo: unknown): Promise<ResultadoEnvioNativo> {
    const s = await deps.firmar(cuerpo);
    if (!s) return { ok: false, motivo: "no se pudo firmar con la identidad de malla" };
    return encolar(ip, JSON.stringify({ t, s }), puerto);
  }

  async function saludar(ip: string, puerto: number, neurona: string, resp: boolean): Promise<void> {
    const yo = await deps.yo();
    if (!yo) return;
    ultimoHola[ip] = deps.ahora();
    await firmarYEnviar(ip, puerto, "nl.hola", holaNativa({ de: yo, para: neurona, limites: misLimites, webrtc: deps.webrtc(), resp, ts: deps.ahora() }));
  }

  async function verificarSobre(cuerpo: string): Promise<{ cuerpo: unknown; huella?: string } | null> {
    let o: unknown;
    try {
      o = JSON.parse(cuerpo);
    } catch {
      return null;
    }
    const sobre = (o as { s?: unknown } | null)?.s;
    if (!sobre) return null;
    try {
      const v = await deps.verificar(sobre);
      return v.valido ? { cuerpo: v.cuerpo, huella: v.huella } : null;
    } catch {
      return null;
    }
  }

  async function recibirHola(cuerpo: string, ip: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    if (!v) return;
    const h = leerHola(v.cuerpo);
    const yo = await deps.yo();
    if (!h || !yo) return;
    const ac = aceptarHola(h, v.huella, yo.neurona, deps.vinculos());
    if (!ac.ok) {
      ultimoRechazo = ac.motivo;
      avisar();
      return;
    }
    const nueva = !ligaduraDeNeurona(ligaduras, h.de.neurona, deps.ahora());
    const puerto = vecinos.find((x) => x.ip === ip)?.puerto ?? colas.get(ip)?.puerto ?? PUERTO_CANAL_NATIVO;
    ligaduras = ligar(ligaduras, {
      ip,
      puerto: puerto >= 1024 ? puerto : PUERTO_CANAL_NATIVO,
      neurona: h.de.neurona,
      huella: v.huella as string,
      nombre: ac.vinculo.nombre || h.de.nombre,
      ...((ac.vinculo.sync ?? h.de.sync) ? { sync: ac.vinculo.sync ?? h.de.sync } : {}),
      ...((ac.vinculo.cuenta ?? h.de.cuenta) ? { cuenta: ac.vinculo.cuenta ?? h.de.cuenta } : {}),
      limites: h.lim ? leerLimites(h.lim) : { ...LIMITES_CANAL_ANTERIOR },
      webrtc: h.webrtc,
      at: deps.ahora(),
    });
    delete caidas[ip];
    ultimoRechazo = null;
    avisar();
    if (!h.resp && deps.ahora() - (ultimoHola[ip] ?? -Infinity) >= 1000) await saludar(ip, puerto, h.de.neurona, true);
    if (nueva) await ticSenales();
  }

  /* ─────────────── Señalización ─────────────── */

  function evento(neurona: string, ev: EventoSenal): void {
    const r = pasoSenal(senales.get(neurona) ?? SENAL_INICIAL, ev);
    senales.set(neurona, r.estado);
    for (const a of r.acciones) void ejecutar(neurona, a);
    avisar();
  }

  async function mandarSenal(lig: Ligadura, p: Pick<SenalNativa, "k" | "s" | "sdp">): Promise<ResultadoEnvioNativo> {
    const yo = await deps.yo();
    if (!yo) return { ok: false, motivo: "sin identidad de esta neurona" };
    const s: SenalNativa = { t: "nl.sen", v: 1, k: p.k, s: p.s, de: yo.neurona, para: lig.neurona, ...(p.sdp ? { sdp: p.sdp } : {}), n: yo.nombre, ts: deps.ahora() };
    return firmarYEnviar(lig.ip, lig.puerto, "nl.sen", s);
  }

  function guardarConexion(sesion: string, neurona: string, conx: ConexionSenal): void {
    const baja = conx.alCambiar((e, motivo) => {
      if (e === "abierta") {
        evento(neurona, { t: "abierta", sesion, ahora: deps.ahora() });
        return;
      }
      // En curso → fallo (la máquina reintenta); ya abierta → el siguiente tic ve que no hay enlace.
      evento(neurona, { t: "fallo", sesion, ahora: deps.ahora(), motivo: motivo ?? (e === "cerrada" ? "la conexión se cerró" : "la conexión falló") });
      soltarConexion(sesion);
    });
    conexiones.set(sesion, { neurona, conx, baja });
  }

  function soltarConexion(sesion: string): void {
    const c = conexiones.get(sesion);
    if (!c) return;
    conexiones.delete(sesion);
    try {
      c.baja();
    } catch {
      /* noop */
    }
    try {
      c.conx.cancelar();
    } catch {
      /* noop */
    }
  }

  async function ejecutar(neurona: string, a: AccionSenal): Promise<void> {
    const lig = ligaduraDeNeurona(ligaduras, neurona, deps.ahora());
    const fallo = (motivo: string) => evento(neurona, { t: "fallo", sesion: a.sesion, ahora: deps.ahora(), motivo });
    if (a.a === "cancelar") {
      soltarConexion(a.sesion);
      ofertas.delete(a.sesion);
      respuestas.delete(a.sesion);
      if (a.avisar && lig) await mandarSenal(lig, { k: "cierre", s: a.sesion });
      return;
    }
    if (!lig) return fallo("ya no hay ligadura con esa neurona");
    const yo = await deps.yo();
    if (!yo) return fallo("sin identidad de esta neurona");
    if (a.a === "ofrecer") {
      const r = await deps.ofrecer({ sesion: a.sesion, nombre: yo.nombre, nombreRemoto: lig.nombre });
      if (!r.ok) return fallo(r.motivo);
      guardarConexion(a.sesion, neurona, r);
      const env = await mandarSenal(lig, { k: "oferta", s: a.sesion, sdp: r.sdp });
      if (!env.ok) return fallo(env.motivo ?? "la oferta no salió");
      evento(neurona, { t: "oferta-enviada", sesion: a.sesion, ahora: deps.ahora() });
      return;
    }
    if (a.a === "responder") {
      const sdp = ofertas.get(a.sesion);
      ofertas.delete(a.sesion);
      if (!sdp) return fallo("la oferta ya no está");
      const r = await deps.responder({ sesion: a.sesion, sdp: candidatosConIp(sdp, lig.ip), nombre: yo.nombre, nombreRemoto: lig.nombre });
      if (!r.ok) return fallo(r.motivo);
      guardarConexion(a.sesion, neurona, r);
      const env = await mandarSenal(lig, { k: "respuesta", s: a.sesion, sdp: r.sdp });
      if (!env.ok) return fallo(env.motivo ?? "la respuesta no salió");
      evento(neurona, { t: "respuesta-enviada", sesion: a.sesion, ahora: deps.ahora() });
      return;
    }
    // completar
    const sdp = respuestas.get(a.sesion);
    respuestas.delete(a.sesion);
    const c = conexiones.get(a.sesion);
    if (!sdp || !c?.conx.completar) return fallo("no hay oferta propia a la que aplicar la respuesta");
    const r = await c.conx.completar(candidatosConIp(sdp, lig.ip));
    if (!r.ok) fallo(r.motivo ?? "la respuesta no encaja");
  }

  async function recibirSenal(cuerpo: string, ip: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    if (!v) return;
    const s = leerSenal(v.cuerpo);
    const lig = ligaduraDeIp(ligaduras, ip, deps.ahora());
    // Solo de la neurona LIGADA a esa IP y firmada por la misma identidad que la ligó.
    if (!s || !lig || lig.neurona !== s.de || lig.huella !== v.huella) return;
    const yo = await deps.yo();
    if (!yo || s.para !== yo.neurona) return;
    const ahora = deps.ahora();
    // Lo que la máquina no adopta (oferta ignorada, respuesta vieja) no se guarda.
    if (s.k === "oferta" && s.sdp) {
      ofertas.set(s.s, s.sdp);
      evento(lig.neurona, { t: "oferta-recibida", sesion: s.s, ahora, ofrezco: quienOfrece(yo.neurona, lig.neurona) });
      if (senales.get(lig.neurona)?.sesion !== s.s) ofertas.delete(s.s);
    } else if (s.k === "respuesta" && s.sdp) {
      respuestas.set(s.s, s.sdp);
      evento(lig.neurona, { t: "respuesta-recibida", sesion: s.s, ahora });
      if (senales.get(lig.neurona)?.sesion !== s.s) respuestas.delete(s.s);
    } else if (s.k === "cierre") {
      evento(lig.neurona, { t: "cierre-recibido", sesion: s.s, ahora });
    }
  }

  async function ticSenales(): Promise<void> {
    const yo = await deps.yo();
    if (!yo) return;
    const ahora = deps.ahora();
    const vistas = new Set<string>();
    for (const l of ligaduras) {
      if (ahora - l.at > 5 * 60_000) continue;
      vistas.add(l.neurona);
      evento(l.neurona, {
        t: "tic",
        ahora,
        posible: escuchando && deps.webrtc() && l.webrtc,
        ofrezco: quienOfrece(yo.neurona, l.neurona),
        enlaceAbierto: deps.enlaceLocalCon(l.neurona),
        sesionNueva: deps.nuevaSesion(),
      });
    }
    for (const n of Array.from(senales.keys())) {
      if (vistas.has(n)) continue;
      evento(n, { t: "tic", ahora, posible: false, ofrezco: false, enlaceAbierto: deps.enlaceLocalCon(n), sesionNueva: deps.nuevaSesion() });
    }
  }

  /* ─────────────── Entrada ─────────────── */

  async function recibir(cuerpo: string, ip: string): Promise<void> {
    const ipOk = ipLocal(ip);
    if (!ipOk || typeof cuerpo !== "string") return;
    if (cuerpo.startsWith('{"t":"nl.lote"')) {
      for (const t of desempaquetarLote(cuerpo) ?? []) await recibir(t, ipOk);
      return;
    }
    if (cuerpo.startsWith('{"t":"nl.hola"')) return recibirHola(cuerpo, ipOk);
    if (cuerpo.startsWith('{"t":"nl.sen"')) return recibirSenal(cuerpo, ipOk);
    const lig = ligaduraDeIp(ligaduras, ipOk, deps.ahora());
    if (!lig) return; // sin vínculo y saludo firmado, ni mensajes ni archivos
    try {
      if (cuerpo.startsWith('{"t":"tu.')) {
        deps.entregarTransporte(cuerpo, { enlaceId: idEnlaceNativo(ipOk), etiqueta: `${lig.nombre} · red local`, ...(lig.sync ? { syncDeviceId: lig.sync } : {}) });
      } else if (cuerpo.startsWith('{"t":"archivo.')) {
        deps.entregarArchivo(canalArchivos(ipOk), cuerpo, `${lig.nombre} (red local · app nativa)`);
      }
    } catch {
      /* un oyente roto no tumba el canal */
    }
  }

  async function refrescar(): Promise<void> {
    let st: EstadoCanalNativo | null = null;
    try {
      st = await deps.estado();
    } catch {
      st = null;
    }
    escuchando = !!st?.escuchando;
    vecinos = st?.vecinos ?? [];
    misLimites = st?.limites ?? null;
    const ahora = deps.ahora();
    ligaduras = podarLigaduras(ligaduras, ahora);
    if (escuchando) {
      const destinos = destinosHola({ vecinos, vinculos: deps.vinculos(), ligaduras, ultimoHola, ahora });
      await Promise.all(destinos.map((d) => saludar(d.ip, d.puerto, d.neurona, false)));
    }
    await ticSenales();
    avisar();
  }

  return {
    refrescar,
    ticSenales,
    enlaces: () => enlacesNativos({ ligaduras, ahora: deps.ahora(), escuchando, caidas, rtt }),
    enviarTexto: (ip, texto, puerto) => encolar(ip, texto, puerto),
    canalArchivos: (ip) => canalArchivos(ipLocal(ip) ?? ip),
    recibir,
    colaBytes: (ip) => colas.get(ip)?.bytesDatos ?? 0,
    instantanea: () => ({
      escuchando,
      ligaduras: [...ligaduras],
      senales: Object.fromEntries(senales),
      caidas: { ...caidas },
      ultimoRechazo,
    }),
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
  };
}

/* ══════════════════════════ Instancia real (solo en la app nativa) ══════════════════════════ */

let red: RedNativa | null = null;

/** La red nativa de esta página, si arrancó (solo en la app nativa). */
export function redLocalNativaActiva(): RedNativa | null {
  return red;
}

function sesionNueva(): string {
  try {
    const a = crypto.getRandomValues(new Uint8Array(9));
    return PREFIJO_SESION_NATIVA + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  } catch {
    return `${PREFIJO_SESION_NATIVA}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function aConexion(
  emp: { estado(): string; motivo(): string | null; alCambiar(cb: () => void): () => void; cancelar(): void },
  sdp: string,
  completar?: (sdp: string) => Promise<{ ok: boolean; motivo?: string }>,
): ConexionSenal {
  return {
    sdp,
    ...(completar ? { completar } : {}),
    cancelar: () => emp.cancelar(),
    alCambiar: (cb) =>
      emp.alCambiar(() => {
        const e = emp.estado();
        if (e === "abierto") cb("abierta");
        else if (e === "fallido") cb("fallida", emp.motivo() ?? undefined);
        else if (e === "cerrado") cb("cerrada", emp.motivo() ?? undefined);
      }),
  };
}

async function depsReales(): Promise<DepsRedNativa> {
  const [{ puenteNativo }, sync, { enlacesLocalesVivos }, { identidadDispositivo }] = await Promise.all([
    import("@/lib/nativa/puente"),
    import("./sincronizacion-neuronas-motor"),
    import("./registro-enlaces-locales"),
    import("@/lib/network/identidad-dispositivo"),
  ]);
  const motor = sync.motorSync();
  motor.cargar();
  return {
    ahora: () => Date.now(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    nuevaSesion: sesionNueva,
    estado: async () => {
      const r = await puenteNativo().llamar<{ escuchando: boolean; vecinos: VecinoMinimo[]; max_cuerpo?: number; limite_mensajes?: number; limite_ventana_ms?: number }>("malla_local_estado");
      if (!r.ok || !r.valor) return null;
      const v = r.valor;
      return {
        escuchando: !!v.escuchando,
        vecinos: Array.isArray(v.vecinos) ? v.vecinos : [],
        limites: typeof v.max_cuerpo === "number" ? leerLimites(v) : null,
      };
    },
    enviar: async (ip, puerto, json) => {
      const r = await puenteNativo().llamar<{ ms: number }>("malla_local_enviar", { ip, puerto, json });
      return r.ok ? { ok: true, ms: Number(r.valor?.ms) || 0 } : { ok: false, motivo: r.motivo };
    },
    yo: async () => {
      try {
        const id = identidadDispositivo();
        const cuenta = await sync.cuentaDeEstaNeurona();
        return {
          neurona: id.neuronDeviceId,
          ...(id.syncDeviceId ? { sync: id.syncDeviceId } : {}),
          ...(cuenta ? { cuenta } : {}),
          nombre: sync.nombreDeEstaNeurona(id.neuronDeviceId),
        };
      } catch {
        return null;
      }
    },
    vinculos: () => motor.instantanea().vinculos,
    firmar: async (cuerpo) => {
      const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
      const s = await wrapSigned(cuerpo);
      return (s as { v?: unknown }).v === 2 ? s : null;
    },
    verificar: async (sobre) => {
      const [{ unwrapSigned }, { acceptFreshness }] = await Promise.all([import("@/ai/astraura/mesh/mesh-identity"), import("@/ai/astraura/mesh/replay-guard")]);
      const r = await unwrapSigned(sobre);
      const b = r.body as { t?: unknown; ts?: unknown; s?: unknown } | null;
      const clave = b && typeof b.t === "string" ? `${b.t}:${String(b.s ?? b.ts ?? "")}` : undefined;
      const fresco = r.verified && typeof r.ts === "number" && !!r.nonce && acceptFreshness(r.fp, r.ts, r.nonce, clave);
      return { cuerpo: r.body, huella: r.fp, valido: r.verified && fresco };
    },
    webrtc: () => typeof RTCPeerConnection === "function",
    enlaceLocalCon: (neurona) => enlacesLocalesVivos().some((e) => e.par.neuronDeviceId === neurona),
    ofrecer: async (o) => {
      const em = await import("./emparejar-sin-internet");
      const r = await em.ofrecerPorCanal({ sesion: o.sesion, nombre: o.nombre, nombreRemoto: o.nombreRemoto });
      return r.ok ? { ok: true, ...aConexion(r.emp, r.sdp, r.completar) } : r;
    },
    responder: async (o) => {
      const em = await import("./emparejar-sin-internet");
      const r = await em.responderPorCanal({ sesion: o.sesion, sdp: o.sdp, nombre: o.nombre, nombreRemoto: o.nombreRemoto });
      return r.ok ? { ok: true, ...aConexion(r.emp, r.sdp) } : r;
    },
    entregarTransporte: (texto, origen) => {
      void import("./transporte-universal")
        .then((tu) => tu.despacharTextoTransporte(texto, { tipo: "nativo", ...origen }, nadaQueHacer))
        .catch(nadaQueHacer);
    },
    entregarArchivo: (canal, texto, etiquetaOrigen) => {
      void import("@/lib/network/archivos-malla")
        .then((am) => am.motorArchivosCompartido().manejarMensaje(canal, texto, { mismaCuenta: false, etiquetaOrigen, verificarPermiso: () => true }))
        .catch(nadaQueHacer);
    },
  };
}

/**
 * iniciarRedLocalNativa — arranca el enlace `nativo:<ip>` y la señalización WebRTC por el canal local
 * (solo en la app nativa; en el navegador no hace nada). Lo arranca `iniciarSincronizacionNeuronas`.
 */
export function iniciarRedLocalNativa(): () => void {
  let vivo = true;
  const relojes: Array<ReturnType<typeof setInterval>> = [];
  void depsReales()
    .then((deps) => {
      if (!vivo) return;
      const r = crearRedNativa(deps);
      red = r;
      void r.refrescar();
      relojes.push(setInterval(() => void r.refrescar(), 15_000));
      relojes.push(setInterval(() => void r.ticSenales(), 5_000));
    })
    .catch(nadaQueHacer);
  return () => {
    vivo = false;
    for (const t of relojes.splice(0)) clearInterval(t);
    red = null;
  };
}

/** Solo pruebas: fija (o quita) la instancia de la página. */
export function __fijarRedNativaParaPruebas(r: RedNativa | null): void {
  red = r;
}
