import { describe, expect, it } from "vitest";
import { colorDe, colorPorDefecto, colorValido } from "../color-publico";

describe("CTL1117H · color público de neurona", () => {
    it("los mismos cinco ids dan los mismos cinco colores que Rust (control_ajustes.rs)", () => {
        for (const [id, c] of [
            ["tableta", "#ddc23c"],
            ["mac-alex", "#dd3cd2"],
            ["neurona-1", "#3c9fdd"],
            ["b49724b6", "#3cddb2"],
            ["ñandú", "#5fdd3c"],
        ] as const) {
            expect(colorPorDefecto(id), id).toBe(c);
            expect(colorValido(c)).toBe(true);
        }
    });
    it("solo vale #rrggbb en minúsculas; si no, el del id", () => {
        for (const malo of ["#12ABEF", "12abef", "#12abe", "#12abefg", "", undefined, 3, null]) expect(colorValido(malo)).toBe(false);
        expect(colorDe("tableta", "#12abef")).toBe("#12abef");
        expect(colorDe("tableta", "rojo")).toBe("#ddc23c");
        expect(colorDe("tableta")).toBe("#ddc23c");
    });
});
