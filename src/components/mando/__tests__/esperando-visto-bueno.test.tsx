import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { EsperandoVistoBueno } from "@/components/mando/ramificacion-agentes";
import { AJUSTES_POR_DEFECTO } from "@/lib/mando/ajustes-tipos";
import type { ConfigEnjambre } from "@/lib/mando/ajustes-tipos";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";

const configCon = (v: boolean): ConfigEnjambre => ({
    ...AJUSTES_POR_DEFECTO,
    resolucionAutomatica: v,
});

function tareaQueEspera(id = "A1"): RamaTarea {
    return {
        id,
        ola: "300",
        cola: "pruebas",
        titulo: "Tarea de prueba que espera",
        dependencias: [],
        estado: "esperando_aprobacion",
        nivel: 0,
        donde: "mac",
        medio: "mando",
        modelo: "nim/kimi-k3",
        proveedor: "nim",
        revisor: "nim/deepseek",
        sha: "abc1234",
        nota: "",
        segundos: 60,
        modelosFallidos: [],
        pasos: [],
        eventos: [],
        vivo: null,
        alcance: null,
        revision: null,
        motivoAprobacion: "revisión bloqueante",
        bloqueadaPor: null,
        aprobacion: null,
        impacto: null,
    };
}

function olaCon(tareas: RamaTarea[]): RamaOla {
    return {
        id: "300",
        numero: 300,
        tareas,
        total: tareas.length,
        hechas: 0,
        enCurso: 0,
        fallidas: 0,
        sinCambios: 0,
        pendientes: 0,
        esperandoAprobacion: tareas.length,
        bloqueadas: 0,
        viva: true,
    };
}

const fetchOriginal = globalThis.fetch;

interface Guion {
    valor: boolean;
    /** Si es true, el PUT falla con 500. */
    putFalla?: boolean;
}

/** Instala un fetch de pruebas: GET de ajustes responde la config; PUT responde ok (o falla). */
function instalarFetch(guion: Guion): { llamadasPut: () => Array<{ metodo: string; cuerpo: unknown }> } {
    const puts: Array<{ metodo: string; cuerpo: unknown }> = [];
    globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof entrada === "string" ? entrada : entrada.toString();
        if (!url.includes("/api/mando/ajustes")) {
            return new Response("{}", { status: 404 });
        }
        if (init?.method === "PUT") {
            puts.push({ metodo: "PUT", cuerpo: JSON.parse(String(init.body ?? "{}")) });
            if (guion.putFalla) {
                return new Response(JSON.stringify({ error: "disco lleno" }), { status: 500 });
            }
            return new Response(
                JSON.stringify({ ok: true, config: JSON.parse(String(init.body ?? "{}")) }),
                { status: 200 },
            );
        }
        return new Response(JSON.stringify({ config: configCon(guion.valor) }), { status: 200 });
    }) as typeof fetch;
    return { llamadasPut: () => puts };
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

const noop = () => {};

describe("EsperandoVistoBueno · switch de resolución automática", () => {
    it("muestra el switch cuando hay tareas esperando y refleja el valor de la API (apagado)", async () => {
        instalarFetch({ valor: false });
        render(<EsperandoVistoBueno olas={[olaCon([tareaQueEspera()])]} onVer={noop} onHecho={noop} />);

        const interruptor = await screen.findByRole("switch", { name: "Resolución automática" });
        expect(interruptor).toHaveAttribute("aria-checked", "false");
        expect(screen.getByText("Todo espera tu visto bueno.")).toBeInTheDocument();
        expect(screen.getByText(/Esperando tu visto bueno · 1/)).toBeInTheDocument();
    });

    it("refleja el valor encendido que devuelve la API", async () => {
        instalarFetch({ valor: true });
        render(<EsperandoVistoBueno olas={[olaCon([tareaQueEspera()])]} onVer={noop} onHecho={noop} />);

        const interruptor = await screen.findByRole("switch", { name: "Resolución automática" });
        expect(interruptor).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByText("El director y los verificadores resuelven solos lo que esté limpio."),
        ).toBeInTheDocument();
    });

    it("al cambiarlo hace PUT a /api/mando/ajustes con el valor invertido", async () => {
        const { llamadasPut } = instalarFetch({ valor: false });
        render(<EsperandoVistoBueno olas={[olaCon([tareaQueEspera()])]} onVer={noop} onHecho={noop} />);

        const interruptor = await screen.findByRole("switch", { name: "Resolución automática" });
        fireEvent.click(interruptor);

        await waitFor(() => expect(llamadasPut()).toHaveLength(1));
        const cuerpo = llamadasPut()[0]!.cuerpo as ConfigEnjambre;
        expect(cuerpo.resolucionAutomatica).toBe(true);
        await waitFor(() =>
            expect(
                screen.getByRole("switch", { name: "Resolución automática" }),
            ).toHaveAttribute("aria-checked", "true"),
        );
    });

    it("si el PUT falla, el switch vuelve al valor anterior y dice por qué", async () => {
        instalarFetch({ valor: false, putFalla: true });
        render(<EsperandoVistoBueno olas={[olaCon([tareaQueEspera()])]} onVer={noop} onHecho={noop} />);

        const interruptor = await screen.findByRole("switch", { name: "Resolución automática" });
        fireEvent.click(interruptor);

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("disco lleno"));
        expect(interruptor).toHaveAttribute("aria-checked", "false");
        expect(screen.getByText("Todo espera tu visto bueno.")).toBeInTheDocument();
    });

    it("sin tareas esperando no renderiza nada ni pide los ajustes", async () => {
        const espia = vi.fn();
        globalThis.fetch = espia as unknown as typeof fetch;
        const { container } = render(
            <EsperandoVistoBueno olas={[olaCon([{ ...tareaQueEspera(), estado: "commit" }])]} onVer={noop} onHecho={noop} />,
        );
        expect(container.firstChild).toBeNull();
        expect(espia).not.toHaveBeenCalled();
    });
});
