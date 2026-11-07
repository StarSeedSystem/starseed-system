import { describe, expect, it } from "vitest";

/*
 * Transmisión de datos en vivo con una neurona (NEU1107A): protocolo (abrir · trozo · cerrar ·
 * acuse), reductor del estado con huecos y duplicados, troceo y el ritmo de los acuses. Puro.
 */

import {
    aBase64,
    aplicarAcuse,
    aplicarTrozo,
    apuntarEnvio,
    cerrarEstadoFlujo,
    deBase64,
    flujoEnSilencio,
    juntarBinario,
    leerMensajeFlujo,
    MAX_REGISTROS_FLUJO,
    MAX_TROZO_FLUJO,
    nuevoEstadoFlujo,
    resumenFlujo,
    tocaAcuse,
    trocearBinario,
    trocearTexto,
    type MsgFlujoTrozo,
} from "@/lib/mensajeria/neuronas/flujo-datos";

const trozo = (n: number, d = `t${n}`): MsgFlujoTrozo => ({ t: "fd.trozo", id: "f1", n, d });

describe("protocolo: lo que llega se valida", () => {
    it("acepta abrir, trozo, cerrar y acuse bien formados; limpia el nombre", () => {
        expect(leerMensajeFlujo({ t: "fd.abrir", id: "f1", nombre: "Sensor\u0007", formato: "json", mime: "Application/JSON", de: { n: "tab" }, para: {}, at: 5 })).toEqual({
            t: "fd.abrir", id: "f1", nombre: "Sensor", formato: "json", mime: "application/json", de: { n: "tab", nom: undefined, u: undefined }, para: { n: undefined, u: undefined }, at: 5,
        });
        expect(leerMensajeFlujo({ t: "fd.trozo", id: "f1", n: 3, d: "x" })).toEqual({ t: "fd.trozo", id: "f1", n: 3, d: "x" });
        expect(leerMensajeFlujo({ t: "fd.cerrar", id: "f1", total: 4, motivo: "fin" })).toEqual({ t: "fd.cerrar", id: "f1", total: 4, motivo: "fin" });
        expect(leerMensajeFlujo({ t: "fd.acuse", id: "f1", recibidos: 9, perdidos: 1 })).toEqual({ t: "fd.acuse", id: "f1", recibidos: 9, perdidos: 1 });
    });

    it("rechaza lo mal formado (formato desconocido, n negativo, trozo enorme, sin id)", () => {
        expect(leerMensajeFlujo({ t: "fd.abrir", id: "f1", formato: "exe" })).toBeNull();
        expect(leerMensajeFlujo({ t: "fd.trozo", id: "f1", n: -1, d: "x" })).toBeNull();
        expect(leerMensajeFlujo({ t: "fd.trozo", id: "f1", n: 1, d: "x".repeat(MAX_TROZO_FLUJO * 2 + 1) })).toBeNull();
        expect(leerMensajeFlujo({ t: "fd.acuse", id: "f1", recibidos: 1.5 })).toBeNull();
        expect(leerMensajeFlujo({ t: "fd.trozo", n: 1, d: "x" })).toBeNull();
        expect(leerMensajeFlujo("hola")).toBeNull();
    });
});

describe("estado de un flujo recibido", () => {
    it("texto: se ve el último; los huecos cuentan como perdidos y un atrasado los recupera", () => {
        let e = nuevoEstadoFlujo({ id: "f1", nombre: "Notas", formato: "texto" }, "n:tab", "entra", 0);
        e = aplicarTrozo(e, trozo(0, "h"), 1);
        e = aplicarTrozo(e, trozo(2, "hol"), 2);
        expect(e).toMatchObject({ texto: "hol", trozos: 2, perdidos: 1, siguiente: 3 });
        e = aplicarTrozo(e, trozo(1, "ho"), 3);
        expect(e).toMatchObject({ texto: "hol", perdidos: 0 });
        // Un duplicado ya contado no cambia nada.
        expect(aplicarTrozo(e, trozo(1, "ho"), 4)).toBe(e);
    });

    it("json: guarda los últimos registros; binario: junta las partes y las devuelve tal cual", () => {
        let j = nuevoEstadoFlujo({ id: "f1", nombre: "Sensor", formato: "json" }, "n:tab", "entra", 0);
        for (let i = 0; i < MAX_REGISTROS_FLUJO + 5; i += 1) j = aplicarTrozo(j, trozo(i, JSON.stringify({ i })), i);
        expect(j.registros).toHaveLength(MAX_REGISTROS_FLUJO);
        expect(j.registros?.at(-1)).toEqual({ i: MAX_REGISTROS_FLUJO + 4 });

        const datos = new Uint8Array(20_000).map((_, i) => i % 251);
        const partes = trocearBinario(datos, 4000);
        expect(partes.every((p) => p.length <= 4000)).toBe(true);
        let b = nuevoEstadoFlujo({ id: "f1", nombre: "Bin", formato: "binario" }, "n:tab", "entra", 0);
        partes.forEach((p, i) => (b = aplicarTrozo(b, trozo(i, p), i)));
        b = cerrarEstadoFlujo(b, 99, partes.length);
        expect(b).toMatchObject({ abierto: false, perdidos: 0, bytes: 20_000 });
        expect(Array.from(juntarBinario(b.partes ?? []))).toEqual(Array.from(datos));
        expect(Array.from(deBase64(aBase64(new Uint8Array([0, 255, 7]))))).toEqual([0, 255, 7]);
    });

    it("al cerrar cuenta los trozos anunciados que no llegaron; cerrado no admite más", () => {
        let e = nuevoEstadoFlujo({ id: "f1", nombre: "x", formato: "texto" }, "n:tab", "entra", 0);
        e = aplicarTrozo(e, trozo(0), 1);
        e = cerrarEstadoFlujo(e, 2, 5, "fin");
        expect(e).toMatchObject({ abierto: false, perdidos: 4, totalAnunciado: 5, motivoCierre: "fin" });
        expect(aplicarTrozo(e, trozo(1), 3)).toBe(e);
        expect(resumenFlujo(e)).toBe("1 trozo · 2 car. · 4 perdidos");
    });

    it("silencio: lo dice pasado el umbral (no lo cierra)", () => {
        const e = nuevoEstadoFlujo({ id: "f1", nombre: "x", formato: "texto" }, "n:tab", "entra", 0);
        expect(flujoEnSilencio(e, 10_000)).toBe(false);
        expect(flujoEnSilencio(e, 31_000)).toBe(true);
    });
});

describe("emisor: envío y acuses", () => {
    it("cuenta lo que sale y apunta el acuse sin bajar nunca", () => {
        let e = nuevoEstadoFlujo({ id: "f1", nombre: "x", formato: "texto" }, "n:tab", "sale", 0);
        e = apuntarEnvio(e, "hola", 1);
        e = apuntarEnvio(e, "hola mundo", 2);
        expect(e).toMatchObject({ trozos: 2, texto: "hola mundo", bytes: 14 });
        e = aplicarAcuse(e, { t: "fd.acuse", id: "f1", recibidos: 2, perdidos: 0 }, 3);
        expect(e.recibidosOtro).toBe(2);
        e = aplicarAcuse(e, { t: "fd.acuse", id: "f1", recibidos: 1, perdidos: 0 }, 4);
        expect(e.recibidosOtro).toBe(2);
        // Un receptor no apunta acuses.
        const r = nuevoEstadoFlujo({ id: "f1", nombre: "x", formato: "texto" }, "n:tab", "entra", 0);
        expect(aplicarAcuse(r, { t: "fd.acuse", id: "f1", recibidos: 5, perdidos: 0 }, 1)).toBe(r);
    });

    it("el receptor acusa cada 10 trozos, cada 2 s o al cerrar (y nunca dos veces lo mismo)", () => {
        const ultimo = { trozos: 0, en: 0 };
        expect(tocaAcuse({ trozos: 3, abierto: true }, ultimo, 500)).toBe(false);
        expect(tocaAcuse({ trozos: 10, abierto: true }, ultimo, 500)).toBe(true);
        expect(tocaAcuse({ trozos: 3, abierto: true }, ultimo, 2500)).toBe(true);
        expect(tocaAcuse({ trozos: 3, abierto: false }, ultimo, 1)).toBe(true);
        expect(tocaAcuse({ trozos: 0, abierto: false }, ultimo, 9999)).toBe(false);
    });

    it("trocea texto sin partir un carácter de dos mitades", () => {
        const t = `${"a".repeat(4)}😀${"b".repeat(4)}`;
        const partes = trocearTexto(t, 5);
        expect(partes.join("")).toBe(t);
        expect(partes.every((p) => !/[\ud800-\udbff]$/.test(p))).toBe(true);
    });
});
