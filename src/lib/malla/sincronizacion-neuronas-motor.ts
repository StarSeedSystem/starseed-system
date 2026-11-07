"use client";

/**
 * sincronizacion-neuronas-motor — el motor CON RED de la sincronización entre neuronas (2026-11-07 · MSH1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/sincronizacion-neuronas.md`. La lógica pura (mensajes, estados, vínculos,
 * candidatos, plan) está en `sincronizacion-neuronas.ts`; aquí se envía, se recibe y se guarda.
 *
 * Vías, en este orden (el resultado dice SIEMPRE cuál se usó y por qué fallaron las demás):
 *   1. Canal local de la app nativa (TCP 47071, `native/src-tauri/src/malla_local.rs`) a las neuronas que
 *      su faro oye en esta red: llega al instante y sin internet.
 *   2. Transporte universal (`transporte-universal.ts`): enlace emparejado por QR, malla P2P de la cuenta,
 *      vínculo entre cuentas o relé con identidad.
 *   3. Relé cifrado de la cuenta, sin destinatario (lo recogen todas tus neuronas y solo la nombrada
 *      contesta) cuando hay internet y sesión.
 * Cada mensaje va FIRMADO con la identidad de malla (`wrapSigned`) y se comprueba al llegar (firma +
 * guarda anti-reenvío). La app nativa solo transporta.
 *
 * Ligero a propósito: el radar importa `useRedLocal()`; el transporte universal, el relé y la cuenta se
 * cargan con `import()` solo al usarlos.
 */

import { useSyncExternalStore } from "react";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { alRegistrarEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import { unwrapSigned, wrapSigned } from "@/ai/astraura/mesh/mesh-identity";
import { acceptFreshness } from "@/ai/astraura/mesh/replay-guard";
import {
  CANAL_PING,
  CANAL_SYNC,
  CLAVE_VINCULOS_LOCAL,
  EVENTO_MALLA_LOCAL,
  PUERTO_MALLA_LOCAL,
  autoAceptable,
  candidatosRedLocal,
  claveVinculosCuenta,
  esTerminal,
  esperaMiRespuesta,
  fusionarVinculos,
  leerMensaje,
  leerVinculos,
  mensajeCancelada,
  mensajeRespuesta,
  mensajeSolicitud,
  mensajeVinculada,
  nuevaEntrante,
  nuevaSaliente,
  permitirSolicitud,
  planDeEnvio,
  ponerVinculo,
  quitarVinculo,
  reconexionesPendientes,
  serializarVinculos,
  sincronizacionesDe,
  solicitudParaMi,
  textoEstado,
  textoVia,
  tieneIdentidad,
  transicion,
  viaDeOrigen,
  viaDeTipoEnlace,
  viasDeVinculo,
  vinculoDeSolicitud,
  type DestinoSync,
  type DisponibilidadVias,
  type EstadoRedLocal,
  type LatenciaVia,
  type MedidasVias,
  type MensajeRedLocal,
  type MensajeSync,
  type NeuronaSync,
  type SincronizacionResumen,
  type SolicitudSync,
  type VecinoRedLocal,
  type ViaSync,
  type VinculoNeurona,
} from "./sincronizacion-neuronas";
import {
  AJUSTES_VINCULO_DEFECTO,
  CLAVE_AJUSTES_VINCULOS,
  cambiarAjustes,
  filtrarPasos,
  fraseViasQuitadas,
  leerMapaAjustes,
  serializarMapaAjustes,
  viaPermitida,
  type AjustesVinculo,
  type MapaAjustesVinculos,
} from "./ajustes-vinculo";
import { desempaquetarLote, ipDeEnlaceNativo } from "./red-local-nativa";

/* ══════════════════════════ Tipos públicos ══════════════════════════ */

export interface IntentoSync {
  via: ViaSync | null;
  ok: boolean;
  detalle: string;
}

export interface ResultadoSolicitud {
  ok: boolean;
  /** Id de la solicitud (también si falló: queda en la lista con su motivo). */
  id: string | null;
  via: ViaSync | null;
  /** Frase para la interfaz: por qué vía fue, o por qué no pudo ir. */
  detalle: string;
  intentos: IntentoSync[];
  /** Sin internet y sin canal nativo: ofrecer «Vincular sin internet» (QR). */
  ofrecerQr: boolean;
}

export interface OpcionesSolicitud {
  /** Reconexión automática de un vínculo recordado (nadie pulsó nada: sin avisos de error). */
  auto?: boolean;
  /** Marcar «recordar» desde el principio (por defecto, lo que ya se recordaba de esa neurona). */
  recordar?: boolean;
  /** La lanza un agente en nombre de la persona: ella también tendrá que aceptarla. */
  porAgente?: boolean;
}

export interface OrigenSync {
  via: ViaSync;
  ip?: string;
  enlaceId?: string;
  syncDeviceId?: string;
  etiqueta?: string;
}

export interface AvisoSync {
  tipo: "vinculadas" | "reconectada" | "rechazada" | "caducada" | "cancelada";
  solicitud: SolicitudSync;
  texto: string;
}

/** Un vínculo con lo que se sabe AHORA de él (para el panel del vínculo). */
export interface VinculoVivo extends VinculoNeurona {
  /** Su faro se oye ahora en esta red. */
  enRedLocal: boolean;
  /** Cada vía: si está disponible y su latencia medida. */
  vias: LatenciaVia[];
  /** Solicitudes con esa neurona en esta sesión (la más reciente primero) y su estado. */
  sincronizaciones: SincronizacionResumen[];
  /** Ajustes de ESTE aparato con esa neurona: reconectar sola y vías permitidas (VIN1107A). */
  ajustes: AjustesVinculo;
}

export interface EnlaceHacia {
  id: string;
  tipo: string;
  rttMs: number | null;
}

export type ResultadoNativo = { ok: true; ms: number } | { ok: false; motivo: string };

export interface ResultadoTransporte {
  ok: boolean;
  confirmado: boolean;
  tipo: string | null;
  enlaceId?: string;
  etiqueta?: string;
  motivo?: string;
  ms: number;
}

export interface DestinoTransporteSync {
  enlaceId?: string;
  neuronDeviceId?: string;
  syncDeviceId?: string;
  identidadRele?: string;
}

/** Todo lo que el motor necesita del mundo (inyectable: las pruebas montan dos neuronas en memoria). */
export interface DepsMotorSync {
  ahora(): number;
  nuevoId(): string;
  /** Id de neurona de este aparato (síncrono: para las claves de almacenamiento). */
  neuronaPropia(): string;
  yo(): Promise<NeuronaSync>;
  miCuenta(): Promise<string | null>;
  /** Sobre firmado del mensaje (null si no se puede firmar). */
  firmar(m: MensajeSync): Promise<unknown | null>;
  /** Comprueba firma y frescura; devuelve el mensaje y la huella de quien firmó. */
  verificar(sobre: unknown): Promise<{ cuerpo: unknown; huella?: string; valido: boolean }>;
  nativa: {
    disponible(): boolean;
    estado(): Promise<EstadoRedLocal | null>;
    enviar(ip: string, puerto: number, json: string): Promise<ResultadoNativo>;
  };
  transporte: {
    enviar(destino: DestinoTransporteSync, canal: string, cuerpo: unknown): Promise<ResultadoTransporte>;
    releCuenta(cuerpo: unknown, uid: string): Promise<{ ok: boolean; motivo?: string }>;
    enlacesHacia(neurona: string | undefined, sync: string | undefined): Promise<EnlaceHacia[]>;
    enLinea(): boolean;
  };
  almacen: { leer(clave: string): string | null; escribir(clave: string, valor: string): void };
}

export interface InstantaneaSync {
  solicitudes: SolicitudSync[];
  vinculos: VinculoVivo[];
  red: EstadoRedLocal | null;
}

export interface MotorSync {
  cargar(): void;
  solicitar(destino: DestinoSync, opts?: OpcionesSolicitud): Promise<ResultadoSolicitud>;
  responder(id: string, acepta: boolean, recordar: boolean): Promise<{ ok: boolean; motivo?: string }>;
  cancelar(id: string): Promise<void>;
  /** Cambia «recordar» de una solicitud en curso (o del vínculo si ya está vinculada). */
  recordar(id: string, recordar: boolean): void;
  recordarVinculo(neurona: string, recordar: boolean): void;
  olvidar(neurona: string): void;
  /** Ajustes de este aparato con esa neurona (por defecto: reconectar sola y todas las vías). */
  ajustes(neurona: string): AjustesVinculo;
  cambiarAjustes(neurona: string, patch: Partial<AjustesVinculo>): void;
  /** Entrada única de todo lo que llega, venga por la vía que venga. */
  recibir(sobre: unknown, origen: OrigenSync): Promise<void>;
  tic(): void;
  refrescarRed(): Promise<EstadoRedLocal | null>;
  activarReconexion(activa: boolean): void;
  alAbrirseEnlace(e: { enlaceId: string; neurona?: string; sync?: string; nombre?: string }): void;
  medirVias(neurona: string): Promise<LatenciaVia[]>;
  solicitud(id: string): SolicitudSync | undefined;
  instantanea(): InstantaneaSync;
  suscribir(cb: () => void): () => void;
  alAviso(cb: (a: AvisoSync) => void): () => void;
}

/* ══════════════════════════ Motor (inyectable) ══════════════════════════ */

const NATIVO_INFO = (ip: string) => `en ${ip}`;

export function crearMotorSync(deps: DepsMotorSync): MotorSync {
  const solicitudes = new Map<string, SolicitudSync>();
  /** IPs a las que se difundió una saliente sin destino exacto (para poder cancelarla). */
  const difundidas = new Map<string, Array<{ ip: string; puerto: number }>>();
  const historial = new Map<string, number[]>();
  const medidas = new Map<string, MedidasVias>();
  const enlacesCache = new Map<string, EnlaceHacia[]>();
  const oyentes = new Set<() => void>();
  const oyentesAviso = new Set<(a: AvisoSync) => void>();
  let vinculos: VinculoNeurona[] = [];
  let ajustesVinculos: MapaAjustesVinculos = {};
  let cargado = false;
  let red: EstadoRedLocal | null = null;
  let cuentaCache: string | null = null;
  let reconexion = false;
  let presentesAntes = new Set<string>();
  const ultimosIntentos: Record<string, number> = {};
  let snap: InstantaneaSync | null = null;

  const emitir = () => {
    snap = null;
    for (const cb of Array.from(oyentes)) {
      try {
        cb();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const avisar = (tipo: AvisoSync["tipo"], s: SolicitudSync) => {
    const a: AvisoSync = { tipo, solicitud: s, texto: textoEstado(s) };
    for (const cb of Array.from(oyentesAviso)) {
      try {
        cb(a);
      } catch {
        /* */
      }
    }
  };

  function cargar(): void {
    if (cargado) return;
    cargado = true;
    const local = leerVinculos(deps.almacen.leer(CLAVE_VINCULOS_LOCAL));
    const propia = deps.neuronaPropia();
    const cuenta = propia ? leerVinculos(deps.almacen.leer(claveVinculosCuenta(propia))) : [];
    vinculos = fusionarVinculos(local, cuenta);
    ajustesVinculos = leerMapaAjustes(deps.almacen.leer(CLAVE_AJUSTES_VINCULOS));
    emitir(); // quien ya miraba (radar, ventana) ve los recordados
  }

  function guardar(): void {
    try {
      deps.almacen.escribir(CLAVE_VINCULOS_LOCAL, serializarVinculos(vinculos, "local"));
      const propia = deps.neuronaPropia();
      if (propia) deps.almacen.escribir(claveVinculosCuenta(propia), serializarVinculos(vinculos, "cuenta"));
    } catch {
      /* sin almacenamiento: el vínculo vive en esta sesión */
    }
  }

  const vinculo = (neurona: string | undefined) => (neurona ? vinculos.find((v) => v.neurona === neurona) : undefined);

  const ajustesDe = (neurona: string | undefined): AjustesVinculo =>
    (neurona ? ajustesVinculos[neurona] : undefined) ?? AJUSTES_VINCULO_DEFECTO;

  function cambiarAjustesDe(neurona: string, patch: Partial<AjustesVinculo>): void {
    cargar();
    ajustesVinculos = cambiarAjustes(ajustesVinculos, neurona, patch);
    try {
      deps.almacen.escribir(CLAVE_AJUSTES_VINCULOS, serializarMapaAjustes(ajustesVinculos));
    } catch {
      /* sin almacenamiento: el ajuste vale en esta sesión */
    }
    emitir();
  }

  function poner(s: SolicitudSync): SolicitudSync {
    solicitudes.set(s.id, s);
    if (solicitudes.size > 100) {
      const viejas = Array.from(solicitudes.values())
        .filter((x) => esTerminal(x.estado))
        .sort((a, b) => a.actualizada - b.actualizada);
      for (const v of viejas.slice(0, solicitudes.size - 100)) solicitudes.delete(v.id);
    }
    emitir();
    return s;
  }

  function actualizar(id: string, f: (s: SolicitudSync) => SolicitudSync): SolicitudSync | undefined {
    const s = solicitudes.get(id);
    if (!s) return undefined;
    const n = f(s);
    if (n !== s) poner(n);
    return n;
  }

  function medir(neurona: string, via: ViaSync, ms: number): void {
    if (!neurona || !Number.isFinite(ms)) return;
    medidas.set(neurona, { ...(medidas.get(neurona) ?? {}), [via]: { ms: Math.max(0, Math.round(ms)), at: deps.ahora() } });
    emitir();
  }

  async function miCuenta(): Promise<string | null> {
    try {
      cuentaCache = (await deps.miCuenta()) ?? null;
    } catch {
      /* se queda la última conocida */
    }
    return cuentaCache;
  }

  function sobreNativo(firmado: unknown, yo: NeuronaSync): Record<string, unknown> {
    return { t: "tu.msg", v: 1, id: deps.nuevoId(), c: CANAL_SYNC, b: firmado, de: { s: yo.sync, n: yo.nombre } };
  }

  /** Contesta por donde llegó (IP local o enlace) y, si no, por cualquier camino hacia esa neurona. */
  async function enviarPorRuta(sol: SolicitudSync, msg: MensajeSync): Promise<{ ok: boolean; via: ViaSync | null; motivo?: string }> {
    const firmado = await deps.firmar(msg);
    if (!firmado) return { ok: false, via: null, motivo: "No se pudo firmar el mensaje." };
    const fallos: string[] = [];
    const yo = await deps.yo();
    const json = JSON.stringify(sobreNativo(firmado, yo));
    // Los ajustes de esa neurona también valen para contestarle (VIN1107A).
    const aj = ajustesDe(sol.otro.neurona);
    if (deps.nativa.disponible() && viaPermitida(aj, "red-local-nativa")) {
      const ips = sol.ip ? [{ ip: sol.ip, puerto: PUERTO_MALLA_LOCAL }] : (difundidas.get(sol.id) ?? []);
      if (ips.length) {
        const rs = await Promise.all(ips.map((d) => deps.nativa.enviar(d.ip, d.puerto, json)));
        if (rs.some((r) => r.ok)) return { ok: true, via: "red-local-nativa" };
        for (const r of rs) if (!r.ok) fallos.push(r.motivo);
      }
    }
    const destinos: DestinoTransporteSync[] = [];
    if (sol.enlaceId) destinos.push({ enlaceId: sol.enlaceId });
    if (sol.otro.neurona || sol.otro.sync) destinos.push({ neuronDeviceId: sol.otro.neurona || undefined, syncDeviceId: sol.otro.sync });
    const transporteOk = !filtrarPasos(aj, ["transporte"]).quitados.length;
    for (const d of transporteOk ? destinos : []) {
      const r = await deps.transporte.enviar(d, CANAL_SYNC, firmado);
      if (r.ok) return { ok: true, via: viaDeTipoEnlace(r.tipo) };
      if (r.motivo) fallos.push(r.motivo);
    }
    const cuenta = await miCuenta();
    if (cuenta && viaPermitida(aj, "rele") && deps.transporte.enLinea() && (!sol.otro.cuenta || sol.otro.cuenta === cuenta)) {
      const r = await deps.transporte.releCuenta(firmado, cuenta);
      if (r.ok) return { ok: true, via: "rele" };
      if (r.motivo) fallos.push(r.motivo);
    }
    return { ok: false, via: null, motivo: fallos.join(" · ") || "No hay camino de vuelta hacia esa neurona." };
  }

  function vinculadas(s: SolicitudSync): void {
    const v = vinculoDeSolicitud(s, vinculo(s.otro.neurona), deps.ahora());
    if (v) {
      vinculos = ponerVinculo(vinculos, v);
      guardar();
      emitir();
    }
    avisar(s.auto ? "reconectada" : "vinculadas", s);
  }

  async function refrescarRed(): Promise<EstadoRedLocal | null> {
    if (!deps.nativa.disponible()) return null;
    let estado: EstadoRedLocal | null = null;
    try {
      estado = await deps.nativa.estado();
    } catch {
      estado = null;
    }
    if (!estado) return red;
    red = estado;
    emitir();
    if (reconexion) revisarReconexiones(estado.vecinos);
    return red;
  }

  function enCurso(): Set<string> {
    const s = new Set<string>();
    for (const x of solicitudes.values()) if (!esTerminal(x.estado) && x.otro.neurona) s.add(x.otro.neurona);
    return s;
  }

  function revisarReconexiones(vecinos: readonly VecinoRedLocal[]): void {
    cargar();
    const ahora = deps.ahora();
    // «Reconectar sola» apagado para una neurona: ni se le pide sola ni se la cuenta como pendiente.
    const r = reconexionesPendientes({ vinculos: vinculos.filter((v) => ajustesDe(v.neurona).reconectarSola), vecinos, presentesAntes, ultimosIntentos, enCurso: enCurso(), ahora });
    presentesAntes = r.presentes;
    for (const x of r.reconectar) {
      ultimosIntentos[x.vinculo.neurona] = ahora;
      void solicitar(
        { neurona: x.vinculo.neurona, sync: x.vinculo.sync, ip: x.ip, nombre: x.vinculo.nombre, cuenta: x.vinculo.cuenta },
        { auto: true, recordar: true },
      );
    }
  }

  async function solicitar(destino: DestinoSync, opts: OpcionesSolicitud = {}): Promise<ResultadoSolicitud> {
    cargar();
    const nada = (detalle: string): ResultadoSolicitud => ({ ok: false, id: null, via: null, detalle, intentos: [], ofrecerQr: false });
    if (!tieneIdentidad(destino)) return nada("Esa señal no dice a qué neurona pertenece: no hay a quién pedirle la sincronización.");
    const yo = await deps.yo();
    if (destino.neurona && destino.neurona === yo.neurona) return nada("Esa neurona eres tú.");
    const ya = Array.from(solicitudes.values()).find(
      (s) =>
        s.direccion === "saliente" &&
        !esTerminal(s.estado) &&
        ((!!destino.neurona && s.otro.neurona === destino.neurona) || (!!destino.ip && s.ip === destino.ip)),
    );
    if (ya) {
      return { ok: true, id: ya.id, via: ya.via, detalle: `Ya hay una solicitud en curso: ${textoEstado(ya)}`, intentos: [], ofrecerQr: false };
    }
    const ahora = deps.ahora();
    const previo = vinculo(destino.neurona);
    const recordar = opts.recordar ?? previo?.recordado ?? false;
    const id = deps.nuevoId();
    const firmado = await deps.firmar(
      mensajeSolicitud({ id, de: yo, para: { neurona: destino.neurona, sync: destino.sync }, ahora, auto: opts.auto, recordar }),
    );
    if (!firmado) {
      return nada("No se pudo firmar la solicitud (este navegador no ofrece WebCrypto): sin firma, la otra neurona no podría saber que eres tú.");
    }
    const otro: NeuronaSync = {
      neurona: destino.neurona ?? "",
      sync: destino.sync,
      cuenta: destino.cuenta ?? previo?.cuenta,
      nombre: destino.nombre ?? previo?.nombre ?? (destino.ip ? `Neurona ${NATIVO_INFO(destino.ip)}` : "Neurona"),
      capacidades: previo?.capacidades ?? [],
    };
    poner({ ...nuevaSaliente({ id, otro, ahora, recordar, auto: opts.auto, aceptoYo: !opts.porAgente }), ...(destino.enlaceId ? { enlaceId: destino.enlaceId } : {}) });

    const intentos: IntentoSync[] = [];
    const nativa = deps.nativa.disponible();
    const estadoRed = nativa ? await refrescarRed() : null;
    const cand = estadoRed ? candidatosRedLocal(estadoRed.vecinos, destino, vinculos) : { exactos: false, lista: [] as VecinoRedLocal[] };
    const cuenta = await miCuenta();
    const planCompleto = planDeEnvio({ nativa, candidatosLan: cand.lista.length, enLinea: deps.transporte.enLinea(), sesion: !!cuenta });
    // Vías que esa neurona tiene permitidas en los ajustes de este aparato (por defecto, todas).
    const filtrado = filtrarPasos(ajustesDe(destino.neurona), planCompleto.pasos);
    const plan = { ...planCompleto, pasos: filtrado.pasos };
    const sinCamino = planCompleto.sinCamino + fraseViasQuitadas(filtrado.quitados);

    for (const paso of plan.pasos) {
      if (paso === "red-local-nativa") {
        const json = JSON.stringify(sobreNativo(firmado, yo));
        const rs = await Promise.all(
          cand.lista.map(async (c) => ({ c, r: await deps.nativa.enviar(c.ip, c.puerto || PUERTO_MALLA_LOCAL, json) })),
        );
        for (const { c, r } of rs) {
          intentos.push({ via: "red-local-nativa", ok: r.ok, detalle: r.ok ? `${c.ip}: entregada en ${r.ms} ms` : `${c.ip}: ${r.motivo}` });
        }
        const ok = rs.filter((x) => x.r.ok);
        if (!ok.length) continue;
        const unico = cand.exactos && ok.length === 1 ? ok[0] : null;
        const detalle = unico ? NATIVO_INFO(unico.c.ip) : `difundida a ${ok.length} neurona${ok.length === 1 ? "" : "s"} de esta red`;
        if (!unico) difundidas.set(id, ok.map((x) => ({ ip: x.c.ip, puerto: x.c.puerto || PUERTO_MALLA_LOCAL })));
        actualizar(id, (s) =>
          unico
            ? transicion({ ...s, ip: unico.c.ip }, { tipo: "entregada", via: "red-local-nativa", detalle }, deps.ahora())
            : { ...s, via: "red-local-nativa", viaDetalle: detalle, actualizada: deps.ahora() },
        );
        if (unico && unico.r.ok && destino.neurona) medir(destino.neurona, "red-local-nativa", unico.r.ms);
        return { ok: true, id, via: "red-local-nativa", detalle: `Solicitud enviada por ${textoVia("red-local-nativa", detalle)} · esperando respuesta`, intentos, ofrecerQr: false };
      }
      if (paso === "transporte") {
        const r = await deps.transporte.enviar(
          { enlaceId: destino.enlaceId, neuronDeviceId: destino.neurona, syncDeviceId: destino.sync, identidadRele: destino.identidadRele },
          CANAL_SYNC,
          firmado,
        );
        const via = viaDeTipoEnlace(r.tipo);
        intentos.push({ via, ok: r.ok, detalle: r.ok ? `${r.etiqueta ?? "enlace"}: ${r.confirmado ? `confirmada en ${r.ms} ms` : "enviada sin acuse"}` : (r.motivo ?? "sin enlace") });
        if (!r.ok || !via) continue;
        const detalle = r.etiqueta;
        const enlaceId = r.enlaceId && (via === "enlace-local" || via === "malla-cuenta" || via === "vinculo-par") ? r.enlaceId : undefined;
        actualizar(id, (s) => {
          const base = { ...s, ...(enlaceId ? { enlaceId } : {}) };
          return r.confirmado
            ? transicion(base, { tipo: "entregada", via, detalle }, deps.ahora())
            : { ...base, via, viaDetalle: detalle, actualizada: deps.ahora() };
        });
        if (r.confirmado && destino.neurona) medir(destino.neurona, via, r.ms);
        return { ok: true, id, via, detalle: `Solicitud enviada por ${textoVia(via, detalle)} · esperando respuesta`, intentos, ofrecerQr: false };
      }
      if (paso === "rele-cuenta" && cuenta) {
        if (destino.cuenta && destino.cuenta !== cuenta) {
          intentos.push({ via: "rele", ok: false, detalle: "es de otra cuenta: el relé de tu cuenta no le llega" });
          continue;
        }
        const r = await deps.transporte.releCuenta(firmado, cuenta);
        intentos.push({ via: "rele", ok: r.ok, detalle: r.ok ? "subida al relé de tu cuenta" : (r.motivo ?? "el relé no la aceptó") });
        if (!r.ok) continue;
        actualizar(id, (s) => ({ ...s, via: "rele", viaDetalle: "de tu cuenta", actualizada: deps.ahora() }));
        return {
          ok: true,
          id,
          via: "rele",
          detalle: "Solicitud enviada por el relé cifrado de tu cuenta · le llegará cuando esa neurona lo consulte",
          intentos,
          ofrecerQr: false,
        };
      }
    }
    actualizar(id, (s) => transicion(s, { tipo: "fallo", motivo: sinCamino }, deps.ahora()));
    return { ok: false, id, via: null, detalle: sinCamino, intentos, ofrecerQr: plan.ofrecerQr };
  }

  async function aplicarRespuesta(
    sol: SolicitudSync,
    acepta: boolean,
    recordarOtro: boolean,
    de: NeuronaSync,
    huella: string,
    origen: OrigenSync,
  ): Promise<void> {
    const s = actualizar(sol.id, (x) =>
      transicion(
        {
          ...x,
          huellaOtro: huella,
          otro: de,
          via: origen.via,
          viaDetalle: origen.ip ? NATIVO_INFO(origen.ip) : (origen.etiqueta ?? x.viaDetalle),
          ip: origen.ip ?? x.ip,
          enlaceId: origen.enlaceId ?? x.enlaceId,
        },
        { tipo: "respuesta", acepta, recordar: recordarOtro },
        deps.ahora(),
      ),
    );
    if (!s) return;
    difundidas.delete(s.id);
    if (s.estado === "vinculada") {
      vinculadas(s);
      await enviarPorRuta(s, mensajeVinculada(s.id, await deps.yo(), s.recordarYo, deps.ahora()));
    } else if (s.estado === "rechazada" && !s.auto) {
      avisar("rechazada", s);
    }
  }

  async function recibirSolicitud(m: MensajeSync, huella: string, origen: OrigenSync, yo: NeuronaSync): Promise<void> {
    const ahora = deps.ahora();
    const directa = origen.via === "red-local-nativa" || origen.via === "enlace-local";
    if (!solicitudParaMi(m, yo, directa)) return;
    if ((m.caduca ?? 0) < ahora || solicitudes.has(m.id)) return;
    // Cruce: yo también le estaba pidiendo sincronizar → su solicitud es su «sí» a la mía.
    const mia = Array.from(solicitudes.values()).find(
      (s) =>
        s.direccion === "saliente" &&
        !esTerminal(s.estado) &&
        s.aceptoYo &&
        (s.otro.neurona === m.de.neurona || (!s.otro.neurona && !!s.ip && s.ip === origen.ip)),
    );
    // Si la recordaba con otra huella, no vale como «sí»: se enseña como solicitud nueva (con aviso).
    const recordada = vinculo(m.de.neurona);
    if (mia && (!recordada?.huella || recordada.huella === huella)) {
      await aplicarRespuesta(mia, true, m.recordar === true, m.de, huella, origen);
      return;
    }
    const lim = permitirSolicitud(historial.get(huella) ?? [], ahora);
    historial.set(huella, lim.historial);
    if (!lim.permitir) return;
    const sol = poner(
      nuevaEntrante(m, {
        via: origen.via,
        viaDetalle: origen.ip ? NATIVO_INFO(origen.ip) : origen.etiqueta,
        ip: origen.ip,
        enlaceId: origen.enlaceId,
        huella,
        ahora,
      }),
    );
    if (ajustesDe(m.de.neurona).reconectarSola && autoAceptable(vinculo(m.de.neurona), huella)) await responder(sol.id, true, true);
  }

  async function recibir(sobre: unknown, origen: OrigenSync): Promise<void> {
    cargar();
    let v: { cuerpo: unknown; huella?: string; valido: boolean };
    try {
      v = await deps.verificar(sobre);
    } catch {
      return;
    }
    if (!v.valido || !v.huella) return; // sin firma válida no se enseña nada a nadie
    const m = leerMensaje(v.cuerpo);
    if (!m) return;
    const yo = await deps.yo();
    if (m.de.neurona === yo.neurona) return; // mi propio eco (p. ej. el relé de la cuenta)
    if (m.t === "sync.solicitud") {
      await recibirSolicitud(m, v.huella, origen, yo);
      return;
    }
    const sol = solicitudes.get(m.id);
    if (!sol) return;
    if (sol.huellaOtro && sol.huellaOtro !== v.huella) return; // otra identidad: no es con quien se hablaba
    if (sol.otro.neurona && sol.otro.neurona !== m.de.neurona) return;
    if (!sol.otro.neurona && sol.otro.sync && m.de.sync !== sol.otro.sync) return;
    const ahora = deps.ahora();
    if (m.t === "sync.respuesta") {
      if (sol.direccion !== "saliente") return;
      // Primer contacto: confianza en el primer uso. Si ya la recordaba, tiene que firmar LA MISMA identidad.
      const recordada = vinculo(m.de.neurona);
      if (recordada?.huella && recordada.huella !== v.huella) return;
      await aplicarRespuesta(sol, m.acepta === true, m.recordar === true, m.de, v.huella, origen);
      return;
    }
    if (m.t === "sync.vinculada") {
      if (sol.direccion !== "entrante") return;
      const s = actualizar(sol.id, (x) => transicion({ ...x, otro: m.de }, { tipo: "confirmada", recordar: m.recordar }, ahora));
      if (s?.estado === "vinculada") vinculadas(s);
      return;
    }
    if (m.t === "sync.cancelada" && sol.huellaOtro) {
      const s = actualizar(sol.id, (x) => transicion(x, { tipo: "cancela-el-otro" }, ahora));
      if (s?.estado === "cancelada" && !s.auto) avisar("cancelada", s);
    }
  }

  async function responder(id: string, acepta: boolean, recordar: boolean): Promise<{ ok: boolean; motivo?: string }> {
    const sol = solicitudes.get(id);
    if (!sol || !esperaMiRespuesta(sol)) return { ok: false, motivo: "Esa solicitud ya no espera respuesta." };
    const ahora = deps.ahora();
    const yo = await deps.yo();
    if (!acepta) {
      actualizar(id, (x) => transicion(x, { tipo: "rechazo" }, ahora));
      const msg = sol.direccion === "entrante" ? mensajeRespuesta(id, yo, false, false, ahora) : mensajeCancelada(id, yo, ahora);
      void enviarPorRuta(sol, msg);
      return { ok: true };
    }
    const s = actualizar(id, (x) => transicion(x, { tipo: "acepto", recordar }, ahora));
    if (!s) return { ok: false, motivo: "La solicitud ya no existe." };
    if (s.direccion === "entrante") {
      const r = await enviarPorRuta(s, mensajeRespuesta(id, yo, true, recordar, ahora));
      if (!r.ok) {
        const motivo = `No se pudo contestar: ${r.motivo ?? "sin camino"}`;
        actualizar(id, (x) => transicion(x, { tipo: "fallo", motivo }, deps.ahora()));
        return { ok: false, motivo };
      }
      return { ok: true };
    }
    if (s.estado === "vinculada") {
      vinculadas(s);
      await enviarPorRuta(s, mensajeVinculada(id, yo, recordar, ahora));
    }
    return { ok: true };
  }

  async function cancelar(id: string): Promise<void> {
    const sol = solicitudes.get(id);
    if (!sol || esTerminal(sol.estado)) return;
    actualizar(id, (x) => transicion(x, { tipo: "cancelo" }, deps.ahora()));
    const yo = await deps.yo();
    await enviarPorRuta(sol, mensajeCancelada(id, yo, deps.ahora()));
    difundidas.delete(id);
  }

  function recordarVinculo(neurona: string, valor: boolean): void {
    cargar();
    const v = vinculo(neurona);
    if (!v || v.recordado === valor) return;
    vinculos = ponerVinculo(vinculos, { ...v, recordado: valor });
    guardar();
    emitir();
  }

  function recordar(id: string, valor: boolean): void {
    const s = solicitudes.get(id);
    if (!s) return;
    if (s.estado === "vinculada") {
      poner({ ...s, recordarYo: valor });
      recordarVinculo(s.otro.neurona, valor);
      return;
    }
    actualizar(id, (x) => transicion(x, { tipo: "recordar", recordar: valor }, deps.ahora()));
  }

  function olvidar(neurona: string): void {
    cargar();
    vinculos = quitarVinculo(vinculos, neurona);
    guardar();
    emitir();
  }

  function tic(): void {
    const ahora = deps.ahora();
    for (const s of Array.from(solicitudes.values())) {
      if (esTerminal(s.estado)) continue;
      const n = transicion(s, { tipo: "reloj" }, ahora);
      if (n !== s) {
        poner(n);
        difundidas.delete(n.id);
        if (n.estado === "caducada" && !n.auto) avisar("caducada", n);
      }
    }
  }

  function alAbrirseEnlace(e: { enlaceId: string; neurona?: string; sync?: string; nombre?: string }): void {
    cargar();
    const v = vinculo(e.neurona) ?? (e.sync ? vinculos.find((x) => x.sync === e.sync) : undefined);
    if (!v || !v.recordado || enCurso().has(v.neurona)) return;
    const ahora = deps.ahora();
    if (ahora - (ultimosIntentos[v.neurona] ?? 0) < 60_000) return;
    ultimosIntentos[v.neurona] = ahora;
    void solicitar({ enlaceId: e.enlaceId, neurona: v.neurona, sync: v.sync, nombre: v.nombre, cuenta: v.cuenta }, { auto: true, recordar: true });
  }

  function vivo(v: VinculoNeurona): VinculoVivo {
    const vec =
      red?.vecinos.find((x) => x.neurona === v.neurona) ?? (v.ultimaIp ? red?.vecinos.find((x) => x.ip === v.ultimaIp && !x.neurona) : undefined);
    const enl = enlacesCache.get(v.neurona) ?? [];
    const de = (tipo: string) => {
      const e = enl.find((x) => x.tipo === tipo);
      return e ? { id: e.id, rttMs: e.rttMs } : null;
    };
    const d: DisponibilidadVias = {
      redLocal: vec ? { ip: vec.ip, canal: vec.canal } : null,
      enlaceLocal: de("local"),
      mallaCuenta: de("cuenta"),
      vinculoPar: de("par"),
      rele: deps.transporte.enLinea() && !!cuentaCache && (!v.cuenta || v.cuenta === cuentaCache),
    };
    return {
      ...v,
      enRedLocal: !!vec,
      vias: viasDeVinculo(d, medidas.get(v.neurona)),
      sincronizaciones: sincronizacionesDe(v.neurona, Array.from(solicitudes.values())),
      ajustes: ajustesDe(v.neurona),
    };
  }

  async function medirVias(neurona: string): Promise<LatenciaVia[]> {
    cargar();
    const v = vinculo(neurona);
    if (deps.nativa.disponible()) {
      const estado = await refrescarRed();
      const vec =
        estado?.vecinos.find((x) => x.neurona === neurona) ??
        (v?.ultimaIp ? estado?.vecinos.find((x) => x.ip === v.ultimaIp && !x.neurona) : undefined);
      if (vec && vec.canal !== false) {
        const r = await deps.nativa.enviar(vec.ip, vec.puerto || PUERTO_MALLA_LOCAL, JSON.stringify({ t: "tu.ping", v: 1 }));
        if (r.ok) medir(neurona, "red-local-nativa", r.ms);
      }
    }
    let enl: EnlaceHacia[] = [];
    try {
      enl = await deps.transporte.enlacesHacia(neurona, v?.sync);
    } catch {
      enl = [];
    }
    enlacesCache.set(neurona, enl);
    for (const e of enl) {
      const r = await deps.transporte.enviar({ enlaceId: e.id }, CANAL_PING, { t: deps.ahora() });
      const via = viaDeTipoEnlace(e.tipo);
      if (r.ok && r.confirmado && via) medir(neurona, via, r.ms);
    }
    await miCuenta();
    emitir();
    const actual = vinculo(neurona);
    return actual ? vivo(actual).vias : [];
  }

  function instantanea(): InstantaneaSync {
    if (snap) return snap;
    snap = {
      solicitudes: Array.from(solicitudes.values()).sort((a, b) => b.creada - a.creada),
      vinculos: vinculos.map(vivo),
      red,
    };
    return snap;
  }

  return {
    cargar,
    solicitar,
    responder,
    cancelar,
    recordar,
    recordarVinculo,
    olvidar,
    ajustes: (neurona) => (cargar(), ajustesDe(neurona)),
    cambiarAjustes: cambiarAjustesDe,
    recibir,
    tic,
    refrescarRed,
    activarReconexion: (activa) => {
      reconexion = activa;
    },
    alAbrirseEnlace,
    medirVias,
    solicitud: (id) => solicitudes.get(id),
    instantanea,
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    alAviso: (cb) => {
      oyentesAviso.add(cb);
      return () => {
        oyentesAviso.delete(cb);
      };
    },
  };
}

/* ══════════════════════════ Dependencias reales ══════════════════════════ */

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function cuentaActual(): Promise<string | null> {
  try {
    const m = await import("@/lib/consumo/usuario");
    return (await m.uidActual()) ?? null;
  } catch {
    return null;
  }
}

function plataforma(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac/i.test(ua)) return "macOS";
  if (/Win/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return undefined;
}

/** Cuenta con la que está esta neurona (null sin sesión). También la usa el canal nativo (MLT1107A). */
export function cuentaDeEstaNeurona(): Promise<string | null> {
  return cuentaActual();
}

/** Nombre que la persona le puso a esta neurona (preferencias de neuronas) o uno honesto por plataforma. */
export function nombreDeEstaNeurona(neurona: string): string {
  try {
    const prefs = JSON.parse(safeGet("starseed.neurons.prefs.v1") ?? "{}") as { names?: Record<string, unknown> };
    const n = prefs.names?.[neurona];
    if (typeof n === "string" && n.trim()) return n.trim().slice(0, 60);
  } catch {
    /* preferencias ilegibles */
  }
  const p = plataforma() ?? "Neurona";
  return `${p} · ${esAppNativa() ? "app nativa" : "navegador"}`;
}

const proveedoresCapacidades = new Set<() => string[]>();

/**
 * Añade capacidades a lo que esta neurona anuncia en cada solicitud y respuesta (p. ej. las capas de
 * conciencia que comparte). Devuelve la baja. Solo etiquetas PÚBLICAS: nada de datos privados.
 */
export function fijarCapacidadesAnunciadas(fn: () => string[]): () => void {
  proveedoresCapacidades.add(fn);
  return () => {
    proveedoresCapacidades.delete(fn);
  };
}

function capacidadesAnunciadas(): string[] {
  const base: string[] = [];
  if (esAppNativa()) base.push("canal local (TCP 47071)");
  if (typeof RTCPeerConnection !== "undefined") base.push("WebRTC");
  for (const fn of Array.from(proveedoresCapacidades)) {
    try {
      base.push(...fn());
    } catch {
      /* un proveedor roto no tumba el anuncio */
    }
  }
  return Array.from(new Set(base)).slice(0, 16);
}

function depsReales(): DepsMotorSync {
  return {
    ahora: () => Date.now(),
    nuevoId,
    neuronaPropia: () => identidadDispositivo().neuronDeviceId,
    yo: async () => {
      const id = identidadDispositivo();
      const cuenta = await cuentaActual();
      return {
        neurona: id.neuronDeviceId,
        ...(id.syncDeviceId ? { sync: id.syncDeviceId } : {}),
        ...(cuenta ? { cuenta } : {}),
        nombre: nombreDeEstaNeurona(id.neuronDeviceId),
        plataforma: plataforma(),
        medio: esAppNativa() ? "app-nativa" : "navegador",
        capacidades: capacidadesAnunciadas(),
      };
    },
    miCuenta: cuentaActual,
    firmar: async (m) => {
      const s = await wrapSigned(m);
      return (s as { v?: unknown }).v === 2 ? s : null;
    },
    verificar: async (sobre) => {
      const r = await unwrapSigned(sobre);
      const b = r.body as { id?: unknown; t?: unknown } | null;
      const clave = b && typeof b.id === "string" && typeof b.t === "string" ? `${b.t}:${b.id}` : undefined;
      // Solo sobres v:2 (con instante y nonce): la guarda anti-reenvío tiene que poder aplicarse.
      const fresco = r.verified && typeof r.ts === "number" && !!r.nonce && acceptFreshness(r.fp, r.ts, r.nonce, clave);
      return { cuerpo: r.body, huella: r.fp, valido: r.verified && fresco };
    },
    nativa: {
      disponible: () => esAppNativa(),
      estado: async () => {
        const r = await puenteNativo().llamar<EstadoRedLocal>("malla_local_estado");
        return r.ok ? r.valor : null;
      },
      enviar: async (ip, puerto, json) => {
        const r = await puenteNativo().llamar<{ ms: number }>("malla_local_enviar", { ip, puerto, json });
        return r.ok ? { ok: true, ms: Number(r.valor?.ms) || 0 } : { ok: false, motivo: r.motivo };
      },
    },
    transporte: {
      enviar: async (destino, canal, cuerpo) => {
        const t0 = Date.now();
        try {
          const tu = await import("@/lib/malla/transporte-universal");
          const r = await tu.enviarMensaje(destino, canal, cuerpo);
          const fallos = r.intentos.filter((i) => !i.ok).map((i) => i.detalle);
          return {
            ok: r.ok,
            confirmado: r.confirmado,
            tipo: r.enlace?.tipo ?? null,
            enlaceId: r.enlace?.id,
            etiqueta: r.enlace?.etiqueta,
            motivo: r.motivo ?? (fallos.length ? fallos.join(" · ") : undefined),
            ms: Date.now() - t0,
          };
        } catch {
          return { ok: false, confirmado: false, tipo: null, motivo: "El transporte universal no está disponible.", ms: Date.now() - t0 };
        }
      },
      releCuenta: async (cuerpo, uid) => {
        try {
          const [tu, rele] = await Promise.all([import("@/lib/malla/transporte-universal"), import("@/ai/astraura/mesh/server-relay")]);
          const sobre = { t: "tu.msg" as const, v: 1 as const, id: nuevoId(), c: CANAL_SYNC, b: cuerpo, de: { s: identidadDispositivo().syncDeviceId } };
          // Sin `recipient`: llavero compartido de la cuenta → lo recogen todas sus neuronas; solo contesta la nombrada.
          const r = await rele.uploadRelay({ cls: "P1", ptype: "message", body: tu.formaCorta(sobre, uid), oid: sobre.id });
          return { ok: r.ok, motivo: r.detail };
        } catch {
          return { ok: false, motivo: "El relé de la cuenta no está disponible." };
        }
      },
      enlacesHacia: async (neurona, sync) => {
        const tu = await import("@/lib/malla/transporte-universal");
        const l = await tu.enlacesDisponibles();
        return l
          .filter(
            (e) =>
              (e.tipo === "local" || e.tipo === "cuenta" || e.tipo === "par") &&
              e.abierto &&
              ((!!neurona && e.alcanza.neuronDeviceId === neurona) || (!!sync && e.alcanza.syncDeviceId === sync)),
          )
          .map((e) => ({ id: e.id, tipo: e.tipo, rttMs: e.rttMs ?? null }));
      },
      enLinea: () => (typeof navigator === "undefined" ? false : navigator.onLine !== false),
    },
    almacen: {
      leer: (k) => safeGet(k),
      escribir: (k, v) => {
        safeSet(k, v);
      },
    },
  };
}

/* ══════════════════════════ Instancia de la página ══════════════════════════ */

let motor: MotorSync | null = null;

export function motorSync(): MotorSync {
  if (!motor) motor = crearMotorSync(depsReales());
  return motor;
}

/** Solo pruebas: sustituye (o quita) la instancia de la página. */
export function __fijarMotorSyncParaPruebas(m: MotorSync | null): void {
  motor = m;
}

export function solicitarSincronizacion(destino: DestinoSync, opts?: OpcionesSolicitud): Promise<ResultadoSolicitud> {
  return motorSync().solicitar(destino, opts);
}
export function responderSolicitud(id: string, acepta: boolean, recordar: boolean) {
  return motorSync().responder(id, acepta, recordar);
}
export function cancelarSolicitud(id: string): Promise<void> {
  return motorSync().cancelar(id);
}
export function recordarSolicitud(id: string, recordar: boolean): void {
  motorSync().recordar(id, recordar);
}
export function recordarVinculo(neurona: string, recordar: boolean): void {
  motorSync().recordarVinculo(neurona, recordar);
}
export function olvidarVinculo(neurona: string): void {
  motorSync().olvidar(neurona);
}
/** Ajustes de este aparato con esa neurona (reconectar sola, vías permitidas). */
export function ajustesDeVinculo(neurona: string): AjustesVinculo {
  return motorSync().ajustes(neurona);
}
export function cambiarAjustesVinculo(neurona: string, patch: Partial<AjustesVinculo>): void {
  motorSync().cambiarAjustes(neurona, patch);
}
export function alAvisoSync(cb: (a: AvisoSync) => void): () => void {
  return motorSync().alAviso(cb);
}

/* ══════════════════════════ API para el panel del vínculo ══════════════════════════ */

/** Los vínculos (recordados y de esta sesión) con vías, latencias, sincronizaciones y capacidades. */
export function vinculosDeNeuronas(): VinculoVivo[] {
  const m = motorSync();
  m.cargar();
  return m.instantanea().vinculos;
}

/** Avisa con la lista nueva cada vez que cambia algo (vínculos, vías, latencias, solicitudes). */
export function suscribirVinculos(cb: (vinculos: VinculoVivo[]) => void): () => void {
  const m = motorSync();
  m.cargar();
  return m.suscribir(() => cb(m.instantanea().vinculos));
}

/** Mide ahora la latencia de cada vía hacia esa neurona (ping por la red local y por cada enlace abierto). */
export function medirVias(neurona: string): Promise<LatenciaVia[]> {
  return motorSync().medirVias(neurona);
}

export function solicitudesSync(): SolicitudSync[] {
  return motorSync().instantanea().solicitudes;
}

export function suscribirSolicitudes(cb: () => void): () => void {
  return motorSync().suscribir(cb);
}

/* ══════════════════════════ Hooks ══════════════════════════ */

const VACIA: InstantaneaSync = { solicitudes: [], vinculos: [], red: null };

function useInstantanea(): InstantaneaSync {
  return useSyncExternalStore(
    (cb) => motorSync().suscribir(cb),
    () => motorSync().instantanea(),
    () => VACIA,
  );
}

export function useSolicitudesSync(): SolicitudSync[] {
  return useInstantanea().solicitudes;
}

export function useVinculosNeuronas(): VinculoVivo[] {
  return useInstantanea().vinculos;
}

/** Sondeo COMPARTIDO del canal local (cada 15 s mientras alguien mira). En la web normal no sondea. */
let sondeos = 0;
let temporizadorRed: ReturnType<typeof setInterval> | null = null;

function suscribirRed(cb: () => void): () => void {
  const m = motorSync();
  const baja = m.suscribir(cb);
  sondeos += 1;
  if (sondeos === 1 && esAppNativa()) {
    m.cargar();
    void m.refrescarRed();
    temporizadorRed = setInterval(() => void m.refrescarRed(), 15_000);
  }
  return () => {
    baja();
    sondeos = Math.max(0, sondeos - 1);
    if (sondeos === 0 && temporizadorRed) {
      clearInterval(temporizadorRed);
      temporizadorRed = null;
    }
  };
}

const SIN_VECINOS: VecinoRedLocal[] = [];

/** Lo que oye la app nativa en esta red y los vínculos (para el radar). Vacío fuera de la app. */
export function useRedLocal(): { vecinos: VecinoRedLocal[]; vinculos: VinculoNeurona[] } {
  const s = useSyncExternalStore(suscribirRed, () => motorSync().instantanea(), () => VACIA);
  // Referencias estables: el radar las usa como dependencias de sus `useMemo`.
  return { vecinos: s.red?.vecinos ?? SIN_VECINOS, vinculos: s.vinculos };
}

/* ══════════════════════════ Arranque global ══════════════════════════ */

/**
 * Entrada ÚNICA de lo que llega por el canal local nativo. La sincronización (`tu.msg` del canal
 * `sync`, firmada) se atiende aquí venga de quien venga; los lotes `nl.lote` se abren y cada texto
 * vuelve a entrar; lo demás (`tu.*` de otros canales, `archivo.*`, `nl.hola`, `nl.sen`) va al enlace
 * `nativo:<ip>` (MLT1107A), que solo lo atiende de una neurona VINCULADA con saludo firmado.
 */
async function manejarTextoNativo(m: MotorSync, cuerpo: string, ip: string, dentroDeLote = false): Promise<void> {
  if (!dentroDeLote && cuerpo.startsWith('{"t":"nl.lote"')) {
    for (const t of desempaquetarLote(cuerpo) ?? []) await manejarTextoNativo(m, t, ip, true);
    return;
  }
  let x: unknown;
  try {
    x = JSON.parse(cuerpo);
  } catch {
    return;
  }
  const o = (x && typeof x === "object" ? x : {}) as { t?: unknown; c?: unknown; b?: unknown };
  if (o.t === "tu.ping") return; // solo medía la ida y vuelta (el acuse lo dio la app)
  if (o.t === "tu.msg" && o.c === CANAL_SYNC) {
    await m.recibir(o.b, { via: "red-local-nativa", ip });
    return;
  }
  if (cuerpo.startsWith('{"t":"tu.') || cuerpo.startsWith('{"t":"nl.') || cuerpo.startsWith('{"t":"archivo.')) {
    try {
      const { redLocalNativaActiva } = await import("@/lib/malla/red-local-nativa-motor");
      await redLocalNativaActiva()?.recibir(cuerpo, ip);
    } catch {
      /* sin el enlace nativo */
    }
  }
}

/**
 * iniciarSincronizacionNeuronas — engancha la recepción por todas las vías, el canal local nativo
 * (con lo que llegó antes de escuchar), la reconexión de los vínculos recordados y las caducidades.
 * Una vez por sesión (lo monta `MallaNeuronasMount`); devuelve la parada.
 */
export function iniciarSincronizacionNeuronas(): () => void {
  const m = motorSync();
  m.cargar();
  m.activarReconexion(true);
  let vivo = true;
  const bajas: Array<() => void> = [];

  void import("@/lib/malla/transporte-universal")
    .then((tu) => {
      if (!vivo) return;
      bajas.push(
        tu.alRecibirMensaje(CANAL_SYNC, (msg) => {
          const directo = msg.origen.tipo === "local" || msg.origen.tipo === "nativo" || msg.origen.tipo === "cuenta" || msg.origen.tipo === "par";
          void m.recibir(msg.cuerpo, {
            via: viaDeOrigen(msg.origen),
            enlaceId: directo ? msg.origen.enlaceId : undefined,
            ...(msg.origen.tipo === "nativo" && ipDeEnlaceNativo(msg.origen.enlaceId) ? { ip: ipDeEnlaceNativo(msg.origen.enlaceId) as string } : {}),
            syncDeviceId: msg.origen.syncDeviceId,
            etiqueta: msg.origen.etiqueta,
          });
        }),
      );
    })
    .catch(() => undefined);

  if (esAppNativa()) {
    const p = puenteNativo();
    const vistos = new Set<number>();
    const procesar = (x: unknown) => {
      const r = x as MensajeRedLocal | null;
      if (!r || typeof r.seq !== "number" || typeof r.cuerpo !== "string" || typeof r.ip !== "string") return;
      if (vistos.has(r.seq)) return;
      vistos.add(r.seq);
      if (vistos.size > 1000) vistos.delete(Math.min(...vistos));
      void manejarTextoNativo(m, r.cuerpo, r.ip);
    };
    void p.escuchar(EVENTO_MALLA_LOCAL, procesar).then((q) => (vivo ? bajas.push(q) : q()));
    void p.llamar<MensajeRedLocal[]>("malla_local_recibidos", { desde: 0 }).then((r) => {
      if (vivo && r.ok && Array.isArray(r.valor)) [...r.valor].sort((a, b) => a.seq - b.seq).forEach(procesar);
    });
    void m.refrescarRed();
    const t = setInterval(() => void m.refrescarRed(), 15_000);
    bajas.push(() => clearInterval(t));
    // (MLT1107A) El canal local como enlace del transporte universal y la señalización WebRTC sin QR.
    void import("@/lib/malla/red-local-nativa-motor")
      .then((rn) => {
        const parar = rn.iniciarRedLocalNativa();
        if (vivo) bajas.push(parar);
        else parar();
      })
      .catch(() => undefined);
  }

  bajas.push(
    alRegistrarEnlaceLocal((e) =>
      m.alAbrirseEnlace({ enlaceId: e.id, neurona: e.par.neuronDeviceId, sync: e.par.syncDeviceId, nombre: e.par.nombre }),
    ),
  );
  const reloj = setInterval(() => m.tic(), 5_000);
  bajas.push(() => clearInterval(reloj));

  return () => {
    vivo = false;
    m.activarReconexion(false);
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* */
      }
    }
  };
}
