/**
 * Botones de una neurona en MetaGenesis (rescate de la rama nube/38500780177): los casos que
 * main no cubre en src/lib/metagenesis/__tests__/colmena.test.ts — el contrato completo del
 * botón «Desconectar» sin trabajo en curso, y que un contenedor activo lo habilita solo.
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

describe("colmena-botones", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
});
