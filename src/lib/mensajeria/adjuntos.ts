/**
 * adjuntos — reescribe la URL pública de storage de un adjunto cuando apunta a un
 * proyecto de Supabase DISTINTO al vigente (tras una migración de proyecto, el
 * mismo caso que resuelve `duplicadoVivo` en `@/lib/files/os-files.ts`). El resto de
 * URLs (mismo proyecto, otro host cualquiera, dataURL…) se deja intacto. Puro: no
 * hace red, solo reescribe el string.
 */

const PATRON_STORAGE_PUBLICO = /^https:\/\/([a-z0-9-]+)\.supabase\.co(\/storage\/v1\/object\/public\/.*)$/i;

function hostVigente(): string | null {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) return null;
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * Devuelve `url` con el host reescrito al proyecto de Supabase VIGENTE si `url` es
 * una URL pública de storage de OTRO proyecto `*.supabase.co`. `undefined` si `url`
 * está vacía o ausente; sin cambios si no hace falta reescribir nada.
 */
export function urlVigenteAdjunto(url?: string | null): string | undefined {
    if (!url) return undefined;
    const m = url.match(PATRON_STORAGE_PUBLICO);
    if (!m) return url;
    const vigente = hostVigente();
    if (!vigente) return url; // sin config: no hay a qué reescribir
    const hostDeLaUrl = `${m[1]}.supabase.co`;
    if (hostDeLaUrl === vigente) return url; // ya es del proyecto actual
    return `https://${vigente}${m[2]}`;
}
