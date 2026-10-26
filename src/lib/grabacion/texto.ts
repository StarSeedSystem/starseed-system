/**
 * Textos y formatos de la grabadora (puro): duración, tamaño, nombre de archivo y errores en claro.
 */

import type { Instantanea } from "./tipos";

const dos = (n: number) => String(n).padStart(2, "0");

/** 75 000 ms → «01:15»; 3 725 000 ms → «1:02:05». Nunca negativa ni NaN. */
export function formatearDuracion(ms: number): string {
  const seg = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

/** 1 536 000 → «1,5 MB» (coma decimal, como en el resto de la interfaz). */
export function formatearTamano(bytes: number): string {
  const b = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (b < 1024) return `${Math.round(b)} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = b / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  const texto = valor >= 100 ? String(Math.round(valor)) : valor.toFixed(1).replace(".", ",");
  return `${texto.replace(/,0$/, "")} ${unidades[i]}`;
}

/** «starseed-grabacion-2026-10-26-1530.webm» (hora local de quien graba). */
export function nombreArchivo(tipo: "video" | "imagen", fecha: Date, extension: string): string {
  const base = tipo === "video" ? "starseed-grabacion" : "starseed-captura";
  const f = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  const h = `${dos(fecha.getHours())}${dos(fecha.getMinutes())}`;
  return `${base}-${f}-${h}.${extension.replace(/^\./, "")}`;
}

export type QueSePedia = "pantalla" | "camara" | "microfono";

export interface FalloMedios {
  mensaje: string;
  /** La persona cerró el selector o negó el permiso: no es un fallo, es una decisión. */
  cancelado: boolean;
}

function nombreDe(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string") {
    return (err as { name: string }).name;
  }
  return "";
}

/** Traduce un fallo de getDisplayMedia/getUserMedia a una frase útil. */
export function explicarFalloMedios(err: unknown, que: QueSePedia): FalloMedios {
  const nombre = nombreDe(err);
  const objeto = que === "pantalla" ? "la pantalla" : que === "camara" ? "la cámara" : "el micrófono";
  switch (nombre) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return que === "pantalla"
        ? { mensaje: "No elegiste qué compartir, así que no se grabó nada. Pulsa Grabar para volver a intentarlo.", cancelado: true }
        : { mensaje: `El navegador no dio permiso para usar ${objeto}. Actívalo en el candado de la barra de direcciones.`, cancelado: false };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { mensaje: `No encontramos ${que === "camara" ? "ninguna cámara" : que === "microfono" ? "ningún micrófono" : "nada que compartir"} en este aparato.`, cancelado: false };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return { mensaje: `Otra aplicación está usando ${objeto}. Ciérrala y vuelve a probar.`, cancelado: false };
    case "TypeError":
    case "NoMediaDevices":
      return { mensaje: "Este navegador no permite capturar aquí: hace falta una conexión segura (https) y un navegador actual.", cancelado: false };
    default:
      return { mensaje: `No se pudo usar ${objeto}. Vuelve a probar en un momento.`, cancelado: false };
  }
}

/** Lo que se dice de la grabadora en una frase corta según su fase; null cuando está en reposo o con resultado. */
export function rotuloDeFase(s: Pick<Instantanea, "fase" | "cuenta">): string | null {
  switch (s.fase) {
    case "preparando":
      return "Eligiendo qué grabar…";
    case "cuenta-atras":
      return `Empieza en ${s.cuenta}`;
    case "grabando":
      return "Grabando";
    case "pausada":
      return "En pausa";
    case "procesando":
      return "Preparando el archivo…";
    default:
      return null;
  }
}
