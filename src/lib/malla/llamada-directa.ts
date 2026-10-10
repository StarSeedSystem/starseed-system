"use client";

/**
 * llamada-directa — llamada de voz o vídeo por un enlace LOCAL, sin internet (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Va sobre un enlace emparejado sin internet (`emparejar-sin-internet.ts`): el timbre, la
 * respuesta y el colgado viajan por su canal de datos (`ll.*`) y el audio/vídeo se añade a SU
 * conexión renegociando por ese mismo canal. Sin servidor, sin STUN, sin TURN.
 *
 * Consentimiento: el enlace existe porque las dos personas se pasaron el código; aun así cada
 * llamada SUENA y solo se envía audio/vídeo cuando la otra persona contesta. Nada se graba.
 *
 * La máquina de estados es PURA (`transicionLlamada`) y se prueba sin navegador.
 */

import { useSyncExternalStore } from "react";
import {
  alRegistrarEnlaceLocal,
  enlaceLocal,
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

export interface EstadoLlamadaDirecta {
  fase: FaseLlamadaDirecta;
  enlaceId: string | null;
  nombre: string;
  video: boolean;
  local: MediaStream | null;
  remoto: MediaStream | null;
  micro: boolean;
  motivo: string | null;
  /** Epoch ms en que empezó la conversación (para el cronómetro). */
  desde: number | null;
}

const INICIAL: EstadoLlamadaDirecta = {
  fase: "inactiva",
  enlaceId: null,
  nombre: "",
  video: false,
  local: null,
  remoto: null,
  micro: true,
  motivo: null,
  desde: null,
};

const SIN_RESPUESTA_MS = 45_000;

let estado: EstadoLlamadaDirecta = INICIAL;
let llamadaId: string | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
const oyentes = new Set<() => void>();

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

function enviar(e: EnlaceLocalVivo | undefined, o: Record<string, unknown>): boolean {
  return !!e && e.enviar(JSON.stringify(o));
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

function terminar(ev: EventoLlamada, motivo: string | null): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const e = estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined;
  void e?.ponerPistas(null);
  pararLocal();
  if (aplicar(ev, { motivo, local: null, remoto: null, desde: null })) {
    llamadaId = null;
    temporizador = setTimeout(() => aplicar("reposo", { enlaceId: null, motivo: null }), 4000);
  }
}

async function pedirMedios(video: boolean): Promise<{ stream: MediaStream | null; error?: string }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, error: "Este navegador no deja usar el micrófono." };
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video }) };
  } catch (err) {
    const nombre = (err as { name?: string })?.name;
    return {
      stream: null,
      error: nombre === "NotAllowedError" ? "Sin permiso para el micrófono o la cámara." : "No se encontró micrófono o cámara.",
    };
  }
}

/* ── escucha de los enlaces ─────────────────────────────────────────────────────────────── */

let escuchando = false;

/** Engancha el timbre y los flujos de todos los enlaces locales (idempotente). */
export function asegurarEscuchaLlamadas(): void {
  if (escuchando) return;
  escuchando = true;
  alRegistrarEnlaceLocal((e) => {
    e.alMensaje((d) => {
      if (typeof d !== "string" || !d.startsWith('{"t":"ll.')) return;
      try {
        manejar(e, JSON.parse(d) as Record<string, unknown>);
      } catch {
        /* basura */
      }
    });
    e.alFlujoRemoto((s) => {
      // El audio del otro puede llegar antes que su «aceptar»: se guarda en cuanto hay llamada.
      if (estado.enlaceId === e.id && estado.fase !== "inactiva" && estado.fase !== "terminada") poner({ remoto: s });
    });
  });
  suscribirEnlacesLocales(() => {
    if (estado.enlaceId && estado.fase !== "inactiva" && estado.fase !== "terminada" && !enlaceLocal(estado.enlaceId)) {
      terminar("enlace-perdido", "Se perdió el enlace directo.");
    }
  });
}

function manejar(e: EnlaceLocalVivo, o: Record<string, unknown>): void {
  const id = typeof o.id === "string" ? o.id : null;
  switch (o.t) {
    case "ll.sonar": {
      const libre = estado.fase === "inactiva" || estado.fase === "terminada";
      if (!libre || !id) {
        enviar(e, { t: "ll.rechazar", id, motivo: "ocupado" });
        return;
      }
      if (temporizador) clearTimeout(temporizador);
      llamadaId = id;
      aplicar("sonar-recibido", { enlaceId: e.id, nombre: e.par.nombre, video: o.video === true, motivo: null, remoto: null, local: null });
      return;
    }
    case "ll.aceptar":
      if (id !== llamadaId || estado.enlaceId !== e.id) return;
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
      void e.ponerPistas(estado.local);
      aplicar("aceptada", { desde: Date.now() });
      return;
    case "ll.rechazar":
      if (id !== llamadaId) return;
      terminar("rechazada", o.motivo === "ocupado" ? "Está en otra llamada." : "No puede contestar ahora.");
      return;
    case "ll.colgar":
      if (id !== llamadaId) return;
      terminar("colgada", "La otra persona colgó.");
      return;
    default:
      return;
  }
}

/* ── acciones ───────────────────────────────────────────────────────────────────────────── */

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ll-${Date.now().toString(36)}`;
  }
}

/** Llama por un enlace local (pide micro, y cámara si `video`, tras un gesto de la persona). */
export async function llamarPorEnlace(enlaceId: string, video: boolean): Promise<{ ok: boolean; motivo?: string }> {
  asegurarEscuchaLlamadas();
  const e = enlaceLocal(enlaceId);
  if (!e || !e.abierto()) return { ok: false, motivo: "Ese enlace ya no está abierto." };
  if (transicionLlamada(estado.fase, "llamar") === null) return { ok: false, motivo: "Ya hay una llamada en curso." };
  const m = await pedirMedios(video);
  if (!m.stream) return { ok: false, motivo: m.error };
  if (temporizador) clearTimeout(temporizador);
  llamadaId = nuevoId();
  aplicar("llamar", { enlaceId, nombre: e.par.nombre, video, local: m.stream, remoto: null, micro: true, motivo: null, desde: null });
  if (!enviar(e, { t: "ll.sonar", id: llamadaId, video })) {
    terminar("colgar", "No se pudo avisar al otro aparato.");
    return { ok: false, motivo: "No se pudo avisar al otro aparato." };
  }
  temporizador = setTimeout(() => {
    enviar(enlaceLocal(enlaceId), { t: "ll.colgar", id: llamadaId });
    terminar("sin-respuesta", "No contestó.");
  }, SIN_RESPUESTA_MS);
  return { ok: true };
}

export async function contestarLlamada(): Promise<{ ok: boolean; motivo?: string }> {
  if (estado.fase !== "entrante" || !estado.enlaceId) return { ok: false };
  const e = enlaceLocal(estado.enlaceId);
  if (!e) {
    terminar("enlace-perdido", "Se perdió el enlace directo.");
    return { ok: false, motivo: "Se perdió el enlace directo." };
  }
  const m = await pedirMedios(estado.video);
  if (!m.stream) {
    enviar(e, { t: "ll.rechazar", id: llamadaId });
    terminar("rechazar", m.error ?? null);
    return { ok: false, motivo: m.error };
  }
  aplicar("contestar", { local: m.stream, micro: true, desde: Date.now() });
  await e.ponerPistas(m.stream);
  enviar(e, { t: "ll.aceptar", id: llamadaId });
  return { ok: true };
}

export function rechazarLlamada(): void {
  if (estado.fase !== "entrante") return;
  enviar(estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined, { t: "ll.rechazar", id: llamadaId });
  terminar("rechazar", null);
}

export function colgarLlamada(): void {
  if (estado.fase === "inactiva" || estado.fase === "terminada") return;
  enviar(estado.enlaceId ? enlaceLocal(estado.enlaceId) : undefined, { t: "ll.colgar", id: llamadaId });
  terminar("colgar", "Llamada terminada.");
}

export function alternarMicro(): void {
  const on = !estado.micro;
  for (const t of estado.local?.getAudioTracks() ?? []) t.enabled = on;
  poner({ micro: on });
}

export function estadoLlamadaDirecta(): EstadoLlamadaDirecta {
  return estado;
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
