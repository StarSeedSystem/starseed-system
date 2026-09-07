/**
 * Pruebas de las funciones puras de la salud de la neurona (Ola 258 · 2026-09-06).
 * Solo se testean las piezas sin red ni sistema (`parsearVmStat`, `parsearSwapusage`
 * y `avisosDe`); `medirNeurona` y las sondas dependen del hardware y no se
 * prueban en CI.
 */

import { describe, expect, it } from "vitest";
import { parsearVmStat, parsearSwapusage, avisosDe } from "../mando/neurona";
import type { SaludNeurona } from "../mando/neurona";

describe("parsearVmStat (Ola 258 · memoria)", () => {
    it("lee el tamaño de página y convierte páginas inactivas/compressor a MB", () => {
        const texto = [
            "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
            "Pages free: 100.",
            "Pages inactive: 4096.",
            "Pages active: 8192.",
            "Pages occupied by compressor: 2048.",
        ].join("\n");
        // 4096 páginas · 16384 B = 64 MB · 2048 · 16384 = 32 MB.
        expect(parsearVmStat(texto)).toEqual({ paginaBytes: 16384, inactivaMb: 64, comprimidaMb: 32 });
    });
    it("devuelve null cuando falta un campo o el texto no es vm_stat", () => {
        expect(parsearVmStat("sin datos")).toEqual({ paginaBytes: null, inactivaMb: null, comprimidaMb: null });
    });
});

describe("parsearSwapusage (Ola 258 · swap)", () => {
    it("convierte valores en M redondeando los decimales", () => {
        const texto = "total = 8192.00M  used = 3821.31M  free = 4370.69M  encrypted = 0.00M";
        expect(parsearSwapusage(texto)).toEqual({ usadoMb: 3821, totalMb: 8192 });
    });
    it("convierte valores en G a MB (1.50G → 1536)", () => {
        expect(parsearSwapusage("total = 16.00G  used = 1.50G")).toEqual({ usadoMb: 1536, totalMb: 16384 });
    });
    it("devuelve null cuando falta el campo", () => {
        expect(parsearSwapusage("sin datos")).toEqual({ usadoMb: null, totalMb: null });
    });
});

/** Construye una salud base sana para aislar cada aviso. */
function saludBase(): SaludNeurona {
    return {
        t: "2026-09-06T00:00:00.000Z",
        memoria: { libreMb: 4000, inactivaMb: 500, comprimidaMb: 200, totalMb: 8192, swapUsadoMb: 0, swapTotalMb: 8192, paginaBytes: 16384 },
        voz: { vivo: true, ready: true, despertando: false, memoriaLibreMb: 1000, oido: null, latenciaMs: 40 },
        bitnet: { puerto: 8790, estado: "vivo", latenciaMs: 5, crashes24h: 0, ultimoCrash: null },
        ollama: { vivo: false, modelos: [] },
        avisos: [],
        verificacion: null,
    };
}

describe("avisosDe (Ola 258 · los cinco casos)", () => {
    it("poca memoria cuando libre + inactiva < 800 MB", () => {
        const s = saludBase();
        s.memoria.libreMb = 400;
        s.memoria.inactivaMb = 100;
        expect(avisosDe(s)).toContain("Poca memoria: la voz y el oído tardarán");
    });
    it("swap alto cuando se usa más de 3000 MB", () => {
        const s = saludBase();
        s.memoria.swapUsadoMb = 3500;
        expect(avisosDe(s)).toContain("Swap alto (3500 MB)");
    });
    it("BitNet apagado o dormido cuando no responde", () => {
        const s = saludBase();
        s.bitnet.estado = "apagado";
        expect(avisosDe(s)).toContain("BitNet apagado o dormido: la primera respuesta tardará");
    });
    it("avisa de los crashes del llama-server en 24 h", () => {
        const s = saludBase();
        s.bitnet.crashes24h = 3;
        expect(avisosDe(s)).toContain("El llama-server BitNet se cayó 3 veces en 24 h");
    });
    it("avisa de los modelos cargados en Ollama con su memoria total", () => {
        const s = saludBase();
        s.ollama.vivo = true;
        s.ollama.modelos = [{ nombre: "qwen2.5:7b", tamanoMb: 4500, expira: null }];
        expect(avisosDe(s)).toContain("Ollama tiene 1 modelo(s) cargado(s) (4500 MB)");
    });
    it("no produce avisos cuando todo va bien", () => {
        expect(avisosDe(saludBase())).toEqual([]);
    });
});