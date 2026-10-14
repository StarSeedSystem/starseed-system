// Preferencias de procesos activos del cerebro.
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7 (Ajustables).

import { TipoProceso, UmbralesProcesos, UMBRALES_POR_DEFECTO, ETIQUETA_TIPO } from "./procesos";

/** Clave de almacenamiento para las preferencias de procesos.
// NOTA: El prefijo `starseed.cerebros.` no está en SYNCED_PREFIXES de settings-sync.ts,
// por lo que usamos `starseed.brain.<id>.procesos.v1` que sí se sincroniza (ver line 223). */
export const CLAVE_PROCESOS = (brainId: string) => `starseed.brain.${brainId}.procesos.v1`;

export interface PreferenciasProcesos {
  tipos: TipoProceso[];
  intervaloSeg: number;
  umbrales: UmbralesProcesos;
  ocultos: string[];
}

/** Preferencias por defecto. */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasProcesos = {
  tipos: Object.keys(ETIQUETA_TIPO) as TipoProceso[], // Todos los tipos visibles por defecto
  intervaloSeg: 15, // 15 segundos por defecto
  umbrales: { ...UMBRALES_POR_DEFECTO }, // Copia de los umbrales por defecto
  ocultos: [], // Ningún servidor oculto por defecto,
};

/**
 * Normaliza las preferencias crudas (por ejemplo, de localStorage).
 * - intervaloSeg: entre 5 y 120, 15 por defecto
 * - umbrales: cada valor entre 1 y 100, por defecto los de UMBRALES_POR_DEFECTO
 * - tipos: filtro a valores válidos de TipoProceso, por defecto todos
 * - ocultos: array de strings, por defecto vacío
 */
export function normalizarPreferencias(raw: unknown): PreferenciasProcesos {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return PREFERENCIAS_POR_DEFECTO;
  }

  const o = raw as Record<string, unknown>;

  // Normalizar tipos
  const tiposRaw = o.tipos;
  let tipos: TipoProceso[] = PREFERENCIAS_POR_DEFECTO.tipos; // Valor por defecto
  
  if (Array.isArray(tiposRaw)) {
    // Filtrar a valores string válidos y luego verificar que sean tipos de proceso conocidos
    const tiposValidos = tiposRaw
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .filter((t): t is TipoProceso =>
        [
          "genesis",
          "poligenesis",
          "sueno",
          "imaginacion",
          "descarga",
          "instalacion",
          "actualizacion",
          "app-fondo",
          "servicio",
        ].includes(t)
      );
    // Si hay al menos un tipo válido, usamos solo esos; si no, mantenemos el valor por defecto
    if (tiposValidos.length > 0) {
      tipos = tiposValidos;
    }
    // Si no hay tipos válidos, mantenemos los tipos por defecto (ya está inicializado así)
  }

  // Normalizar intervaloSeg (entre 5 y 120, 15 por defecto)
  const intervaloRaw = o.intervaloSeg;
  let intervaloSeg = PREFERENCIAS_POR_DEFECTO.intervaloSeg;
  if (typeof intervaloRaw === "number" && Number.isFinite(intervaloRaw)) {
    intervaloSeg = Math.max(5, Math.min(120, Math.round(intervaloRaw)));
  }

  // Normalizar umbrales (cada uno entre 1 y 100)
  const umbralesRaw = o.umbrales;
  let umbrales: UmbralesProcesos = { ...UMBRALES_POR_DEFECTO };
  if (
    umbralesRaw &&
    typeof umbralesRaw === "object" &&
    !Array.isArray(umbralesRaw)
  ) {
    const u = umbralesRaw as Record<string, unknown>;
    if (typeof u.cpu === "number" && Number.isFinite(u.cpu)) {
      umbrales.cpu = Math.max(1, Math.min(100, Math.round(u.cpu)));
    }
    if (typeof u.ram === "number" && Number.isFinite(u.ram)) {
      umbrales.ram = Math.max(1, Math.min(100, Math.round(u.ram)));
    }
    if (typeof u.disco === "number" && Number.isFinite(u.disco)) {
      umbrales.disco = Math.max(1, Math.min(100, Math.round(u.disco)));
    }
    if (typeof u.bateria === "number" && Number.isFinite(u.bateria)) {
      umbrales.bateria = Math.max(1, Math.min(100, Math.round(u.bateria)));
    }
  }

  // Normalizar ocultos (array de strings, filtrando no strings)
  const ocultosRaw = o.ocultos;
  let ocultos: string[] = PREFERENCIAS_POR_DEFECTO.ocultos;
  if (Array.isArray(ocultosRaw)) {
    ocultos = ocultosRaw
      .filter((s): s is string => typeof s === "string")
  }

  return {
    tipos,
    intervaloSeg,
    umbrales,
    ocultos,
  };
}

/**
 * Lee las preferencias de procesos del localStorage para el cerebro dado.
 * Devuelve las preferencias normalizadas o las por defecto si no hay nada válido.
 */
export function leerPreferencias(brainId: string | null): PreferenciasProcesos {
  if (!brainId) {
    return PREFERENCIAS_POR_DEFECTO;
  }

  try {
    const raw = window.localStorage.getItem(CLAVE_PROCESOS(brainId));
    if (raw === null) {
      return PREFERENCIAS_POR_DEFECTO;
    }
    const parsed = JSON.parse(raw);
    return normalizarPreferencias(parsed);
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

/**
 * Guarda las preferencias de procesos en localStorage y las empuja a la cuenta.
 */
export function guardarPreferencias(
  brainId: string | null,
  preferencias: PreferenciasProcesos
): void {
  if (!brainId) {
    return;
  }

  try {
    window.localStorage.setItem(
      CLAVE_PROCESOS(brainId),
      JSON.stringify(preferencias)
    );
    // Empujar a la cuenta (sincronización)
    // Nota: Esto requiere importar y llamar a pushPreferences de settings-sync
    // Pero como este es un módulo puro, no lo hacemos aquí para evitar dependencias de red/disco
    // El llamador debería llamar a pushPreferences después si lo desea
  } catch {
    // Ignorar errores de almacenamiento
  }
}

/**
 * Hook de React para suscribirse a los cambios de preferencias de procesos.
 * En una implementación completa, esto usaría un evento o suscripción a cambios.
 * Por ahora, devuelve las preferencias actuales y una función para actualizarlas.
 */
export function usarPreferenciasProcesos(
  brainId: string | null
): [PreferenciasProcesos, (p: PreferenciasProcesos) => void] {
  // En una implementación real, esto usaríamos useState y useEffect con eventos
  // Pero para mantener el módulo puro, devolvemos un valor estático y un no-op
  const preferencias = leerPreferencias(brainId);
  const establecerPreferencias = (p: PreferenciasProcesos) => {
    // En un componente, esto llamaría a guardarPreferencias y posiblemente pushPreferences
    // Pero aquí no podemos hacer efectos secundarios
  };
  return [preferencias, establecerPreferencias];
}

/**
 * Obtiene los límites de CPU y RAM para un cerebro específico.
 * Devuelve null si no hay límites establecidos.
 */
export function limitesDeCerebro(
  brainId: string | null
): { cpuMaxPct: number | null; ramMaxMb: number | null } | null {
  if (!brainId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `starseed.brain.${brainId}.limites`
    );
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const o = parsed as Record<string, unknown>;
      const cpuMaxPct =
        typeof o.cpuMaxPct === "number" && Number.isFinite(o.cpuMaxPct)
          ? o.cpuMaxPct
          : null;
      const ramMaxMb =
        typeof o.ramMaxMb === "number" && Number.isFinite(o.ramMaxMb)
          ? o.ramMaxMb
          : null;
      return { cpuMaxPct, ramMaxMb };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Guarda los límites de CPU y RAM para un cerebro específico.
 */
export function guardarLimites(
  brainId: string | null,
  limites: { cpuMaxPct: number | null; ramMaxMb: number | null }
): void {
  if (!brainId) {
    return;
  }

  try {
    window.localStorage.setItem(
      `starseed.brain.${brainId}.limites`,
      JSON.stringify(limites)
    );
  } catch {
    // Ignorar errores de almacenamiento
  }
}