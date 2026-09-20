import { describe, it, expect } from "vitest";
import {
    leerEstadoRenovacion,
    frescura,
    avisoVersionMayor,
    resumenNucleo,
} from "../nucleo-astraura";

const FIXTURE_JSON = JSON.stringify({
    paquete: { instalado: "3.0.2", pypi: "3.0.2", t: "2026-09-19T18:00:00.000Z" },
    pesos: { sha: "abc123", hf_modificado: "2026-09-19", archivo: "model.safetensors" },
    siguiente_mayor: { needle4: true, hf_modificado: "2026-09-20" },
    cambios: ["optimización de memoria"],
});

describe("nucleo-astraura", () => {
    it("leerEstadoRenovacion sanea el JSON del renovador correctamente", () => {
        const renovacion = leerEstadoRenovacion(FIXTURE_JSON);
        expect(renovacion).not.toBeNull();
        expect(renovacion?.paquete?.instalado).toBe("3.0.2");
        expect(renovacion?.siguiente_mayor?.needle4).toBe(true);

        expect(leerEstadoRenovacion("json-invalido")).toBeNull();
        expect(leerEstadoRenovacion(null)).toBeNull();
    });

    it("frescura calcula tiempos relativos en español", () => {
        const ahora = new Date("2026-09-19T20:00:00.000Z");
        expect(frescura("2026-09-19T18:00:00.000Z", ahora)).toBe("hace 2 h");
        expect(frescura("2026-09-19T19:50:00.000Z", ahora)).toBe("hace 10 min");
        expect(frescura(null, ahora)).toBe("fecha desconocida");
    });

    it("avisoVersionMayor detecta needle4 correctamente", () => {
        const renovacion = leerEstadoRenovacion(FIXTURE_JSON);
        expect(avisoVersionMayor(renovacion)).toBe("Hay una versión mayor nueva: la decide Alex");

        const sinNeedle4 = { siguiente_mayor: { needle4: false } };
        expect(avisoVersionMayor(sinNeedle4)).toBeNull();
        expect(avisoVersionMayor(null)).toBeNull();
    });

    it("resumenNucleo genera las 3 tarjetas de estado con su tono y detalle", () => {
        const renovacion = leerEstadoRenovacion(FIXTURE_JSON);
        const ahora = new Date("2026-09-19T20:00:00.000Z");

        const tarjetas = resumenNucleo({
            bitnet: { disponible: true, estado: "vivo", detalle: "BitNet b1.58 2B-4T · puerto 8790" },
            needle: {
                needle3: { disponible: true, paquete: "3.0.2", pesos_mb: 35, pesos_fecha: "19/09" },
                needle2: { disponible: true, esp32: true },
            },
            renovacion,
        });

        expect(tarjetas).toHaveLength(3);
        expect(tarjetas[0].nombre).toBe("BitNet 1.58");
        expect(tarjetas[0].estado).toBe("vivo");
        expect(tarjetas[0].tono).toContain("emerald");

        expect(tarjetas[1].nombre).toBe("Needle 3");
        expect(tarjetas[1].estado).toBe("vivo");
        expect(tarjetas[1].detalle).toContain("paquete 3.0.2");
        expect(tarjetas[1].detalle).toContain("pesos 35 MB del 19/09");

        expect(tarjetas[2].nombre).toBe("Needle 2 / ESP32");
        expect(tarjetas[2].estado).toBe("vivo");
    });
});
