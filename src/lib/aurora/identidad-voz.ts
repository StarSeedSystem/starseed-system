/**
 * IDENTIDAD-VOZ (Ola 1015V · `architecture/voz-fusionada-astraura.md` §3 regla 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * La cara del RESOLUTOR ÚNICO de identidad de voz que LEE por sí misma los mapas
 * existentes — los seis que estaban sin coordinar — sin borrar ni mover a
 * ninguno:
 *   · VOZ_POR_PERSONA de voz-rt.ts: no se exporta, así que llega inyectado
 *     (vozDePersona lo pasa tal cual);
 *   · pines del registro: lo fijado por ámbito llega como capas
 *     (agente › cerebro › neurona › cuenta, cada una con motor/timbre/vozRT…);
 *   · timbres y voz-inicial: `TIMBRE_PREDETERMINADO[generoEfectivo(modo)]`
 *     (el modo autónomo de voz-inicial parte de neutra, como manda el catálogo);
 *   · voz-rito no guarda mapa propio: deriva de ese mismo modo y timbre;
 *   · INSTRUCT del demonio: `TIMBRES[].local.instruct`, lo que motor-local manda
 *     al demonio 1.58 para cada timbre;
 *   · `seedKindFor` de openvoice2.ts y `XAI_PERSONA_VOICES` de
 *     xai-persona-voices.ts, leídas aquí directamente.
 *
 * La precedencia (agente › personalidad › cerebro › neurona › cuenta) la aplica
 * el núcleo puro de `voz-identidad.ts`, que ya alimenta a `vozDePersona` de
 * voz-rt.ts. Los mapas de timbre/instruct van al suelo de la CAPA DE CUENTA:
 * son datos de la neurona, así que cualquier ámbito más específico los vence.
 * Ninguna función lanza («Aurora SIEMPRE habla»): si el resolutor falla, cae
 * al suelo (vozRT F1, timbre fem-aurora, motor auto) y la voz sigue.
 */

import { generoEfectivo, getModoVoz, type ModoVoz } from "@/lib/aurora/voz-inicial";
import { TIMBRE_PREDETERMINADO, TIMBRES } from "@/lib/aurora/timbres-catalogo";
import { seedKindFor } from "@/lib/aurora/tts-oss/openvoice2";
import {
    vozIdentidad,
    xaiPorDefecto,
    type NivelIdentidadVoz,
    type VozIdentidad,
} from "@/lib/aurora/voz-identidad";

export type { NivelIdentidadVoz, VozIdentidad };

/** Entrada del resolutor: ids y fijaciones por ámbito + los mapas privados del llamador. */
export interface EntradaIdentidadVoz {
    agente?: NivelIdentidadVoz;
    /** Id de la personalidad activa: activa los tres mapas por persona. */
    personalidad?: string;
    cerebro?: NivelIdentidadVoz;
    neurona?: NivelIdentidadVoz;
    cuenta?: NivelIdentidadVoz;
    /** VOZ_POR_PERSONA de voz-rt.ts: mapa privado del llamador, se pasa tal cual. */
    vozPorPersona?: Record<string, string>;
    /** Modo de voz de esta neurona (voz-inicial); si falta, se lee el guardado. */
    modoVoz?: ModoVoz;
}

/** El INSTRUCT que el demonio usaría para ese timbre, según el catálogo. Nunca lanza. */
function instructDeTimbre(id: string): string | undefined {
    try {
        return TIMBRES.find((t) => t.id === id)?.local.instruct;
    } catch {
        return undefined;
    }
}

/**
 * Resuelve la identidad de voz de UNA persona leyendo los mapas existentes:
 * `{ timbre, motor, vozRT, origen }` — con instruct, semilla y xai que quedan
 * para los motores que los saben usar. Pura respecto a la lógica; la única
 * lectura viva es la del modo guardado, ya protegida dentro de voz-inicial.
 */
export function identidadVoz(e: EntradaIdentidadVoz = {}): VozIdentidad {
    const modo = e.modoVoz ?? getModoVoz();
    const timbreDelMapa = TIMBRE_PREDETERMINADO[generoEfectivo(modo)] || "fem-aurora";
    try {
        // Primero la resolución de capas; la cuenta solo añade el timbre del mapa.
        const r = vozIdentidad(
            {
                personalidadId: e.personalidad,
                agente: e.agente,
                cerebro: e.cerebro,
                neurona: e.neurona,
                cuenta: { ...e.cuenta, timbre: e.cuenta?.timbre || timbreDelMapa },
            },
            {
                vozPorPersona: e.vozPorPersona,
                xaiPorPersona: xaiPorDefecto(),
                semillaPorPersona: seedKindFor,
            },
        );
        // El INSTRUCT del demonio acompaña al timbre que quedó: si un ámbito fijó
        // el suyo manda el suyo; si no, lo da el catálogo para el timbre FINAL.
        return { ...r, instruct: r.instruct ?? instructDeTimbre(r.timbre) };
    } catch {
        // El resolutor nunca tumba a la capa de voz: el suelo siempre está.
        return vozIdentidad();
    }
}
