/**
 * Casos rescatados de la rama nube/a1-20261014-085445 para los botones de una neurona de la
 * colmena (COL1012): el contrato de «Desconectar» según el trabajo en curso y el contenedor.
 * Adaptados a la API de hoy: `botonesNeurona` vive en src/lib/metagenesis/colmena.ts.
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";

describe("colmena · botones de desconectar y contenedor", () => {
    const MAC: NeuronaColmena = { nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 };

    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona(MAC);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ ...MAC, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("con trabajo en curso de 1 agente, desconectar se habilita y pide confirmación", () => {
        const b = botonesNeurona({ ...MAC, enCurso: 1 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
});
