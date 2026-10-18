// @vitest-environment-options {"url": "https://starseed-os.vercel.app"}
/**
 * BotonesNeurona · los botones que ve una neurona en /metagenesis y en Neuronas.
 * Colmena (COL1012): los botones que se pintan para un aparato (como si fuera una neurona): «Desconectar», «Usar como contenedor», «Instalar el trabajador».
 * Pura: las entradas son del sistema (la mac y lo que está en curso) y del navegador (versión del SO y memoria).
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena, type SO } from "@/lib/metagenesis/colmena";

describe("botonesNeurona", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 0,
        });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 0,
            contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
        });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 1,
        });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
});