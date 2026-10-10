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
