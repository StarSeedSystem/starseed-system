/**
 * Etiquetas de tiempo de la lista y de los silencios (2026-09-28), en español y respetando el
 * formato 24 h de los ajustes. Puras: reciben `ahora` para poder probarlas.
 */

function mismoDia(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function horaCorta(d: Date, formato24h: boolean): string {
    try {
        return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: !formato24h });
    } catch {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
}

/** Hoy → hora · ayer → «Ayer» · esta semana → día · antes → dd/mm/aa. */
export function etiquetaFechaLista(iso: string | null | undefined, formato24h = true, ahora: Date = new Date()): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    if (mismoDia(d, ahora)) return horaCorta(d, formato24h);
    const ayer = new Date(ahora);
    ayer.setDate(ahora.getDate() - 1);
    if (mismoDia(d, ayer)) return "Ayer";
    const dias = (ahora.getTime() - d.getTime()) / 86_400_000;
    try {
        if (dias < 7 && dias > 0) return d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
        return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
    } catch {
        return "";
    }
}

/**
 * Descripción de un silencio: null si no está silenciado (o ya caducó).
 * `hasta`: null · "siempre" · ISO.
 */
export function describirSilencio(hasta: string | null | undefined, formato24h = true, ahora: Date = new Date()): string | null {
    if (!hasta) return null;
    if (hasta === "siempre") return "Silenciado siempre";
    const d = new Date(hasta);
    if (Number.isNaN(d.getTime()) || d.getTime() <= ahora.getTime()) return null;
    if (mismoDia(d, ahora)) return `Silenciado hasta las ${horaCorta(d, formato24h)}`;
    try {
        const dia = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
        return `Silenciado hasta el ${dia}, ${horaCorta(d, formato24h)}`;
    } catch {
        return "Silenciado";
    }
}
