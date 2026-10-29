/**
 * UIG1029B · Pruebas de las filas plegables de Genesis: cerrar y abrir,
 * resumen cerrado correcto y «Ver todas (N)».
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FilasDeProcesos } from "@/components/mando/ramificacion-agentes";
import type { FotoEnjambre, LatidoTarea } from "@/lib/mando/tipos";
import type { RamaOla, RamaTarea } from "@/lib/mando/ramificacion";

/** Tarea de fila con lo mínimo que la pestaña usa (el resto, neutro). */
function tarea(p: Partial<RamaTarea> & { id: string; estado: string; cola: string }): RamaTarea {
    return {
        id: p.id, ola: "ola-1000", cola: p.cola, titulo: `Tarea ${p.id}`, dependencias: [],
        estado: p.estado, nivel: 0, donde: null, medio: null, modelo: "org/modelo-x",
        proveedor: "nim", revisor: "", sha: "", nota: "", segundos: 0, modelosFallidos: [],
        pasos: [], eventos: [], vivo: null, alcance: null, revision: null,
        motivoAprobacion: null, bloqueadaPor: null, veredicto: null, aprobacion: null,
        impacto: null, ...p,
    };
}

const latido: LatidoTarea = { tarea: "AB0", cola: "cola-fija1", fase: "escribiendo", modelo: "org/modelo-x", minutos: 3, quietoSegundos: 0, donde: "mac" };

const enjambres: FotoEnjambre[] = [{
    donde: "mac", cola: "cola-fija1", agentesActivos: 1, memoriaMb: 900, integradas: 4,
    proveedores: {}, t: "2026-10-28T10:00:00Z", medio: "hermes",
}];

/** Una ola con 1 en curso (AB0), 12 pendientes (AB1-AB12) y 1 integrada (FIX1). */
function montar() {
    const pendientes = Array.from({ length: 12 }, (_, i) => tarea({ id: `AB${i + 1}`, estado: "pendiente", cola: "fija1" }));
    const tareas = [tarea({ id: "AB0", estado: "en_curso", cola: "fija1", vivo: { ...latido } }), ...pendientes, tarea({ id: "FIX1", estado: "commit", cola: "otra" })];
    const ola: RamaOla = { id: "ola-1000", numero: 1000, tareas, total: 14, hechas: 1, enCurso: 1, fallidas: 0, sinCambios: 0, pendientes: 12, esperandoAprobacion: 0, bloqueadas: 0, viva: true };
    render(<FilasDeProcesos olas={[ola]} olaSel={ola} latidos={[latido]} enjambres={enjambres} onVer={() => {}} />);
}

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

describe("FilasDeProcesos (UIG1029B)", () => {
    it("cierra la fila de la ola y queda el resumen; al abrir vuelve el contenido", () => {
        montar();
        const region = screen.getByRole("region", { name: /Fila de la ola/ });
        expect(within(region).getByText("AB0")).toBeInTheDocument();
        expect(within(region).getByText(/Turno real/)).toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: /Cerrar lista/ }));
        expect(within(region).queryByText("AB0")).not.toBeInTheDocument();
        expect(within(region).getByText("1 en curso · 12 pendientes · 1 hechas")).toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: /Abrir lista/ }));
        expect(within(region).getByText("AB0")).toBeInTheDocument();
        expect(within(region).queryByText("1 en curso · 12 pendientes · 1 hechas")).not.toBeInTheDocument();
    });

    it("cada agente es su propia sección, abierta si late; cerrada enseña su resumen", () => {
        montar();
        const region = screen.getByRole("region", { name: "mac · cola-fija1" });
        expect(within(region).getByText("1 escribiendo")).toBeInTheDocument();
        expect(within(region).getByText("AB0")).toBeInTheDocument();
        expect(within(region).getByText(/desde hermes/)).toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: /Cerrar lista/ }));
        expect(within(region).getByText("1 escribiendo · 12 en fila · 4 integradas")).toBeInTheDocument();
        expect(within(region).queryByText("AB0")).not.toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: /Abrir lista/ }));
        expect(within(region).getByText("AB0")).toBeInTheDocument();
    });

    it("las filas largas enseñan las primeras 8 y «Ver todas (N)» muestra el resto", () => {
        montar();
        const region = screen.getByRole("region", { name: "mac · cola-fija1" });
        expect(within(region).getByRole("button", { name: "AB7" })).toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: "AB12" })).not.toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: "Ver todas (13)" }));
        expect(within(region).getByRole("button", { name: "AB12" })).toBeInTheDocument();
        fireEvent.click(within(region).getByRole("button", { name: "Ver 8 primeras" }));
        expect(within(region).queryByRole("button", { name: "AB12" })).not.toBeInTheDocument();
    });
});
