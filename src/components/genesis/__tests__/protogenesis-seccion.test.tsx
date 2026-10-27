import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("ProtoGenesis secciones en archivos editados", () => {
    const miGenesis = readFileSync("src/components/genesis/mi-genesis.tsx", "utf-8");
    const poliGenesis = readFileSync("src/components/genesis/poligenesis.tsx", "utf-8");

    it("Mi Genesis contiene el texto explicativo y PanelProtoGenesis", () => {
        expect(miGenesis).toContain("La génesis de cada creación");
        expect(miGenesis).toContain("PanelProtoGenesis");
        expect(miGenesis).toContain("Ver ProtoGenesis");
        expect(miGenesis).toContain("protoGenesis-encargos");
    });

    it("PoliGenesis contiene el texto explicativo, GobiernoProtoResumen y PanelProtoGenesis", () => {
        expect(poliGenesis).toContain("La génesis de cada creación");
        expect(poliGenesis).toContain("GobiernoProtoResumen");
        expect(poliGenesis).toContain("PanelProtoGenesis");
        expect(poliGenesis).toContain("Ver ProtoGenesis");
        expect(poliGenesis).toContain("protoGenesis-encargos");
    });
});
