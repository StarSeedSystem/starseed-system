import { describe, it, expect } from "vitest";
import {
    NOMBRES_CANALES_POR_DEFECTO,
    esNombreCanonico,
    nombreDeCanal,
} from "../canales-nombres";

describe("canales-nombres", () => {
    it("usa los tres nombres canónicos cuando no hay registro", () => {
        expect(NOMBRES_CANALES_POR_DEFECTO).toEqual({
            principal: "Principal",
            general: "General",
            audiovisual: "Audiovisual y diseño",
        });
        expect(nombreDeCanal("principal", null)).toBe("Principal");
        expect(nombreDeCanal("general", {})).toBe("General");
        expect(nombreDeCanal("audiovisual")).toBe("Audiovisual y diseño");
    });

    it("lee el nombre del registro y recorta los espacios", () => {
        const registro = {
            principal: { nombre: "  Principal  " },
            general: { nombre: "General" },
            audiovisual: { nombre: "  Audiovisual   y diseño " },
        };
        expect(nombreDeCanal("principal", registro)).toBe("Principal");
        expect(nombreDeCanal("audiovisual", registro)).toBe("Audiovisual y diseño");
    });

    it("cae al canónico si el registro trae vacío o algo que no es texto", () => {
        expect(nombreDeCanal("general", { general: { nombre: "   " } })).toBe("General");
        expect(nombreDeCanal("principal", { principal: { nombre: 42 } })).toBe("Principal");
        expect(nombreDeCanal("audiovisual", { audiovisual: { nombre: null } })).toBe(
            "Audiovisual y diseño",
        );
    });

    it("compara nombres sin distinguir mayúsculas ni espacios repetidos", () => {
        expect(esNombreCanonico("principal", "  principal ")).toBe(true);
        expect(esNombreCanonico("audiovisual", "Audiovisual   y diseño")).toBe(true);
        expect(esNombreCanonico("general", "Maggacortex")).toBe(false);
        expect(esNombreCanonico("general", null)).toBe(false);
    });
});
