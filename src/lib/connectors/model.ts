/*
 * Conectores · Modelo de datos
 * ---------------------------------------------------------------------------
 * Tipos del "Hub de Conectores / Integraciones" de StarSeed OS.
 *
 * FILOSOFÍA (alineada con CLAUDE.md · §3 Ciberdelia + §6 Invariantes):
 *  - Lo GRATIS / CÓDIGO ABIERTO / PROPIO funciona por DEFECTO, sin cuenta.
 *  - Conectar cuentas externas es SIEMPRE opcional, por usuario y contexto.
 *  - Los conectores propios/OSS/gratis nunca requieren credenciales para
 *    estar "disponibles"; los de clave/oauth se marcan honestamente como
 *    'needs-auth' hasta que el usuario los configure.
 *  - Astraura puede AUTO-SELECCIONAR el mejor conector por tarea/contexto
 *    (ver `ConnectorSelection` y `store.selectConnector`).
 *
 * Este módulo es solo TIPOS (sin efectos): seguro en servidor y cliente.
 */

/** Familia funcional del conector (para agrupar en el hub y seleccionar por tarea). */
export type ConnectorCategory =
  | "llm" // modelos de lenguaje / inferencia
  | "search" // buscadores / motores de búsqueda
  | "web" // rastreo / lectura de páginas (crawl, scrape, fetch)
  | "storage" // almacenamiento de objetos / archivos remotos
  | "calendar" // calendarios / agenda
  | "email" // correo
  | "chat" // mensajería / chat de equipo
  | "dev" // desarrollo / repos / CI
  | "social" // redes sociales
  | "memory" // memoria / conocimiento (Registro Acásico, notas)
  | "files" // archivos locales / del dispositivo
  | "custom"; // endpoint arbitrario definido por el usuario

/**
 * Naturaleza del conector respecto a soberanía y coste. El orden implícito de
 * preferencia de Astraura es: own → oss → free → paid (gratis-primero, propio-primero).
 */
export type ConnectorKind =
  | "own" // propio del usuario (local / auto-hospedado / dispositivo)
  | "oss" // software de código abierto (auto-hospedable)
  | "free" // servicio gratuito de terceros (con o sin clave)
  | "paid"; // servicio de pago (siempre opcional)

/** Cómo se autentica el conector. 'none' = no requiere credenciales. */
export type ConnectorAuthType =
  | "none" // funciona sin credenciales (propio/OSS/gratis abierto)
  | "apiKey" // requiere una clave que el usuario pega
  | "oauth" // requiere flujo OAuth (aquí solo abrimos su documentación)
  | "localEndpoint"; // requiere una URL de endpoint local/propio

/** Estado de disponibilidad del conector para el usuario actual. */
export type ConnectorStatus =
  | "available" // listo para usar sin configurar (o con default de StarSeed)
  | "connected" // configurado/activado por el usuario
  | "needs-auth"; // requiere que el usuario aporte clave / endpoint / OAuth

/**
 * Descriptor estático de un conector. Vive en el registro (`registry.ts`).
 * NO contiene secretos: solo metadatos + pistas de configuración.
 */
export interface Connector {
  /** Identificador estable (kebab-case). Clave de persistencia. */
  id: string;
  /** Nombre legible para la UI. */
  name: string;
  /** Familia funcional. */
  category: ConnectorCategory;
  /** Naturaleza (propio/oss/gratis/pago) para orden de preferencia. */
  kind: ConnectorKind;
  /** Cómo se autentica. */
  authType: ConnectorAuthType;
  /** Estado base del descriptor (el estado efectivo lo calcula el store). */
  status: ConnectorStatus;
  /** ¿Se puede usar sin coste? (los propios/OSS locales son true). */
  free: boolean;
  /** Descripción corta y honesta (qué hace, si es opcional). */
  description?: string;
  /** Repositorio (para OSS/propio auto-hospedable). */
  repo?: string;
  /** Documentación / página para conseguir clave o iniciar OAuth. */
  docsUrl?: string;
  /** Pista de qué debe rellenar el usuario (placeholder del campo). */
  configHint?: string;
  /** Icono lucide sugerido (nombre), para que la UI lo resuelva. Opcional. */
  icon?: string;
  /** Marca de recomendado por defecto (gratis · propio · código abierto). */
  recommended?: boolean;
}

/**
 * Configuración del usuario para un conector concreto. Se persiste en
 * localStorage y se espeja en la cuenta soberana (`user_settings.prefs.connectors`).
 * Solo el usuario ve/posee estos datos (RLS). Las claves viven en el navegador.
 */
export interface ConnectorConfig {
  /** id del conector (== Connector.id). */
  id: string;
  /** ¿El usuario lo ha activado explícitamente? */
  enabled: boolean;
  /** Clave/API key (si authType === 'apiKey'). Vive solo en el navegador. */
  apiKey?: string;
  /** Endpoint local/propio (si authType === 'localEndpoint' o 'custom'). */
  endpoint?: string;
  /** Marca de que el usuario completó un flujo OAuth externamente. */
  oauthConnected?: boolean;
  /** Notas/etiqueta libre opcional del usuario. */
  note?: string;
  /** Última actualización (ISO) para diagnóstico. */
  updatedAt?: string;
}

/** Mapa persistido: id de conector → su configuración de usuario. */
export type ConnectorConfigMap = Record<string, ConnectorConfig>;

/**
 * Resultado de `selectConnector`: el conector elegido por Astraura para una
 * categoría/tarea, con la razón (transparencia) y su config efectiva.
 */
export interface ConnectorSelection {
  /** Conector elegido (o null si no hay ninguno adecuado). */
  connector: Connector | null;
  /** Config de usuario asociada (si existe). */
  config?: ConnectorConfig;
  /** Estado efectivo en el momento de la selección. */
  status: ConnectorStatus;
  /** Motivo legible de por qué se eligió (gratis-primero / propio / configurado…). */
  reason: string;
}

/** Etiquetas legibles por categoría (para agrupar en el hub). */
export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  llm: "Modelos de IA",
  search: "Búsqueda",
  web: "Web (rastreo y lectura)",
  storage: "Almacenamiento",
  calendar: "Calendario",
  email: "Correo",
  chat: "Chat de equipo",
  dev: "Desarrollo",
  social: "Redes sociales",
  memory: "Memoria",
  files: "Archivos",
  custom: "Personalizado",
};

/** Etiquetas legibles por naturaleza. */
export const KIND_LABELS: Record<ConnectorKind, string> = {
  own: "Propio",
  oss: "Código abierto",
  free: "Gratis",
  paid: "De pago",
};

/** Etiquetas legibles por estado (para el badge de la tarjeta). */
export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  available: "Disponible",
  connected: "Conectado",
  "needs-auth": "Requiere conexión",
};
