// src/lib/__tests__/post-entity-rid.test.ts
// -----------------------------------------------------------------------------
// Ids de gobernanza de la ENTIDAD ÚNICA (`posts`): `rid` genera el id de las
// sugerencias (interactions.suggestions) y de los reportes
// (interactions.reports). Deben salir de Web Crypto —NO de `Math.random`— para
// que no se falsifiquen adivinando y para que no colisionen.
//
// Función pura exportada: sin red, sin disco, sin Supabase.
// -----------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from "vitest";
import { fragmentoAleatorioSeguro, rid } from "@/lib/posts/post-entity";

/** Rellena el buffer con un patrón cíclico (para comprobar el reparto). */
function rellenarCon(patron: number[]) {
    return <T extends ArrayBufferView | null>(array: T): T => {
        if (!array) return array;
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let i = 0; i < bytes.length; i++) bytes[i] = patron[i % patron.length];
        return array;
    };
}

describe("rid · ids de gobernanza", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("mantiene el formato <prefijo>_<tiempo base36>_<aleatorio base36>", () => {
        expect(rid("sug")).toMatch(/^sug_[0-9a-z]+_[0-9a-z]{8}$/);
        expect(rid("rep")).toMatch(/^rep_[0-9a-z]+_[0-9a-z]{8}$/);
        expect(rid()).toMatch(/^id_[0-9a-z]+_[0-9a-z]{8}$/);
    });

    it("no usa Math.random: los ids no se falsifican adivinando", () => {
        const espia = vi.spyOn(Math, "random").mockReturnValue(0);
        rid("sug");
        rid("rep");
        fragmentoAleatorioSeguro(8);
        expect(espia).not.toHaveBeenCalled();
    });

    it("toma los bytes de crypto.getRandomValues", () => {
        const espia = vi
            .spyOn(globalThis.crypto, "getRandomValues")
            .mockImplementation(rellenarCon([0, 1, 2, 3, 4, 5, 6, 7]));
        expect(fragmentoAleatorioSeguro(8)).toBe("01234567");
        expect(espia).toHaveBeenCalled();
    });

    it("descarta los bytes sesgados (>= 252) para repartir en base36 sin sesgo", () => {
        // 252 % 36 = 0 (valores 0..251 se reparten 7 veces; 252..255 sobran).
        // Con descarte: 252 se ignora y 251 -> 'z' (251 % 36 = 35).
        vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(rellenarCon([252, 251, 250]));
        expect(fragmentoAleatorioSeguro(2)).toBe("zy");
    });

    it("el fragmento tiene la longitud pedida y solo caracteres base36", () => {
        for (const n of [1, 4, 8, 12]) {
            const fragmento = fragmentoAleatorioSeguro(n);
            expect(fragmento).toHaveLength(n);
            expect(fragmento).toMatch(/^[0-9a-z]+$/);
        }
    });

    it("no repite ids en miles de llamadas", () => {
        const vistos = new Set<string>();
        for (let i = 0; i < 5000; i++) vistos.add(rid("sug"));
        expect(vistos.size).toBe(5000);
    });

    it("sin Web Crypto degrada a un contador único (y tampoco usa Math.random)", () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
        Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
        try {
            const espia = vi.spyOn(Math, "random").mockReturnValue(0);
            const primero = rid("sug");
            const segundo = rid("sug");
            expect(primero).not.toBe(segundo);
            expect(espia).not.toHaveBeenCalled();
        } finally {
            if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
        }
    });
});
