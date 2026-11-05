import { describe, expect, it } from "vitest";

import { resumenMemoria } from "../memoria-servidor";

const MB = 1024 * 1024;

/** Lecturas crudas de Node: techo de 100 MB y un montón usado de 60 MB. */
function lecturas(usadoMb = 60) {
    return {
        uso: {
            rss: 400 * MB,
            heapUsed: usadoMb * MB,
            heapTotal: 80 * MB,
            external: 10 * MB,
            arrayBuffers: 2 * MB,
        },
        montón: { heap_size_limit: 100 * MB },
        espacios: [
            { space_name: "code_space", space_used_size: 4 * MB },
            { space_name: "old_space", space_used_size: 40 * MB },
            { space_name: "large_object_space", space_used_size: 12 * MB },
        ],
        arranqueMs: 1_000_000,
        ahoraMs: 1_000_000 + 5 * 60_000,
    };
}

describe("resumenMemoria", () => {
    it("traduce las lecturas de Node a MB y saca el porcentaje del techo", () => {
        const r = resumenMemoria(lecturas());
        expect(r.rssMb).toBe(400);
        expect(r.heapUsedMb).toBe(60);
        expect(r.heapTotalMb).toBe(80);
        expect(r.externalMb).toBe(10);
        expect(r.arrayBuffersMb).toBe(2);
        expect(r.heapSizeLimitMb).toBe(100);
        expect(r.porcentajeTecho).toBe(60);
        expect(r.minutosArranque).toBe(5);
    });

    it("cambia de nivel en los tres tramos del techo", () => {
        expect(resumenMemoria(lecturas(69)).nivel).toBe("holgado");
        expect(resumenMemoria(lecturas(70)).nivel).toBe("justo");
        expect(resumenMemoria(lecturas(85)).nivel).toBe("justo");
        expect(resumenMemoria(lecturas(86)).nivel).toBe("al límite");
    });

    it("ordena los espacios del montón de mayor a menor", () => {
        const r = resumenMemoria(lecturas());
        expect(r.espacios.map((e) => e.nombre)).toEqual(["old_space", "large_object_space", "code_space"]);
        expect(r.espacios.map((e) => e.mb)).toEqual([40, 12, 4]);
    });

    it("sin datos no lanza y dice que no hay dato", () => {
        const r = resumenMemoria({});
        expect(r.nivel).toBe("sin dato");
        expect(r.porcentajeTecho).toBeNull();
        expect(r.espacios).toEqual([]);
        expect(r.rssMb).toBe(0);
        expect(r.minutosArranque).toBe(0);
    });

    it("con datos raros (NaN) no lanza y no devuelve NaN", () => {
        const r = resumenMemoria({
            uso: { rss: Number.NaN, heapUsed: Number.NaN, heapTotal: Number.NaN },
            montón: { heap_size_limit: Number.NaN },
            espacios: [{ space_name: "old_space", space_used_size: Number.NaN }],
            arranqueMs: Number.NaN,
            ahoraMs: Number.NaN,
        });
        expect(r.nivel).toBe("sin dato");
        expect(r.porcentajeTecho).toBeNull();
        expect(r.rssMb).toBe(0);
        expect(r.heapUsedMb).toBe(0);
        expect(r.espacios).toEqual([]);
        expect(r.minutosArranque).toBe(0);
    });
});
