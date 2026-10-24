import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarFallo } from "../daemon";

describe("registrarFallo", () => {
    afterEach(() => vi.restoreAllMocks());

    it("registra contexto y tipo sin propagar el mensaje del error", () => {
        const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        registrarFallo("mundo-avatares.perfiles", new Error("dato privado"));

        expect(aviso).toHaveBeenCalledWith("[avatares] fallo", {
            contexto: "mundo-avatares.perfiles",
            error: "Error",
        });
        expect(JSON.stringify(aviso.mock.calls)).not.toContain("dato privado");
    });
});
