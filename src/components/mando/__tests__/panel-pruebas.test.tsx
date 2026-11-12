import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import type { VersionPrueba } from "@/lib/mando/lanzamientos-pruebas-tipos";
import type { RespuestaVivo } from "@/lib/mando/pruebas-vivas-tipos";
import { PanelPruebas } from "../panel-pruebas";

const fetchOriginal = globalThis.fetch;
const pedidos: { url: string; metodo?: string; cuerpo?: Record<string, unknown> }[] = [];
afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
    pedidos.length = 0;
});

const SHA = "a".repeat(40);
const ahoraIso = () => new Date().toISOString();
const plataforma = (p: "macos" | "windows" | "linux" | "android", estado: string, extra: Record<string, unknown> = {}) => ({
    plataforma: p, titulo: p === "macos" ? "macOS" : p, estado, desde: new Date(Date.now() - 12 * 60_000).toISOString(), hasta: null, job: null, url: null, detalle: "", ...extra,
});
function version(n: number, plataformas: unknown[], extra: Partial<VersionPrueba> = {}): VersionPrueba {
    return {
        numero: n, version: `0.5.1-prueba.${n}`, etiqueta: `prueba.${n}`, sha: SHA, fecha: ahoraIso(), runUrl: null,
        plataformas, publicadaEnTodas: false, vigente: { escritorio: false, android: false }, contenido: null,
        comprobaciones: [], aprobacion: null, director: null, mainMovido: null, desconocido: [], ...extra,
    } as unknown as VersionPrueba;
}
function vivo(r: Partial<RespuestaVivo> = {}): RespuestaVivo {
    return {
        versiones: [], resumen: "Sin versiones de prueba", web: null, avisos: [], generadoEn: ahoraIso(),
        aprobarAqui: true, controlAqui: true, tipicos: {}, peticiones: [],
        director: { formato: 1, t: ahoraIso(), cadaS: 60, pasada: 1, pausado: false, pausaMotivo: null, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [] },
        banco: null, cola: { sinPublicar: 0, origen: SHA, local: SHA }, accesos: [], prereleaseLeido: true, enMarcha: null, ahoraServidor: Date.now(),
        ...r,
    } as unknown as RespuestaVivo;
}
function servir(r: RespuestaVivo) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        pedidos.push({ url: String(url), metodo: init?.method, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (init?.method === "POST") return new Response(JSON.stringify({ ok: true, id: "pet-1731371000-ab12", accion: "compilar" }), { status: 200 });
        return new Response(JSON.stringify(r), { status: 200 });
    }) as typeof fetch;
}
const montar = () => render(<AppearanceProvider><PanelPruebas /></AppearanceProvider>);

describe("PanelPruebas", () => {
    it("sin pruebas lo dice y no inventa", async () => {
        servir(vivo());
        montar();
        expect(await screen.findByTestId("sin-pruebas")).toHaveTextContent(/no ve ninguna versión de prueba/);
        expect(screen.getByTestId("cadena").children.length).toBe(8);
    });

    it("en marcha: pasos hechos de total, tiempo y «aún no se sabe» sin historia", async () => {
        const v = version(40, [
            plataforma("macos", "compilando", { pasos: { hechos: 6, total: 11, actual: "Compilar" } }),
            plataforma("windows", "en-cola"),
            plataforma("linux", "publicada"),
            plataforma("android", "en-cola"),
        ]);
        servir(vivo({ versiones: [v], resumen: "prueba.40 · compilando" }));
        montar();
        const mac = await screen.findByTestId("plataforma-macos");
        expect(within(mac).getByText(/Paso 7 de 11/)).toBeInTheDocument();
        expect(within(mac).getByText(/Compilar/)).toBeInTheDocument();
        expect(within(mac).getByTestId("progreso-macos")).toHaveTextContent(/aún no se sabe/i);
        expect(screen.getByTestId("tono-pruebas")).toHaveTextContent("atento");
    });

    it("fallo: job, paso y registro bajo petición; pedir arreglo con nota", async () => {
        const v = version(40, [
            plataforma("macos", "publicada"),
            plataforma("linux", "fallo", { job: "os · ubuntu-24.04", pasoFallido: "Compilar", runId: 11, jobId: 22, url: "https://github.com/x/y/runs/22" }),
        ]);
        servir(vivo({ versiones: [v] }));
        montar();
        const f = await screen.findByTestId("fallo-linux");
        expect(f).toHaveTextContent("os · ubuntu-24.04");
        expect(f).toHaveTextContent("Compilar");
        expect(screen.getByTestId("tono-pruebas")).toHaveTextContent("falla algo");
        expect(within(f).getByRole("button", { name: /últimas líneas/ })).toBeInTheDocument();
    });

    it("director parado: los botones están desactivados y dicen por qué", async () => {
        servir(vivo({ director: { formato: 1, t: "2026-01-01T00:00:00Z", cadaS: 60, pasada: 1, pausado: false, pausaMotivo: null, pidOk: true, enCurso: null, esperando: null, ultimas: [], peticiones: [], avisos: [] } as never }));
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        for (const b of within(g).getAllByRole("button")) expect(b).toBeDisabled();
        expect(screen.getByTestId("botones-sin-director")).toBeInTheDocument();
    });

    it("compilar pide confirmación y no escribe nada hasta confirmar", async () => {
        servir(vivo());
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        fireEvent.click(within(g).getByRole("button", { name: /Compilar/ }));
        const d = await screen.findByTestId("confirmacion-control");
        expect(pedidos.some((p) => p.metodo === "POST")).toBe(false);
        fireEvent.click(within(d).getByRole("button", { name: /Compilar con lo publicado/ }));
        await waitFor(() => expect(pedidos.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({ accion: "compilar" }));
        expect(pedidos.find((p) => p.metodo === "POST")?.url).toContain("/pruebas/control");
    });

    it("desde otra neurona se ve pero no se pide", async () => {
        servir(vivo({ controlAqui: false, aprobarAqui: false }));
        montar();
        expect(await screen.findByText(/solo funcionan desde Genesis en la Mac/)).toBeInTheDocument();
        const g = screen.getByRole("group", { name: /Acciones sobre las pruebas/ });
        for (const b of within(g).getAllByRole("button")) expect(b).toBeDisabled();
    });

    it("sin evidencia del banco lo dice, sin inventar aparatos", async () => {
        servir(vivo({ versiones: [version(40, [plataforma("macos", "publicada")], { publicadaEnTodas: true })] }));
        montar();
        expect(await screen.findByTestId("sin-banco")).toBeInTheDocument();
    });

    it("un error de lectura no deja la pantalla vacía", async () => {
        globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
        montar();
        expect(await screen.findByRole("alert")).toBeInTheDocument();
    });

    it("PRB1111X: con algo compilando, «Compilar» está desactivado y dice por qué; «Cancelar» sigue activo", async () => {
        const v = version(40, [plataforma("macos", "compilando"), plataforma("windows", "en-cola")]);
        servir(vivo({ versiones: [v] }));
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        expect(within(g).getByRole("button", { name: /Compilar prueba ahora/ })).toBeDisabled();
        expect(within(g).getByRole("button", { name: /^Cancelar$/ })).toBeEnabled();
        expect(within(g).getByText(/Ya hay una compilación en marcha/)).toBeInTheDocument();
    });

    it("PRB1111X: esperando a main se puede sustituir: «Compilar» sigue activo", async () => {
        const v = version(40, [plataforma("macos", "esperando-main"), plataforma("windows", "esperando-main")]);
        servir(vivo({ versiones: [v] }));
        montar();
        const g = await screen.findByRole("group", { name: /Acciones sobre las pruebas/ });
        expect(within(g).getByRole("button", { name: /Compilar prueba ahora/ })).toBeEnabled();
    });

    it("PRB1111X: «Abrir la app» sale con la app cerrada, pide confirmar y escribe app-abrir", async () => {
        const banco = { t: ahoraIso(), cadaS: 60, lineasLeidas: 10, sugerenciasNota: null, llamadas: [], sugerencias: [], aparatos: [{ id: "mac", nombre: "Esta Mac", esta: true, version: "0.5.1-prueba.39", versionDe: "app-instalada", appAbierta: false, ultimoArranque: null, errores: [], visto: ahoraIso() }] };
        servir(vivo({ banco: banco as never, versiones: [version(39, [plataforma("macos", "publicada")], { publicadaEnTodas: true })] }));
        montar();
        const caja = await screen.findByTestId("abrir-app");
        fireEvent.click(within(caja).getByRole("button", { name: "Abrir la app" }));
        expect(pedidos.some((p) => p.metodo === "POST")).toBe(false);
        fireEvent.click(within(caja).getByRole("button", { name: /Sí, abrir la app/ }));
        await waitFor(() => expect(pedidos.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ accion: "app-abrir" }));
    });

    it("PRB1111X: con la app abierta no se ofrece", async () => {
        const banco = { t: ahoraIso(), cadaS: 60, lineasLeidas: 10, sugerenciasNota: null, llamadas: [], sugerencias: [], aparatos: [{ id: "mac", nombre: "Esta Mac", esta: true, version: null, versionDe: null, appAbierta: true, ultimoArranque: null, errores: [], visto: null }] };
        servir(vivo({ banco: banco as never }));
        montar();
        await screen.findByTestId("aparato-mac");
        expect(screen.queryByTestId("abrir-app")).toBeNull();
    });

    describe("PRB1111Z · versión de la evidencia", () => {
        const aparatoMac = { id: "mac", nombre: "Esta Mac", esta: true, version: "0.5.1-prueba.39", versionDe: "app-instalada", appAbierta: true, ultimoArranque: null, errores: [], visto: ahoraIso(), versionDesde: "2026-11-12T01:49:00Z", versionDesdeFuente: "paquete-instalado" };
        const llamadaOtra = { id: "llamada-20261111T191944", desde: "2026-11-11T19:19:44Z", hasta: null, duracionS: 90, con: "maggaboard", terminada: true, medios: [], kbps: null, lados: [], versionRelacion: "otra", versionMac: "0.5.1-prueba.37" };
        const comps = [
            { id: "c19", texto: "Arranque limpio", aparato: "Mac", estado: "pendiente", nota: "", quien: "", t: null, senal: "arranque-limpio" },
            { id: "c7", texto: "El vídeo llega a 5 fps", aparato: "Mac y tablet", estado: "pendiente", nota: "", quien: "", t: null, senal: "video-fps-ble" },
        ];
        const caso = (extra: Record<string, unknown> = {}) => {
            const banco = { t: ahoraIso(), cadaS: 60, lineasLeidas: 1, sugerenciasNota: null, aparatos: [aparatoMac], llamadas: [llamadaOtra],
                sugerencias: [{ prueba: 39, comprobacion: "c19", senal: "arranque-limpio", veredicto: "bien", motivo: "arranque limpio", llamada: null }],
                sinEvidencia: [{ prueba: 39, comprobacion: "c7", senal: "video-fps-ble", razon: "La tablet no da señal desde 21:01Z.", produciria: "una llamada con la 39 en la Mac y la tablet" }], ...extra };
            servir(vivo({ banco: banco as never, versiones: [version(39, [plataforma("macos", "publicada")], { publicadaEnTodas: true, comprobaciones: comps as never })] }));
            montar();
        };

        it("la llamada de otra versión es historia, con su versión, y no cuenta como evidencia", async () => {
            caso();
            const h = await screen.findByTestId("historia-llamadas");
            expect(within(h).getByTestId("version-llamada-llamada-20261111T191944")).toHaveTextContent(/hecha con 0\.5\.1-prueba\.37/);
            expect(screen.getByTestId("sin-llamadas-esta")).toHaveTextContent(/Ninguna llamada hecha con esta versión/);
            expect(screen.queryByTestId("llamadas")).toBeNull();
        });

        it("una llamada de versión desconocida lo dice", async () => {
            caso({ llamadas: [{ ...llamadaOtra, id: "llamada-x", versionRelacion: "desconocida", versionMac: null }] });
            expect(await screen.findByTestId("version-llamada-llamada-x")).toHaveTextContent(/No se sabe con qué versión/);
        });

        it("bajo la comprobación sin evidencia: texto, razón y qué la produciría; no parece sugerencia ni fallo", async () => {
            caso();
            const c7 = await screen.findByTestId("sin-evidencia-c7");
            expect(c7).toHaveTextContent("sin evidencia aún con esta versión");
            expect(c7).toHaveTextContent(/La tablet no da señal desde 21:01Z/);
            expect(c7).toHaveTextContent(/Lo que la produciría: una llamada con la 39/);
            expect(screen.queryByTestId("sugerencia-c7")).toBeNull();
            expect(screen.queryByTestId("pedir-arreglo-c7")).toBeNull();
            expect(screen.getByTestId("sugerencia-c19")).toHaveTextContent(/bien/);
            expect(screen.queryByTestId("sin-evidencia-c19")).toBeNull();
        });

        it("la fila de la Mac dice desde cuándo corre su versión", async () => {
            caso();
            expect(await screen.findByTestId("desde-mac")).toHaveTextContent(/Con esta versión desde .*según el paquete instalado/);
        });

        it("un archivo sin los campos v1.3 se ve como antes", async () => {
            const { versionDesde, versionDesdeFuente, ...mac } = aparatoMac;
            const { versionRelacion, versionMac, ...ll } = llamadaOtra;
            caso({ aparatos: [mac], llamadas: [ll], sinEvidencia: undefined });
            expect(await screen.findByTestId("llamadas")).toBeInTheDocument();
            expect(screen.queryByTestId("historia-llamadas")).toBeNull();
            expect(screen.queryByTestId("desde-mac")).toBeNull();
            expect(screen.queryByTestId("sin-evidencia-c7")).toBeNull();
        });
    });
});
