/**
 * Cliente del OÍDO EN LA NUBE (`/api/voz/oir`) · Ola 1105 · VOZ · 2026-11-05.
 * ─────────────────────────────────────────────────────────────────────────────
 * En el móvil, la orbe mantiene UNA línea de micrófono abierta y corta la voz en tramos
 * (`escucha-fusionada.ts`); cada tramo se manda aquí ya convertido a WAV de 16 bits a 16 kHz
 * (30 s ≈ 1 MB en vez de ~6 MB en flotante a 48 kHz). Así no se reinicia el reconocedor del
 * navegador, que en Android pita cada vez que arranca.
 *
 * Se apaga con `localStorage["starseed.oido.nube"] = "0"` (entonces manda el oído del navegador).
 * Nunca lanza.
 */

export const CLAVE_APAGADO = "starseed.oido.nube";
const CACHE_MS = 10 * 60 * 1000;

let cache: { at: number; v: boolean } | null = null;
let enCurso: Promise<boolean> | null = null;

function apagado(): boolean {
    try {
        return typeof window !== "undefined" && window.localStorage.getItem(CLAVE_APAGADO) === "0";
    } catch {
        return false;
    }
}

/** ¿Hay oído en la nube? Lo último sabido, sin esperar (lo refresca en segundo plano). */
export function oidoNubeListoYa(): boolean {
    if (apagado()) return false;
    if (!cache || Date.now() - cache.at > CACHE_MS) void oidoNubeDisponible();
    return !!cache?.v;
}

/** ¿Hay oído en la nube? Consulta `/api/voz/oir` (caché 10 min). */
export async function oidoNubeDisponible(): Promise<boolean> {
    if (apagado() || typeof fetch === "undefined") return false;
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.v;
    if (enCurso) return enCurso;
    enCurso = (async () => {
        let v = false;
        try {
            const r = await fetch("/api/voz/oir", { cache: "no-store", signal: AbortSignal.timeout(6000) });
            const j = (await r.json()) as { disponible?: boolean };
            v = r.ok && !!j.disponible;
        } catch {
            v = false;
        }
        cache = { at: Date.now(), v };
        enCurso = null;
        return v;
    })();
    return enCurso;
}

/** Remuestrea a `destino` Hz promediando (suficiente para voz) — PURO. */
export function remuestrear(pcm: Float32Array, origen: number, destino = 16000): Float32Array {
    if (!pcm.length || origen <= 0 || origen === destino) return pcm;
    const razon = origen / destino;
    const largo = Math.max(1, Math.floor(pcm.length / razon));
    const fuera = new Float32Array(largo);
    for (let i = 0; i < largo; i++) {
        const a = Math.floor(i * razon);
        const b = Math.min(pcm.length, Math.max(a + 1, Math.floor((i + 1) * razon)));
        let s = 0;
        for (let j = a; j < b; j++) s += pcm[j];
        fuera[i] = s / (b - a);
    }
    return fuera;
}

/** WAV PCM de 16 bits mono — PURO. */
export function wav16(pcm: Float32Array, rate: number): ArrayBuffer {
    const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const txt = (p: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
    txt(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, "data"); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return v.buffer;
}

/** Transcribe un tramo por la nube. `null` si no hay oído o falla (se pierde ESE tramo). */
export async function transcribirNube(pcm: Float32Array, rate: number, idioma?: string): Promise<string | null> {
    try {
        const cuerpo = wav16(remuestrear(pcm, rate, 16000), 16000);
        const r = await fetch(`/api/voz/oir?idioma=${encodeURIComponent((idioma || "es").slice(0, 5))}`, {
            method: "POST",
            headers: { "Content-Type": "audio/wav" },
            body: cuerpo,
            cache: "no-store",
            signal: AbortSignal.timeout(25_000),
        });
        if (r.status === 503) cache = { at: Date.now(), v: false }; // sin motores: el navegador manda
        if (!r.ok) return null;
        const j = (await r.json()) as { texto?: string };
        return typeof j.texto === "string" ? j.texto.trim() : null;
    } catch {
        return null;
    }
}
