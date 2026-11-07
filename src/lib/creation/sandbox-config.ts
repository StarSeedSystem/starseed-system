// src/lib/creation/sandbox-config.ts
// Configuración del sandbox del iframe para bloques de código ejecutable.
// Hardened: sin allow-popups (previene phishing/redirección), sin allow-same-origin (origen opaco).

/** Atributo sandbox endurecido para el iframe de vista previa. */
export function getSandboxAttributes(): string {
    return "allow-scripts allow-modals";
}

/**
 * Capacidades concedidas y denegadas en el sandbox del iframe.
 * Documentación para auditoría de seguridad (hallazgo SA102440).
 */
export const SANDBOX_CAPABILITIES = [
    "allow-scripts: permite ejecutar JavaScript en el iframe",
    "allow-modals: permite alert(), confirm(), prompt()",
    "allow-popups: DENEGADO — previene phishing y redirecciones no deseadas",
    "allow-same-origin: DENEGADO — origen opaco, sin acceso a cookies/localStorage/sesión",
    "allow-forms: DENEGADO — sin envío de formularios",
    "allow-top-navigation: DENEGADO — sin navegación del contexto superior",
    "allow-pointer-lock: DENEGADO — sin bloqueo de puntero",
    "allow-downloads: DENEGADO — sin descargas automáticas",
] as const;