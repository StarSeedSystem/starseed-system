import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { MedidorConsumo } from "../medidor-consumo";
import { leerConsumoOracle } from "@/lib/mando/oracle-consumo-tipos";

const fetchOriginal = globalThis.fetch;
let llamadas: { url: string; metodo: string }[] = [];
let gastoMes = 0;

function oracle() {
    return leerConsumoOracle({
        leido: new Date(Date.now() - 5 * 60_000).toISOString(),
        ok: true,
        region: "mx-queretaro-1",
        consola: "https://cloud.oracle.com/?region=mx-queretaro-1",
        gasto: { mes: gastoMes, previsto: gastoMes, presupuesto: 1, moneda: "MXN", fuente: "presupuesto de Oracle" },
        prueba: { activa: true, credito: 6150, usado: 0, restante: 6150, moneda: "MXN", fin: "2026-11-05T23:59:59Z", dias_restantes: 26 },
        uso: { salida_gb: 0.0049, a1_ocpu_h: 96.62, a1_gb_h: 579.75 },
        instancias: [{ nombre: "starseed-a1", forma: "VM.Standard.A1.Flex", ocpus: 2, gb: 12, estado: "RUNNING" }],
        disco: { gb: 100, arranque_gb: 100, bloques_gb: 0 },
        objetos: { gb: 0, cubos: 0 },
        reclamacion: {
            riesgo: true,
            maquinas: [{ nombre: "starseed-a1", medida: true, riesgo: true, nivel: "aviso", cpu_p95: 0.52, mem_p95: 5.26, red_p95_pct: 0.0015, dias: 2.1, reclamable_desde: "2026-10-14T23:00:00Z" }],
        },
        computo: { a1_ocpus: 2, a1_gb: 12, micro: 0, a1_nombre: "starseed-a1", a1_estado: "RUNNING" },
        freno: gastoMes > 0 ? { activo: true, motivo: "el gasto del mes es 0.4 MXN" } : { activo: false, motivo: "" },
        margen: gastoMes > 0 ? { apto: false, motivo: "freno: el gasto del mes pasó de 0" } : { apto: true, motivo: "hay margen gratis: 99,5 % de CPU y 11,4 GB libres" },
        errores: [],
    });
}

beforeEach(() => {
    llamadas = [];
    gastoMes = 0;
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        llamadas.push({ url: u, metodo: init?.method ?? "GET" });
        if (u === "/api/mando/oracle/consumo") {
            return new Response(JSON.stringify({ datos: oracle(), mensaje: init?.method === "POST" ? "Oracle medido ahora." : undefined }));
        }
        return new Response(JSON.stringify({ error: "sin consumo en esta prueba" }), { status: 503 });
    }) as typeof fetch;
});

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("Tarjeta de Oracle Cloud en «Consumo y créditos»", () => {
    it("pinta cada medida con su límite gratis, el riesgo y la consola", async () => {
        render(<MedidorConsumo />);
        const tarjeta = await screen.findByRole("article", { name: "Oracle Cloud" });
        await within(tarjeta).findByText("Riesgo de reclamación");
        expect(within(tarjeta).getByRole("progressbar", { name: "Gasto del mes: 0,00 / 1,00 MXN" })).toBeInTheDocument();
        expect(within(tarjeta).getByRole("progressbar", { name: "Disco (arranque + bloques): 100 / 200 GB" })).toBeInTheDocument();
        expect(within(tarjeta).getByRole("progressbar", { name: "Object Storage: 0 / 20 GB" })).toBeInTheDocument();
        expect(within(tarjeta).getByRole("progressbar", { name: /Salida de datos del mes: .* \/ 10 TB/ })).toBeInTheDocument();
        expect(within(tarjeta).getByRole("progressbar", { name: "A1 starseed-a1: 2/2 OCPU · 12/12 GB" })).toBeInTheDocument();
        expect(screen.getByTestId("oracle-reclamacion")).toHaveTextContent("14 oct");
        expect(within(tarjeta).getByText(/envían trabajo al A1/)).toBeInTheDocument();
        expect(within(tarjeta).getByRole("link", { name: /Abrir la consola de Oracle/ })).toHaveAttribute(
            "href",
            "https://cloud.oracle.com/?region=mx-queretaro-1",
        );
        expect(within(tarjeta).getByText(/medido hace 5 min/)).toBeInTheDocument();
    });

    it("«Actualizar ahora» mide por POST y lo dice", async () => {
        render(<MedidorConsumo />);
        const tarjeta = await screen.findByRole("article", { name: "Oracle Cloud" });
        await within(tarjeta).findByText("Riesgo de reclamación");
        fireEvent.click(within(tarjeta).getByRole("button", { name: /Actualizar ahora/ }));
        expect(await within(tarjeta).findByText("Oracle medido ahora.")).toBeInTheDocument();
        expect(llamadas.some((l) => l.url === "/api/mando/oracle/consumo" && l.metodo === "POST")).toBe(true);
    });

    it("con gasto > 0 avisa del freno y los agentes dejan de enviar trabajo", async () => {
        gastoMes = 0.4;
        render(<MedidorConsumo />);
        const tarjeta = await screen.findByRole("article", { name: "Oracle Cloud" });
        await waitFor(() => expect(within(tarjeta).getByRole("alert")).toHaveTextContent("Gasto mayor que 0"));
        expect(within(tarjeta).getByText("Gasto > 0 · freno")).toBeInTheDocument();
        expect(within(tarjeta).getByText(/no envían trabajo a Oracle/)).toBeInTheDocument();
    });
});
