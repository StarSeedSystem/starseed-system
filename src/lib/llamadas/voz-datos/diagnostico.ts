/**
 * voz-datos/diagnostico — los hitos de una llamada, en el mismo registro que los enlaces (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Cada hito sale como un evento «llamada» del Registro del enlace (`registro-enlace-ble.ts`), que la app
 * nativa copia a `~/Library/Logs/app.starseed.os/enlaces.log`. Se lee con
 *   grep ' llamada ' ~/Library/Logs/app.starseed.os/enlaces.log
 * Líneas: `llamada senal-enviada …`, `llamada senal-recibida …`, `llamada contestada …`,
 * `llamada medio=webrtc …`, `llamada medio=enlace-datos …`, `llamada fallo …`.
 * Nunca lanza y nunca escribe contenido de la llamada (ni SDP ni audio): solo el tipo, el sentido y el medio.
 */

import { etiquetaBuild } from "@/lib/pwa/build-corriendo";

export type HitoLlamada = "senal-enviada" | "senal-recibida" | "contestada" | "medio=webrtc" | "medio=enlace-datos" | "medio=video-datos" | "escalada-wifi" | "camara" | "fallo" | "reintento" | "carril" | "negociacion" | "inicio" | "directa" | "fin" | "banco"; // LLA1114B: «banco», líneas del banco automático (contrato ronda-automatica-llamadas §6) · LLA1112A · LLA1113C: «fin», cómo acabó la llamada en este lado: «directa», la llamada directa por un enlace local (`malla/llamada-directa.ts`)

export type SumideroDiagnostico = (linea: { hito: HitoLlamada; neurona: string | null; detalle: string }) => void;

let sumidero: SumideroDiagnostico | null = null;

/** Pruebas (o un panel): recibe cada hito además del registro. */
export function fijarSumideroDiagnostico(f: SumideroDiagnostico | null): void {
  sumidero = f;
}

export function anotarLlamada(hito: HitoLlamada, neurona: string | null, detalle = ""): void {
  // ACT1113F: la primera línea de una llamada («inicio») y la última («fin») acaban con la build de la web que corre
  // este aparato (`web=<build>/<sha>`); el resto del texto no cambia y la marca no se corta con el recorte.
  const marca = hito === "inicio" || hito === "fin" ? ` web=${etiquetaBuild()}` : "";
  const limpio = (String(detalle ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 200) + marca).trim();
  try {
    sumidero?.({ hito, neurona, detalle: limpio });
  } catch {
    /* el sumidero de prueba no tumba la llamada */
  }
  if (typeof window === "undefined") return;
  void import("@/lib/malla/bluetooth-directo-motor")
    .then((m) => {
      const red = m.bluetoothDirectoActivo();
      if (!red) return;
      red.registro().anotar("llamada", neurona, `${hito}${limpio ? ` ${limpio}` : ""}`, neurona ? red.enlaceHacia(neurona) : null);
    })
    .catch(() => undefined);
}
