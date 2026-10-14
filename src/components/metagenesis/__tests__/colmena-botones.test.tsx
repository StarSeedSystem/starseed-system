// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * Colmena · botones de una neurona en la web (COL1012): el contrato de «Desconectar» en los tres
 * rincones de `trabajo = enCurso > 0 || contenedor.activo` — sin nada en curso, con el trabajo solo
 * en el contenedor y con agentes en marcha sin contenedor. Rescate de la rama nube/38618241797,
 * adaptado a la API de hoy (`botonesNeurona` de `@/lib/metagenesis/colmena`).
 */
import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";

const NEURONA: NeuronaColmena = { nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 0 };

describe("colmena-botones · desconectar según el trabajo en curso", () => {
    it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
        const b = botonesNeurona(NEURONA);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
        expect(b.desconectar.confirmar).toBe(false);
    });

    it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
        const b = botonesNeurona({ ...NEURONA, contenedor: { activo: true, agentes: 3, apto: true, motivo: "" } });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
    });

    it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
        const b = botonesNeurona({ ...NEURONA, enCurso: 1 });
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
        expect(b.desconectar.explica).toContain("1 agente");
        expect(b.desconectar.confirmar).toBe(true);
    });
});
