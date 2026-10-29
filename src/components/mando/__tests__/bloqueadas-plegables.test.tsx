/**
 * (UIG1029C) «Bloqueadas y rechazadas» por causa: una sección plegable por causa,
 * abierta solo la que más tareas tiene, con su número y la reparación automática
 * que la trata; «Cerrar lista» arriba; la misma vista en el medidor y en Ramificación.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    BloqueadasGrupos,
    accionAutomaticaDeFila,
    agruparBloqueadasPorCausa,
    causaDeFila,
} from "@/components/mando/bloqueadas-grupos";
import { SeccionBloqueadasReintentos } from "@/components/mando/ramificacion-agentes";
import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

function fila(
    id: string,
    estado: string,
    porque: string,
    grupo: FilaMedidor["grupo"] = "atascada",
): FilaMedidor {
    return { id, titulo: `tarea ${id}`, estado, porque, grupo, acciones: [] };
}

const detalle: DetalleMedidor = {
    clave: "bloqueadas",
    titulo: "Bloqueadas",
    resumen: "5 paradas",
    acciones: [],
    filas: [
        fila("TSC1", "fallo_tsc", "tsc rojo"),
        fila("TSC2", "fallo_tsc", "tsc rojo"),
        fila("TSC3", "fallo_tsc", "tsc rojo"),
        fila("CAM1", "sin_cambios", "la rehace CAM1b (en_curso)", "sin-resolver"),
        fila("BLOQ1", "bloqueante", "la escalera del director la reintenta (intento 1 de 2)"),
    ],
    bloqueadas: {
        valor: 5,
        enCadena: 0,
        atascadas: 4,
        alex: 0,
        transformadasHoy: 0,
        sinResolver: 1,
        sinResolverEnMarcha: 1,
        pastilla: "4 atascadas · 1 sin resolver · ábrelo para ver por qué",
        texto: "5 paradas",
        textoCadena: "ninguna tarea espera a otra",
        cadenas: [],
        transformadas: [],
        preguntas: [],
        revisorAlDia: false,
    },
};

describe("por causa (puro)", () => {
    it("traduce el estado a una causa legible", () => {
        expect(causaDeFila({ estado: "fallo_tsc" })).toBe("Fallo de TypeScript");
        expect(causaDeFila({ estado: "sin_cambios" })).toBe("No tocó sus archivos");
        expect(causaDeFila({ estado: "bloqueante" })).toBe("Revisión bloqueante");
        expect(causaDeFila({ estado: "" })).toBe("Causa sin anotar");
    });

    it("dice qué reparación automática la está tratando", () => {
        expect(accionAutomaticaDeFila({ porque: "la rehace CAM1b (en_curso)" })).toBe(
            "La rehace CAM1b (en_curso)",
        );
        expect(
            accionAutomaticaDeFila({
                porque: "la escalera del director la reintenta (intento 1 de 2) · nota",
            }),
        ).toContain("escalera del director");
        expect(accionAutomaticaDeFila({ porque: "tsc rojo" })).toBeNull();
    });

    it("agrupa, cuenta y ordena por número de tareas", () => {
        const grupos = agruparBloqueadasPorCausa(detalle.filas);
        expect(grupos[0].causa).toBe("Fallo de TypeScript");
        expect(grupos[0].filas).toHaveLength(3);
        expect(grupos[0].accion).toBeUndefined();
        expect(grupos.find((g) => g.causa === "No tocó sus archivos")?.accion).toContain("La rehace");
    });
});

describe("BloqueadasGrupos plegable por causa", () => {
    it("abre solo la causa con más tareas y deja las demás con su resumen", () => {
        render(<BloqueadasGrupos detalle={detalle} />);
        const tsc = screen.getByRole("region", { name: "Fallo de TypeScript" });
        expect(within(tsc).getByText("TSC1")).toBeInTheDocument();

        const cambios = screen.getByRole("region", { name: "No tocó sus archivos" });
        expect(within(cambios).queryByText("CAM1")).not.toBeInTheDocument();
        expect(within(cambios).getByText("1 tarea · La rehace CAM1b (en_curso)")).toBeInTheDocument();

        const bloqueante = screen.getByRole("region", { name: "Revisión bloqueante" });
        expect(within(bloqueante).queryByText("BLOQ1")).not.toBeInTheDocument();
    });

    it("«Cerrar lista» arriba cierra todas las causas y «Abrir lista» las vuelve a abrir", () => {
        render(<BloqueadasGrupos detalle={detalle} />);
        const cerrar = screen.getByTestId("bloqueadas-cerrar-lista");
        expect(cerrar).toHaveTextContent("Cerrar lista");

        fireEvent.click(cerrar);
        expect(screen.queryByText("TSC1")).not.toBeInTheDocument();
        expect(screen.getByText("3 tareas · sin reparación automática")).toBeInTheDocument();
        expect(screen.getByTestId("bloqueadas-cerrar-lista")).toHaveTextContent("Abrir lista");

        fireEvent.click(screen.getByTestId("bloqueadas-cerrar-lista"));
        expect(screen.getByText("TSC1")).toBeInTheDocument();
    });

    it("la misma vista se pinta en el medidor y en Ramificación", () => {
        const primera = render(<BloqueadasGrupos detalle={detalle} />);
        expect(screen.getByRole("region", { name: "Fallo de TypeScript" })).toBeInTheDocument();
        primera.unmount();

        render(
            <SeccionBloqueadasReintentos
                olas={[]}
                onVer={() => undefined}
                onHecho={() => undefined}
                detalle={detalle}
            />,
        );
        const seccion = screen.getByTestId("seccion-bloqueadas-reintentos");
        expect(within(seccion).getByRole("region", { name: "Fallo de TypeScript" })).toBeInTheDocument();
        expect(within(seccion).getByTestId("bloqueadas-cerrar-lista")).toBeInTheDocument();
    });
});
