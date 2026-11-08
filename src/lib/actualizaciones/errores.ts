/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) Errores de la actualización, en español claro. Lógica PURA.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 * El 08/11 GitHub devolvió 504 en `releases/download/…` y la persona vio «Could not fetch a valid release
 * JSON from the remote» (o nada). Aquí se traduce lo que dicen Rust, Kotlin y `fetch` a un texto que se
 * entiende y a un código estable; siempre con la opción de reintentar.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type CodigoError = "github" | "sin-conexion" | "tiempo" | "firma" | "no-existe" | "sin-permiso" | "otro";

export interface ErrorActualizacion {
  codigo: CodigoError;
  /** Estado HTTP si el texto lo dice (504, 503…). */
  http: number | null;
  /** El texto para la persona. */
  texto: string;
  /** ¿Tiene sentido reintentar (ahora o cuando vuelva la red)? */
  reintentable: boolean;
  /** ¿Conviene esperar a que vuelva la red en vez de insistir? */
  esperarRed: boolean;
}

function textoDe(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && typeof (x as { message?: unknown }).message === "string") return (x as { message: string }).message;
  return "";
}

/** El estado HTTP de 5xx/429 que aparece en el texto («HTTP 504», «504 Gateway Timeout»). Pura. */
export function httpDeTexto(t: string): number | null {
  // Solo cuenta un número tras «HTTP», «status», «error» o un paréntesis («pesa 500 MB» no es un 500).
  const m = /(?:\bhttp\b|\bstatus\b|\berror\b)[^0-9]{0,40}\b([45]\d\d)\b|\(\s*([45]\d\d)\b/i.exec(t);
  return m ? Number(m[1] ?? m[2]) : null;
}

/** Traduce un error de cualquier capa a uno que se entiende. Pura; nunca lanza. */
export function describirError(crudo: unknown, opciones: { enLinea?: boolean } = {}): ErrorActualizacion {
  const t = textoDe(crudo).trim();
  const e = t.toLowerCase();
  const http = httpDeTexto(t);
  const enLinea = opciones.enLinea ?? true;

  if (/signature|firma/.test(e) && !/firmada? por|firma de la misma/.test(e)) {
    return { codigo: "firma", http, texto: "La firma de la versión nueva no es válida, así que no se instala. Reintenta más tarde.", reintentable: true, esperarRed: false };
  }
  if (!enLinea || /sin conexi[oó]n|offline|failed to fetch|networkerror|network error|dns|no hubo conexi[oó]n|connection (refused|reset|closed)|unreachable/.test(e)) {
    return { codigo: "sin-conexion", http, texto: "Sin conexión: lo intentaré cuando vuelva la red.", reintentable: true, esperarRed: true };
  }
  if (http === 404 || /not found|no existe|no est[aá] en el release/.test(e)) {
    return { codigo: "no-existe", http: 404, texto: "Esa versión aún no está publicada para este sistema. Lo intentaré de nuevo más tarde.", reintentable: true, esperarRed: false };
  }
  if (/not allowed|no est[aá] permitido|permission|permiso/.test(e) && !/github/.test(e)) {
    return { codigo: "sin-permiso", http, texto: "Esta app no tiene permiso para buscar actualizaciones. Instala la versión nueva desde la Librería.", reintentable: false, esperarRed: false };
  }
  if (/(timed out|timeout|tard[oó] demasiado|aborted)/.test(e) && (http === null || http < 500)) {
    return { codigo: "tiempo", http, texto: "GitHub tardó demasiado en responder. Reintenta en un momento.", reintentable: true, esperarRed: false };
  }
  if ((http !== null && (http >= 500 || http === 429)) || /could not fetch a valid release|bad gateway|gateway|github no respondi[oó]|error sending request|server error/.test(e)) {
    const n = http !== null ? ` (${http})` : "";
    return { codigo: "github", http, texto: `GitHub no respondió${n}. Reintenta en unos minutos; probé también por otra ruta.`, reintentable: true, esperarRed: false };
  }
  return { codigo: "otro", http, texto: t ? `No se pudo comprobar actualizaciones: ${t.slice(0, 200)}` : "No se pudo comprobar actualizaciones.", reintentable: true, esperarRed: false };
}

/**
 * El aviso MIENTRAS se reintenta («GitHub no respondió (504). Lo intento por otra ruta…»). Pura.
 * `siguiente`: la ruta que se prueba ahora.
 */
export function textoReintento(crudo: unknown, siguiente: "directa" | "api" | "espejo"): string {
  const d = describirError(crudo);
  const causa = d.codigo === "github" ? `GitHub no respondió${d.http ? ` (${d.http})` : ""}` : d.codigo === "tiempo" ? "GitHub tardó demasiado" : "No hubo conexión con GitHub";
  const donde = siguiente === "api" ? "por otra ruta (la API de GitHub)" : siguiente === "espejo" ? "desde otra neurona cercana" : "de nuevo por la ruta directa";
  return `${causa}. Lo intento ${donde}…`;
}
