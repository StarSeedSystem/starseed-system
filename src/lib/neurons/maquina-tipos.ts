/*
 * maquina-tipos — normalización del nombre de máquina para la huella (puro, cliente y servidor).
 * El servidor local (`/api/dispositivo/maquina`) y la app nativa (`device_info`) deben llegar a
 * la MISMA cadena: minúsculas, sin `.local`/`.lan` final y sin espacios.
 */
export function normalizarNombreMaquina(nombre: string | null | undefined): string {
  return String(nombre ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.(local|lan|home|localdomain)$/, "")
    .replace(/\s+/g, "-");
}

/**
 * (NEU1108A) Nombres que el sistema da cuando no sabe el suyo: Android dice «localhost» en TODOS los
 * aparatos (también al servidor local de la APK). No identifican la máquina: no dan huella.
 */
const NOMBRES_GENERICOS = new Set(["localhost", "unknown", "android", "(none)", "none"]);

/** El nombre normalizado si identifica la máquina; si no (vacío o genérico), "". Pura. */
export function nombreMaquinaUtil(nombre: string | null | undefined): string {
  const n = normalizarNombreMaquina(nombre);
  return n && !NOMBRES_GENERICOS.has(n) ? n : "";
}
