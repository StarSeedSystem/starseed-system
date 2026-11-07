/**
 * GRP1107A · audio/vídeo por canal de datos (puro): segmentos troceados y reensamblados (uno a
 * medias se descarta entero), medida de lo enviado frente a lo confirmado, ritmo que baja al
 * saturarse y sube con cautela sin pasar del 80 % del tope medido, y descarte en vivo.
 */
import { describe, expect, it } from "vitest";
import {
    ajustarRitmo,
    aplicarTrozoMedios,
    armarTrozosSegmento,
    bitsGrabacion,
    bytesConfirmados,
    debeDescartarSegmento,
    elegirMime,
    ESCALONES_KBPS,
    leerTrozoMedios,
    MAX_EN_COLA_BYTES,
    medirEnlace,
    ritmoInicial,
    SEGMENTOS_VACIO,
    SUBIDAS_PARA_SUBIR,
    textoRitmo,
    type EstadoRitmo,
    type EstadoSegmentos,
} from "@/lib/mensajeria/neuronas/flujo-medios";
import { aplicarTrozo, deBase64, leerMensajeFlujo, nuevoEstadoFlujo, resumenFlujo } from "@/lib/mensajeria/neuronas/flujo-datos";

const bytes = (n: number, semilla = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + semilla) % 256);

function reensamblar(trozos: string[], inicio: EstadoSegmentos = SEGMENTOS_VACIO) {
    let e = inicio;
    const listos: Array<{ seg: number; partes: string[] }> = [];
    for (const d of trozos) {
        const t = leerTrozoMedios(d);
        if (!t) continue;
        const r = aplicarTrozoMedios(e, t);
        e = r.estado;
        listos.push(...r.listos);
    }
    return { e, listos };
}

const juntar = (partes: string[]) => {
    const t = partes.map(deBase64);
    const out = new Uint8Array(t.reduce((s, x) => s + x.length, 0));
    let o = 0;
    for (const x of t) {
        out.set(x, o);
        o += x.length;
    }
    return out;
};

describe("segmentos", () => {
    it("trocea un segmento en trozos que caben y lo reconstruye igual", () => {
        const datos = bytes(50_000);
        const trozos = armarTrozosSegmento(7, datos, 12_000);
        expect(trozos.length).toBe(6);
        expect(trozos.every((t) => t.length <= 12_000)).toBe(true);
        expect(trozos[0].startsWith("m1|7|0|6|")).toBe(true);
        const { e, listos } = reensamblar(trozos, { ...SEGMENTOS_VACIO, siguiente: 7 });
        expect(listos.map((l) => l.seg)).toEqual([7]);
        expect(juntar(listos[0].partes)).toEqual(datos);
        expect(e).toEqual({ pendientes: {}, siguiente: 8, entregados: 1, perdidos: 0 });
    });

    it("un segmento a medias se descarta entero cuando se completa el siguiente (y cuenta como perdido)", () => {
        const s0 = armarTrozosSegmento(0, bytes(30_000, 1), 12_000);
        const s1 = armarTrozosSegmento(1, bytes(30_000, 2), 12_000);
        const s2 = armarTrozosSegmento(2, bytes(100, 3), 12_000);
        const { e, listos } = reensamblar([...s0, s1[0], /* s1[1..] se pierden */ ...s2]);
        expect(listos.map((l) => l.seg)).toEqual([0, 2]);
        expect(e.perdidos).toBe(1);
        expect(e.pendientes).toEqual({});
        // Lo que llegue tarde de un segmento ya superado no cuenta.
        const tarde = aplicarTrozoMedios(e, leerTrozoMedios(s1[1]) as NonNullable<ReturnType<typeof leerTrozoMedios>>);
        expect(tarde.listos).toEqual([]);
        expect(tarde.estado).toBe(e);
    });

    it("duplicados no cuentan dos veces; trozos mal formados fuera", () => {
        const s0 = armarTrozosSegmento(0, bytes(30_000), 12_000);
        const { e } = reensamblar([s0[0], s0[0]]);
        expect(e.pendientes[0].recibidas).toBe(1);
        expect(leerTrozoMedios("m1|0|3|3|AAAA")).toBeNull();
        expect(leerTrozoMedios("m1|x|0|1|AAAA")).toBeNull();
        expect(leerTrozoMedios("m1|0|0|1|<script>")).toBeNull();
        expect(leerTrozoMedios("hola")).toBeNull();
    });
});

describe("medir y ajustar el ritmo", () => {
    it("bytesConfirmados y medirEnlace (necesita dos muestras y al menos 1 s)", () => {
        expect(bytesConfirmados([10, 20, 30], 2)).toBe(30);
        expect(bytesConfirmados([10], 5)).toBe(10);
        expect(medirEnlace([{ en: 0, enviados: 0, confirmados: 0 }], 0)).toBeNull();
        expect(medirEnlace([{ en: 0, enviados: 0, confirmados: 0 }, { en: 500, enviados: 1000, confirmados: 1000 }], 500)).toBeNull();
        expect(medirEnlace([{ en: 0, enviados: 0, confirmados: 0 }, { en: 2000, enviados: 100_000, confirmados: 60_000 }], 2000)).toEqual({ enviadoKbps: 400, confirmadoKbps: 240 });
    });

    it("saturado: el tope es lo que confirmó el otro y se baja a lo que cabe en su 80 %", () => {
        const r = ajustarRitmo({ ...ritmoInicial("video"), kbps: 800 }, { enviadoKbps: 1000, confirmadoKbps: 600 }, 0);
        // 600 kbps de enlace / (4/3) = 450 de grabación; el 80 % = 360 → escalón 300.
        expect(r).toMatchObject({ kbps: 300, topeKbps: 600, subidas: 0 });
        expect(textoRitmo(r)).toBe("≈ 300 kbps · tope medido 600 kbps");
    });

    it(`sin saturar: sube un escalón tras ${SUBIDAS_PARA_SUBIR} medidas, sin pasar del 80 % de un tope ya medido`, () => {
        let r = ritmoInicial("video");
        const bien = { enviadoKbps: 400, confirmadoKbps: 400 };
        r = ajustarRitmo(r, bien, 0);
        expect(r.kbps).toBe(300);
        expect(textoRitmo(r)).toBe("≈ 300 kbps · el enlace lleva ≥ 400 kbps (sin tope aún)");
        r = ajustarRitmo(r, bien, 0);
        expect(r.kbps).toBe(500);
        // Con un tope medido de 700 (→ 420 de grabación al 80 %), de 300 no sube a 500.
        let t: EstadoRitmo = { ...ritmoInicial("video"), topeKbps: 700 };
        t = ajustarRitmo(ajustarRitmo(t, bien, 0), bien, 0);
        expect(t.kbps).toBe(300);
        expect(t.motivo).toBe("dentro del tope medido");
        // …hasta que pasa el doble de medidas sin saturar: el tope se olvida (la red pudo mejorar).
        t = ajustarRitmo(ajustarRitmo(t, bien, 0), bien, 0);
        expect(t.topeKbps).toBeNull();
        expect(t.kbps).toBe(500);
    });

    it("si la cola del enlace crece, un escalón menos; sin medida, nada cambia y se dice", () => {
        expect(ajustarRitmo({ ...ritmoInicial("audio"), kbps: 64 }, null, MAX_EN_COLA_BYTES).kbps).toBe(32);
        expect(ajustarRitmo(ritmoInicial("audio"), null, 0)).toMatchObject({ kbps: 32, motivo: "sin medir todavía" });
        expect(textoRitmo(ritmoInicial("audio"))).toBe("≈ 32 kbps · sin medir");
    });

    it("nunca por debajo del escalón más bajo ni por encima del más alto", () => {
        const bajo = ajustarRitmo(ritmoInicial("video"), { enviadoKbps: 400, confirmadoKbps: 10 }, 0);
        expect(bajo.kbps).toBe(ESCALONES_KBPS.video[0]);
        let alto = { ...ritmoInicial("video"), kbps: 1200 };
        alto = ajustarRitmo(ajustarRitmo(alto, { enviadoKbps: 2000, confirmadoKbps: 2000 }, 0), { enviadoKbps: 2000, confirmadoKbps: 2000 }, 0);
        expect(alto.kbps).toBe(1200);
    });

    it("descartar en vivo; bits de grabación; formato que admite el navegador", () => {
        expect(debeDescartarSegmento(MAX_EN_COLA_BYTES - 10, 100)).toEqual({ descartar: true, motivo: "la cola del enlace está llena" });
        expect(debeDescartarSegmento(0, 100)).toEqual({ descartar: false });
        expect(debeDescartarSegmento(null, 0).descartar).toBe(true);
        expect(bitsGrabacion({ tipo: "audio", kbps: 32 })).toEqual({ audioBitsPerSecond: 32_000 });
        expect(bitsGrabacion({ tipo: "video", kbps: 300 })).toEqual({ audioBitsPerSecond: 32_000, videoBitsPerSecond: 268_000 });
        expect(elegirMime("audio", (m) => m === "audio/mp4")).toBe("audio/mp4");
        expect(elegirMime("video", () => false)).toBeNull();
    });
});

describe("formato «medios» del flujo genérico", () => {
    it("se acepta, cuenta bytes y no junta nada en memoria", () => {
        const abrir = leerMensajeFlujo({ t: "fd.abrir", id: "f1", nombre: "Vídeo en vivo", formato: "medios", mime: "video/webm;codecs=vp8,opus", de: {}, para: {}, at: 1 });
        expect(abrir && abrir.t === "fd.abrir" && abrir.formato).toBe("medios");
        const e0 = nuevoEstadoFlujo({ id: "f1", nombre: "Vídeo en vivo", formato: "medios" }, "n:x", "entra", 1);
        expect(e0.partes).toBeUndefined();
        const [d] = armarTrozosSegmento(0, bytes(300));
        const e1 = aplicarTrozo(e0, { t: "fd.trozo", id: "f1", n: 0, d }, 2);
        expect(e1.bytes).toBe(300);
        expect(e1.partes).toBeUndefined();
        expect(resumenFlujo(e1)).toBe("1 trozo · 300 B");
    });
});
