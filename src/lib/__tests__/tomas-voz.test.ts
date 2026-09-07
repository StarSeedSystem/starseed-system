import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NuevaTomaVoz } from "../voces/tomas-voz";
import {
    actualizarTomaVoz,
    audioABase64,
    borrarTomaVoz,
    crearTomaVoz,
    listarTomasVoz,
    listarTomasVozDe,
    versionDesdeToma,
} from "../voces/tomas-voz";

// Mock mínimo de localStorage + window: tomas-voz.ts guarda en `localStorage`
// (clave `starseed.voces.tomas-voz.v1`) y emite un `CustomEvent` al cambiar.
// vitest corre en entorno node (sin DOM), así que se inyecta un `window` falso
// con lo único que el módulo toca: `localStorage` y `dispatchEvent`.
class LocalStorageFalso {
    private datos = new Map<string, string>();
    getItem(k: string): string | null {
        return this.datos.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
        this.datos.set(k, v);
    }
    removeItem(k: string): void {
        this.datos.delete(k);
    }
    clear(): void {
        this.datos.clear();
    }
}

class CustomEventFalso {
    readonly type: string;
    constructor(type: string) {
        this.type = type;
    }
}

let almacen: LocalStorageFalso;

beforeEach(() => {
    almacen = new LocalStorageFalso();
    (globalThis as Record<string, unknown>).window = {
        localStorage: almacen,
        dispatchEvent: () => true,
    } as unknown as Window & typeof globalThis;
    (globalThis as Record<string, unknown>).CustomEvent = CustomEventFalso;
});

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).CustomEvent;
});

/** Base de toma para las pruebas; cada test matiza lo que necesita. */
function baseToma(timbreId = "neu-zenit", overrides: Partial<NuevaTomaVoz> = {}): NuevaTomaVoz {
    return {
        timbreId,
        nombreVoz: "Zenit",
        texto: "Hola, StarSeed",
        params: {
            instruct: "young adult, moderate pitch",
            speed: 1.06,
        },
        nivel: "alta",
        ...overrides,
    };
}

describe("crearTomaVoz", () => {
    it("crea una toma con id, fecha y audio nulo por defecto", () => {
        const t = crearTomaVoz(baseToma());
        expect(t.id).toBeTruthy();
        expect(t.creadaEn).toBeTruthy();
        expect(t.audioDataUrl).toBeNull();
        expect(t.sinAudio).toBe(true);
        expect(listarTomasVoz()).toHaveLength(1);
    });

    it("guarda el audio como base64 solo si cabe; si no, sinAudio", () => {
        const conAudio = crearTomaVoz(baseToma("neu-zenit", { audioDataUrl: "d3d3" }));
        expect(conAudio.sinAudio).toBe(false);

        const sinAudio = crearTomaVoz(baseToma("neu-zenit", { audioDataUrl: null, sinAudio: true }));
        expect(sinAudio.sinAudio).toBe(true);
    });

    it("audioABase64 devuelve null si el buffer pesa >= 1,5 MB", () => {
        const pesado = new Uint8Array(1_500_000).buffer;
        expect(audioABase64(pesado)).toBeNull();
        expect(audioABase64(new Uint8Array(0).buffer)).toBeNull();
        expect(audioABase64(new Uint8Array([1, 2, 3]).buffer)).toBe("AQID");
    });
});

describe("listarTomasVoz", () => {
    it("filtra por voz (timbreId) sin tocar el resto", () => {
        crearTomaVoz(baseToma("neu-zenit"));
        crearTomaVoz(baseToma("neu-horizon"));
        expect(listarTomasVoz()).toHaveLength(2);
        expect(listarTomasVozDe("neu-zenit")).toHaveLength(1);
        expect(listarTomasVozDe("neu-horizon")).toHaveLength(1);
        expect(listarTomasVozDe("otra")).toHaveLength(0);
    });
});

describe("orden: más recientes primero", () => {
    it("devuelve la toma más nueva al frente", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-09-06T10:00:00.000Z"));
            const vieja = crearTomaVoz(baseToma());
            vi.setSystemTime(new Date("2026-09-06T10:00:01.000Z"));
            const nueva = crearTomaVoz(baseToma());

            const lista = listarTomasVoz();
            expect(lista[0].id).toBe(nueva.id);
            expect(lista[1].id).toBe(vieja.id);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("límite de 40: se descartan primero las sin valoración", () => {
    it("descarta las más antiguas sin valoración para caber en 40", () => {
        vi.useFakeTimers();
        try {
            // Se crean 41 tomas en orden cronológico: la más vieja (la primera)
            // SIN valorar y las 40 siguientes VALORADAS. El tope es 40, así que
            // debe salir la más antigua sin valoración aunque haya más recientes.
            let valoradas = 0;
            let viejaId = "";
            for (let i = 0; i < 41; i++) {
                vi.setSystemTime(new Date(1_700_000_000_000 + i * 1000));
                const conValoracion = i !== 0;
                const t = crearTomaVoz(
                    baseToma("neu-zenit", conValoracion ? { valoracion: 5 } : {}),
                );
                if (i === 0) viejaId = t.id;
                if (conValoracion) valoradas += 1;
            }

            const lista = listarTomasVoz();
            expect(lista).toHaveLength(40);
            expect(lista.some((t) => t.id === viejaId)).toBe(false);
            expect(valoradas).toBe(40);
            // Todas las que quedan están valoradas (la única sin valorar se fue).
            expect(lista.every((t) => t.valoracion !== undefined)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("una toma valorada sobrevive a la antigüedad", () => {
        vi.useFakeTimers();
        try {
            // 41 tomas: la MÁS ANTIGUA está valorada, las demás no. Al llegar
            // al tope no debe perderse por antigüedad: se descarta la sin
            // valorar más antigua y la apreciada queda dentro de las 40.
            let antiguaId = "";
            let sinValorarId = "";
            for (let i = 0; i < 41; i++) {
                vi.setSystemTime(new Date(1_700_000_000_000 + i * 1000));
                const t = crearTomaVoz(
                    baseToma("neu-zenit", i === 0 ? { valoracion: 5 } : {}),
                );
                if (i === 0) antiguaId = t.id;
                if (i === 1) sinValorarId = t.id;
            }

            const lista = listarTomasVoz();
            expect(lista).toHaveLength(40);
            // La valorada antigua se conserva; la sin valorar más antigua se va.
            expect(lista.some((t) => t.id === antiguaId)).toBe(true);
            expect(lista.some((t) => t.id === sinValorarId)).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("actualizarTomaVoz y borrarTomaVoz", () => {
    it("actualiza valoración y notas sin crear duplicados", () => {
        const t = crearTomaVoz(baseToma());
        actualizarTomaVoz(t.id, { valoracion: 4, notas: "muy nítida" });
        const [actualizada] = listarTomasVoz();
        expect(actualizada.valoracion).toBe(4);
        expect(actualizada.notas).toBe("muy nítida");
        expect(listarTomasVoz()).toHaveLength(1);
    });

    it("borra una toma", () => {
        const t = crearTomaVoz(baseToma());
        borrarTomaVoz(t.id);
        expect(listarTomasVoz()).toHaveLength(0);
    });
});

describe("versionDesdeToma", () => {
    it("conserva los parámetros reproducibles de la toma", () => {
        const toma = crearTomaVoz(
            baseToma("neu-zenit", {
                params: {
                    instruct: "grave, pausado",
                    speed: 0.9,
                    seed: 42,
                    pitch: 0.9,
                    emocion: "serena",
                    intensidad: 0.7,
                    efectos: { eq: "cálida", reverb: 0.3, compresor: true, deesser: true },
                },
                notas: "prueba de conservación",
                valoracion: 4,
            }),
        );

        const v = versionDesdeToma(toma);
        expect(v.timbreBase).toBe(toma.timbreId);
        expect(v.params.speed).toBe(0.9);
        expect(v.params.instruct).toBe("grave, pausado");
        expect(v.params.seed).toBe(42);
        expect(v.params.pitch).toBe(0.9);
        expect(v.params.emocionBase).toBe("serena");
        expect(v.params.intensidad).toBe(0.7);
        expect(v.params.efectos).toEqual({ eq: "cálida", reverb: 0.3, compresor: true, deesser: true });
        expect(v.notas).toBe("prueba de conservación");
        expect(v.valoracion).toBe(4);
    });

    it("no arrastra parámetros que la toma no tiene", () => {
        const toma = crearTomaVoz(baseToma("neu-zenit"));
        const v = versionDesdeToma(toma);
        expect(v.params.seed).toBeUndefined();
        expect(v.params.pitch).toBeUndefined();
        expect(v.params.emocionBase).toBeUndefined();
        expect(v.params.efectos).toBeUndefined();
    });
});