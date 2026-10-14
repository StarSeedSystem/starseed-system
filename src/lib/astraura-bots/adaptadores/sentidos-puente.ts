'use client';
/**
 * Bots/dots de Astraura · PUENTE DE SENTIDOS (BOT1011F). Contrato: architecture/astraura-bots.md §5.
 *
 * Conecta cada Sentido con su fuente real del OS, SIEMPRE tras `decidirSentido`: sin permiso
 * vigente, la fuente ni se toca. Adaptador de cliente: las fuentes son inyectables para probar
 * sin navegador. Nunca guarda capturas y recorta el texto a `MAX_TEXTO_SENTIDO`. Antes de
 * devolver texto a un bot de grupo/entidad o invitado pasa la guarda anti-fuga contra los
 * fragmentos de memoria personal que le den: invitados y bots de grupo NUNCA ven lo personal.
 */
import { scanScreen, formatScanSummary } from "@/lib/aurora/screen-control/screen-scanner";
import { auroraSee } from "@/lib/aurora/senses/vision-sense";
import { conectarCarpetaYDetectar } from "@/lib/aurora/senses/folder-detect";
import { detectarFuga, type FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { decidirSentido } from "../permisos";
import {
  esBotDeEntidad, esInvitado,
  type Bot, type ConsentimientoSentido, type Medio, type Sentido, type TipoSesion,
} from "../tipos";

/** Máximo de caracteres que una percepción devuelve al bot. */
export const MAX_TEXTO_SENTIDO = 4000;

export type ResultadoPercepcion =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

/** Fuentes reales, todas inyectables. La lectura de `red` la aporta quien integra (BOT1011H1). */
export interface FuentesSentidos {
  /** Texto del escáner del DOM (nunca píxeles). */
  pantalla: () => string | Promise<string>;
  /** Visión local: "screen" = captura de pantalla, "camera" = cámara. Devuelve descripción. */
  ver: (fuente: "screen" | "camera") => Promise<string>;
  /** Conecta una carpeta del cerebro y resume lo detectado; null si la persona cancela. */
  archivos: () => Promise<{ resumen: string; backend?: string } | null>;
  /** Notificaciones y feed del OS. */
  red: () => Promise<string>;
}

export interface ContextoPercepcion {
  /** Cuenta cuyos datos tocaría el sentido (la que está delante del aparato). */
  cuentaId: string;
  sesion: TipoSesion;
  medio: Medio;
  /** Consentimientos vigentes (los carga el almacén de consentimientos, BOT1011E1). */
  consentimientos: readonly ConsentimientoSentido[];
  /** Fragmentos de memoria personal para la guarda anti-fuga (bots de grupo o invitados). */
  fragmentosPersonales?: readonly FragmentoMemoria[];
  ahora: number;
}

export interface PuenteSentidos {
  percibir(bot: Bot, sentido: Sentido, ctx: ContextoPercepcion): Promise<ResultadoPercepcion>;
}

/** Fuentes por defecto: las reales del OS (navegador). */
export function fuentesReales(): FuentesSentidos {
  return {
    pantalla: () => formatScanSummary(scanScreen(), 20),
    ver: (fuente) => auroraSee(fuente),
    archivos: () => conectarCarpetaYDetectar(),
    red: () =>
      Promise.resolve("próximamente: el lector de notificaciones y feed llega con BOT1011H1."),
  };
}

const proximamente = (sentido: Sentido): ResultadoPercepcion => ({
  ok: false,
  motivo: `próximamente: «${sentido}» aún no tiene una fuente conectada en el puente.`,
});

/** Recorta el texto al máximo permitido. */
export function recortar(texto: string): string {
  return texto.length > MAX_TEXTO_SENTIDO ? texto.slice(0, MAX_TEXTO_SENTIDO) : texto;
}

export function crearPuenteSentidos(dep: Partial<FuentesSentidos> = {}): PuenteSentidos {
  const fuentes: FuentesSentidos = { ...fuentesReales(), ...dep };

  async function leerFuente(bot: Bot, sentido: Sentido): Promise<ResultadoPercepcion> {
    try {
      switch (sentido) {
        case "pantalla":
          return { ok: true, texto: recortar(await fuentes.pantalla()) };
        case "captura-pantalla":
          return { ok: true, texto: recortar(await fuentes.ver("screen")) };
        case "camara":
          return { ok: true, texto: recortar(await fuentes.ver("camera")) };
        case "archivos": {
          const carpeta = await fuentes.archivos();
          if (!carpeta) return { ok: false, motivo: "No conectaste ninguna carpeta." };
          const texto = carpeta.backend ? `${carpeta.resumen} ${carpeta.backend}` : carpeta.resumen;
          return { ok: true, texto: recortar(texto) };
        }
        case "red":
          return { ok: true, texto: recortar(await fuentes.red()) };
        case "microfono":
          // La escucha la hace el motor de voz existente; aquí solo queda el sentido activo
          // (el indicador lo enseña la orbe mientras dure).
          return { ok: true, texto: "Micrófono activo: la escucha la hace el motor de voz y el indicador queda encendido." };
        default:
          return proximamente(sentido);
      }
    } catch (e) {
      // Un fallo de la fuente nunca lanza: se vuelve un motivo honesto.
      const detalle = e instanceof Error ? e.message : "error desconocido";
      return { ok: false, motivo: `«${bot.nombre}» no pudo usar «${sentido}»: ${detalle}` };
    }
  }

  return {
    async percibir(bot, sentido, ctx) {
      // Primero la puerta: sin permiso vigente, la fuente ni se toca.
      const decision = decidirSentido({
        bot, sentido,
        cuentaId: ctx.cuentaId,
        sesion: ctx.sesion,
        medio: ctx.medio,
        consentimientos: ctx.consentimientos,
        ahora: ctx.ahora,
      });
      if (!decision.permitido) return { ok: false, motivo: decision.motivo };

      const r = await leerFuente(bot, sentido);
      if (!r.ok) return r;

      // Guarda anti-fuga: un bot de grupo/entidad o invitado nunca recibe memoria personal.
      if (esInvitado(bot) || esBotDeEntidad(bot)) {
        const fugas = detectarFuga(r.texto, [...(ctx.fragmentosPersonales ?? [])]);
        if (fugas.length > 0) {
          return { ok: false, motivo: "El texto toca memoria personal y este bot es compartido o invitado: no se lo enseño." };
        }
      }
      return r;
    },
  };
}
