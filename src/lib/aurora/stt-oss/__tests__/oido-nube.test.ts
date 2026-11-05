import { afterEach, describe, expect, it, vi } from "vitest";

import { remuestrear, transcribirNube, wav16 } from "../oido-nube";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("oído en la nube · audio pequeño y legible", () => {
    it("remuestrea 48 kHz → 16 kHz (un tercio de muestras) y conserva el nivel", () => {
        const pcm = new Float32Array(48000).fill(0.5);
        const r = remuestrear(pcm, 48000, 16000);
        expect(r.length).toBe(16000);
        expect(r[100]).toBeCloseTo(0.5, 5);
        expect(remuestrear(pcm, 16000, 16000)).toBe(pcm);
    });

    it("el WAV es PCM de 16 bits con su cabecera: 30 s a 16 kHz ≈ 0,96 MB", () => {
        const buf = wav16(new Float32Array(16000 * 30), 16000);
        const v = new DataView(buf);
        expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
        expect(v.getUint16(20, true)).toBe(1); // PCM lineal
        expect(v.getUint16(34, true)).toBe(16);
        expect(buf.byteLength).toBe(44 + 16000 * 30 * 2);
        expect(buf.byteLength).toBeLessThan(4 * 1024 * 1024);
    });

    it("recorta el audio fuera de rango sin desbordar", () => {
        const v = new DataView(wav16(new Float32Array([2, -2]), 16000));
        expect(v.getInt16(44, true)).toBe(0x7fff);
        expect(v.getInt16(46, true)).toBe(-0x8000);
    });
});

describe("oído en la nube · transcripción", () => {
    it("manda el tramo a /api/voz/oir con el idioma y devuelve el texto", async () => {
        const f = vi.fn(async () => new Response(JSON.stringify({ texto: " hola Astraura " }), { status: 200 }));
        vi.stubGlobal("fetch", f);
        const texto = await transcribirNube(new Float32Array(4800), 48000, "es-MX");
        expect(texto).toBe("hola Astraura");
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("/api/voz/oir?idioma=es-MX");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/wav");
        expect((init.body as ArrayBuffer).byteLength).toBe(44 + 1600 * 2);
    });

    it("un fallo devuelve null y no lanza", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
        expect(await transcribirNube(new Float32Array(10), 16000)).toBeNull();
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
        expect(await transcribirNube(new Float32Array(10), 16000)).toBeNull();
    });
});
