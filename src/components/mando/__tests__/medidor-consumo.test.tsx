import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { MedidorConsumo, SONDEO_MS, hace } from "../medidor-consumo";
import { PRESUPUESTOS_POR_DEFECTO, type DatosConsumo } from "@/lib/mando/consumo-tipos";

const fetchOriginal = globalThis.fetch;

function datos(extra: Partial<DatosConsumo["supabase"]> = {}): DatosConsumo {
    const historial = Array.from({ length: 14 }, (_, i) => ({
        dia: new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10),
        peticiones: i === 5 ? null : 1000 * (i + 1),
    }));
    return {
        generadoEn: "2026-09-29T18:00:00.000Z",
        presupuestos: { ...PRESUPUESTOS_POR_DEFECTO },
        supabase: {
            nivel: "aviso",
            medidoEn: "2026-09-29T17:50:00Z",
            fresco: true,
            dia: "2026-09-29",
            peticiones: 18_000,
            mb: 60,
            fraccionMedida: 0.4,
            pctPeticiones: 0.72,
            pctMb: 0.4,
            c402: 0,
            top: [
                { ruta: "/auth/v1/user", n: 9000, mb: 10 },
                { ruta: "/rest/v1/os_mesh_relay", n: 5000, mb: 30 },
                { ruta: "/rest/v1/posts", n: 1000, mb: 5 },
            ],
            realtime: { mb: 3, escrituras: 1200, registros: 0, estimado: true },
            ciclo: { mb: 1200, presupuestoMb: 5120, pct: 1200 / 5120, inicio: "2026-09-10", diasRestantes: 11, supuesto: false },
            freno: { activo: false, motivo: null, hasta: null, remoto: "ok" },
            historial,
            ultimoBucle: { t: "2026-09-29T15:00:00Z", ruta: "/rest/v1/os_mesh_relay", ua: "Chrome", n: 2100 },
            ...extra,
        },
        jev: { usdHoy: 0.01, techo: 0.05, pct: 0.2, saldo: 9.5, saldoMin: 2, tono: "ok" },
        claude: {
            sesion: {
                pct: 34,
                queda: 66,
                reinicio: "2026-10-01T00:00:00Z",
                minutosParaReinicio: 30,
                coste: 5.2,
                proyeccion: 34,
                reiniciada: false,
                tono: "aviso",
            },
            semana: {
                pct: 61,
                queda: 39,
                reinicio: "2026-10-02T00:00:00Z",
                minutosParaReinicio: 60,
                coste: 3.1,
                proyeccion: 61,
                reiniciada: false,
                tono: "ok",
            },
            modelo: {
                pct: 45,
                queda: 55,
                reinicio: "2026-10-03T00:00:00Z",
                minutosParaReinicio: 90,
                coste: 2.0,
                proyeccion: 45,
                reiniciada: false,
                tono: "aviso",
            },
            modeloNombre: "Fable",
            lecturaEn: "2026-09-29T10:00:00Z",
            lecturaHaceMin: 120,
            desactualizada: false,
            programadasEnSesion: 0,
            programadasEnSemana: 0,
            recomendacion: "Espacia las revisiones: caben 10 hasta el reinicio de semana",
            tono: "aviso",
            enlace: "https://claude.ai/settings/usage",
            comando: "python3 scripts/puente/limites_claude.py estado",
        },
    };
}

let llamadas: { url: string; init?: RequestInit }[] = [];
let respuesta: () => Response = () => new Response(JSON.stringify({ datos: datos() }), { status: 200 });

function visibilidad(estado: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { value: estado, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
    llamadas = [];
    respuesta = () => new Response(JSON.stringify({ datos: datos() }), { status: 200 });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        llamadas.push({ url: String(url), init });
        return respuesta();
    }) as typeof fetch;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = fetchOriginal;
});

describe("MedidorConsumo", () => {
    it("pinta una fila por medio con sus barras, top 3, 14 días y el último bucle", async () => {
        render(<MedidorConsumo />);
        const supabase = await screen.findByRole("article", { name: "Supabase" });
        expect(within(supabase).getByText("Aviso · más del 70 %")).toBeInTheDocument();
        expect(within(supabase).getByRole("progressbar", { name: "Peticiones hoy: 18.000 / 25.000" })).toHaveAttribute(
            "aria-valuenow",
            "72",
        );
        expect(within(supabase).getByRole("progressbar", { name: "Salida estimada hoy: 60 MB / 150 MB" })).toBeInTheDocument();
        expect(within(supabase).getByRole("progressbar", { name: "Ciclo de facturación: 1,17 GB / 5,00 GB" })).toBeInTheDocument();
        expect(within(supabase).getByText(/quedan 11 días/)).toBeInTheDocument();
        expect(within(supabase).getByText("/auth/v1/user")).toBeInTheDocument();
        expect(within(supabase).getByRole("img", { name: /últimos 14 días/ })).toBeInTheDocument();
        expect(screen.getByTestId("ultimo-bucle")).toHaveTextContent("/rest/v1/os_mesh_relay");
        expect(screen.getByTestId("ultimo-bucle")).toHaveTextContent("2.100 peticiones/h");

        const jev = screen.getByRole("article", { name: "Jev y OpenRouter" });
        expect(within(jev).getByRole("progressbar", { name: "Gasto de hoy: $0.0100 / $0.05" })).toBeInTheDocument();
        const claude = screen.getByRole("article", { name: "Límites del plan de Claude" });
        expect(within(claude).getByRole("progressbar", { name: "Sesión (≈5 h): 34 % usado · queda 66 %" })).toBeInTheDocument();
        expect(within(claude).getByText("34 % usado · queda 66 %")).toBeInTheDocument();
        expect(within(claude).getByRole("link", { name: /Ver el uso en claude.ai/ })).toHaveAttribute(
            "href",
            "https://claude.ai/settings/usage",
        );
        expect(within(claude).getByText(/Espacia las revisiones: caben 10/)).toBeInTheDocument();
        expect(within(claude).getByText(/limites_claude.py estado/)).toBeInTheDocument();
    });

    it("avisa del freno remoto y del 402", async () => {
        respuesta = () =>
            new Response(
                JSON.stringify({
                    datos: datos({
                        nivel: "freno",
                        freno: { activo: true, motivo: "Presupuesto diario de Supabase agotado.", hasta: "2026-09-30T00:00:00Z", remoto: "ok" },
                    }),
                }),
            );
        render(<MedidorConsumo />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Freno remoto activo hasta las 00:00 UTC");
        cleanup();
        respuesta = () => new Response(JSON.stringify({ datos: datos({ nivel: "restringido" }) }));
        render(<MedidorConsumo />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Supabase responde 402");
    });

    it("dice cuándo la vigía no está midiendo", async () => {
        respuesta = () => new Response(JSON.stringify({ datos: datos({ fresco: false, medidoEn: "2026-09-29T12:00:00Z" }) }));
        render(<MedidorConsumo />);
        expect(await screen.findByText(/no mide desde hace 6 h/)).toBeInTheDocument();
        expect(screen.getByText("python3 scripts/puente/vigia_consumo.py")).toBeInTheDocument();
    });

    it("pregunta cada 60 s SOLO con la pestaña visible", async () => {
        vi.useFakeTimers();
        render(<MedidorConsumo />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(llamadas).toHaveLength(1);
        await act(async () => {
            vi.advanceTimersByTime(SONDEO_MS);
        });
        expect(llamadas).toHaveLength(2);
        act(() => visibilidad("hidden"));
        await act(async () => {
            vi.advanceTimersByTime(SONDEO_MS * 5);
        });
        expect(llamadas).toHaveLength(2);
        await act(async () => {
            visibilidad("visible");
        });
        expect(llamadas).toHaveLength(3);
        cleanup();
        await act(async () => {
            vi.advanceTimersByTime(SONDEO_MS * 3);
        });
        expect(llamadas).toHaveLength(3);
    });

    it("el formulario valida antes de enviar y guarda por POST JSON", async () => {
        render(<MedidorConsumo />);
        await screen.findByRole("article", { name: "Supabase" }); // sin datos, el botón espera
        fireEvent.click(screen.getByRole("button", { name: /Presupuestos/ }));
        const form = screen.getByRole("form", { name: "Presupuestos de consumo" });
        expect(within(form).getByText(/no tiene límite de gasto diario/)).toBeInTheDocument();

        fireEvent.change(within(form).getByLabelText("Supabase · peticiones por día"), { target: { value: "0" } });
        fireEvent.click(within(form).getByRole("button", { name: /Guardar presupuestos/ }));
        expect(await within(form).findByRole("alert")).toHaveTextContent("peticiones por día");
        expect(llamadas.filter((l) => l.init?.method === "POST")).toHaveLength(0);

        const nuevos = { ...PRESUPUESTOS_POR_DEFECTO, supabase_peticiones_dia: 20_000 };
        respuesta = () =>
            new Response(JSON.stringify({ datos: { ...datos(), presupuestos: nuevos }, mensaje: "Presupuestos guardados." }));
        fireEvent.change(within(form).getByLabelText("Supabase · peticiones por día"), { target: { value: "20000" } });
        fireEvent.click(within(form).getByRole("button", { name: /Guardar presupuestos/ }));
        expect(await screen.findByText("Presupuestos guardados.")).toBeInTheDocument();
        const envio = llamadas.find((l) => l.init?.method === "POST");
        expect(envio?.url).toBe("/api/mando/consumo");
        expect((envio?.init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
        expect(JSON.parse(String(envio?.init?.body)).presupuestos.supabase_peticiones_dia).toBe(20_000);
        expect(screen.queryByRole("form", { name: "Presupuestos de consumo" })).not.toBeInTheDocument();
    });
});

describe("hace", () => {
    it("minutos, horas y días", () => {
        const ahora = Date.parse("2026-09-29T18:00:00Z");
        expect(hace(null, ahora)).toBe("nunca");
        expect(hace("2026-09-29T17:59:40Z", ahora)).toBe("hace menos de 1 min");
        expect(hace("2026-09-29T17:45:00Z", ahora)).toBe("hace 15 min");
        expect(hace("2026-09-29T15:00:00Z", ahora)).toBe("hace 3 h");
        expect(hace("2026-09-25T18:00:00Z", ahora)).toBe("hace 4 días");
    });
});
