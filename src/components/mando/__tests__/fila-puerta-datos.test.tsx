import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FilaPuertaDatos } from "../fila-puerta-datos";
import { CLAVE_CONFIG, CLAVE_CONTADORES, leerDatosPuerta } from "@/lib/datos/puerta-a1-tipos";

const fetchOriginal = globalThis.fetch;
let llamadas: { url: string; metodo: string }[] = [];

function datos(extra: Record<string, unknown> = {}) {
    return {
        version: 1,
        comprobado: new Date(Date.now() - 4 * 60_000).toISOString(),
        ok: true,
        servicio: "active",
        salud: { ok: true, version: "1.0.0", jwks: "ok", caddy: "ok", replica: { activa: true, sin_migracion: true, hoy: 0, pendientes: { eventos: 6, neuronas: 0, presencia: 0 } } },
        https: { ok: true, ms: 258 },
        hoy: { dia: "2026-10-10", servidas: 1520, a_supabase: 9, ahorradas: 1511, grupos: { neuronas: { servidas: 900, a_supabase: 0 }, bus: { servidas: 620, a_supabase: 0 }, jwks: { servidas: 0, a_supabase: 9 } } },
        presencia: { neuronas: 4, neuronas_vivas: 2, cuentas: 1, en_linea: 1 },
        fichas: ["astraura", "enjambre"],
        ...extra,
    };
}

beforeEach(() => {
    llamadas = [];
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        llamadas.push({ url: String(url), metodo: init?.method ?? "GET" });
        return new Response(JSON.stringify({ datos: leerDatosPuerta(JSON.stringify(datos())), mensaje: init?.method === "POST" ? "Puerta comprobada ahora." : undefined }));
    }) as typeof fetch;
});

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("Fila «Puerta de datos (A1)» en Consumo y créditos", () => {
    it("enseña salud, peticiones ahorradas medidas en la puerta, réplica y lo de esta neurona", async () => {
        localStorage.setItem(CLAVE_CONTADORES, JSON.stringify({ dia: new Date().toISOString().slice(0, 10), porPuerta: 42, porSupabase: 3, enCola: 0, rechazos: 0 }));
        render(<FilaPuertaDatos />);
        const fila = await screen.findByRole("article", { name: "Puerta de datos del A1" });
        expect(await within(fila).findByText("Sana · 258 ms")).toBeInTheDocument();
        expect(screen.getByTestId("puerta-ahorradas")).toHaveTextContent("1511");
        expect(within(fila).getByText(/neuronas 900/)).toBeInTheDocument();
        expect(within(fila).getByText(/esperando la migración/)).toBeInTheDocument();
        expect(screen.getByTestId("puerta-aparato")).toHaveTextContent("42 por la puerta · 3 por Supabase");
        expect(within(fila).getByText(/2 de 4 neuronas vivas/)).toBeInTheDocument();
        expect(within(fila).getByText(/comprobada hace 4 min/)).toBeInTheDocument();
    });

    it("«Comprobar ahora» mide por POST y el interruptor apaga la puerta en ESTA neurona", async () => {
        render(<FilaPuertaDatos />);
        const fila = await screen.findByRole("article", { name: "Puerta de datos del A1" });
        await within(fila).findByText("Sana · 258 ms");
        fireEvent.click(within(fila).getByRole("button", { name: /Comprobar ahora/ }));
        expect(await within(fila).findByText("Puerta comprobada ahora.")).toBeInTheDocument();
        expect(llamadas.some((l) => l.url === "/api/mando/puerta-datos" && l.metodo === "POST")).toBe(true);
        fireEvent.change(within(fila).getByRole("combobox", { name: /Usar la puerta de datos en esta neurona/ }), { target: { value: "apagada" } });
        expect(JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? "{}")).toEqual({ modo: "apagada" });
        expect(within(fila).getByText(/apagada aquí: todo va a Supabase/)).toBeInTheDocument();
    });

    it("la lectura del archivo es con lista blanca: ni URLs, ni IPs, ni fichas llegan a la pantalla", () => {
        const sucio = datos({ motivo: "fallo en https://datos.1-2-3-4.sslip.io con pd_" + "x".repeat(40), servicio: "10.0.0.7", fichas: ["astraura", "https://x"] });
        const limpio = leerDatosPuerta(JSON.stringify(sucio));
        const texto = JSON.stringify(limpio);
        expect(texto).not.toMatch(/sslip|https?:\/\/|pd_x|10\.0\.0\.7/);
        expect(limpio?.fichas).toEqual(["astraura"]);
        expect(leerDatosPuerta("no es json")).toBeNull();
        expect(leerDatosPuerta(JSON.stringify({ ok: true }))).toBeNull();
    });

    it("(PDA1012) dice, por grupo, cuántas operaciones de esta neurona fueron por la puerta", async () => {
        localStorage.setItem(
            CLAVE_CONTADORES,
            JSON.stringify({
                dia: new Date().toISOString().slice(0, 10),
                porPuerta: 9,
                porSupabase: 1,
                enCola: 0,
                rechazos: 0,
                porGrupo: { neuronas: { puerta: 6, supabase: 0 }, presencia: { puerta: 2, supabase: 1 }, freno: { puerta: 1, supabase: 0 } },
            }),
        );
        render(<FilaPuertaDatos />);
        await screen.findByRole("article", { name: "Puerta de datos del A1" });
        expect(screen.getByTestId("puerta-grupos")).toHaveTextContent("neuronas 6/6 · presencia 2/3 · freno 1/1");
    });
});

