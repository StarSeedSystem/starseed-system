/**
 * Utilidades puras para clasificación y formateo de mensajes de error.
 * Sin dependencias de red, disco ni procesos: solo entrada → salida.
 */

export type ErrorSeverity = "error" | "warning" | "success" | "info";
export type ErrorContext = "network" | "validation" | "permission" | "server" | "unknown";

export interface ClassifiedError {
  severity: ErrorSeverity;
  context: ErrorContext;
  title: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

const NETWORK_ERROR_PATTERNS = [
  /network/i,
  /fetch/i,
  /connection/i,
  /timeout/i,
  /dns/i,
  /sin red/i,
  /no se pudo conectar/i,
  /offline/i,
];

const VALIDATION_ERROR_PATTERNS = [
  /valid/i,
  /inválid/i,
  /formato/i,
  /requerid/i,
  /escribe/i,
  /debe/i,
  /inválido/i,
];

const PERMISSION_ERROR_PATTERNS = [
  /permission/i,
  /permiso/i,
  /denied/i,
  /denegad/i,
  /unauthorized/i,
  /no autorizad/i,
  /forbidden/i,
  /prohibid/i,
];

const SERVER_ERROR_PATTERNS = [
  /server/i,
  /servidor/i,
  /500/i,
  /502/i,
  /503/i,
  /504/i,
  /indisponible/i,
  /no disponible/i,
  /internal/i,
];

function matchPatterns(message: string, patterns: RegExp[]): boolean {
  const lower = message.toLowerCase();
  return patterns.some((p) => p.test(lower));
}

export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error || "Error desconocido");
  const lower = message.toLowerCase();

  let context: ErrorContext = "unknown";
  let severity: ErrorSeverity = "error";
  let recoverable = true;
  let suggestedAction: string | undefined;

  if (matchPatterns(message, NETWORK_ERROR_PATTERNS)) {
    context = "network";
    severity = "error";
    suggestedAction = "Revisa tu conexión e inténtalo de nuevo";
  } else if (matchPatterns(message, VALIDATION_ERROR_PATTERNS)) {
    context = "validation";
    severity = "warning";
    recoverable = true;
    suggestedAction = "Corrige los datos e inténtalo de nuevo";
  } else if (matchPatterns(message, PERMISSION_ERROR_PATTERNS)) {
    context = "permission";
    severity = "error";
    suggestedAction = "Revisa los permisos en Ajustes";
  } else if (matchPatterns(message, SERVER_ERROR_PATTERNS)) {
    context = "server";
    severity = "error";
    suggestedAction = "El servicio está temporalmente no disponible, inténtalo más tarde";
  }

  const contextTitles: Record<ErrorContext, string> = {
    network: "Sin conexión",
    validation: "Dato inválido",
    permission: "Permiso denegado",
    server: "Servidor no disponible",
    unknown: "Error inesperado",
  };

  const severityTitles: Record<ErrorSeverity, string> = {
    error: "Error",
    warning: "Aviso",
    success: "Éxito",
    info: "Información",
  };

  return {
    severity,
    context,
    title: severityTitles[severity],
    message,
    recoverable,
    suggestedAction,
  };
}

export function formatErrorMessage(error: unknown, options?: { includeAction?: boolean }): string {
  const classified = classifyError(error);
  const parts = [classified.message];
  if (options?.includeAction && classified.suggestedAction) {
    parts.push(`→ ${classified.suggestedAction}`);
  }
  return parts.join(" ");
}

export function getSeverityColor(severity: ErrorSeverity): string {
  const colors: Record<ErrorSeverity, string> = {
    error: "trinity-crimson",
    warning: "trinity-amber",
    success: "trinity-emerald",
    info: "trinity-cyan",
  };
  return colors[severity];
}

export function getContextIcon(context: ErrorContext): string {
  const icons: Record<ErrorContext, string> = {
    network: "📡",
    validation: "✏️",
    permission: "🔒",
    server: "🖥️",
    unknown: "❓",
  };
  return icons[context];
}