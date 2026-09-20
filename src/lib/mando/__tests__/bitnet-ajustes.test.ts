import { describe, it, expect } from "vitest";
import {
    AJUSTES_BITNET_DEFECTO,
    aEntorno,
    desdeEntorno,
    recomendarPorHardware,
    validar,
} from "../bitnet-ajustes";

describe("bitnet-ajustes", () => {
    it("validar maneja objetos nulos, incompletos y valores fuera de rango", () => {
        expect(validar(null)).toEqual(AJUSTES_BITNET_DEFECTO);
        expect(validar({})).toEqual(AJUSTES_BITNET_DEFECTO);
        const valido = validar({
            ctx: 4096,
            paralelo: 2,
            servidores: "dual",
            suenoMin: 30,
            hilos: 8,
            nodo: "local",
            dormirSiSwapGb: 16,
        });
        expect(valido.ctx).toBe(4096);
        expect(valido.servidores).toBe("dual");
    });

    it("recomendarPorHardware aplica reglas de 8 GB, 16 GB y nube 2 CPU", () => {
        const r8 = recomendarPorHardware({ ramGb: 8, cpu: 4 });
        expect(r8.ctx).toBe(2048);
        expect(r8.paralelo).toBe(1);
        expect(r8.servidores).toBe("shared");
        expect(r8.dormirSiSwapGb).toBe(8);

        const r16 = recomendarPorHardware({ ramGb: 16, cpu: 8 });
        expect(r16.ctx).toBe(4096);
        expect(r16.paralelo).toBe(2);
        expect(r16.servidores).toBe("dual");

        const rNube = recomendarPorHardware({ ramGb: 4, cpu: 2, esNube: true });
        expect(rNube.ctx).toBe(2048);
        expect(rNube.paralelo).toBe(1);
        expect(rNube.servidores).toBe("shared");
    });

    it("aEntorno y desdeEntorno realizan ida y vuelta sin pérdida de datos", () => {
        const original = {
            ctx: 4096 as const,
            paralelo: 2 as const,
            servidores: "dual" as const,
            suenoMin: 20,
            hilos: 6,
            nodo: "local" as const,
            dormirSiSwapGb: 12,
        };

        const env = aEntorno(original);
        expect(env.ASTRAURA_BITNET_CTX).toBe("4096");
        expect(env.ASTRAURA_BITNET_PAR).toBe("2");
        expect(env.ASTRAURA_BITNET_SERVIDORES).toBe("dual");

        const recuperado = desdeEntorno(env);
        expect(recuperado).toEqual(original);
    });
});
