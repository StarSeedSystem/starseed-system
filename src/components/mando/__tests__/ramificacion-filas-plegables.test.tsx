/**
 * (UIG1029B) Las filas de MetaGenesis se pliegan: la «Fila de la ola» y la «Fila por
 * agente» a su resumen de una línea; cada agente (y cada cola sin nadie) es su propia
 * sección plegable; una fila larga enseña las primeras 8 y «Ver todas (N)» el resto;
 * fase, modelo y dónde van en pastillas y el título nunca se corta.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { FilasDeProcesos } from "@/components/mando/ramificacion-agentes";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";
import type { LatidoTarea } from "@/lib/mando/tipos";

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

const latido: LatidoTarea = {
    tarea: "TA00", cola: "cola-nio.json", fase: "escribiendo", modelo: "openrouter/glm-4",
    minutos: 2, quietoSegundos: 0, donde: "nube", medio: "opencode",
};

function tarea(id: string, extra: Partial<RamaTarea> = {}): RamaTarea {
    return {
        id, ola: "1029", cola: id.startsWith("TAQ") ? "qui" : "nio", titulo: `cuerpo ${id.toLowerCase()}`,
        dependencias: [], estado: "pendiente", nivel: 0, donde: null, medio: null,
        modelo: "", proveedor: "", revisor: "", sha: "", nota: "", segundos: 0,
        modelosFallidos: [], pasos: [], eventos: [], vivo: null, alcance: null,
        revision: null, motivoAprobacion: null, bloqueadaPor: null, veredicto: null,
        aprobacion: null, impacto: null, ...extra,
    };
}

const tareas: RamaTarea[] = [
    tarea("TA00", { estado: "en_curso", donde: "nube", medio: "opencode", modelo: "openrouter/glm-4", vivo: latido }),
    ...Array.from({ length: 10 }, (_, i) => tarea(`TA${String(i + 1).padStart(2, "0")}`)),
    tarea("TH1", { estado: "commit", donde: "nube" }),
    tarea("TAQ1"), tarea("TAQ2"),
];

const ola: RamaOla = {
    id: "1029", numero: 1029, tareas, total: tareas.length, hechas: 1, enCurso: 1,
    fallidas: 0, sinCambios: 0, pendientes: 11, esperandoAprobacion: 0, bloqueadas: 0, viva: true,
};

const enjambres = [
    { donde: "nube", cola: "cola-nio.json", agentesActivos: 1, memoriaMb: null, integradas: 3, proveedores: {}, t: "2026-10-29T04:00:00", medio: "opencode" },
    { donde: "mac", cola: "cola-sil.json", agentesActivos: 0, memoriaMb: null, integradas: 0, proveedores: {}, t: "2026-10-29T04:00:00", medio: "claude" },
];

function montar() {
    render(<FilasDeProcesos olas={[ola]} olaSel={ola} latidos={[latido]} enjambres={enjambres} onVer={() => {}} />);
}

describe("FilasDeProcesos plegables", () => {
    it("la Fila de la ola se pliega a su resumen y vuelve a abrirse", () => {
        montar();
        const olaSeccion = screen.getByLabelText(/Fila de la ola/);
        expect(within(olaSeccion).getByText("TA00")).toBeInTheDocument();
        fireEvent.click(within(olaSeccion).getByRole("button", { name: /Cerrar lista/ }));
        expect(within(olaSeccion).queryByText("TA00")).not.toBeInTheDocument();
        expect(within(olaSeccion).getByText("1 en curso · 12 pendientes · 1 hecha")).toBeInTheDocument();
        fireEvent.click(within(olaSeccion).getByRole("button", { name: /Abrir lista/ }));
        expect(within(olaSeccion).getByText("TA00")).toBeInTheDocument();
    });

    it("cada agente es su propia sección plegable y solo arranca abierta el que tiene algo vivo", () => {
        montar();
        const vivo = screen.getByLabelText("cola-nio");
        expect(within(vivo).getByTestId("fila-ordenada")).toBeInTheDocument();
        expect(within(vivo).getByText("1 escribiendo · 10 en fila · 3 integradas")).toBeInTheDocument();

        const parado = screen.getByLabelText("cola-sil");
        expect(within(parado).queryByTestId("fila-ordenada")).not.toBeInTheDocument();
        fireEvent.click(within(parado).getByRole("button", { name: /Abrir lista/ }));
        expect(within(parado).getByText("Sin tareas en fila: está cerrando.")).toBeInTheDocument();

        const sinAgente = screen.getByLabelText("cola-qui · sin agente");
        expect(within(sinAgente).queryByText("TAQ1")).not.toBeInTheDocument();
        expect(within(sinAgente).getByText("2 esperan un lanzamiento (Diseñar ola → importar)")).toBeInTheDocument();
        fireEvent.click(within(sinAgente).getByRole("button", { name: /Abrir lista/ }));
        expect(within(sinAgente).getByText("TAQ1")).toBeInTheDocument();
    });

    it("una fila larga enseña las primeras 8 y «Ver todas (N)» despliega el resto", () => {
        montar();
        const olaSeccion = screen.getByLabelText(/Fila de la ola/);
        const fila = within(olaSeccion).getAllByTestId("fila-ordenada")[0];
        expect(within(fila).getByText("TA07")).toBeInTheDocument();
        expect(within(fila).queryByText("TA09")).not.toBeInTheDocument();
        expect(within(fila).queryByText("TH1")).not.toBeInTheDocument();

        fireEvent.click(within(fila).getByRole("button", { name: "Ver todas (14)" }));
        expect(within(fila).getByText("TA09")).toBeInTheDocument();
        expect(within(fila).getByText("TH1")).toBeInTheDocument();
        expect(within(fila).queryByRole("button", { name: /Ver todas/ })).not.toBeInTheDocument();
    });

    it("las tareas sin latido llevan modelo y proveedor en pastilla y sin agentes la Fila por agente queda vacía", () => {
        const doce = Array.from({ length: 12 }, (_, i) =>
            tarea(`TB${String(i + 1).padStart(2, "0")}`, { cola: "", modelo: "kimi-k3", proveedor: "nim" }),
        );
        const olaDoce: RamaOla = {
            id: "300", numero: 300, tareas: doce, total: doce.length, hechas: 0, enCurso: 0,
            fallidas: 0, sinCambios: 0, pendientes: doce.length, esperandoAprobacion: 0, bloqueadas: 0, viva: false,
        };
        render(<FilasDeProcesos olas={[olaDoce]} olaSel={olaDoce} latidos={[]} enjambres={[]} onVer={() => {}} />);

        const olaSeccion = screen.getByLabelText("Fila de la ola · 300");
        expect(within(olaSeccion).getAllByText("kimi-k3 · nim")).toHaveLength(8);

        const agentes = screen.getByLabelText("Fila por agente");
        expect(within(agentes).queryAllByTitle("Abrir la ficha")).toHaveLength(0);
        expect(within(agentes).getByText("Ningún orquestador vivo y ninguna cola con tareas pendientes.")).toBeInTheDocument();
    });

    it("fase, modelo y dónde van en pastillas y el título no se corta (va debajo en móvil)", () => {
        montar();
        const vivo = screen.getByLabelText("cola-nio");
        const fila = within(vivo).getByTestId("fila-ordenada");
        const pastillas = Array.from(fila.querySelectorAll("[data-pastilla]")).map((p) => p.textContent ?? "");
        expect(pastillas.some((t) => t.includes("escribiendo") && t.includes("glm-4") && t.includes("2 min"))).toBe(true);
        expect(pastillas.some((t) => t.includes("nube") && t.includes("opencode"))).toBe(true);
        const cuerpo = within(fila).getByTitle("cuerpo ta01");
        expect(cuerpo).toHaveClass("truncate");
    });
});
