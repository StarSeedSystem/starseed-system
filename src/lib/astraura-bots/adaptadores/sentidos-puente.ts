"use client";

/**
 * Bots/dots de Astraura · PUENTE DE SENTIDOS (BOT1011F). Contrato: architecture/astraura-bots.md §5.
 *
 * Cada `Sentido` va a su fuente real del OS, y SIEMPRE después de `decidirSentido` con los
 * consentimientos vigentes (almacén de BOT1011E1). Si no está permitido, se devuelve su motivo
 * sin tocar la fuente. Solo texto: nunca píxeles ni capturas guardadas. A un bot de grupo o
 * invitado, antes `detectarFuga`. Fuentes inyectables (pruebas sin navegador); nada lanza.
 *   pantalla → scanScreen + formatScanSummary · captura-pantalla/camara → auroraSee
 *   archivos → conectarCarpetaYDetectar · red → lector inyectado · microfono → solo lo marca activo
 */
import { formatScanSummary, scanScreen } from "@/lib/aurora/screen-control/screen-scanner";
import { conectarCarpetaYDetectar } from "@/lib/aurora/senses/folder-detect";
import { auroraSee } from "@/lib/aurora/senses/vision-sense";
import { detectarFuga, type FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import type { EventoBucle } from "../bucle";
import { decidirSentido } from "../permisos";
import { EVENTO_BUCLE_UI } from "./evento-bucle-ui";
import { esBotDeEntidad, esInvitado, type Bot, type ConsentimientoSentido, type Medio, type Sentido, type TipoSesion } from "../tipos";

export const MAX_TEXTO_SENTIDO = 4000;
export type ResultadoPercibir = { ok: true; texto: string } | { ok: false; motivo: string };

export interface DepsPuenteSentidos {
  /** Almacén de consentimientos (BOT1011E1); se leen los vigentes en cada percepción. */
  consentimientos: { vigentes(ahora: number): readonly ConsentimientoSentido[] };
  /** Texto de lo que pinta el OS (por defecto, escáner del DOM). */
  leerPantalla?: () => string;
  /** Descripción en texto de un fotograma (por defecto, `auroraSee`); la imagen no sale de ahí. */
  ver?: (fuente: "screen" | "camera") => Promise<string>;
  carpeta?: () => Promise<{ resumen: string; backend?: string } | null>;
  /** Lector de notificaciones y feed del OS; sin él, «red» se dice «próximamente». */
  red?: () => Promise<string>;
  /** Eventos `observar`/`soltar` para el bucle (`avanzar`) de ESE bot: el indicador se ve mientras dure. */
  alEvento?: (ev: EventoBucle, botId: string) => void;
  ahora?: () => number;
}

export interface ContextoPercibir {
  /** Persona cuyos datos tocaría el sentido (la que está delante del aparato). */
  cuentaId: string;
  sesion: TipoSesion;
  medio: Medio;
  /** Fragmentos personales que el bot de grupo o invitado nunca debe repetir. */
  personales?: readonly FragmentoMemoria[];
}

type SinFuente = "correo" | "terminal" | "sensores" | "ubicacion" | "portapapeles" | "aparatos";
export const PROXIMAMENTE: Record<SinFuente, string> = {
  correo: "próximamente: el correo llegará por los conectores (Gmail, IMAP) con su propio permiso; aún no hay lector para bots.",
  terminal: "próximamente: la terminal del aparato solo existirá en la app nativa (fase F3).",
  sensores: "próximamente: movimiento y salud siguen el permiso de salud de la Protomolécula y aún no tienen puente para bots.",
  ubicacion: "próximamente: falta el lector de ubicación con su indicador propio.",
  portapapeles: "próximamente: leer el portapapeles exige un gesto tuyo en cada lectura y falta ese botón.",
  aparatos: "próximamente: BLE, serie, MIDI, HID y Meshtastic piden elegir el aparato con un gesto; falta el selector para bots.",
};
const MICROFONO = "Micrófono activo: la escucha la hace el motor de voz de Astraura; este puente no graba nada.";
const SIN_RED = "próximamente: falta conectar el lector de notificaciones y feed del OS (lo trae la orbe-bot, BOT1011H1).";
const escanear = (): string => formatScanSummary(scanScreen(), 40);
const verDefecto = (f: "screen" | "camera"): Promise<string> => auroraSee(f);

/** Sin píxeles: cualquier imagen incrustada se quita; luego se recorta a 4.000 caracteres. */
function limpiar(texto: string): string {
  const sinImagen = texto.replace(/data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g, "[imagen omitida]").trim();
  return sinImagen.length > MAX_TEXTO_SENTIDO ? `${sinImagen.slice(0, MAX_TEXTO_SENTIDO - 1)}…` : sinImagen;
}

export function crearPuenteSentidos(dep: DepsPuenteSentidos) {
  const ahora = dep.ahora ?? Date.now;
  const avisar = (ev: EventoBucle, botId: string) => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENTO_BUCLE_UI, { detail: { botId, evento: ev } }));
      }
    } catch { /* sin orbe montada: el aviso no tumba la percepción */ }
    try { dep.alEvento?.(ev, botId); } catch { /* el aviso no tumba la percepción */ }
  };
  /** Lecturas en curso por bot y sentido: el indicador se apaga cuando acaba la ÚLTIMA, no la primera. */
  const enCurso = new Map<string, number>();
  const restar = (k: string): number => { const n = (enCurso.get(k) ?? 1) - 1; if (n > 0) enCurso.set(k, n); else enCurso.delete(k); return n; };
  async function fuente(sentido: Sentido): Promise<ResultadoPercibir | string> {
    switch (sentido) {
      case "pantalla": return (dep.leerPantalla ?? escanear)() || "No veo elementos interactivos en la pantalla del OS.";
      case "captura-pantalla": return (dep.ver ?? verDefecto)("screen");
      case "camara": return (dep.ver ?? verDefecto)("camera");
      case "archivos": {
        const r = await (dep.carpeta ?? conectarCarpetaYDetectar)();
        return r ? [r.resumen, r.backend].filter(Boolean).join(" ") : { ok: false, motivo: "No elegiste ninguna carpeta." };
      }
      case "red": return dep.red ? dep.red() : { ok: false, motivo: SIN_RED };
      case "microfono": return MICROFONO;
      default: return { ok: false, motivo: PROXIMAMENTE[sentido] };
    }
  }

  async function percibir(bot: Bot, sentido: Sentido, ctx: ContextoPercibir): Promise<ResultadoPercibir> {
    const at = ahora();
    let consentimientos: readonly ConsentimientoSentido[] = [];
    try { consentimientos = dep.consentimientos.vigentes(at); } catch { /* sin almacén legible: sin consentimiento */ }
    const decision = decidirSentido({ bot, sentido, cuentaId: ctx.cuentaId, sesion: ctx.sesion, medio: ctx.medio, consentimientos, ahora: at });
    if (!decision.permitido) {
      avisar({ tipo: "observar", sentido, decision, at }, bot.id);
      return { ok: false, motivo: decision.motivo };
    }
    const sinFuente = sentido in PROXIMAMENTE || (sentido === "red" && !dep.red);
    const clave = `${bot.id}|${sentido}`, lectura = !sinFuente && sentido !== "microfono";
    if (!sinFuente) avisar({ tipo: "observar", sentido, decision, at }, bot.id);
    if (lectura) enCurso.set(clave, (enCurso.get(clave) ?? 0) + 1);
    let crudo: ResultadoPercibir | string;
    try {
      crudo = await fuente(sentido);
    } catch (e) {
      const detalle = e instanceof Error && e.message ? e.message.slice(0, 300) : "error desconocido";
      crudo = { ok: false, motivo: `No pude usar «${sentido}»: ${detalle}` };
    } finally {
      if (lectura && restar(clave) <= 0) avisar({ tipo: "soltar", sentido, at: ahora() }, bot.id);
    }
    if (typeof crudo !== "string") return crudo;
    const texto = limpiar(crudo);
    if ((esInvitado(bot) || esBotDeEntidad(bot)) && detectarFuga(texto, [...(ctx.personales ?? [])]).length > 0) {
      return { ok: false, motivo: `Lo percibido repite recuerdos personales y «${bot.nombre}» es de grupo o invitado: no se le pasa.` };
    }
    return { ok: true, texto };
  }

  return { percibir };
}
