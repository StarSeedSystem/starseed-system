"use client";

/**
 * AuroraIntro — la pantalla «Hola, soy Aurora» (Adenda 67 · P1).
 * ============================================================================
 * YA NO es sólo una presentación con 3-5 preguntas: ahora es la puerta al
 * **CENTRO DE CONFIGURACIÓN DE AURORA Y ASTRAURA**
 * (`@/components/aurora/setup/aurora-setup-center`), que incluye:
 *
 *   Bienvenida · Personalidad · Sentidos · Conexiones · Astraura · Voz · Memoria
 *
 * La pestaña «Bienvenida» conserva exactamente las preguntas de antes (nombre,
 * tono, intereses, idioma, voz) y las aplica igual: contexto de usuario
 * (`starseed.astraura.usercontext.v1`), nivelador de formalidad de la personalidad
 * activa y encendido/apagado de la voz. Todo sigue siendo opcional y saltable.
 *
 * Este archivo se conserva (en vez de borrarse) porque es el que monta el layout
 * de la app (`src/app/(app)/layout.tsx`) y porque otros módulos aún importan sus
 * constantes. La lógica de apertura vive ahora en el propio centro.
 *
 * Compatibilidad: el evento `starseed:open-aurora-intro` y `window.openAuroraIntro()`
 * siguen funcionando (los escucha el centro) — p. ej. `aurora-control-panel.tsx`.
 */

import { AuroraSetupCenter } from "@/components/aurora/setup/aurora-setup-center";

/**
 * Clave persistida del intro ANTIGUO. Se mantiene exportada por compatibilidad;
 * el gate real del centro es `starseed.aurora.setup.v1` (ver `setup-config.ts`).
 */
export const AURORA_INTRO_KEY = "starseed.aurora.intro.v1";
/** Evento (legado) para relanzar la pantalla desde Ajustes. Lo escucha el centro. */
export const AURORA_INTRO_OPEN_EVENT = "starseed:open-aurora-intro";

export function AuroraIntro() {
  return <AuroraSetupCenter />;
}

export default AuroraIntro;
