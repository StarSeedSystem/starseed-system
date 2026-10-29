/**
 * VZR1011C — VOCES NO COMERCIALES DE USO PERSONAL (F5-TTS, XTTS-v2) y la ficha
 * de ChatTTS (que NO se integra). Licencias EXACTAS del contrato §1
 * (`architecture/astraura-voces-y-robots.md`, verificado el 2026-10-11) y regla
 * de la forja §4 (en producto y en todo uso comercial solo MIT/Apache). Aquí NO
 * entra nada en el registro de motores ni en la cadena AUTO: F5-TTS y XTTS-v2
 * son OPCIONALES de uso personal no comercial (la persona los instala a mano y
 * acepta su licencia en una casilla que la explica); jamás en comerciales.
 * Módulo PURO: sin imports, sin red, nunca lanza; descargas automáticas
 * de pesos prohibidas («basta de ilusiones»).
 */

export type ContextoUsoVoz =
  | "personal"
  | "paginas-comerciales"
  | "grupos-comerciales"
  | "producto";

/** Ficha de una voz no comercial. */
export interface FichaVozNoComercial {
  id: "f5-tts" | "xtts-v2" | "chattts";
  nombre: string;
  repo: string;
  licenciaCodigo: string;
  licenciaPesos: string;
  /** Idiomas honestos del contrato §1. */
  idiomas: string;
  espanol: boolean;
  /** Regla forja §4; y por defecto NUNCA habla sin instalación y aceptación. */
  enProducto: false;
  porDefecto: false;
  /** f5-tts y xtts-v2: integrados como OPCIONALES de uso personal. */
  integrado: boolean;
  /** ChatTTS: solo ficha, sin motor (no hay casilla ni activación). */
  soloFicha: boolean;
  requiereCasilla: boolean;
}

export const VOCES_NO_COMERCIALES: readonly FichaVozNoComercial[] = [
  { id: "f5-tts", nombre: "F5-TTS (opcional personal)", repo: "https://github.com/SWivid/F5-TTS", licenciaCodigo: "MIT", licenciaPesos: "CC-BY-NC-4.0", idiomas: "chino e inglés sin español oficial", espanol: false, enProducto: false, porDefecto: false, integrado: true, soloFicha: false, requiereCasilla: true },
  { id: "xtts-v2", nombre: "XTTS-v2 (opcional personal)", repo: "https://huggingface.co/coqui/XTTS-v2", licenciaCodigo: "MPL-2.0", licenciaPesos: "Coqui Public Model License (no comercial)", idiomas: "16 idiomas (es incluido)", espanol: true, enProducto: false, porDefecto: false, integrado: true, soloFicha: false, requiereCasilla: true },
  { id: "chattts", nombre: "ChatTTS (solo ficha)", repo: "https://github.com/2noise/ChatTTS", licenciaCodigo: "AGPLv3+", licenciaPesos: "CC BY-NC 4.0 («solo académico»)", idiomas: "inglés y chino", espanol: false, enProducto: false, porDefecto: false, integrado: false, soloFicha: true, requiereCasilla: false },
];

export function fichaNoComercial(id: string): FichaVozNoComercial | null {
  return VOCES_NO_COMERCIALES.find((f) => f.id === id) ?? null;
}

/** ¿El contexto es comercial (o producto)? Todo lo que no es personal, sí. */
export function esContextoComercial(ctx: ContextoUsoVoz): boolean {
  return ctx !== "personal";
}

/** ¿Esta voz se permite en este contexto? Nunca lanza. */
export function sePermiteEnContexto(id: string, ctx: ContextoUsoVoz): boolean {
  const f = fichaNoComercial(id);
  return !!f && !f.soloFicha && !esContextoComercial(ctx) && f.integrado && f.requiereCasilla;
}

/** La CASILLA que explica la licencia, exacta (§1). ChatTTS no tiene. */
const CASILLAS: Record<string, string> = {
  "f5-tts":
    "Uso personal no comercial. El código de F5-TTS es MIT, pero sus PESOS son CC-BY-NC-4.0: no pueden entrar en producto ni en páginas o grupos con fines comerciales (regla de la forja §4). Lo instalas tú, se apaga por defecto y no está en la cadena automática.",
  "xtts-v2":
    "Uso personal no comercial. El código de XTTS-v2 es MPL-2.0 y el modelo lleva la Coqui Public Model License (no comercial): Coqui cerró y no hay licencia comercial que comprar. Lo instalas tú, se apaga por defecto y nunca en contextos comerciales.",
};

/** Texto de la casilla que explica la licencia; null si no hay. Nunca lanza. */
export function textoCasillaLicencia(id: string): string | null {
  return CASILLAS[id] ?? null;
}

/** Petición de habilitación (lo que manda el panel de voz al activar). */
export interface PeticionHabilitarVozNoComercial {
  id: string;
  /** La persona la puso en marcha ella misma (nunca descarga automática). */
  instaladoPorPersona?: boolean;
  /** La casilla explicativa marcada de verdad (no ahí sin leer). */
  casillaAceptada?: boolean;
  context: ContextoUsoVoz;
}

/** Resultado de la habilitación, con los motivos honestos si faltan cosas. */
export interface HabilitacionVoz {
  habilitada: boolean;
  faltan: string[];
}

/**
 * El FILTRO COMERCIAL: F5-TTS y XTTS-v2 solo se habilitan con licencia
 * aceptada en la casilla, instalación por la persona y contexto personal.
 * ChatTTS no se habilita nunca. Nunca lanza.
 */
export function habilitarVozNoComercial(p: PeticionHabilitarVozNoComercial): HabilitacionVoz {
  const faltan: string[] = [];
  if (!fichaNoComercial(p.id)) faltan.push("Voz no conocida.");
  else if (fichaNoComercial(p.id)?.soloFicha) faltan.push("ChatTTS no se integra: solo su ficha.");
  else {
    if (!p.instaladoPorPersona) faltan.push("La persona debe instalar el motor ella misma.");
    if (!p.casillaAceptada) faltan.push("Falta aceptar la licencia en la casilla que la explica.");
    if (esContextoComercial(p.context)) faltan.push("Uso comercial: prohibido por su licencia.");
  }
  return { habilitada: faltan.length === 0, faltan };
}
