import { describe, expect, it } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

describe("colmena-botones · botones de una neurona (rescatado de rama nube/38843736821)", () => {
    // Casos descartados (ya cubiertos en src/lib/metagenesis/__tests__/colmena.test.ts):
    // - "sin trabajo en curso, desconectar deshabilitado" (contrato igual con enCurso=0, cubierto allí).
    // - "trabajo en curso con 1 agente" (mismo contrato que con 3 agentes, cubierto allí).
    // Se conserva solo el caso que cubre un comportamiento que main no cubre: contenedor activo con enCurso=0.

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });
});