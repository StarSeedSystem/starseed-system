import { describe, it, expect } from "vitest";
import {
    ORDEN_CANALES_ESPECIALIZADOS,
    PERFILES_CANALES,
    PERFILES_PESTANAS_DIRECCION,
    canalPorPuenteAstraura,
    canalesEspecializadosOrdenados,
    perfilDeCanal,
    perfilDePestana,
} from "../canales-especializados";

describe("canales-especializados", () => {
    it("define exactamente los tres canales especializados de dirección", () => {
        expect(ORDEN_CANALES_ESPECIALIZADOS).toEqual([
            "principal",
            "general",
            "audiovisual",
        ]);
        const lista = canalesEspecializadosOrdenados();
        expect(lista.map((c) => c.id)).toEqual(["principal", "general", "audiovisual"]);
        expect(lista.map((c) => c.botTelegram)).toEqual([
            "@starseed_neurocortex_bot",
            "@starseed_puente_bot",
            "@StarSeed_Design_bot",
        ]);
    });

    it("separa los bots y puentes Astraura de cada canal sin mezclarlos", () => {
        expect(perfilDeCanal("principal").puenteAstraura).toBe("genesis");
        expect(perfilDeCanal("general").puenteAstraura).toBe("hermes-avisos");
        expect(perfilDeCanal("audiovisual").puenteAstraura).toBe("peticiones");

        expect(canalPorPuenteAstraura("genesis")?.id).toBe("principal");
        expect(canalPorPuenteAstraura("hermes-avisos")?.id).toBe("general");
        expect(canalPorPuenteAstraura("peticiones")?.id).toBe("audiovisual");
        expect(canalPorPuenteAstraura("avisos-directores")).toBeNull();
    });

    it("incluye diseño profesional, audiovisual, NotebookLM y promoción/contactos con reglas en el canal audiovisual", () => {
        const av = PERFILES_CANALES.audiovisual;
        const ids = av.herramientas.map((h) => h.id);
        expect(ids).toContain("stitch");
        expect(ids).toContain("awesome-design");
        expect(ids).toContain("higgsfield");
        expect(ids).toContain("motion");
        expect(ids).toContain("blender");
        expect(ids).toContain("notebooklm");
        expect(ids).toContain("alcance");
        expect(ids).toContain("metageminis");

        const higgsfield = av.herramientas.find((h) => h.id === "higgsfield");
        const alcance = av.herramientas.find((h) => h.id === "alcance");
        expect(higgsfield?.regla).toMatch(/aprobaci[oó]n/i);
        expect(alcance?.regla).toMatch(/SHA-256/i);
    });

    it("provee perfil adaptativo para las seis pestañas de dirección", () => {
        const claves = Object.keys(PERFILES_PESTANAS_DIRECCION);
        expect(claves).toEqual([
            "todo",
            "direccion",
            "conversacion",
            "informes",
            "enjambre",
            "usos",
        ]);
        for (const vista of claves as Array<keyof typeof PERFILES_PESTANAS_DIRECCION>) {
            const p = perfilDePestana(vista);
            expect(p.titulo.length).toBeGreaterThan(3);
            expect(p.herramientas.length).toBeGreaterThan(0);
            expect(p.atajos.length).toBeGreaterThan(0);
        }
    });
});
