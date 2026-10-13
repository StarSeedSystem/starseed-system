import { describe, expect, it } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

// Rescate de la rama de la nube: dos huecos que main no cubría en `botonesNeurona`.

describe("colmena · botones · casos rescatados", () => {
    it("sin trabajo ni contenedor, Desconectar se ve pero no se puede pulsar", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("contenedor activo sin trabajo propio basta para habilitar Desconectar", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 0,
            contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
        });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, confirmar: false });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
});
