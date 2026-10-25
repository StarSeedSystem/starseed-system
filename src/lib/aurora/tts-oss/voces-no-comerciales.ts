"use client";

/**
 * voces-no-comerciales.ts — MOTORES DE VOZ OPCIONALES DE USO PERSONAL NO COMERCIAL · VZR1011C.
 * ============================================================================
 * Contrato `architecture/astraura-voces-y-robots.md` §1 (datos verificados el
 * 2026-10-11) y regla de la forja (`architecture/forja-voz-158.md` §4): en el
 * producto y en TODO uso comercial solo MIT/Apache. Por eso F5-TTS y XTTS-v2
 * NO se integran en el producto y NO entran en la cadena AUTO
 * (`AUTO_ENDPOINT_ORDER` ni `buildVoiceChain` los nombran): son OPCIONES
 * PERSONALES que la persona instala a mano, acepta su licencia en la casilla
 * que explica y usa solo fuera de contextos comerciales. ChatTTS NO se
 * integra en absoluto (modelo «CC BY-NC 4.0, solo académico» y sin español):
 * aquí está su ficha, nada más.
 *
 * Apagados por defecto: sin la aceptación registrada NO se pueden usar, aunque
 * la persona levante su propio servidor. Nunca descargamos pesos ni los
 * pedimos (quien instala lo hace él, comprobando el espacio ≥ 3 veces).
 * Puro e inyectable (`DepsVozNoComercial`), espejo de `chatterbox.ts`. Sin
 * red, sin disco implícito, sin `node:*`. Nunca lanza.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Motores no comerciales que PUEDEN activarse como uso personal (ChatTTS no). */
export type VozNoComercialId = "f5-tts" | "xtts-v2";

/** Dónde y para qué se pide una voz: el filtro comercial decide con esto. */
export interface ContextoUsoVoz {
  /** Personal (tú), página pública o grupo de la red. */
  tipo: "personal" | "pagina" | "grupo";
  /**
   * ¿El contexto tiene fines comerciales? Sin declararlo en página o grupo se
   * trata como comercial (prudencia): hay que marcar el «no» a la vista.
   */
  finesComerciales?: boolean;
}

/** Veredicto del filtro, con el motivo a la vista (nada silencioso). */
export interface VeredictoNoComercial {
  permitido: boolean;
  motivo: "ok" | "contexto-comercial" | "sin-aceptar-licencia" | "solo-ficha" | "motor-desconocido";
}

/** Deps inyectables para el estado de aceptación (tests y SSR). */
export interface DepsVozNoComercial {
  leer: (clave: string) => string | null;
  escribir: (clave: string, valor: string) => void;
  ahora: () => number;
}

// ── Fichas (licencias EXACTAS del contrato §1; no se inventan otras) ─────────

export interface FichaVozNoComercial {
  id: VozNoComercialId | "chat-tts";
  nombre: string;
  /** Licencia del CÓDIGO (contrato §1). */
  licenciaCodigo: string;
  /** Licencia de los PESOS / modelo (contrato §1). */
  licenciaPesos: string;
  /** Español nativo según los datos verificados del contrato §1. */
  espanol: boolean;
  repo: string;
  /** Texto de la casilla: explica la licencia ANTES de aceptar. */
  textoCasilla: string;
  /** Solo ficha: jamás se integra. */
  soloFicha: boolean;
}

export const FICHA_F5_TTS: FichaVozNoComercial = {
  id: "f5-tts",
  nombre: "F5-TTS · SWivid",
  licenciaCodigo: "MIT",
  licenciaPesos: "CC-BY-NC",
  espanol: false,
  repo: "https://github.com/SWivid/F5-TTS",
  textoCasilla:
    "Pesos bajo CC-BY-NC, no comerciales: solo tú, nunca en páginas o grupos con fines comerciales y nunca en el producto StarSeed. Español no oficial (zh/en entrenamiento). Lo instala y aloja tu propio equipo: no descargamos pesos por ti.",
  soloFicha: false,
};

export const FICHA_XTTS_V2: FichaVozNoComercial = {
  id: "xtts-v2",
  nombre: "XTTS-v2 · Coqui",
  licenciaCodigo: "MPL-2.0",
  licenciaPesos: "Coqui Public Model License (no comercial)",
  espanol: true,
  repo: "https://github.com/coqui-ai/TTS",
  textoCasilla:
    "El modelo lleva la Coqui Public Model License (no comercial): solo tú, nunca en páginas o grupos con fines comerciales y nunca en el producto StarSeed. Coqui cerró y no hay licencia comercial que comprar. Habla español (16 idiomas). Lo instala y aloja tu propio equipo: no descargamos pesos por ti.",
  soloFicha: false,
};

/** Ficha de ChatTTS: SOLO catalogar — no se integra ni se activa jamás. */
export const FICHA_CHATTTS: FichaVozNoComercial = {
  id: "chat-tts",
  nombre: "ChatTTS · 2noise",
  licenciaCodigo: "AGPLv3+",
  licenciaPesos: "CC BY-NC 4.0 (solo académico)",
  espanol: false,
  repo: "https://github.com/2noise/ChatTTS",
  textoCasilla:
    "No se integra en el OS: su modelo es «CC BY-NC 4.0, solo académico», no habla español y añade ruido a propósito. Ficha solo para consulta.",
  soloFicha: true,
};

export const LICENCIAS_VOCES_NO_COMERCIALES: readonly FichaVozNoComercial[] = [
  FICHA_F5_TTS,
  FICHA_XTTS_V2,
  FICHA_CHATTTS,
];

// ── Filtros puros (la regla del área, en funciones) ──────────────────────────

/** ¿Es uno de los motores no comerciales de este módulo? */
export function esMotorNoComercial(id: string | null | undefined): boolean {
  return id === "f5-tts" || id === "xtts-v2" || id === "chat-tts";
}

/**
 * ¿El contexto es COMERCIAL? En lo declarado se cree; en lo no declarado de
 * página o grupo se actúa con prudencia (se trata como comercial hasta que su
 * dueño marque el «no» a la vista). Lo personal se presume no comercial.
 */
export function esContextoComercial(ctx: ContextoUsoVoz): boolean {
  try {
    if (ctx.finesComerciales === true) return true;
    if (ctx.finesComerciales === false) return false;
    return ctx.tipo !== "personal";
  } catch {
    return true;
  }
}

/**
 * EL FILTRO COMERCIAL: ¿se puede usar un motor no comercial EN ESTE uso?
 * Reglas del contrato §1 + forja §4, en orden: ChatTTS jamás; contexto
 * comercial jamás; sin licencia aceptada jamás. Nunca lanza (ante duda,
 * `motor-desconocido` = no).
 */
export function evaluarUsoNoComercial(
  id: string | null | undefined,
  aceptada: boolean,
  ctx: ContextoUsoVoz,
): VeredictoNoComercial {
  try {
    if (id === "chat-tts") return { permitido: false, motivo: "solo-ficha" };
    if (!esMotorNoComercial(id)) return { permitido: false, motivo: "motor-desconocido" };
    if (esContextoComercial(ctx)) return { permitido: false, motivo: "contexto-comercial" };
    if (!aceptada) return { permitido: false, motivo: "sin-aceptar-licencia" };
    return { permitido: true, motivo: "ok" };
  } catch {
    return { permitido: false, motivo: "motor-desconocido" };
  }
}

/**
 * Una CADENA de voz (buildVoiceChain o la prioridad guardada) NO debe llevar
 * motores no comerciales: ChatTTS JAMÁS (solo ficha) y F5/XTTS solo si la
 * persona aceptó su licencia PARA ESE uso personal. En la cadena AUTO nunca
 * están (este módulo ni toca `AUTO_ENDPOINT_ORDER`); si un día se colaran,
 * aquí se filtran.
 */
export function sinNoComercialesNoAceptados(
  cadena: readonly string[],
  aceptadas?: readonly string[],
): string[] {
  try {
    const ok = new Set(aceptadas ?? []);
    return (cadena ?? []).filter((id) => {
      if (id === "chat-tts") return false;
      return !(esMotorNoComercial(id) && !ok.has(id));
    });
  } catch {
    return [];
  }
}

/**
 * Regla de la forja §4: ¿el motor es apto PARA EL PRODUCTO / uso comercial?
 * Entre los tres de este módulo: ninguno (son no comerciales). Los MIT/Apache
 * del registro (`chatterbox`, `openvoice2`…) sí pasan.
 */
export function aptoParaProducto(id: string): boolean {
  try {
    return !esMotorNoComercial(id);
  } catch {
    return false;
  }
}

// ── Estado de aceptación (opt-in, APAGADO POR DEFECTO) ──────────────────────

/** Clave de localStorage: { motor: { aceptadaAt } } · solo motores NO soloFicha. */
export const CLAVE_VOCES_NO_COMERCIALES = "starseed.aurora.voces.no-comerciales.v1";

/** Deps por defecto (navegador). SSR-safe: null fuera del cliente. */
export function depsDeNavegador(): DepsVozNoComercial | null {
  try {
    if (typeof window === "undefined") return null;
    return {
      leer: (c) => window.localStorage.getItem(c),
      escribir: (c, v) => window.localStorage.setItem(c, v),
      ahora: () => Date.now(),
    };
  } catch {
    return null;
  }
}

type RegistroAceptacion = Partial<Record<VozNoComercialId, { aceptadaAt: number }>>;

function leerAceptadas(deps: DepsVozNoComercial): RegistroAceptacion {
  try {
    const bruto = deps.leer(CLAVE_VOCES_NO_COMERCIALES);
    return bruto ? (JSON.parse(bruto) as RegistroAceptacion) : {};
  } catch {
    return {};
  }
}

/** ¿La licencia del motor está aceptada? Apagado por defecto: sin registro, no. */
export function licenciaAceptadaNoComercial(
  id: VozNoComercialId,
  deps: DepsVozNoComercial,
): boolean {
  try {
    return typeof leerAceptadas(deps)[id]?.aceptadaAt === "number";
  } catch {
    return false;
  }
}

/** Registra la aceptación de la casilla. ChatTTS (soloFicha) se ignora. */
export function aceptarLicenciaNoComercial(id: VozNoComercialId, deps: DepsVozNoComercial): void {
  try {
    if (LICENCIAS_VOCES_NO_COMERCIALES.find((f) => f.id === id)?.soloFicha) return;
    const actual = leerAceptadas(deps);
    actual[id] = { aceptadaAt: deps.ahora() };
    deps.escribir(CLAVE_VOCES_NO_COMERCIALES, JSON.stringify(actual));
  } catch {
    /* almacenamiento no disponible → no rompemos: sigue apagado */
  }
}

/** Revoca la aceptación: la licencia se puede retractar en cualquier momento. */
export function revocarLicenciaNoComercial(id: VozNoComercialId, deps: DepsVozNoComercial): void {
  try {
    const actual = leerAceptadas(deps);
    delete actual[id];
    deps.escribir(CLAVE_VOCES_NO_COMERCIALES, JSON.stringify(actual));
  } catch {
    /* */
  }
}

/**
 * Veredicto COMPLETO: filtro comercial + estado guardado. Es la función que
 * la UI y un futuro enrutado de voz llamarían antes de usar el motor.
 */
export function puedeUsarseNoComercial(
  id: string,
  ctx: ContextoUsoVoz,
  deps: DepsVozNoComercial,
): VeredictoNoComercial {
  try {
    if (id === "chat-tts") return { permitido: false, motivo: "solo-ficha" };
    return evaluarUsoNoComercial(
      id,
      licenciaAceptadaNoComercial(id as VozNoComercialId, deps),
      ctx,
    );
  } catch {
    return { permitido: false, motivo: "motor-desconocido" };
  }
}
