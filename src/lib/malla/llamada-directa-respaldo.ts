"use client";

/**
 * llamada-directa-respaldo — el canal de la app para los controles de la llamada directa (LLA1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11): el timbre `ll.sonar` iba solo por un enlace WebRTC medio abierto y se perdía, mientras
 * los mensajes llegaban por el canal TCP 47071 con acuse. Aquí se conecta `llamada-directa.ts` con:
 *  · el transporte universal (canal «llamada-directa»): cada `ll.*` también va a la neurona por el mejor
 *    enlace con acuse (el WebRTC si contesta, si no el TCP 47071 de la app nativa). Solo se atiende lo que
 *    llega por enlaces de consentimiento (emparejado, red local nativa vinculada, Bluetooth directo, malla
 *    de la cuenta, vínculo entre cuentas); nunca por el relé ni por LoRa (no llevan llamadas);
 *  · el enlace WebRTC para el audio: el abierto más nuevo con esa neurona o, si no hay, se urge la
 *    señalización por el canal local (MLT1107A, `urgirEnlace`) y se espera a que se abra.
 * Lo carga perezoso `asegurarEscuchaLlamadas` (en la app; las pruebas inyectan el suyo). Nunca lanza.
 */

import { fijarRespaldoLlamadas, recibirSenalLlamada } from "./llamada-directa";
import { enlaceVivoMasNuevoCon, suscribirEnlacesLocales, type EnlaceLocalVivo } from "./registro-enlaces-locales";

export const CANAL_LLAMADA_DIRECTA = "llamada-directa";
/** (LLA1108F) El canal del despertador; lo lee Rust (llamada_entrante_logica.rs · CANAL_TIMBRE). */
export const CANAL_TIMBRE_LLAMADA = "llamada-timbre";

/** Por dónde se atiende un control de llamada (los enlaces con consentimiento; ni relé ni LoRa). */
const ORIGENES_ADMITIDOS = new Set(["local", "nativo", "ble", "cuenta", "par"]);

let conectado = false;
let yoCache: { neurona: string; nombre: string } | null = null;

function corto(v: unknown, n: number): string | null {
  return typeof v === "string" && v.trim() && v.length <= n ? v.trim() : null;
}

async function calcularYo(): Promise<void> {
  try {
    const { identidadDispositivo } = await import("@/lib/network/identidad-dispositivo");
    const neurona = identidadDispositivo().neuronDeviceId;
    if (!neurona) return;
    let nombre = "Una neurona";
    try {
      nombre = (await import("./sincronizacion-neuronas-motor")).nombreDeEstaNeurona(neurona) || nombre;
    } catch {
      /* sin nombre: el genérico */
    }
    yoCache = { neurona, nombre };
  } catch {
    yoCache = null;
  }
}

/**
 * Un enlace WebRTC vivo con esa neurona: el más nuevo, o el que se abra en `ms` tras urgir la señalización
 * por el canal local de la app nativa. Null si no llega (y nunca lanza).
 */
export function asegurarEnlaceCon(neurona: string, ms: number): Promise<EnlaceLocalVivo | null> {
  const ya = enlaceVivoMasNuevoCon(neurona);
  if (ya) return Promise.resolve(ya);
  void import("./red-local-nativa-motor")
    .then((m) => m.redLocalNativaActiva()?.urgirEnlace?.(neurona))
    .catch(() => undefined);
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
    t = setTimeout(() => acabar(null), Math.max(0, ms));
    // El id de neurona del par llega con su saludo (`enl.hola`), un momento después de abrirse.
    baja = suscribirEnlacesLocales(() => {
      const e = enlaceVivoMasNuevoCon(neurona);
      if (e) acabar(e);
    });
  });
}

/** Engancha el canal de la app a la llamada directa (una vez por pestaña). */
export function conectarRespaldoLlamadas(): void {
  if (conectado) return;
  conectado = true;
  void calcularYo();
  fijarRespaldoLlamadas({
    yo: () => yoCache,
    enviar: (neurona, o) => {
      void import("./transporte-universal")
        .then((tu) => tu.enviarMensaje({ neuronDeviceId: neurona }, CANAL_LLAMADA_DIRECTA, o, { esperarAcuseMs: 1500 }))
        .catch(() => undefined);
    },
    asegurarEnlace: asegurarEnlaceCon,
    // (LLA1108F) El despertador: Rust firma la cabecera con la clave de faro de la cuenta y va por cada enlace del canal de la app.
    timbre: (neurona, d) => {
      void (async () => {
        try {
          const { puenteNativo } = await import("@/lib/nativa/puente");
          const p = puenteNativo();
          if (!p.disponible) return;
          const r = await p.llamar<Record<string, unknown>>("llamada_timbre_firmar", { id: d.id, nombre: d.nombre, tipo: d.video ? "video" : "voz", medio: "red-local" });
          if (!r.ok || !r.valor || typeof r.valor !== "object") return;
          const tu = await import("./transporte-universal");
          await tu.enviarMensaje({ neuronDeviceId: neurona }, CANAL_TIMBRE_LLAMADA, r.valor, { esperarAcuseMs: 1500 });
        } catch {
          /* sin clave de cuenta o sin enlace: no hay despertador */
        }
      })();
    },
  });
  void import("./transporte-universal")
    .then((tu) =>
      tu.alRecibirMensaje(CANAL_LLAMADA_DIRECTA, (m) => {
        if (!ORIGENES_ADMITIDOS.has(m.origen.tipo)) return;
        const c = m.cuerpo as Record<string, unknown> | null;
        if (!c || typeof c !== "object" || typeof c.t !== "string" || !c.t.startsWith("ll.")) return;
        // Por un enlace WebRTC con neurona conocida manda la del enlace; si no, la que dice el control.
        const neurona = corto(c.de, 80);
        if (!neurona) return;
        recibirSenalLlamada({ neurona, nombre: corto(c.n, 60) ?? m.origen.etiqueta }, c);
      }),
    )
    .catch(() => undefined);
}
