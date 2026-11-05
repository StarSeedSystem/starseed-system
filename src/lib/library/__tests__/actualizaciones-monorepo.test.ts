import { describe, expect, it } from "vitest";

import { compararVersiones } from "../actualizaciones";

// (1104 · AI) Los monorepos etiquetan «paquete@versión»: OpenUI («@openuidev/react-lang@1.1.0») y
// Cloudflare Computer («@cloudflare/computer@0.9.0») quedaban siempre en «desconocida».
describe("compararVersiones · etiquetas de monorepo", () => {
    it("misma versión con el nombre del paquete delante → igual", () => {
        expect(compararVersiones("1.1.0", "@openuidev/react-lang@1.1.0")).toBe("igual");
    });

    it("versión remota mayor → hay actualización (con y sin ámbito)", () => {
        expect(compararVersiones("0.7.0", "@cloudflare/computer@0.9.0")).toBe("hay-actualizacion");
        expect(compararVersiones("1.0.0", "paquete@1.2.0")).toBe("hay-actualizacion");
    });

    it("local más nueva o igual con ceros → igual", () => {
        expect(compararVersiones("2.0.0", "@scope/pkg@1.9.9")).toBe("igual");
        expect(compararVersiones("v1.2", "@scope/pkg@1.2.0")).toBe("igual");
    });

    it("lo de antes sigue igual: v-prefijo, release- y shas", () => {
        expect(compararVersiones("v5.2.9", "v5.2.10")).toBe("hay-actualizacion");
        expect(compararVersiones("5.2.3", "release-5.2.3")).toBe("igual");
        expect(compararVersiones("1.0.0", "a1b2c3d")).toBe("desconocida");
    });
});
