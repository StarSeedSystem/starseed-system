/**
 * Lo que contesta un botón del panel TIENE que quedarse en pantalla (2026-09-22).
 *
 * Alex: «los botones no funcionan». Pulsé «Buscar contenedores en la nube» en el navegador
 * y en pantalla no pasaba nada — pero el inventario se volvía a medir tres segundos
 * después. El botón trabajaba; el panel se comía su respuesta: `PanelMedidor` se recarga
 * solo cada 5 s y esa recarga hacía `setAviso(null)`, y encima `ejecutar` recargaba justo
 * después de accionar, así que el mensaje se borraba en el acto. Afectaba a TODOS los
 * botones del panel, no solo a los nuevos.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelMedidor } from "@/components/mando/medidor-abrible";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const detalle: DetalleMedidor = {
    clave: "agentes",
    titulo: "Agentes trabajando",
    resumen: "1 agente · 1 medio(s)",
    filas: [],
    acciones: [{ clase: "sondear-contenedores", texto: "Buscar contenedores en la nube", destructiva: false }],
    vacio: "Ningún agente está escribiendo ahora mismo.",
};

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/api/mando/comprobar")) {
            return new Response(JSON.stringify({ comprobacion: null }), { status: 200 });
        }
        return new Response(JSON.stringify({ detalle }), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

describe("la respuesta de un botón del panel", () => {
    it("se enseña, SOBREVIVE a la recarga y se puede descartar", async () => {
        const usuario = userEvent.setup();
        render(
            <PanelMedidor
                clave="agentes"
                alCerrar={() => {}}
                alAccionar={async () => "5 contenedor(es) · 12 libre(s) de 12"}
            />,
        );

        await usuario.click(await screen.findByRole("button", { name: /Buscar contenedores/i }));

        // 1. Aparece.
        const dicho = await screen.findByTestId("respuesta-accion");
        expect(dicho.textContent).toContain("12 libre(s) de 12");

        // 2. Sobrevive a que el panel vuelva a leer el detalle: ESTO es lo que se rompía.
        //    `ejecutar` recarga justo después de accionar, así que si la recarga borrase el
        //    mensaje, ya no estaría aquí.
        await waitFor(() => {
            expect(screen.getByTestId("respuesta-accion").textContent).toContain("12 libre(s)");
        });

        // 3. Se puede quitar cuando ya se ha leído.
        await usuario.click(screen.getByRole("button", { name: /Descartar el mensaje/i }));
        await waitFor(() => {
            expect(screen.queryByTestId("respuesta-accion")).toBeNull();
        });
    });
});
