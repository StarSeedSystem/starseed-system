/**
 * Los botones de una neurona de la colmena (COL1012): qué deja hacer «Desconectar» según el
 * trabajo en curso y el contenedor. Rescate de la rama de la nube
 * nube/a1-20261013-095951-RTCOL1012Ae: las combinaciones que colmena.test.ts no fija — cada
 * disyuntiva de `trabajo` (agentes en curso, contenedor activo) comprobada por separado.
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";

const MAC: NeuronaColmena = { nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 };

describe("colmena · botones de una neurona", () => {
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

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ ...MAC, enCurso: 1 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
});
