/**
 * Botones de cada neurona en MetaGenesis (desconectar y contenedor): los casos que
 * venían en la rama de la nube y que las pruebas de `colmena.test.ts` no fijaban.
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena } from "../../../lib/metagenesis/colmena";

describe("botonesNeurona: desconectar y contenedor", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 } as NeuronaColmena);
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
        } as NeuronaColmena);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
});
