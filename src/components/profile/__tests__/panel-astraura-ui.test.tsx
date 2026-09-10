import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { PanelAstrauraUi, type ActorUi } from "../panel-astraura-ui";
import { CLAVE_PERMISOS_UI, leerPermisos } from "@/lib/astraura/ui-permisos";
import type { AccionUi } from "@/lib/astraura/ui-acciones";
import type { EntradaBitacora } from "@/lib/astraura/ui-aplicador";

/**
 * El panel es la ventana del usuario sobre lo que la IA puede tocar: aquí se
 * comprueba que se pinta, que mover el nivel de un actor QUEDA GUARDADO (si no
 * persiste, revocar no significa nada) y que «Deshacer» llama al aplicador.
 */

// Reloj fijo: la caducidad de los permisos no puede depender del día del test.
const AHORA = 1_700_000_000_000;

const AURORA: ActorUi = {
    actor: "agente:aurora",
    nombre: "Aurora",
    descripcion: "Ajusta el fondo según lo que estés leyendo",
};

const PROPUESTA_DESTRUCTIVA: AccionUi = {
    tipo: "apariencia",
    ambito: "cuenta",
    parche: { styling: { radius: 20 } },
    motivo: "unificar el radio en todos tus perfiles",
    actor: "agente:aurora",
};

const ENTRADA: EntradaBitacora = {
    id: "e1",
    at: AHORA - 60_000,
    actor: "agente:aurora",
    tipo: "fondo",
    ambito: "perfil",
    ambitoId: "p1",
    motivo: "estabas leyendo de noche",
    resumen: "fondo: nebulosa → aurora",
    inverso: { background: { value: "nebulosa" } },
};

afterEach(() => {
    cleanup();
    window.localStorage.removeItem(CLAVE_PERMISOS_UI);
});

describe("PanelAstrauraUi · se pinta", () => {
    it("sin nada que gobernar explica qué es y qué se gana", () => {
        render(<PanelAstrauraUi ahora={AHORA} />);

        expect(screen.getByTestId("panel-astraura-ui")).toBeInTheDocument();
        expect(screen.getByTestId("panel-astraura-vacio")).toBeInTheDocument();
    });

    it("pinta el actor con su nivel de fábrica y sus tipos", () => {
        render(<PanelAstrauraUi actores={[AURORA]} ahora={AHORA} />);

        expect(screen.getByTestId("actor-agente:aurora")).toBeInTheDocument();
        expect(screen.getByText("Aurora")).toBeInTheDocument();
        // Reparto de fábrica: propone, no aplica.
        expect(screen.getByTestId("nivel-agente:aurora-proponer")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.queryByTestId("panel-astraura-vacio")).not.toBeInTheDocument();
    });

    it("avisa antes de aplicar una propuesta destructiva", () => {
        render(
            <PanelAstrauraUi propuestas={[PROPUESTA_DESTRUCTIVA]} ahora={AHORA} />,
        );

        expect(screen.getByTestId("propuesta-destructiva-0")).toBeInTheDocument();
        expect(screen.getByTestId("aplicar-0")).toBeInTheDocument();
        expect(screen.getByTestId("descartar-0")).toBeInTheDocument();
    });
});

describe("PanelAstrauraUi · mandar de verdad", () => {
    it("subir el nivel de un actor lo guarda en los permisos", async () => {
        const usuario = userEvent.setup();
        render(<PanelAstrauraUi actores={[AURORA]} ahora={AHORA} />);

        await usuario.click(screen.getByTestId("nivel-agente:aurora-aplicar"));

        const guardados = leerPermisos();
        expect(guardados).toHaveLength(1);
        expect(guardados[0].actor).toBe("agente:aurora");
        expect(guardados[0].nivel).toBe("aplicar");
        expect(screen.getByTestId("nivel-agente:aurora-aplicar")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("apagar un tipo lo quita del permiso guardado", async () => {
        const usuario = userEvent.setup();
        render(<PanelAstrauraUi actores={[AURORA]} ahora={AHORA} />);

        await usuario.click(screen.getByTestId("tipo-agente:aurora-fondo"));

        const guardados = leerPermisos();
        expect(guardados[0].tipos).not.toContain("fondo");
        expect(guardados[0].tipos).toContain("tipografia");
    });

    it("«Deshacer» llama al aplicador con la entrada de la bitácora", async () => {
        const usuario = userEvent.setup();
        const alDeshacer = vi.fn();
        render(
            <PanelAstrauraUi bitacora={[ENTRADA]} alDeshacer={alDeshacer} ahora={AHORA} />,
        );

        expect(screen.getByText("fondo: nebulosa → aurora")).toBeInTheDocument();
        await usuario.click(screen.getByTestId("deshacer-e1"));

        expect(alDeshacer).toHaveBeenCalledTimes(1);
        expect(alDeshacer).toHaveBeenCalledWith(ENTRADA);
    });
});
