// ════════════════════════════════════════════════════════════════
// Integraciones · Tipos — Conectores funcionales de herramientas OSS
// ----------------------------------------------------------------
// Contrato compartido entre el registro, los clientes, el runner y el
// adaptador de Aurora. La UI de configuración (otra superficie) importa
// estos tipos para pintar formularios y disparar acciones reales.
//
// • IntegrationConfig  → lo que el usuario configura (endpoint + clave…).
// • IntegrationAction  → una operación que la herramienta sabe hacer.
// • IntegrationDescriptor → metadatos de una herramienta del catálogo.
// • IntegrationResult  → resultado honesto y serializable de una llamada.
//
// Todo es defensivo: nada lanza, todo degrada con `{ ok:false, error }`.
// ════════════════════════════════════════════════════════════════

/** Lo que el usuario configura para una herramienta concreta. */
export interface IntegrationConfig {
  /** Si está habilitada (si es false → no se hace ninguna llamada). */
  enabled?: boolean;
  /** URL base del servicio self-host (p.ej. http://localhost:11235). */
  endpoint?: string;
  /** Clave/token opcional (Bearer / X-API-KEY según la herramienta). */
  apiKey?: string;
  /** Campos extra por herramienta (flowId, chatflowId, modelo, ruta…). */
  extra?: Record<string, string>;
}

/** Una operación concreta que una herramienta sabe ejecutar. */
export interface IntegrationAction {
  /** Identificador estable (p.ej. "crawl", "merge", "run-workflow"). */
  id: string;
  /** Etiqueta corta en español para la UI. */
  label: string;
  /** Descripción en español de qué hace la acción. */
  description: string;
}

/** Categoría funcional (espejo del subconjunto relevante de OssCategory). */
export type IntegrationCategory =
  | "data-ingest"
  | "app-platform"
  | "automation"
  | "backend"
  | "runtime"
  | "devops"
  | "memory";

/** Metadatos de una herramienta integrable del catálogo. */
export interface IntegrationDescriptor {
  /** Identificador de la integración (suele coincidir con `ossId`). */
  id: string;
  /** Id correspondiente en oss-library (cuando aplica). */
  ossId?: string;
  /** Etiqueta legible en español. */
  label: string;
  /** Categoría funcional. */
  category: IntegrationCategory;
  /** Capacidades en español (para describir/seleccionar). */
  capabilities: string[];
  /** Endpoint por defecto sugerido (self-host local típico). */
  defaultEndpoint?: string;
  /** Si normalmente requiere clave/token para funcionar. */
  needsKey?: boolean;
  /** Documentación oficial. */
  docsUrl?: string;
  /** Acciones que expone. */
  actions: IntegrationAction[];
}

/** Resultado honesto y serializable de ejecutar una acción. */
export interface IntegrationResult<T = any> {
  ok: boolean;
  /** Datos devueltos por la herramienta (forma libre y defensiva). */
  data?: T;
  /** Mensaje de error en español si `ok` es false. */
  error?: string;
}
