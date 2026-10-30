import { describe, expect, it } from "vitest";

import {
    CONTRATO_1027,
    FICHAS_REPOS_1027,
    IDS_SIEMBRA_1027,
    FICHAS_REPOS_MBT1027,
    IDS_SIEMBRA_MBT1027,
} from "../repos-1027";

const porId = (id: string) => FICHAS_REPOS_1027.find((p) => p.id === id)!;

describe("tanda mbt1027 · MBT1027 (Mausbot de Astraura)", () => {
    it("tiene exactamente 1 ficha", () => {
        expect(FICHAS_REPOS_MBT1027).toHaveLength(1);
    });

    it("la ficha se siembra por defecto y el contrato es el de Mausbot", () => {
        expect(IDS_SIEMBRA_MBT1027).toEqual(["mbt1027-mausbot"]);
        expect(CONTRATO_1027).toBe("architecture/mausbot-astraura.md");
    });

    it("el id está como mbt1027-mausbot y es tipo herramienta", () => {
        expect(porId("mbt1027-mausbot").id).toBe("mbt1027-mausbot");
        expect(porId("mbt1027-mausbot").kind).toBe("tool");
    });

    it("el upstream es el GitHub del origen", () => {
        expect(porId("mbt1027-mausbot").payload.upstream).toBe("https://github.com/mawih/Mausbot-Astraura");
    });

    it("el efecto es ADAPTACIÓN-ABRIEGA", () => {
        expect(porId("mbt1027-mausbot").payload.efecto).toBe("ADAPTACIÓN-ABRIEGA");
    });

    it("correr_aqui es falso (no se ejecuta aquí)", () => {
        expect(porId("mbt1027-mausbot").payload.corre_aqui).toBe(false);
    });

    it("la descripción lo llama Mausbot de Astraura", () => {
        expect(porId("mbt1027-mausbot").name).toBe("MBT1027 · cursor con cara que actúa (Mausbot de Astraura)");
        expect(porId("mbt1027-mausbot").description).toContain("Mausbot de Astraura");
    });
});