import { describe, it, expect } from "vitest";

import { normalizarRemoto, parsearLogGit } from "@/lib/mando/reportes-servidor";

const C = "\x1f";
const R = "\x1e";

describe("parsearLogGit", () => {
    it("parsea un commit de una línea", () => {
        const salida = `abc1234${C}asunto corto${C}${C}2026-09-20T10:00:00Z${R}`;
        const r = parsearLogGit(salida);
        expect(r).toHaveLength(1);
        expect(r[0].sha).toBe("abc1234");
        expect(r[0].asunto).toBe("asunto corto");
        expect(r[0].cuerpo).toBeNull();
        expect(r[0].fecha).toBe("2026-09-20T10:00:00Z");
    });

    it("tolera cuerpos multi-línea sin perder la fecha", () => {
        // El fallo del intento anterior: %b con saltos de línea partía el
        // registro y el commit se iba sin fecha. Con \x1e sobrevive entero.
        const salida =
            `abc1234${C}asunto${C}primera línea\nsegunda línea\n${C}2026-09-20T10:00:00Z${R}` +
            `def5678${C}otro${C}${C}2026-09-21T08:00:00Z${R}`;
        const r = parsearLogGit(salida);
        expect(r).toHaveLength(2);
        expect(r[0].cuerpo).toBe("primera línea\nsegunda línea");
        expect(r[0].fecha).toBe("2026-09-20T10:00:00Z");
        expect(r[1].sha).toBe("def5678");
    });

    it("descarta registros sin sha o sin fecha válida", () => {
        const mala = `noshadin${C}asunto${C}${C}2026-09-20T10:00:00Z${R}`;
        const sinFecha = `abc1234${C}asunto${C}${C}no-es-fecha${R}`;
        expect(parsearLogGit(mala + sinFecha)).toHaveLength(0);
    });

    it("devuelve lista vacía con salida vacía o rota", () => {
        expect(parsearLogGit("")).toEqual([]);
        expect(parsearLogGit("basura sin separadores")).toEqual([]);
    });
});

describe("normalizarRemoto", () => {
    it("convierte ssh con dos puntos a https sin .git", () => {
        expect(normalizarRemoto("git@github.com:Org/repo.git")).toBe("https://github.com/Org/repo");
    });

    it("acepta ssh:// y https ya normalizadas", () => {
        expect(normalizarRemoto("ssh://git@github.com/Org/repo")).toBe("https://github.com/Org/repo");
        expect(normalizarRemoto("https://github.com/Org/repo.git")).toBe("https://github.com/Org/repo");
    });

    it("devuelve null ante vacío o formato irreconocible", () => {
        expect(normalizarRemoto("")).toBeNull();
        expect(normalizarRemoto("  ")).toBeNull();
        expect(normalizarRemoto("no-es-una-url")).toBeNull();
    });
});
