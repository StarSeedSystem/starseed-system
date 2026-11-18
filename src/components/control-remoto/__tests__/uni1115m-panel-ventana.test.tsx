import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { PantallaYEntradaEsteAparato } from "../banda-control";
import { abrirVentanaControl, cerrarVentanaControl, direccionPaginaControl, ventanasAbiertas } from "../anfitrion-control";
import { PALABRAS_FALTA, PALABRAS_MOTIVO, palabrasEstado, palabrasMotivo } from "@/lib/control-remoto/palabras";
import { AJUSTES_QUE_FALTAN, abrirAjusteNativo, aceptarControladorNativo, capacidadesNativas, controladoresAceptadosNativos } from "@/lib/control-remoto/nativo";
import type { CapacidadesNativas } from "@/lib/control-remoto/nativo";

afterEach(() => {
    cleanup();
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
    for (const a of [...ventanasAbiertas()]) cerrarVentanaControl(a.neurona);
});

const caps = (falta: string[], sinPreguntar = false): CapacidadesNativas => ({
    pantalla: { accesibilidad: false, proyeccion: false, sinPreguntar },
    entrada: { gestos: true, maxDedos: 10, teclas: [], volumen: true, brillo: false, texto: true },
    falta,
});

describe("UNI1115M · pantalla y entrada en el aparato controlado", () => {
    it("no sale fuera de la app nativa", () => {
        const { container } = render(<PantallaYEntradaEsteAparato caps={null} aceptados={null} pantallaEnUso={false} entradaEnUso={false} onAjuste={() => undefined} />);
        expect(container).toBeEmptyDOMElement();
    });
    it("un botón por cada cosa que falta (cada uno pide SU ajuste) y el interruptor aparte", async () => {
        const onAjuste = vi.fn();
        render(<PantallaYEntradaEsteAparato caps={caps(["servicio-accesibilidad", "ajustes-restringidos", "consentimiento-pantalla", "escribir-ajustes"])} aceptados={[]} pantallaEnUso={false} entradaEnUso={false} onAjuste={onAjuste} />);
        for (const f of ["servicio-accesibilidad", "ajustes-restringidos", "escribir-ajustes"]) {
            expect(within(screen.getByTestId(`falta-ajuste-${f}`)).getByText(new RegExp(PALABRAS_FALTA[f].slice(0, 20)))).toBeInTheDocument();
            await userEvent.click(within(screen.getByTestId(`falta-ajuste-${f}`)).getByRole("button"));
        }
        expect(screen.queryByTestId("falta-ajuste-consentimiento-pantalla")).toBeNull();
        const sw = screen.getByRole("switch", { name: /Ver la pantalla sin preguntar en cada sesión/ });
        expect(sw).toHaveAttribute("aria-checked", "false");
        await userEvent.click(sw);
        expect(onAjuste.mock.calls.map((c) => c[0])).toEqual(["servicio-accesibilidad", "ajustes-restringidos", "escribir-ajustes", "consentimiento-pantalla"]);
    });
    it("dice si la pantalla o la entrada se usan ahora y quién está aceptado", () => {
        const { rerender } = render(<PantallaYEntradaEsteAparato caps={caps([], true)} aceptados={null} pantallaEnUso={false} entradaEnUso={false} onAjuste={() => undefined} />);
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
        expect(screen.getByTestId("uso-pantalla-entrada")).toHaveTextContent("nadie ve la pantalla · nadie la toca");
        expect(screen.getByTestId("aceptados-entrada")).toHaveTextContent("Ninguna neurona está aceptada");
        rerender(<PantallaYEntradaEsteAparato caps={caps([], true)} aceptados={[{ huella: "ab12cd34", nombre: "Mac de Alex", codigo: "123-456" }]} pantallaEnUso entradaEnUso onAjuste={() => undefined} />);
        expect(screen.getByTestId("uso-pantalla-entrada")).toHaveTextContent("otra neurona está viendo la pantalla · otra neurona puede tocarla");
        expect(screen.getByTestId("aceptados-entrada")).toHaveTextContent("Mac de Alex (código 123-456)");
    });
});

describe("UNI1115M · palabras", () => {
    it("cada motivo de control_entrada y cada falta tiene su frase en español llano", () => {
        for (const m of ["firma", "no-autorizado", "sesion", "regla-g", "pausa-local", "limite", "sin-servicio", "sin-soporte"]) {
            expect(PALABRAS_MOTIVO[m], m).toMatch(/[a-záéíóú]{4,}/i);
            expect(palabrasMotivo(m)).toBe(PALABRAS_MOTIVO[m]);
        }
        for (const f of AJUSTES_QUE_FALTAN) expect(palabrasMotivo(f)).toBe(PALABRAS_FALTA[f]);
        expect(palabrasMotivo("algo-raro")).toBe("Motivo: algo-raro");
        expect(palabrasMotivo(undefined)).toBeUndefined();
    });
    it("cada estado de la ventana tiene frase", () => {
        for (const e of ["conectando", "en-vivo", "pausa-local", "sin-pantalla", "cerrada"] as const) expect(palabrasEstado(e, "Tableta")).toContain("Tableta");
    });
});

describe("UNI1115M · el anfitrión y la ruta de la pestaña propia", () => {
    beforeEach(() => undefined);
    it("abrir y cerrar son idempotentes y solo admiten ids con forma de id", () => {
        expect(abrirVentanaControl("no es un id!", "x")).toBe(false);
        expect(abrirVentanaControl("a1b2-c3", "Tableta")).toBe(true);
        expect(abrirVentanaControl("a1b2-c3", "Tableta")).toBe(true);
        expect(ventanasAbiertas()).toHaveLength(1);
        cerrarVentanaControl("a1b2-c3");
        expect(ventanasAbiertas()).toHaveLength(0);
    });
    it("la pestaña propia usa parámetros de consulta (la interfaz estática de las apps no tiene segmentos dinámicos)", () => {
        const u = direccionPaginaControl("a1b2-c3", "Mi tableta");
        expect(u).toBe("/control-remoto?neurona=a1b2-c3&nombre=Mi%20tableta");
        expect(u).not.toMatch(/\/control-remoto\/[^?]/);
    });
});

describe("UNI1115M · puente de pantalla y entrada con lo nativo", () => {
    const poner = (resp: Record<string, unknown>) => {
        const inv = vi.fn(async (c: string) => {
            if (!(c in resp)) throw new Error("no");
            return resp[c];
        });
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: inv } };
        return inv;
    };
    it("sin app nativa: nada", async () => {
        expect(await capacidadesNativas()).toBeNull();
        expect(await controladoresAceptadosNativos()).toBeNull();
        expect(await abrirAjusteNativo("servicio-accesibilidad")).toEqual({ ok: false, motivo: "sin-soporte" });
        expect((await aceptarControladorNativo("k", "c", "n")).motivo).toBe("sin-soporte");
    });
    it("lee control_capacidades en su forma y manda los argumentos con los nombres de la tabla", async () => {
        const inv = poner({
            control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: false, texto: true }, falta: ["escribir-ajustes"] },
            control_abrir_ajuste: { ok: true },
            control_entrada_aceptar: { ok: true, pendiente: true, codigo: "111-222" },
            control_entrada_aceptados: { ok: true, controladores: [{ huella: "abcdef012345", nombre: "Mac", codigo: "111-222" }] },
        });
        // CTL1118M: esta prueba es la forma que manda una tableta Android; en jsdom el agente dice «linux» y se añadiría la falta de WebRTC de Linux.
        Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 14)", configurable: true });
        expect(await capacidadesNativas()).toEqual({ pantalla: { accesibilidad: true, proyeccion: false, sinPreguntar: true }, entrada: { gestos: true, maxDedos: 10, teclas: ["atras"], volumen: true, brillo: false, texto: true }, falta: ["escribir-ajustes"] });
        expect(await abrirAjusteNativo("escribir-ajustes")).toEqual({ ok: true, motivo: undefined });
        expect(await aceptarControladorNativo("SPKI", "cuenta", "Mac")).toMatchObject({ ok: true, pendiente: true, codigo: "111-222" });
        expect((await controladoresAceptadosNativos())?.[0]).toEqual({ huella: "abcdef01", nombre: "Mac", codigo: "111-222" });
        expect(inv).toHaveBeenCalledWith("control_abrir_ajuste", { cual: "escribir-ajustes" });
        expect(inv).toHaveBeenCalledWith("control_entrada_aceptar", { spki: "SPKI", cuenta: "cuenta", nombre: "Mac" });
    });
    it("en escritorio (sin_soporte) las capacidades son null: el panel no enseña nada", async () => {
        poner({ control_capacidades: { ok: false, motivo: "sin-soporte" } });
        expect(await capacidadesNativas()).toBeNull();
        void act;
    });
});
