/* ============================================================
   STARSEED · URL seguras (biblioteca)
   Helper compartido para validar enlaces de activos antes de
   abrirlos o guardarlos: solo http(s) y rutas internas del OS.
   Bloquea javascript:, data:, vbscript:, file: y evasiones con
   caracteres de control. Módulo puro: sin red ni disco.
   ============================================================ */

/** Caracteres de control que el parser de URL ignora (evasión clásica). */
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/**
 * ¿Es esta URL segura para abrir o guardar?
 * Acepta http/https absolutos y rutas internas que empiecen por "/".
 * Rechaza todo lo demás: javascript:, data:, vbscript:, file:,
 * protocolo-relativo ("//…"), anclas sueltas y cadenas con caracteres
 * de control (el truco de "jav\tascript:" se neutraliza aquí).
 */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const url = raw.trim();
  if (!url || CONTROL_RE.test(url)) return false;
  // Ruta interna del OS: válida salvo protocolo-relativo ("//evil.com").
  if (url.startsWith("/")) return !url.startsWith("//");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Devuelve la URL recortada si es segura, o undefined si no lo es. */
export function safeHttpUrl(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  return isSafeHttpUrl(raw) ? raw.trim() : undefined;
}
