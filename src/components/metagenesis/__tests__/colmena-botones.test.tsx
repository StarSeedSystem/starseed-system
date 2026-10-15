import { describe, expect, it } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

/*
 * Casos rescatados de la rama nube (RTCOL1012B) que main todavía no cubre:
 * el botón «Desconectar» se habilita por el contenedor activo aun sin agentes en curso,
 * y la confirmación del contenedor cuando hay trabajo.
 */

describe("colmena-botones", () => {
    it("con contenedor activo y sin trabajo en curso, desconectar está habilitado", () => {
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

    it("con trabajo en curso y contenedor activo, ambos botones piden confirmación", () => {
        const b = botonesNeurona({
            nodo: "mac-a1b2c3",
            vivo: true,
            so: "macos",
            enCurso: 1,
            contenedor: { activo: true, agentes: 2, apto: true, motivo: "" },
        });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, confirmar: true });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.contenedor).toMatchObject({
            visible: true,
            habilitado: true,
            etiqueta: "Dejar de usar como contenedor",
            confirmar: true,
        });
    });
});
