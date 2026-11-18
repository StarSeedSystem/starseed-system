// (AUD1117 · F5) Servidor de la malla para la ventana transmitida (§9): atiende
// `ventana.pedir` de otra neurona de la MISMA cuenta, abre la app con la sesión
// nativa de préstamo que la persona consiente (diálogo de la app) y transmite los
// fotogramas al cliente que ya existe (cliente.ts / ventana-remota.tsx).
// Sin petición no hace nada. Puro: el canal (mesh) y la captura llegan inyectados.
import { crearSesion, type Sesion } from "../recursos/sesion-prestamo";
import {
  crearAnfitrion,
  type Anfitrion,
  type Calidad,
  type FotogramaAnfitrion,
  type OrdenVentana,
  type PistaAnfitriona,
  type RespuestaVentana,
} from "./anfitrion";
import type { MensajeVentana } from "./cliente";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";

/** Lo que el anfitrión escucha por la malla (JSON): pedir, cortar y las entradas del cliente. */
export type MensajeAnfitrionMalla =
  | { t: "ventana.pedir"; sesion: string; app: string }
  | { t: "ventana.cortar"; sesion: string }
  | MensajeVentana;

/** Lo que contesta el anfitrión: SOLO al peer que pidió. */
export type MensajeServidorVentana =
  | { t: "ventana.aceptada"; sesion: string; app: string }
  | { t: "ventana.cuadro"; sesion: string; fotograma: FotogramaAnfitrion; calidad: Calidad }
  | { t: "ventana.denegado"; sesion: string; motivo: string }
  | { t: "ventana.cerrada"; sesion: string; motivo: string };

/** Configuración de captura que devuelve `abrir` (sesión nativa ya consentida). */
export type ConfigAnfitrion = {
  ventana?: string;
  duracionMs?: number;
  capturar: (orden: OrdenVentana) => RespuestaVentana | Promise<RespuestaVentana>;
  crearPista: (fps: number) => PistaAnfitriona;
  sesionNativa?: () => boolean;
};

export type DepsAnfitrionMalla = {
  cuentaActual: () => string | null;
  cuentaDe: (de: string) => string | null;
  abrir: (pedido: { de: string; app: string }) => Promise<ConfigAnfitrion | null>;
  enviar: (de: string, mensaje: MensajeServidorVentana) => void;
  fps: number;
  anchoMax: number;
  anchoBanda?: () => number;
  reloj?: () => number;
  alEmpezar?: () => void;
  alTerminar?: () => void;
};

export type EstadoAnfitrionMalla = { activo: boolean; de: string | null; sesion: string | null; app: string | null; cuadros: number };

export type AnfitrionMalla = {
  atender(de: string, mensaje: unknown): Promise<boolean>;
  tic(ahora?: number): Promise<boolean>;
  estado(): EstadoAnfitrionMalla;
  cortar(motivo?: string): void;
};

const DURACION_MS = 120_000;

function texto(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Lee un mensaje del canal (texto JSON u objeto ya listo); `null` si no vale. */
export function parseMensajeAnfitrion(dato: unknown): MensajeAnfitrionMalla | null {
  let m: unknown = dato;
  if (typeof m === "string") {
    try { m = JSON.parse(m) as unknown; } catch { return null; }
  }
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, unknown>;
  const sesion = texto(o.sesion);
  if (!sesion) return null;
  if (o.t === "ventana.pedir") {
    const app = texto(o.app);
    return app ? { t: "ventana.pedir", sesion, app } : null;
  }
  if (o.t === "ventana.cortar") return { t: "ventana.cortar", sesion };
  if (o.t === "ventana.entrada" && typeof o.entrada === "object" && o.entrada !== null) return m as MensajeVentana;
  return null;
}

/** Crea el servidor de ventanas de esta neurona. Nada corre hasta que llegue `ventana.pedir`. */
export function crearAnfitrionMalla(deps: DepsAnfitrionMalla): AnfitrionMalla {
  const reloj = deps.reloj ?? (() => Date.now());
  let vivo: { de: string; app: string; sesionId: string; anfitrion: Anfitrion } | null = null;

  function cerrar(motivo: string): void {
    const era = vivo;
    if (!era) return;
    vivo = null;
    era.anfitrion.parar();
    deps.enviar(era.de, { t: "ventana.cerrada", sesion: era.sesionId, motivo });
    deps.alTerminar?.();
  }

  async function atender(de: string, mensaje: unknown): Promise<boolean> {
    const m = parseMensajeAnfitrion(mensaje);
    if (!m) return false;
    if (m.t === "ventana.entrada") {
      if (!vivo || vivo.de !== de || vivo.sesionId !== m.sesion) return false;
      if (!(await vivo.anfitrion.entrada(m.entrada, reloj()))) cerrar("La sesión de préstamo terminó.");
      return true;
    }
    if (m.t === "ventana.cortar") {
      if (!vivo || vivo.de !== de || vivo.sesionId !== m.sesion) return false;
      cerrar("Cortada por quien la usaba.");
      return true;
    }
    return pedir(de, m);
  }

  async function pedir(de: string, m: { sesion: string; app: string }): Promise<boolean> {
    const cuenta = deps.cuentaActual();
    const denegar = (motivo: string): boolean => {
      deps.enviar(de, { t: "ventana.denegado", sesion: m.sesion, motivo });
      return true;
    };
    if (!cuenta || deps.cuentaDe(de) !== cuenta) return denegar("Solo una neurona de tu cuenta puede pedir esta ventana.");
    if (vivo) return denegar("Ya se está transmitiendo una ventana.");
    const cfg = await deps.abrir({ de, app: m.app });
    if (!cfg) return denegar("La ventana no se abrió: la persona no prestó la sesión.");
    const ahora = reloj();
    const sesion: Sesion = crearSesion(
      { anfitrion: de, invitado: de, alcance: { tipo: "app", id: m.app }, duracionMs: cfg.duracionMs ?? DURACION_MS, ahora },
      () => m.sesion
    );
    const anfitrion = crearAnfitrion({
      ventana: cfg.ventana ?? m.app,
      capturar: cfg.capturar,
      crearPista: cfg.crearPista,
      sesion: () => sesion,
      sesionNativa: cfg.sesionNativa,
      fps: deps.fps,
      anchoMax: deps.anchoMax,
      medirAnchoBanda: deps.anchoBanda,
      reloj,
      dibujar: (fotograma, calidad) => {
        deps.enviar(de, { t: "ventana.cuadro", sesion: m.sesion, fotograma, calidad });
      },
    });
    if (!anfitrion.arrancar(ahora).transmitiendo) {
      anfitrion.parar();
      return denegar("La transmisión no se pudo arrancar.");
    }
    vivo = { de, app: m.app, sesionId: m.sesion, anfitrion };
    deps.enviar(de, { t: "ventana.aceptada", sesion: m.sesion, app: m.app });
    deps.alEmpezar?.();
    return true;
  }

  return {
    atender,
    async tic(ahora = reloj()): Promise<boolean> {
      if (!vivo) return false;
      const ok = await vivo.anfitrion.paso(ahora);
      if (!ok) cerrar("La transmisión terminó.");
      return ok;
    },
    estado(): EstadoAnfitrionMalla {
      if (!vivo) return { activo: false, de: null, sesion: null, app: null, cuadros: 0 };
      return { activo: true, de: vivo.de, sesion: vivo.sesionId, app: vivo.app, cuadros: vivo.anfitrion.estado(reloj()).cuadros };
    },
    cortar(motivo = "Cortada desde esta neurona."): void {
      cerrar(motivo);
    },
  };
}

/** Conecta el servidor al mesh compartido: escucha `ventana.*` y contesta SOLO al peer que pidió. */
export function adjuntarAnfitrionMalla(mesh: MeshHandle, deps: Omit<DepsAnfitrionMalla, "enviar">): { servidor: AnfitrionMalla; parar: () => void } {
  const servidor = crearAnfitrionMalla({
    ...deps,
    enviar: (de, m) => {
      mesh.sendToPeer(de, JSON.stringify(m));
    },
  });
  const baja = mesh.onPeer({
    onMessage: (de, data) => {
      void servidor.atender(de, parseMensajeAnfitrion(data));
    },
    onState: (p) => {
      if (p.state === "connected") return;
      const actual = servidor.estado();
      if (actual.activo && actual.de === p.deviceId) servidor.cortar("Se perdió la neurona que usaba la ventana.");
    },
  });
  return { servidor, parar: baja };
}
