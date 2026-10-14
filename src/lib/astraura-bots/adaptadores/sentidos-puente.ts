'use client';

import type { Bot, ConsentimientoSentido, Medio, RolBot, SesionTipo, Sentido } from "./tipos";
import { decidirSentido } from "@/lib/astraura-bots/permisos";
import type { AlcanceMemoria, FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { detectarFuga } from "@/lib/nucleo/alcance-memoria";
import type { ScreenElement } from "@/lib/aurora/screen-control/screen-scanner";

export function crearPuenteSentidos(dep: {
  pantalla: {
    scanScreen: () => ScreenElement[];
    formatScanSummary: (items: ScreenElement[], max?: number) => string;
  };
  "captura-pantalla": () => Promise<string>;
  camara: () => Promise<string>;
  archivos: () => Promise<{ resumen: string; backend?: string } | null>;
  red: () => Promise<string>;
  microfono: () => Promise<string>;
}) {
  return {
    async percibir(bot: Bot, sentido: Sentido, ctx: {
      cuentaId: string;
      sesion: SesionTipo;
      medio: Medio;
      consentimientos: ConsentimientoSentido[];
      ahora: number;
      personales: FragmentoMemoria[];
    }) {
      // 1. Check permission via decidirSentido
      const permiso = decidirSentido({
        bot,
        sentido,
        cuentaId: ctx.cuentaId,
        sesion: ctx.sesion,
        medio: ctx.medio,
        consentimientos: ctx.consentimientos,
        ahora: ctx.ahora,
      });

      if (!permiso.permitido) {
        return { ok: false, motivo: permiso.motivo };
      }

      // 2. Get raw data from the injected dependency
      let texto: string;
      try {
        switch (sentido) {
          case "pantalla": {
            const elementos = dep.pantalla.scanScreen();
            texto = dep.pantalla.formatScanSummary(elementos);
            break;
          }
          case "captura-pantalla": {
            texto = await dep["captura-pantalla"]();
            break;
          }
          case "camara": {
            texto = await dep.camara();
            break;
          }
          case "archivos": {
            const resultado = await dep.archivos();
            if (resultado === null) {
              return { ok: false, motivo: "No se seleccionó ninguna carpeta." };
            }
            texto = resultado.resumen;
            break;
          }
          case "red": {
            texto = await dep.red();
            break;
          }
          case "microfono": {
            texto = await dep.microfono();
            break;
          }
          default: {
            return { ok: false, motivo: `próximamente: sentido ${sentido} no implementado` };
          }
        }
      } catch (error: any) {
        return { ok: false, motivo: error.message ?? "Error desconocido al obtener el sentido." };
      }

      // 3. Truncate text to 4000 characters
      if (texto.length > 4000) {
        texto = texto.slice(0, 4000);
      }

      // 4. Check for memory leakage for guest or group bots
      const esInvitado = bot.origen !== "astraura";
      const esGrupo = bot.dueno.tipo !== "perfil";
      if (esInvitado || esGrupo) {
        const fugas = detectarFuga(texto, ctx.personales);
        if (fugas.length > 0) {
          return { ok: false, motivo: "Fuga de memoria personal detectada." };
        }
      }

      // 5. Return successful perception
      return { ok: true, texto };
    },
  };
}