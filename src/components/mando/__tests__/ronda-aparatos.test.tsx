import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import type { RespuestaVivo } from "@/lib/mando/pruebas-vivas-tipos";
import { PanelPruebas } from "../panel-pruebas";

// RON1112C · la sección «Ronda de aparatos» del panel «Pruebas».
const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; metodo?: string; cuerpo?: Record<string, unknown> }[] = [];
afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const SHA = "a".repeat(40);
const iso = (ms: number) => new Date(ms).toISOString();
const director = (extra: Record<string, unknown> = {}) => ({ formato: 1, t: iso(Date.now()), cadaS: 60, pasada: 1, pausado: false, pausaMotivo: null, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [], ...extra });
function ronda(desdeHaceMin: number, hastaEnMin: number, silencio: Record<string, unknown> | null = {}, extra: Record<string, unknown> = {}) {
    const ahora = Date.now();
    return {
        medidoMs: ahora, cadaS: 60,
        ronda: { quien: "alex", motivo: "llamadas de prueba con la tableta", desdeMs: ahora - desdeHaceMin * 60_000, hastaMs: ahora + hastaEnMin * 60_000, renovaciones: 0, finMs: null, finPor: null, ...extra },
        silencio: silencio === null ? null : { medidoMs: ahora, tranquila: true, linea: "la Mac está tranquila: ningún trabajo pesado conocido y carga 2,1", carga1: 2.1, pesados: [], ...silencio },
    };
}
function vivo(r: Partial<RespuestaVivo> = {}): RespuestaVivo {
    return {
        versiones: [], resumen: "Sin versiones de prueba", web: null, avisos: [], generadoEn: iso(Date.now()),
        aprobarAqui: true, controlAqui: true, tipicos: {}, peticiones: [], director: director(), banco: null, cola: { sinPublicar: 0, origen: SHA, local: SHA },
        accesos: [], prereleaseLeido: true, enMarcha: null, ronda: null, ahoraServidor: Date.now(), ...r,
    } as unknown as RespuestaVivo;
}
function servir(r: RespuestaVivo) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        pedidos.push({ url: String(url), metodo: init?.method, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (init?.method === "POST") return new Response(JSON.stringify({ ok: true, id: "pet-1731371000-ab12", accion: "ronda-iniciar" }), { status: 200 });
        return new Response(JSON.stringify(r), { status: 200 });
    }) as typeof fetch;
}
const montar = () => render(<AppearanceProvider><PanelPruebas /></AppearanceProvider>);
const post = () => pedidos.find((p) => p.metodo === "POST");

describe("Ronda de aparatos en el panel Pruebas", () => {
    it("sin ronda: dice que no hay, pide un motivo y no escribe nada sin él", async () => {
        servir(vivo());
        montar();
        const f = await screen.findByTestId("ronda-formulario");
        expect(screen.getByTestId("ronda-chip")).toHaveTextContent("sin ronda");
        fireEvent.click(within(f).getByTestId("ronda-empezar"));
        expect(await screen.findByRole("alert")).toHaveTextContent(/para qué es la ronda/);
        expect(post()).toBeUndefined();
    });

    it("empezar escribe una petición con el motivo y los minutos elegidos, y enseña su estado", async () => {
        servir(vivo());
        montar();
        const f = await screen.findByTestId("ronda-formulario");
        fireEvent.change(within(f).getByLabelText(/Para qué es/), { target: { value: "  llamadas de prueba con la tableta  " } });
        fireEvent.change(within(f).getByLabelText("Dura"), { target: { value: "60" } });
        fireEvent.click(within(f).getByTestId("ronda-empezar"));
        await waitFor(() => expect(post()?.cuerpo).toEqual({ accion: "ronda-iniciar", nota: "llamadas de prueba con la tableta", minutos: 60 }));
        expect(post()?.url).toContain("/pruebas/control");
        expect(await screen.findByTestId("peticion-pet-1731371000-ab12")).toHaveTextContent(/el director aún no la ha leído/);
    });

    it("activa: quién, para qué, cuánto queda y si la Mac está tranquila; terminar es UNA pulsación", async () => {
        servir(vivo({ ronda: ronda(12, 18) as never }));
        montar();
        expect(await screen.findByTestId("ronda-chip")).toHaveTextContent("en vigor");
        expect(screen.getByTestId("ronda-queda")).toHaveTextContent(/quedan 1[78] min/);
        expect(screen.getByTestId("ronda-texto")).toHaveTextContent(/alex la pidió para «llamadas de prueba con la tableta»/);
        expect(screen.getByTestId("ronda-silencio")).toHaveTextContent(/Mac tranquila/);
        expect(screen.queryByTestId("ronda-formulario")).toBeNull();
        fireEvent.click(screen.getByTestId("ronda-terminar"));
        await waitFor(() => expect(post()?.cuerpo).toEqual({ accion: "ronda-terminar" }));
    });

    it("activa con un trabajo pesado corriendo: no afirma calma y dice qué espera", async () => {
        servir(vivo({ ronda: ronda(5, 25, { tranquila: false, linea: "espera a que termine las pruebas de TypeScript, unos 4 min", pesados: [{ que: "las pruebas de TypeScript", llevaS: 90, sueleS: 330, faltanS: 240 }] }) as never }));
        montar();
        const s = await screen.findByTestId("ronda-silencio");
        expect(s).toHaveTextContent(/Mac ocupada/);
        expect(s).toHaveTextContent(/Espera a que termine las pruebas de TypeScript, unos 4 min\./);
        expect(s).not.toHaveTextContent(/Mac tranquila/);
    });

    it("una medición vieja no se presenta como calma", async () => {
        const hace = Date.now() - 20 * 60_000;
        servir(vivo({ ronda: { ...ronda(25, 5), medidoMs: hace, silencio: { medidoMs: hace, tranquila: true, linea: "la Mac está tranquila", carga1: 1, pesados: [] } } as never }));
        montar();
        const s = await screen.findByTestId("ronda-silencio");
        expect(s).toHaveTextContent(/sin medir/);
        expect(s).toHaveTextContent(/no sé si está tranquila ahora/);
    });

    it("renovar reenvía el motivo y los minutos; en su tope de 90 min no se ofrece alargar", async () => {
        servir(vivo({ ronda: ronda(30, 30) as never }));
        montar();
        fireEvent.click(await screen.findByTestId("ronda-renovar"));
        await waitFor(() => expect(post()?.cuerpo).toMatchObject({ accion: "ronda-iniciar", nota: "llamadas de prueba con la tableta", minutos: 30 }));
        cleanup();
        pedidos.length = 0;
        servir(vivo({ ronda: ronda(60, 30) as never }));
        montar();
        expect(await screen.findByTestId("ronda-renovar")).toBeDisabled();
        expect(screen.getByText(/máximo de 90 min/)).toBeInTheDocument();
    });

    it("vencida (la bandera no manda, la hora sí): sin ronda", async () => {
        servir(vivo({ ronda: ronda(40, -10) as never }));
        montar();
        expect(await screen.findByTestId("ronda-chip")).toHaveTextContent("sin ronda");
        expect(screen.getByTestId("ronda-texto")).toHaveTextContent(/ya venció/);
    });

    it("archivo ilegible: lo dice y se trata como sin ronda", async () => {
        servir(vivo({ ronda: "ilegible" as never }));
        montar();
        expect(await screen.findByTestId("ronda-texto")).toHaveTextContent(/No pude leer el archivo de la ronda/);
        expect(screen.getByTestId("ronda-chip")).toHaveTextContent("sin ronda");
    });

    it("con el director en pausa se puede pedir; parado, no, y dice que la ronda caduca sola", async () => {
        servir(vivo({ director: director({ pausado: true, pausaMotivo: "mantenimiento" }) as never }));
        montar();
        expect(await screen.findByTestId("ronda-empezar")).toBeEnabled();
        cleanup();
        servir(vivo({ ronda: ronda(5, 25) as never, director: director({ t: "2026-01-01T00:00:00Z" }) as never }));
        montar();
        expect(await screen.findByTestId("ronda-terminar")).toBeDisabled();
        expect(screen.getByTestId("ronda-sin-director")).toHaveTextContent(/caduca sola/);
    });

    it("desde otra neurona se ve pero no se pide", async () => {
        servir(vivo({ controlAqui: false, aprobarAqui: false, ronda: ronda(5, 25) as never }));
        montar();
        expect(await screen.findByTestId("ronda-terminar")).toBeDisabled();
        expect(screen.getByTestId("ronda-sin-director")).toHaveTextContent(/solo se ve/);
    });
});
