// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS · Voces no comerciales — filtro de licencia y contexto
// ════════════════════════════════════════════════════════════════════════════
// Contrato: architecture/astraura-voces-y-robots.md §1 (§4 de la forja) y
// memory/voces-catalogo.md.  Módulo PURO: sin red, sin disco, sin procesos.
// ════════════════════════════════════════════════════════════════════════════

/** Tipo de contexto de uso para el filtro de licencia. */
export type ContextoVoz =
  | "personal-local"   // uso individual, sin fines comerciales
  | "grupo-comunitario" // página o grupo con fines no comerciales
  | "comercial"         // página o grupo con fines comerciales
  | "publico-red";     // publicación pública con posible monetización

/** Resultado del filtro de licencia para un motor en un contexto. */
export interface VeredictoVoz {
  motor: string;
  permitido: boolean;
  motivo: string; // mensaje claro en español, accesible
  licenciaExacta: string;
  requiereConsentimiento?: boolean; // clonación de voz ajena
  requiereAceptacionLicencia?: boolean; // casilla explícita
  esOpcionalPersonal?: boolean; // F5-TTS / XTTS-v2
  estaEnCadenaAuto?: boolean; // nunca para opcionales no comerciales
}

/** Ficha mínima verificada del contrato §1 (2026-10-11). */
export interface FichaMotor {
  id: string;
  nombre: string;
  licenciaCodigo: string;
  licenciaPesos?: string;
  usoComercialLibre: boolean; // MIT/Apache-2.0 → sí
  soloUsoPersonalNoComercial: boolean; // pesos CC-BY-NC / MPL público no comercial
  cubreEspanol: boolean;
  soloAcademico?: boolean; // ChatTTS
  requiereConsentimientoClonacion?: boolean;
  marcaAgua?: string; // p. ej. "Perth (Resemble AI)"
  versionVerificada: string; // versión comprobada del upstream
  repoUpstream: string;
}

// ── Catálogo verificado (§1 del contrato, datos del 2026-10-11) ────────────────

export const FICHAS_MOTORES: Record<string, FichaMotor> = {
  "chatterbox": {
    id: "chatterbox",
    nombre: "Chatterbox · Resemble AI",
    licenciaCodigo: "MIT",
    licenciaPesos: "MIT (checkpoints y código)",
    usoComercialLibre: true,
    soloUsoPersonalNoComercial: false,
    cubreEspanol: true,
    soloAcademico: false,
    requiereConsentimientoClonacion: true,
    marcaAgua: "Perth (Resemble AI)",
    versionVerificada: "Multilingual V3 (0.5 B parámetros)",
    repoUpstream: "https://github.com/resemble-ai/chatterbox",
  },
  "openvoice2": {
    id: "openvoice2",
    nombre: "OpenVoice V2 · MyShell",
    licenciaCodigo: "MIT",
    licenciaPesos: "MIT (V2: código y checkpoints)",
    usoComercialLibre: true,
    soloUsoPersonalNoComercial: false,
    cubreEspanol: true,
    soloAcademico: false,
    requiereConsentimientoClonacion: true,
    marcaAgua: undefined,
    versionVerificada: "2.0.0",
    repoUpstream: "https://github.com/myshell-ai/OpenVoice",
  },
  "f5-tts": {
    id: "f5-tts",
    nombre: "F5-TTS · SWivid",
    licenciaCodigo: "MIT",
    licenciaPesos: "CC-BY-NC-4.0 (pesos no comerciales)",
    usoComercialLibre: false,
    soloUsoPersonalNoComercial: true,
    cubreEspanol: false,
    soloAcademico: false,
    requiereConsentimientoClonacion: false,
    marcaAgua: undefined,
    versionVerificada: "1.0 (código MIT · pesos CC-BY-NC verificados 2026-10-11)",
    repoUpstream: "https://github.com/SWivid/F5-TTS",
  },
  "xtts-v2": {
    id: "xtts-v2",
    nombre: "XTTS-v2 · Coqui",
    licenciaCodigo: "MPL-2.0",
    licenciaPesos: "Coqui Public Model License (no comercial)",
    usoComercialLibre: false,
    soloUsoPersonalNoComercial: true,
    cubreEspanol: true,
    soloAcademico: false,
    requiereConsentimientoClonacion: true,
    marcaAgua: undefined,
    versionVerificada: "v2 (código MPL-2.0 · modelo no comercial verificado 2026-10-11)",
    repoUpstream: "https://github.com/coqui-ai/TTS",
  },
  "chatt-ts": {
    // Solo ficha (CC BY-NC 4.0 “solo académico”, sin español); NO se integra
    id: "chatt-ts",
    nombre: "ChatTTS · 2noise",
    licenciaCodigo: "AGPLv3+",
    licenciaPesos: "CC BY-NC 4.0 (solo académico; sin español)",
    usoComercialLibre: false,
    soloUsoPersonalNoComercial: false, // ni siquiera para uso personal
    cubreEspanol: false,
    soloAcademico: true,
    requiereConsentimientoClonacion: false,
    marcaAgua: undefined,
    versionVerificada: "Modelo CC BY-NC 4.0 verificado 2026-10-11 (sin integración)",
    repoUpstream: "https://github.com/2noise/ChatTTS",
  },
};

// ── Funciones puras de filtro (entrada → salida) ──────────────────────────────

/** ¿Es un contexto comercial según la regla dorada y el contrato §1? */
export function esContextoComercial(ctx: ContextoVoz): boolean {
  return ctx === "comercial" || ctx === "publico-red";
}

/** ¿Permite uso personal no comercial para los opcionales (F5-TTS / XTTS-v2)? */
export function esUsoPersonalNoComercial(ctx: ContextoVoz): boolean {
  return ctx === "personal-local" || ctx === "grupo-comunitario";
}

/** Motores que NO entran en AUTO por defecto: solo opcionales personales. */
export function motoresOpcionalesPersonales(): string[] {
  return ["f5-tts", "xtts-v2"];
}

/** Motores con licencia libre para producto (MIT / Apache-2.0 / MPL-2.0 código). */
export function motoresProductoLibre(): string[] {
  return ["chatterbox", "openvoice2"];
}

/** ¿El motor puede usarse en este contexto según su licencia verificada? */
export function puedeUsarMotor(
  idMotor: string,
  contexto: ContextoVoz,
): boolean {
  const ficha = FICHAS_MOTORES[idMotor];
  if (!ficha) return false; // motor desconocido = no permitido
  // ChatTTS: nunca se integra (solo ficha)
  if (ficha.id === "chatt-ts") return false;
  // Contexto comercial: solo los de licencia libre
  if (esContextoComercial(contexto)) {
    return ficha.usoComercialLibre === true;
  }
  // Uso personal no comercial: los opcionales personales se permiten
  // solo si la persona los instala y acepta la licencia (ver `veredicto`).
  if (ficha.soloUsoPersonalNoComercial && esUsoPersonalNoComercial(contexto)) {
    return true; // permitido con la casilla explícita (el veredicto lo refleja)
  }
  // Resto: permitido si tiene licencia libre o es opcional personal aceptado
  return ficha.usoComercialLibre || ficha.soloUsoPersonalNoComercial;
}

/** Ficha con licencia exacta y comprobación de versión. */
export function fichaMotor(idMotor: string): FichaMotor | undefined {
  return FICHAS_MOTORES[idMotor];
}

/** Veredicto completo con mensaje claro, accesible, en español. */
export function veredictoVoz(
  idMotor: string,
  contexto: ContextoVoz,
): VeredictoVoz {
  const ficha = FICHAS_MOTORES[idMotor];
  if (!ficha) {
    return {
      motor: idMotor,
      permitido: false,
      motivo: `Motor «${idMotor}» no registrado en la Biblioteca: sin ficha de licencia verificada.`,
      licenciaExacta: "desconocida",
    };
  }
  if (ficha.id === "chatt-ts") {
    return {
      motor: idMotor,
      permitido: false,
      motivo: `ChatTTS: código ${ficha.licenciaCodigo}, modelo ${ficha.licenciaPesos}. Solo ficha (sin español, sin integración).`,
      licenciaExacta: `${ficha.licenciaCodigo} · ${ficha.licenciaPesos}`,
      esOpcionalPersonal: false,
      estaEnCadenaAuto: false,
    };
  }
  const permitidoEnContexto = puedeUsarMotor(idMotor, contexto);
  const esPersonal = ficha.soloUsoPersonalNoComercial;
  if (esContextoComercial(contexto) && !ficha.usoComercialLibre) {
    return {
      motor: idMotor,
      permitido: false,
      motivo: esPersonal
        ? `Motor «${ficha.nombre}»: ${ficha.licenciaPesos}. Uso NO comercial (pesos CC-BY-NC o licencia pública no comercial). Apagado en contextos comerciales por la regla de la forja §4.`
        : `Motor «${ficha.nombre}»: ${ficha.licenciaPesos}. No permitido en contexto comercial.`,
      licenciaExacta: `${ficha.licenciaCodigo} · ${ficha.licenciaPesos}`,
      requiereAceptacionLicencia: esPersonal,
      requiereConsentimiento: ficha.requiereConsentimientoClonacion || false,
      esOpcionalPersonal: esPersonal,
      estaEnCadenaAuto: false,
    };
  }
  if (esPersonal && esUsoPersonalNoComercial(contexto)) {
    return {
      motor: idMotor,
      permitido: true,
      motivo: `Opcional de uso personal no comercial (${ficha.licenciaPesos}). Requiere instalación manual + aceptación de licencia en casilla explícita. Nunca entra en AUTO por defecto.`,
      licenciaExacta: `${ficha.licenciaCodigo} · ${ficha.licenciaPesos}`,
      requiereAceptacionLicencia: true,
      requiereConsentimiento: ficha.requiereConsentimientoClonacion || false,
      esOpcionalPersonal: true,
      estaEnCadenaAuto: false,
    };
  }
  return {
    motor: idMotor,
    permitido: permitidoEnContexto,
    motivo: permitidoEnContexto
      ? `Motor «${ficha.nombre}»: licencia libre (${ficha.licenciaCodigo}) para producto; pesos ${ficha.licenciaPesos || "MIT/Apache"}. Verificado ${ficha.versionVerificada}.`
      : `Motor «${ficha.nombre}»: no permitido en contexto «${contexto}» según licencia verificada.`,
    licenciaExacta: `${ficha.licenciaCodigo} · ${ficha.licenciaPesos ?? "MIT/Apache"}`,
    requiereAceptacionLicencia: esPersonal,
    requiereConsentimiento: ficha.requiereConsentimientoClonacion || false,
    esOpcionalPersonal: esPersonal,
    estaEnCadenaAuto: ficha.usoComercialLibre,
  };
}

/** Comprobación de versión: compara con el upstream (sin red; el valor viene del registro). */
export function comprobarVersion(
  idMotor: string,
  versionLocal: string,
): string {
  const ficha = FICHAS_MOTORES[idMotor];
  if (!ficha) return `motor «${idMotor}» sin ficha en Biblioteca`;
  return versionLocal === ficha.versionVerificada
    ? `versión verificada (${ficha.versionVerificada}) — coincide con upstream ${ficha.repoUpstream}`
    : `versión local (${versionLocal}) ≠ verificada (${ficha.versionVerificada}) — revisar`;
}
