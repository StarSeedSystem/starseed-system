"use client";

/**
 * llamada-directa — llamada de voz o vídeo por un enlace LOCAL, sin internet (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Va sobre un enlace emparejado sin internet (`emparejar-sin-internet.ts`): el timbre, la
 * respuesta y el colgado viajan por su canal de datos (`ll.*`) y el audio/vídeo se añade a SU
 * conexión renegociando por ese mismo canal. Sin servidor, sin STUN, sin TURN.
 *
 * (LLA1108A · 2026-11-08) Caso real: la Mac llamó a la tableta; la burbuja llegó por el canal TCP 47071
 * con acuse, pero el timbre (`ll.sonar`) iba UNA vez, sin acuse, por el enlace WebRTC que la Mac tenía
 * registrado, medio abierto (la tableta venía de segundo plano). La tableta decía «Sonando» sin nada que
 * contestar y la Mac acabó en «Sin respuesta». Ahora:
 *  · cada control `ll.*` va por el enlace Y por el RESPALDO (el canal de la app hacia esa neurona: TCP
 *    47071 o el mejor enlace del transporte universal; `llamada-directa-respaldo.ts`). Cuenta una vez
 *    (los repetidos se descartan por id); la burbuja del chat también hace sonar (`recibirSenalLlamada`);
 *  · contestar busca el enlace WebRTC VIVO más nuevo con esa neurona y, si no hay, lo abre por el canal
 *    local (MLT1107A); `ll.aceptar` dice por cuál va el audio y quien llama se pasa a ese;
 *  · el fin se dice tal cual (`fin`): colgada, rechazada, sin respuesta o fallo; el timbre de quien
 *    recibe caduca con el mismo tope que el de quien llama.
 *
 * Consentimiento: el enlace existe porque las dos personas se pasaron el código (o son dos neuronas
 * vinculadas); aun así cada llamada SUENA y solo se envía audio/vídeo cuando la otra persona contesta.
 * Nada se graba.
 *
 * La máquina de estados es PURA (`transicionLlamada`) y se prueba sin navegador.
 */

import { useSyncExternalStore } from "react";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import { explicarFalloMedios } from "@/lib/nativa/medios-nativos";
import {
  alRegistrarEnlaceLocal,
  enlaceLocal,
  enlaceVivoMasNuevoCon,
  suscribirEnlacesLocales,
  type EnlaceLocalVivo,
} from "@/lib/malla/registro-enlaces-locales";

export type FaseLlamadaDirecta = "inactiva" | "llamando" | "entrante" | "en-curso" | "terminada";

export type EventoLlamada =
  | "llamar"
  | "sonar-recibido"
  | "contestar"
  | "aceptada"
  | "rechazar"
  | "rechazada"
  | "colgar"
  | "colgada"
  | "sin-respuesta"
  | "enlace-perdido"
  | "reposo";

/** Siguiente fase (o null si el evento no aplica en esa fase). Pura. */
export function transicionLlamada(fase: FaseLlamadaDirecta, ev: EventoLlamada): FaseLlamadaDirecta | null {
  const libre = fase === "inactiva" || fase === "terminada";
  switch (ev) {
    case "llamar":
      return libre ? "llamando" : null;
    case "sonar-recibido":
      return libre ? "entrante" : null;
    case "contestar":
      return fase === "entrante" ? "en-curso" : null;
    case "aceptada":
      return fase === "llamando" ? "en-curso" : null;
    case "rechazar":
      return fase === "entrante" ? "terminada" : null;
    case "rechazada":
    case "sin-respuesta":
      return fase === "llamando" ? "terminada" : null;
    case "colgar":
    case "colgada":
    case "enlace-perdido":
      return libre ? null : "terminada";
    case "reposo":
      return fase === "terminada" ? "inactiva" : null;
    default:
      return null;
  }
}

/** (LLA1108A) Cómo acabó una llamada (el registro del chat lo dice tal cual, sin leer el motivo). */
export type FinLlamadaDirecta = "colgada" | "rechazada" | "sin-respuesta" | "fallo";

export interface EstadoLlamadaDirecta {
  fase: FaseLlamadaDirecta;
  /** Enlace por el que va (o irá) el audio; null mientras suena por el canal de la app sin enlace WebRTC. */
  enlaceId: string | null;
  nombre: string;
  video: boolean;
  /** (NEU1107A) Quien llama comparte su pantalla (el vídeo es la pantalla; quien contesta, solo voz). */
  pantalla: boolean;
  local: MediaStream | null;
  remoto: MediaStream | null;
  micro: boolean;
  motivo: string | null;
  /** Epoch ms en que empezó la conversación (para el cronómetro). */
  desde: number | null;
  /** (LLA1108A) Id de la llamada: el mismo en los dos aparatos y en la burbuja del chat. */
  id: string | null;
  /** (LLA1108A) Neurona del otro aparato (para contestar por otro enlace o por el canal de la app). */
  neurona: string | null;
  /** (LLA1108A) Esta llamada la recibí yo. */
  entrante: boolean;
  /** (LLA1108A) Cómo acabó (null mientras no acaba). */
  fin: FinLlamadaDirecta | null;
}

const INICIAL: EstadoLlamadaDirecta = {
  fase: "inactiva",
  enlaceId: null,
  nombre: "",
  video: false,
  pantalla: false,
  local: null,
  remoto: null,
  micro: true,
  motivo: null,
  desde: null,
  id: null,
  neurona: null,
  entrante: false,
  fin: null,
};

/** Lo que suena una llamada sin contestar (quien llama cuelga; quien recibe, deja de sonar). */
export const SIN_RESPUESTA_MS = 45_000;
/** Quien recibe espera un poco más que quien llama: el «colgar» de quien llama manda. */
const MARGEN_TIMBRE_MS = 3_000;
/** Lo que se espera a que se abra el enlace WebRTC para el audio al contestar. */
export const ESPERA_ENLACE_MS = 12_000;

/**
 * (LLA1108A) El canal de la app hacia una neurona, para los controles `ll.*` cuando el enlace WebRTC no
 * llega (o aún no lo hay), y cómo conseguir un enlace WebRTC vivo para el audio. Lo pone
 * `llamada-directa-respaldo.ts` (la app) o una prueba.
 */
export interface RespaldoLlamadas {
  /** Esta neurona (va en cada control para que el otro sepa a quién contestar). */
  yo?(): { neurona: string; nombre: string } | null;
  /** Manda un control `ll.*` a esa neurona por el canal de la app. Nunca lanza. */
  enviar(neurona: string, o: Record<string, unknown>): void;
  /** Un enlace WebRTC vivo con esa neurona (si no hay, lo abre por el canal local); null si no llega en `ms`. */
  asegurarEnlace?(neurona: string, ms: number): Promise<EnlaceLocalVivo | null>;
}

let estado: EstadoLlamadaDirecta = INICIAL;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let respaldo: RespaldoLlamadas | null = null;
const oyentes = new Set<() => void>();
/** Flujo remoto de cada enlace (para cuando el audio se pasa a otro enlace). */
const remotos = new Map<string, MediaStream | null>();
/** Llamadas acabadas hace poco: un timbre repetido que llega tarde (la burbuja) no vuelve a sonar. */
const acabadas: string[] = [];

function poner(parcial: Partial<EstadoLlamadaDirecta>): void {
  estado = { ...estado, ...parcial };
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* noop */
    }
  }
}

function aplicar(ev: EventoLlamada, extra: Partial<EstadoLlamadaDirecta> = {}): boolean {
  const sig = transicionLlamada(estado.fase, ev);
  if (!sig) return false;
  poner({ ...extra, fase: sig });
  return true;
}

function enviar(e: EnlaceLocalVivo | undefined | null, o: Record<string, unknown>): boolean {
  if (!e) return false;
  try {
    return e.enviar(JSON.stringify(o));
  } catch {
    return false;
  }
}

function abiertoYa(e: EnlaceLocalVivo | undefined | null): e is EnlaceLocalVivo {
  try {
    return !!e && e.abierto();
  } catch {
    return false;
  }
}

/** El enlace de la llamada si sigue abierto. */
function enlaceDeLaLlamada(): EnlaceLocalVivo | null {
  const e = estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined;
  return abiertoYa(e) ? e : null;
}

function yo(): { neurona: string; nombre: string } | null {
  try {
    return respaldo?.yo?.() ?? null;
  } catch {
    return null;
  }
}

/** Quién soy, en cada control: así el otro contesta por el canal de la app si hace falta. */
function firmar(o: Record<string, unknown>): Record<string, unknown> {
  const y = yo();
  return y ? { ...o, de: y.neurona, n: y.nombre } : o;
}

/** Manda por un enlace y por el canal de la app hacia esa neurona. Devuelve si salió por alguno. */
function enviarPorAmbos(o: Record<string, unknown>, enlace: EnlaceLocalVivo | null | undefined, neurona: string | null): boolean {
  const cuerpo = firmar(o);
  let ok = enviar(enlace, cuerpo);
  if (respaldo && neurona) {
    try {
      respaldo.enviar(neurona, cuerpo);
      ok = true;
    } catch {
      /* sin canal de la app: queda el enlace */
    }
  }
  return ok;
}

/** Un control de ESTA llamada (por su enlace, o el indicado, y por el canal de la app). */
function enviarControl(o: Record<string, unknown>, enlace?: EnlaceLocalVivo | null): boolean {
  return enviarPorAmbos(o, enlace ?? (estado.enlaceId ? enlaceLocal(estado.enlaceId) : null), estado.neurona);
}

function pararLocal(): void {
  for (const t of estado.local?.getTracks() ?? []) {
    try {
      t.stop();
    } catch {
      /* noop */
    }
  }
}

function terminar(ev: EventoLlamada, motivo: string | null, fin: FinLlamadaDirecta): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const e = estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined;
  void e?.ponerPistas(null);
  pararLocal();
  const id = estado.id;
  if (aplicar(ev, { motivo, local: null, remoto: null, desde: null, fin })) {
    if (id) {
      acabadas.push(id);
      if (acabadas.length > 20) acabadas.shift();
    }
    temporizador = setTimeout(() => aplicar("reposo", { enlaceId: null, motivo: null }), 4000);
  }
}

/**
 * (MIC1108A) Si no hay micro/cámara se dice POR QUÉ: app instalada sin permiso del sistema (versión
 * anterior), «no» de la persona o del sistema (y dónde se activa, con «Abrir ajustes» si la app sabe),
 * o sin dispositivo. Antes todo era «Este navegador no deja usar el micrófono».
 */
async function pedirMedios(video: boolean): Promise<{ stream: MediaStream | null; error?: string; ajustes?: AjustesMedios | null }> {
  const fallo = async (err: unknown) => {
    const d = await explicarFalloMedios(err, { audio: true, video });
    return { stream: null, error: d.mensaje, ajustes: d.ajustes };
  };
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return fallo({ name: "NoMediaDevices" });
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video }) };
  } catch (err) {
    return fallo(err);
  }
}

function soltarStream(s: MediaStream | null | undefined): void {
  for (const t of s?.getTracks() ?? []) {
    try {
      t.stop();
    } catch {
      /* noop */
    }
  }
}

/* ── escucha de los enlaces y del canal de la app ──────────────────────────────────────────── */

let escuchando = false;

/** (LLA1108A) Pone (o quita) el canal de la app. Lo llama `llamada-directa-respaldo.ts` o una prueba. */
export function fijarRespaldoLlamadas(r: RespaldoLlamadas | null): void {
  respaldo = r;
}

/** Engancha el timbre y los flujos de todos los enlaces locales (idempotente). */
export function asegurarEscuchaLlamadas(): void {
  if (escuchando) return;
  escuchando = true;
  alRegistrarEnlaceLocal((e) => {
    e.alMensaje((d) => {
      if (typeof d !== "string" || !d.startsWith('{"t":"ll.')) return;
      try {
        manejar({ enlace: e, neurona: e.par.neuronDeviceId ?? null, nombre: e.par.nombre }, JSON.parse(d) as Record<string, unknown>);
      } catch {
        /* basura */
      }
    });
    e.alFlujoRemoto((s) => {
      remotos.set(e.id, s);
      // El audio del otro puede llegar antes que su «aceptar»: se guarda en cuanto hay llamada.
      if (estado.enlaceId === e.id && estado.fase !== "inactiva" && estado.fase !== "terminada") poner({ remoto: s });
    });
  });
  suscribirEnlacesLocales(() => {
    if (!estado.enlaceId || estado.fase === "inactiva" || estado.fase === "terminada" || enlaceLocal(estado.enlaceId)) return;
    // Sin el enlace del audio, la conversación se acaba; mientras suena, el timbre sigue por el canal de la app.
    if (estado.fase === "en-curso" || !respaldo || !estado.neurona) terminar("enlace-perdido", "Se perdió el enlace directo.", "fallo");
    else poner({ enlaceId: null });
  });
  // (LLA1108A) En la app (no en las pruebas): el canal de la app como respaldo de los controles.
  if (!respaldo && typeof window !== "undefined" && typeof document !== "undefined") {
    void import("./llamada-directa-respaldo")
      .then((m) => {
        if (!respaldo) m.conectarRespaldoLlamadas();
      })
      .catch(() => undefined);
  }
}

/**
 * (LLA1108A) Un control `ll.*` que llegó por el canal de la app (TCP 47071 u otro enlace del transporte)
 * o la burbuja de una llamada (`ll.sonar`). Lo de un enlace WebRTC entra por `asegurarEscuchaLlamadas`.
 */
export function recibirSenalLlamada(origen: { neurona: string; nombre?: string }, o: Record<string, unknown>): void {
  if (!o || typeof o.t !== "string" || !o.t.startsWith("ll.") || !origen?.neurona) return;
  manejar({ enlace: null, neurona: origen.neurona, nombre: origen.nombre }, o);
}

interface Origen {
  enlace: EnlaceLocalVivo | null;
  neurona: string | null;
  nombre?: string;
}

function texto80(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v.length <= 80 ? v.trim() : null;
}

function manejar(origen: Origen, o: Record<string, unknown>): void {
  const id = texto80(o.id);
  if (!id) return;
  const neurona = origen.neurona ?? texto80(o.de);
  switch (o.t) {
    case "ll.sonar": {
      // Repetido (llegó por el enlace, por el canal de la app y en la burbuja): suena una vez.
      if (id === estado.id && (estado.fase === "entrante" || estado.fase === "en-curso")) {
        if (estado.fase === "entrante" && origen.enlace && !enlaceDeLaLlamada()) {
          poner({ enlaceId: origen.enlace.id, remoto: remotos.get(origen.enlace.id) ?? null });
        }
        return;
      }
      if (acabadas.includes(id)) return;
      const libre = estado.fase === "inactiva" || estado.fase === "terminada";
      if (!libre) {
        enviarPorAmbos({ t: "ll.rechazar", id, motivo: "ocupado" }, origen.enlace, neurona);
        return;
      }
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
      const enlace = origen.enlace ?? (neurona ? enlaceVivoMasNuevoCon(neurona) : null);
      aplicar("sonar-recibido", {
        id,
        enlaceId: enlace?.id ?? null,
        neurona,
        entrante: true,
        fin: null,
        nombre: (origen.nombre || texto80(o.n) || "Una neurona").slice(0, 60),
        video: o.video === true,
        pantalla: o.pantalla === true,
        motivo: null,
        remoto: enlace ? (remotos.get(enlace.id) ?? null) : null,
        local: null,
        micro: true,
        desde: null,
      });
      // El mismo tope que quien llama (más un margen: su «colgar» manda).
      temporizador = setTimeout(() => {
        if (estado.fase === "entrante" && estado.id === id) terminar("colgada", "Llamada perdida.", "sin-respuesta");
      }, SIN_RESPUESTA_MS + MARGEN_TIMBRE_MS);
      // Sin enlace WebRTC con quien llama: se va abriendo ya (al contestar hará falta para el audio).
      if (!enlace && neurona && respaldo?.asegurarEnlace) {
        void respaldo
          .asegurarEnlace(neurona, SIN_RESPUESTA_MS)
          .then((e) => {
            if (e && estado.id === id && estado.fase === "entrante" && !enlaceDeLaLlamada()) {
              poner({ enlaceId: e.id, remoto: remotos.get(e.id) ?? null });
            }
          })
          .catch(() => undefined);
      }
      return;
    }
    case "ll.aceptar":
      if (id !== estado.id || estado.fase !== "llamando") return;
      void aceptada(id, origen, texto80(o.enlace));
      return;
    case "ll.rechazar":
      if (id !== estado.id || estado.fase !== "llamando") return;
      terminar(
        "rechazada",
        o.motivo === "ocupado" ? "Está en otra llamada." : o.motivo === "sin-enlace" ? "Contestó, pero no se pudo abrir el enlace directo para el audio." : "No puede contestar ahora.",
        o.motivo === "sin-enlace" ? "fallo" : "rechazada",
      );
      return;
    case "ll.colgar":
      if (id !== estado.id) return;
      if (estado.fase === "entrante") terminar("colgada", "Llamada perdida: quien llamaba colgó.", "sin-respuesta");
      else terminar("colgada", "La otra persona colgó.", "colgada");
      return;
    default:
      return;
  }
}

let aceptando: string | null = null;

/**
 * Quien llama: contestaron. El audio va por el enlace que dice quien contesta (`enlace`), o por el que
 * trajo el «aceptar» (está vivo: acaba de llevarlo), o por el más nuevo con esa neurona.
 */
async function aceptada(id: string, origen: Origen, preferido: string | null): Promise<void> {
  if (aceptando === id) return;
  aceptando = id;
  try {
    let e: EnlaceLocalVivo | null = null;
    const pref = preferido ? enlaceLocal(preferido) : undefined;
    if (abiertoYa(pref)) e = pref;
    if (!e && abiertoYa(origen.enlace)) e = origen.enlace;
    if (!e && preferido) e = await esperarEnlace(preferido, ESPERA_ENLACE_MS);
    if (!e && estado.neurona) e = enlaceVivoMasNuevoCon(estado.neurona);
    if (estado.id !== id || estado.fase !== "llamando") return;
    if (!e) {
      enviarControl({ t: "ll.colgar", id });
      terminar("colgar", "Contestó, pero no hay un enlace directo para el audio.", "fallo");
      return;
    }
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    poner({ enlaceId: e.id, remoto: remotos.get(e.id) ?? null });
    void e.ponerPistas(estado.local);
    aplicar("aceptada", { desde: Date.now(), motivo: null });
  } finally {
    if (aceptando === id) aceptando = null;
  }
}

/** Espera a que se registre ESE enlace (el que abrió quien contesta). */
function esperarEnlace(enlaceId: string, ms: number): Promise<EnlaceLocalVivo | null> {
  return new Promise((fin) => {
    let hecho = false;
    let baja: () => void = () => undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const acabar = (e: EnlaceLocalVivo | null) => {
      if (hecho) return;
      hecho = true;
      if (t) clearTimeout(t);
      baja();
      fin(e);
    };
    t = setTimeout(() => acabar(null), ms);
    baja = suscribirEnlacesLocales(() => {
      const e = enlaceLocal(enlaceId);
      if (abiertoYa(e)) acabar(e);
    });
  });
}

/* ── acciones ───────────────────────────────────────────────────────────────────────────── */

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ll-${Date.now().toString(36)}`;
  }
}

/**
 * Llama por un enlace local (pide micro, y cámara si `video`, tras un gesto de la persona).
 * (NEU1107A) `pistaPantalla`: la pantalla ya pedida en el mismo gesto (el navegador solo la da
 * ahí); va como el vídeo de la llamada, con el micro. Si se deja de compartir, sigue la voz.
 * (LLA1108A) El timbre va por el enlace y por el canal de la app hacia esa neurona.
 */
export async function llamarPorEnlace(
  enlaceId: string,
  video: boolean,
  opciones: { pistaPantalla?: MediaStreamTrack | null } = {},
): Promise<{ ok: boolean; motivo?: string; ajustes?: AjustesMedios | null }> {
  asegurarEscuchaLlamadas();
  const pantalla = opciones.pistaPantalla ?? null;
  const soltar = () => {
    try {
      pantalla?.stop();
    } catch {
      /* noop */
    }
  };
  const e = enlaceLocal(enlaceId);
  if (!e || !e.abierto()) {
    soltar();
    return { ok: false, motivo: "Ese enlace ya no está abierto." };
  }
  if (transicionLlamada(estado.fase, "llamar") === null) {
    soltar();
    return { ok: false, motivo: "Ya hay una llamada en curso." };
  }
  const m = await pedirMedios(video && !pantalla);
  if (!m.stream) {
    soltar();
    return { ok: false, motivo: m.error, ajustes: m.ajustes ?? null };
  }
  if (pantalla) {
    try {
      m.stream.addTrack(pantalla);
      pantalla.onended = () => {
        // Dejó de compartir: la llamada sigue con la voz (se renegocia por el propio canal).
        try {
          estado.local?.removeTrack(pantalla);
        } catch {
          /* noop */
        }
        const vivo = estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined;
        if (vivo && estado.fase === "en-curso") void vivo.ponerPistas(estado.local);
        poner({ pantalla: false });
      };
    } catch {
      /* sin pantalla: sigue como llamada de voz */
    }
  }
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const id = nuevoId();
  const conVideo = video || !!pantalla;
  aplicar("llamar", {
    id,
    enlaceId,
    neurona: e.par.neuronDeviceId ?? null,
    entrante: false,
    fin: null,
    nombre: e.par.nombre,
    video: conVideo,
    pantalla: !!pantalla,
    local: m.stream,
    remoto: remotos.get(enlaceId) ?? null,
    micro: true,
    motivo: null,
    desde: null,
  });
  if (!enviarControl({ t: "ll.sonar", id, video: conVideo, ...(pantalla ? { pantalla: true } : {}) }, e)) {
    terminar("colgar", "No se pudo avisar al otro aparato.", "fallo");
    return { ok: false, motivo: "No se pudo avisar al otro aparato." };
  }
  temporizador = setTimeout(() => {
    if (estado.id !== id || estado.fase !== "llamando") return;
    enviarControl({ t: "ll.colgar", id });
    terminar("sin-respuesta", "No contestó.", "sin-respuesta");
  }, SIN_RESPUESTA_MS);
  return { ok: true };
}

let contestando: string | null = null;

/**
 * Contesta el timbre: micro (y cámara si es videollamada) con el diagnóstico de MIC1108A, un enlace
 * WebRTC vivo con quien llama (si no hay, se abre por el canal local) y `ll.aceptar` diciendo por cuál.
 */
export async function contestarLlamada(): Promise<{ ok: boolean; motivo?: string; ajustes?: AjustesMedios | null }> {
  if (estado.fase !== "entrante") return { ok: false };
  const id = estado.id;
  // Dos toques (la burbuja y la tarjeta global): se contesta una vez.
  if (contestando && contestando === id) return { ok: false };
  contestando = id;
  try {
    return await contestarAhora(id);
  } finally {
    if (contestando === id) contestando = null;
  }
}

async function contestarAhora(id: string | null): Promise<{ ok: boolean; motivo?: string; ajustes?: AjustesMedios | null }> {
  // Primero el micro, en el mismo gesto (algunos motores solo lo dan ahí). Si el otro comparte su
  // pantalla, se contesta solo con voz (no hace falta la cámara).
  const m = await pedirMedios(estado.video && !estado.pantalla);
  if (estado.fase !== "entrante" || estado.id !== id) {
    soltarStream(m.stream);
    return { ok: false, motivo: "La llamada ya terminó." };
  }
  if (!m.stream) {
    enviarControl({ t: "ll.rechazar", id });
    terminar("rechazar", m.error ?? null, "fallo");
    return { ok: false, motivo: m.error, ajustes: m.ajustes ?? null };
  }
  let e = enlaceDeLaLlamada() ?? (estado.neurona ? enlaceVivoMasNuevoCon(estado.neurona) : null);
  if (!e && estado.neurona && respaldo?.asegurarEnlace) {
    poner({ motivo: "Abriendo el enlace directo para el audio…" });
    e = await respaldo.asegurarEnlace(estado.neurona, ESPERA_ENLACE_MS).catch(() => null);
  }
  if (estado.fase !== "entrante" || estado.id !== id) {
    soltarStream(m.stream);
    return { ok: false, motivo: "La llamada ya terminó." };
  }
  if (!e) {
    soltarStream(m.stream);
    const motivo = "No se pudo abrir el enlace directo con el otro aparato (sin él no hay audio). Comprobad que los dos estáis en la misma red.";
    enviarControl({ t: "ll.rechazar", id, motivo: "sin-enlace" });
    terminar("rechazar", motivo, "fallo");
    return { ok: false, motivo };
  }
  poner({ enlaceId: e.id, remoto: remotos.get(e.id) ?? null });
  aplicar("contestar", { local: m.stream, micro: true, desde: Date.now(), motivo: null });
  await e.ponerPistas(m.stream);
  enviarControl({ t: "ll.aceptar", id, enlace: e.id }, e);
  return { ok: true };
}

export function rechazarLlamada(): void {
  if (estado.fase !== "entrante") return;
  enviarControl({ t: "ll.rechazar", id: estado.id });
  terminar("rechazar", null, "rechazada");
}

export function colgarLlamada(): void {
  if (estado.fase === "inactiva" || estado.fase === "terminada") return;
  enviarControl({ t: "ll.colgar", id: estado.id });
  terminar("colgar", "Llamada terminada.", estado.fase === "entrante" ? "rechazada" : "colgada");
}

export function alternarMicro(): void {
  const on = !estado.micro;
  for (const t of estado.local?.getAudioTracks() ?? []) t.enabled = on;
  poner({ micro: on });
}

export function estadoLlamadaDirecta(): EstadoLlamadaDirecta {
  return estado;
}

/** (NEU1107A) Escucha los cambios de la llamada directa fuera de React (el registro del chat de neurona). */
export function suscribirLlamadaDirecta(cb: (e: EstadoLlamadaDirecta) => void): () => void {
  const f = () => cb(estado);
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

export function useLlamadaDirecta(): EstadoLlamadaDirecta {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    () => estado,
    () => INICIAL,
  );
}
