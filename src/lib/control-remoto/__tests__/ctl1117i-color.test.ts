// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chats-genesis/firma-aparato", () => ({
    firmarOrdenControl: async (construir: (b: { cuenta: string; de: string; seq: number }) => Record<string, unknown>) => {
        const carga = construir({ cuenta: "c@x.es", de: "huella", seq: 1 });
        return { v: 1, carga: Buffer.from(JSON.stringify(carga)).toString("base64url"), firma: "f", spki: "s" };
    },
}));

import { firmarSobre } from "../canal";
import { NEURON_DEVICE_ID_KEY, NEURON_PREFS_KEY } from "@/lib/neurons/neurons";
import { colorPorDefecto } from "@/lib/neurons/color-publico";
import { colorPublicoDeNeurona, colorPublicoPropio, ponerColorPublico } from "@/lib/neurons/color-publico-ajuste";

function leerCarga(s: { carga: string }): { accion: { nombre: string; args: Record<string, unknown> } } {
    return JSON.parse(Buffer.from(s.carga, "base64url").toString("utf8"));
}

beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(NEURON_DEVICE_ID_KEY, "neurona-1");
});
afterEach(() => window.localStorage.clear());

describe("CTL1117I · el controlador firma su color público", () => {
    it("sin color guardado, abrir-sesion y presentarse llevan el color por defecto de su id DENTRO de lo firmado", async () => {
        const def = colorPorDefecto("neurona-1");
        expect(def).toBe("#3c9fdd");
        const a = leerCarga(await firmarSobre("c@x.es", "tableta", "abrir-sesion", {}, { nivel: "controlar" }, "n1"));
        expect(a.accion.args).toEqual({ color: def });
        const p = leerCarga(await firmarSobre("c@x.es", "tableta", "presentarse", { spki: "s", nombre: "Mac", neurona: "neurona-1" }, {}, "n2"));
        expect(p.accion.args).toEqual({ spki: "s", nombre: "Mac", neurona: "neurona-1", color: def });
    });
    it("con color elegido va ese; si se borra vuelve el de por defecto", async () => {
        expect(ponerColorPublico("neurona-1", "#E5484D")).toBe("#e5484d");
        expect(colorPublicoPropio()).toBe("#e5484d");
        expect(leerCarga(await firmarSobre("c@x.es", "t", "abrir-sesion", {}, {}, "n")).accion.args.color).toBe("#e5484d");
        ponerColorPublico("neurona-1", null);
        expect(colorPublicoPropio()).toBe("#3c9fdd");
    });
    it("un dato guardado que no vale se ignora (instalaciones existentes, datos viejos o rotos)", () => {
        window.localStorage.setItem(NEURON_PREFS_KEY, JSON.stringify({ settings: { "neurona-1": { colorPublico: "rojo" } } }));
        expect(colorPublicoPropio()).toBe("#3c9fdd");
        window.localStorage.setItem(NEURON_PREFS_KEY, "{roto");
        expect(colorPublicoPropio()).toBe("#3c9fdd");
    });
    it("las demás órdenes no llevan color y uno ya puesto no se pisa", async () => {
        expect(leerCarga(await firmarSobre("c@x.es", "t", "leer-estado", {}, {}, "n")).accion.args).toEqual({});
        expect(leerCarga(await firmarSobre("c@x.es", "t", "abrir-sesion", { color: "#112233" }, {}, "n")).accion.args).toEqual({ color: "#112233" });
    });
    it("un color escrito mal no se guarda", () => {
        expect(ponerColorPublico("neurona-1", "azul")).toBeNull();
        expect(ponerColorPublico("neurona-1", "#12")).toBeNull();
        expect(colorPublicoPropio()).toBe("#3c9fdd");
    });

    it("lo que anuncia otra neurona vale si es #rrggbb; si no (o es una web anterior sin color) se usa el suyo guardado o el de su id", () => {
        expect(colorPublicoDeNeurona("tableta", "#aabbcc")).toBe("#aabbcc");
        expect(colorPublicoDeNeurona("tableta", undefined)).toBe("#ddc23c");
        expect(colorPublicoDeNeurona("tableta", "#AABBCC")).toBe("#ddc23c");
        expect(colorPublicoDeNeurona("tableta", "<script>")).toBe("#ddc23c");
        ponerColorPublico("tableta", "#0091ff");
        expect(colorPublicoDeNeurona("tableta", null)).toBe("#0091ff");
    });
    it("el color se publica con la presencia de la neurona y un cambio se reenvía (en la firma del anuncio)", async () => {
        const { readFileSync } = await import("node:fs");
        const f = readFileSync("src/lib/neurons/presencia.ts", "utf8");
        expect(f).toMatch(/col\?: string/);
        expect(f).toMatch(/\.\.\.\(col \? \{ col \} : \{\}\)/);
        expect(f).toMatch(/\$\{a\.col \?\? ""\}/);
        expect(f).toMatch(/addEventListener\("starseed:neurons"/);
    });
    it("todas las rutas que abren sesión pasan por la firma de canal.ts: ninguna otra firma órdenes de control", async () => {
        const { readFileSync } = await import("node:fs");
        for (const ruta of ["pantalla-destino.ts", "registro-sesiones.ts", "sesion.ts"]) {
            expect(readFileSync(`src/lib/control-remoto/${ruta}`, "utf8"), ruta).not.toMatch(/firmarOrdenControl/);
        }
        expect(readFileSync("src/lib/banco-llamadas/app.ts", "utf8")).not.toMatch(/firmarOrdenControl/);
        expect(readFileSync("src/lib/control-remoto/canal.ts", "utf8").match(/firmarOrdenControl\(/g)?.length).toBe(1);
    });
});
