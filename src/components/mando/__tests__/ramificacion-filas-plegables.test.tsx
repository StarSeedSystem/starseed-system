import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FilasDeProcesos } from "@/components/mando/ramificacion-agentes";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";
import type { FotoEnjambre, LatidoTarea } from "@/lib/mando/tipos";

const noop = () => {};

function tarea(id: string, estado: string, extra: Partial<RamaTarea> = {}): RamaTarea {
    return {
        id,
        ola: "300",
        cola: "pruebas",
        titulo: `Tarea ${id}`,
        dependencias: [],
        estado,
        nivel: 0,
        donde: "mac",
        medio: "mando",
        modelo: "nim/kimi-k3",
        proveedor: "nim",
        revisor: "",
        sha: "",
        nota: "",
        segundos: 0,
        modelosFallidos: [],
        pasos: [],
        eventos: [],
        vivo: null,
        alcance: null,
        revision: null,
        motivoAprobacion: null,
        bloqueadaPor: null,
        veredicto: null,
        aprobacion: null,
        impacto: null,
        ...extra,
    };
}

function latidoDe(tareaId: string, donde: string, cola = "pruebas"): LatidoTarea {
    return {
        tarea: tareaId,
        cola: `cola-${cola}.json`,
        fase: "escribiendo",
        modelo: "nim/kimi-k3",
        minutos: 3,
        quietoSegundos: 5,
        donde,
        proveedor: "nim",
        medio: "mando",
    };
}

function enjambreDe(donde: string, cola = "pruebas"): FotoEnjambre {
    return {
        donde,
        cola: `cola-${cola}.json`,
        agentesActivos: 1,
        memoriaMb: null,
        integradas: 2,
        proveedores: {},
        t: "2026-10-28T10:00:00.000Z",
        medio: "mando",
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
        esperandoAprobacion: 0,
        bloqueadas: 0,
        viva: true,
    };
}

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
});

describe("FilasDeProcesos · Fila de la ola plegable (UIG1029B)", () => {
    it("cierra y abre la lista, y cerrada enseña el resumen correcto", () => {
        const tasks = [
            tarea("A1", "en_curso", { vivo: latidoDe("A1", "mac", "pruebas"), titulo: "La viva" }),
            tarea("A2", "pendiente", { titulo: "La que espera turno" }),
        ];
        render(
            <FilasDeProcesos
                olas={[olaCon(tasks)]}
                olaSel={olaCon(tasks)}
                latidos={[latidoDe("A1", "mac")]}
                enjambres={[enjambreDe("mac")]}
                onVer={noop}
            />,
        );
        // Abierta por defecto: las tareas de la ola se ven.
        const ola = screen.getByLabelText("Fila de la ola · 300");
        expect(within(ola).getAllByTitle("Abrir la ficha")).toHaveLength(2);
        expect(within(ola).getByText("A1")).toBeInTheDocument();
        expect(within(ola).getByText("A2")).toBeInTheDocument();

        // Cerrar la lista: contenido fuera y resumen de una línea dentro.
        fireEvent.click(within(ola).getByRole("button", { name: /Cerrar lista/ }));
        expect(ola.querySelector("div[id$='-contenido']")).toBeNull();
        expect(within(ola).queryByText("La viva")).not.toBeInTheDocument();
        expect(within(ola).getByText("1 en curso · 1 pendientes · 0 hechas")).toBeInTheDocument();

        // Abrir de nuevo: vuelven las tareas y el resumen desaparece.
        fireEvent.click(within(ola).getByRole("button", { name: /Abrir lista/ }));
        expect(within(ola).getByText("La viva")).toBeInTheDocument();
        expect(within(ola).queryByText("1 en curso · 1 pendientes · 0 hechas")).not.toBeInTheDocument();
    });
});

describe("FilasDeProcesos · fila larga con «Ver todas» (UIG1029B)", () => {
    const doce = Array.from({ length: 12 }, (_, i) => tarea(`P${i + 1}`, "pendiente"));

    it("muestra las primeras 8 y el botón «Ver todas (N)» abre el resto", () => {
        render(
            <FilasDeProcesos
                olas={[olaCon(doce)]}
                olaSel={olaCon(doce)}
                latidos={[]}
                enjambres={[]}
                onVer={noop}
            />,
        );
        const ola = screen.getByLabelText("Fila de la ola · 300");
        expect(within(ola).getAllByTitle("Abrir la ficha")).toHaveLength(8);
        expect(within(ola).getAllByText("kimi-k3 · nim")).toHaveLength(8);
        const verTodas = within(ola).getByText(`Ver todas (${doce.length})`);
        expect(verTodas).toHaveAttribute("data-testid", "fila-ver-todas");

        fireEvent.click(verTodas);
        expect(within(ola).getAllByTitle("Abrir la ficha")).toHaveLength(12);
        expect(within(ola).queryByText(/Ver todas \(12\)/)).not.toBeInTheDocument();

        const parada = screen.getByLabelText("Fila por agente");
        expect(within(parada).queryAllByTitle("Abrir la ficha")).toHaveLength(0);
    });
});

describe("FilasDeProcesos · Fila por agente plegable (UIG1029B)", () => {
    it("cada agente es su propia sección: abierto con algo vivo, cerrado sin latido", () => {
        const tasks = [
            tarea("A1", "en_curso", { vivo: latidoDe("A1", "mac", "pruebas") }),
            tarea("A2", "commit", { cola: "otras", titulo: "La integrada de la otra cola" }),
        ];
        render(
            <FilasDeProcesos
                olas={[olaCon(tasks)]}
                olaSel={olaCon(tasks)}
                latidos={[latidoDe("A1", "mac", "pruebas")]}
                enjambres={[enjambreDe("mac", "pruebas"), enjambreDe("nube", "otras")]}
                onVer={noop}
            />,
        );
        // Agente con latido: abierto de serie; su resumen y su fila se ven.
        const vivo = screen.getByLabelText("Agente en mac · cola-pruebas · desde mando");
        expect(vivo.querySelector("[role='button'], button")).not.toBeNull();
        expect(within(vivo).getByText("A1")).toBeInTheDocument();
        expect(within(vivo).getAllByText(/1 escribiendo · 0 en fila · 2 integradas/).length).toBeGreaterThan(0);

        // Agente sin latido: cerrado de serie (contenido no montado); al abrir sí aparece.
        const parado = screen.getByLabelText("Agente en nube · cola-otras · desde mando");
        expect(screen.queryByText("Sin tareas en fila: está cerrando.")).not.toBeInTheDocument();
        const abrir = parado.querySelector<HTMLButtonElement>("button[aria-controls]");
        expect(abrir).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(abrir!);
        expect(screen.getByText("Sin tareas en fila: está cerrando.")).toBeInTheDocument();
        expect(abrir).toHaveAttribute("aria-expanded", "true");
    });
});

describe("FilasDeProcesos · pastillas y título legible (UIG1029B)", () => {
    it("la fila lee fase, modelo y dónde como pastillas y el título no lleva truncate", () => {
        const viva = latidoDe("A1", "mac");
        const tasks = [
            tarea("A1", "en_curso", {
                vivo: viva,
                titulo: "Un título largo que antes se cortaba en pantallas pequeñas",
                donde: "nube",
                medio: "hermes",
            }),
        ];
        render(
            <FilasDeProcesos
                olas={[olaCon(tasks)]}
                olaSel={olaCon(tasks)}
                latidos={[viva]}
                enjambres={[enjambreDe("mac")]}
                onVer={noop}
            />,
        );
        const ola = screen.getByLabelText("Fila de la ola · 300");
        expect(within(ola).getAllByText(/escribiendo · kimi-k3/).length).toBeGreaterThan(0);
        expect(within(ola).getAllByText(/nube · hermes/).length).toBeGreaterThan(0);
        const titulo = within(ola).getAllByText("Un título largo que antes se cortaba en pantallas pequeñas")[0]!;
        expect(titulo.tagName).toBe("P");
        expect(titulo).not.toHaveClass("truncate");
    });
});
