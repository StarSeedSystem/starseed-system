/**
 * (UIG1029C) «Bloqueadas y rechazadas» por causa: una sección plegable por causa,
 * abierta solo la que más tareas tiene, su acción automática a la vista y el
 * «Cerrar lista» arriba. La misma lista se monta en el medidor y en Ramificación.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { BloqueadasGrupos } from "@/components/mando/bloqueadas-grupos";
import { SeccionBloqueadasReintentos } from "@/components/mando/ramificacion-agentes";
import { accionAutomaticaDeFila, agruparPorCausa, causaDeFila, type ResumenBloqueadas } from "@/lib/mando/bloqueadas";
import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

function fila(id: string, grupo: FilaMedidor["grupo"], porque: string): FilaMedidor {
    return {
        id,
        titulo: `Tarea ${id}`,
        estado: grupo === "sin-resolver" ? "fallo_tsc" : "bloqueada",
        grupo,
        porque,
        acciones: [],
    };
}

const resumen: ResumenBloqueadas = {
    valor: 6,
    enCadena: 0,
    atascadas: 3,
    alex: 0,
    transformadasHoy: 0,
    sinResolver: 3,
    sinResolverEnMarcha: 0,
    pastilla: "3 atascadas · 3 sin resolver",
    texto: "3 atascadas · 3 fallidas o rechazadas sin resolver",
    textoCadena: "ninguna tarea espera a otra",
    cadenas: [],
    transformadas: [],
    preguntas: [],
    revisorAlDia: true,
    revisorDesde: "2026-10-29T04:00:00",
    revisorMedio: "mac",
};

const filas: FilaMedidor[] = [
    fila("A1", "atascada", "espera a 1 tarea(s) que NO EXISTEN: este bloqueo no se resuelve nunca"),
    fila("A2", "atascada", "espera a 1 tarea(s) que NO EXISTEN: este bloqueo no se resuelve nunca"),
    fila("A3", "atascada", "la rehace A3b (en_curso)"),
    fila("F1", "sin-resolver", "no tocó ninguno de los archivos que declaraba"),
    fila("F2", "sin-resolver", "no tocó ninguno de los archivos que declaraba"),
    fila("F3", "sin-resolver", "no tocó ninguno de los archivos que declaraba"),
];

const detalle: DetalleMedidor = {
    clave: "bloqueadas",
    titulo: "Bloqueadas",
    resumen: resumen.texto,
    filas,
    acciones: [],
    bloqueadas: resumen,
};

describe("agruparPorCausa", () => {
    it("junta las filas por causa, ordena por número y enseña la acción automática", () => {
        const grupos = agruparPorCausa(filas, resumen.transformadas);
        expect(grupos.map((g) => g.clave)).toEqual([
            "sin-cambios",
            "dependencia-fantasma",
            "reparacion-en-marcha",
        ]);
        expect(grupos[0]?.filas.map((f) => f.id)).toEqual(["F1", "F2", "F3"]);
        expect(grupos[1]?.titulo).toBe("Espera a tareas que no existen");
        expect(grupos[1]?.filas.map((f) => f.id)).toEqual(["A1", "A2"]);
        expect(grupos[2]?.accion).toBe("La rehace A3b (en_curso)");
    });

    it("una fila sin causa usa su estado y no inventa una acción automática", () => {
        expect(causaDeFila({ estado: "rechazada" })).toEqual({
            clave: "sin-causa-rechazada",
            titulo: "rechazada: sin causa anotada",
        });
        expect(accionAutomaticaDeFila({ id: "X", porque: "" })).toBeNull();
    });
});

describe("BloqueadasGrupos por causa", () => {
    it("abre solo la causa con más tareas y deja «Cerrar lista» arriba", () => {
        render(<BloqueadasGrupos detalle={detalle} />);

        const sinResolver = screen.getByTestId("bloqueadas-causas-sin-resolver");
        expect(within(sinResolver).getByText("F1")).toBeInTheDocument();

        const atascadas = screen.getByTestId("bloqueadas-causas-atascadas");
        expect(within(atascadas).queryByText("A1")).not.toBeInTheDocument();
        expect(within(atascadas).getByText("La rehace A3b (en_curso)")).toBeInTheDocument();

        const cerrarArriba = screen.getAllByRole("button", { name: /Cerrar lista/ })[0];
        expect(cerrarArriba).toBeDefined();
        fireEvent.click(cerrarArriba!);
        expect(screen.queryByTestId("bloqueadas-cifras")).not.toBeInTheDocument();
    });

    it("el medidor y Ramificación pintan la misma lista por causa", () => {
        const medidor = render(<BloqueadasGrupos detalle={detalle} />);
        expect(screen.getByText("El intento no tocó sus archivos")).toBeInTheDocument();
        expect(screen.getByText("F1")).toBeInTheDocument();
        medidor.unmount();

        render(<SeccionBloqueadasReintentos olas={[]} onVer={() => {}} onHecho={() => {}} detalle={detalle} />);
        expect(screen.getByText("El intento no tocó sus archivos")).toBeInTheDocument();
        expect(screen.getByText("F1")).toBeInTheDocument();
    });
});
