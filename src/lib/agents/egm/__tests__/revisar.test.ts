import { describe, it, expect } from "vitest";
import { TipoArtefacto, revisarConPeces } from "../revisar";

describe("revisarConPeces", () => {
    it("debe pasar si ningún pez tiene objeciones", async () => {
        const llamarMock = async (modelo: string, prompt: string) => "ninguna| ";
        const resultado = await revisarConPeces("artefacto", {
            tipo: "respuesta",
            llamar: llamarMock,
            modelos: ["modelo1", "modelo2"],
            n: 2,
            plazoMs: 1000,
        });

        expect(resultado.pasa).toBe(true);
        expect(resultado.objeciones).toHaveLength(0);
    });

    it("debe bloquear si un pez encuentra objeciones bloqueantes", async () => {
        const llamarMock = async (modelo: string, prompt: string) => {
            if (modelo === "modelo1") return "bloquea| Error critico";
            return "ninguna| ";
        };
        const resultado = await revisarConPeces("artefacto", {
            tipo: "respuesta",
            llamar: llamarMock,
            modelos: ["modelo1", "modelo2"],
            n: 2,
            plazoMs: 1000,
        });

        expect(resultado.pasa).toBe(false);
        expect(resultado.objeciones.some(o => o.gravedad === "bloquea")).toBe(true);
    });
});
