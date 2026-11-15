import { describe, expect, it } from "vitest";
import { pasosQueFaltan } from "../pasos";
import type { EstadoApp } from "../actor";

const TAB = "aaaa0002-0000-4000-8000-000000000003";
const AHORA = 1_000_000;
const inf = (x: Partial<EstadoApp> = {}): EstadoApp => ({ v: 1, t: AHORA, llave: true, objetivo: TAB, codigo: "ABCD", sesion: { estado: "aceptada", motivo: null, t: AHORA }, armada: null, ...x });
const claves = (p: ReturnType<typeof pasosQueFaltan>) => p.filter((x) => !x.hecho).map((x) => x.clave);

describe("pasosQueFaltan (BAN1115D)", () => {
    it("sin tableta elegida solo pide elegirla", () => {
        expect(claves(pasosQueFaltan({ informe: null, destino: "", codigo: null }))).toEqual(["tableta"]);
    });
    it("sin informe no afirma nada: dice que está comprobando", () => {
        const p = pasosQueFaltan({ informe: null, destino: TAB, codigo: null });
        expect(p.at(-1)?.texto).toMatch(/Comprobando/);
    });
    it("el orden: primero la clave de este aparato y dónde crearla", () => {
        const p = pasosQueFaltan({ informe: inf({ llave: false, sesion: { estado: "rechazada", motivo: "x", t: 1 } }), destino: TAB, codigo: null });
        expect(claves(p)).toEqual(["llave"]);
        expect(p.at(-1)?.texto).toMatch(/Chats de Genesis/);
    });
    it("después, que la tableta aceptó, con el código para aceptarlo", () => {
        const p = pasosQueFaltan({ informe: inf({ sesion: { estado: "rechazada", motivo: "no-aceptada", t: 1 } }), destino: TAB, codigo: "WXYZ-12" });
        expect(claves(p)).toEqual(["aceptada"]);
        expect(p.at(-1)?.texto).toMatch(/WXYZ-12/);
    });
    it("al final, que el modo banco esté armado hacia ESA tableta y no vencido", () => {
        expect(claves(pasosQueFaltan({ informe: inf(), destino: TAB, codigo: null, ahora: AHORA }))).toEqual(["armada"]);
        const otra = "bbbb0002-0000-4000-8000-000000000003";
        expect(claves(pasosQueFaltan({ informe: inf({ armada: { con: otra, hasta: AHORA + 9, restantes: 3 } }), destino: TAB, codigo: null, ahora: AHORA }))).toEqual(["armada"]);
        expect(claves(pasosQueFaltan({ informe: inf({ armada: { con: TAB, hasta: AHORA - 1, restantes: 3 } }), destino: TAB, codigo: null, ahora: AHORA }))).toEqual(["armada"]);
        expect(claves(pasosQueFaltan({ informe: inf({ armada: { con: TAB, hasta: AHORA + 9, restantes: 3 } }), destino: TAB, codigo: null, ahora: AHORA }))).toEqual([]);
    });
    it("un informe de otra tableta no sirve para esta", () => {
        const p = pasosQueFaltan({ informe: inf({ objetivo: "bbbb0002-0000-4000-8000-000000000003" }), destino: TAB, codigo: null });
        expect(p.at(-1)?.texto).toMatch(/Comprobando/);
    });
});
