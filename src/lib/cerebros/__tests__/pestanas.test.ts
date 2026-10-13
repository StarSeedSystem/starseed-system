import { describe, expect, it } from "vitest";
import {
    alcanceParaEntidad,
    cerebrosDePestana,
    cuentaPorPestana,
    pestanaDeCerebro,
    pestanaDesdeUrl,
    pestanaInicial,
} from "../pestanas";

const cerebros = [
    { id: "a", scope: "account" },
    { id: "p", scope: "profile" },
    { id: "g", scope: "group" },
    { id: "c", scope: "community" },
    { id: "w", scope: "page" },
    { id: "x", scope: "" },
    { id: "y", scope: "raro" },
    { id: "n", scope: null },
];

describe("pestañas de cerebros", () => {
    it("cuentas y perfiles son privados; grupos, comunidades y páginas son públicos", () => {
        expect(pestanaDeCerebro({ scope: "account" })).toBe("privados");
        expect(pestanaDeCerebro({ scope: "profile" })).toBe("privados");
        expect(pestanaDeCerebro({ scope: "group" })).toBe("publicos");
        expect(pestanaDeCerebro({ scope: "community" })).toBe("publicos");
        expect(pestanaDeCerebro({ scope: "PAGE" })).toBe("publicos");
    });

    it("un alcance vacío o desconocido no se esconde: va a privados", () => {
        expect(pestanaDeCerebro({ scope: "" })).toBe("privados");
        expect(pestanaDeCerebro({ scope: null })).toBe("privados");
        expect(pestanaDeCerebro({})).toBe("privados");
        expect(pestanaDeCerebro({ scope: "raro" })).toBe("privados");
    });

    it("filtra y cuenta sin perder ninguno", () => {
        expect(cerebrosDePestana(cerebros, "privados").map((c) => c.id)).toEqual(["a", "p", "x", "y", "n"]);
        expect(cerebrosDePestana(cerebros, "publicos").map((c) => c.id)).toEqual(["g", "c", "w"]);
        expect(cuentaPorPestana(cerebros)).toEqual({ privados: 5, publicos: 3 });
    });

    it("lee la pestaña de la URL", () => {
        expect(pestanaDesdeUrl("?vista=publicos")).toBe("publicos");
        expect(pestanaDesdeUrl("?vista=p%C3%BAblicos")).toBe("publicos");
        expect(pestanaDesdeUrl("?vista=privados&tab=memoria")).toBe("privados");
        expect(pestanaDesdeUrl("?vista=otra")).toBeNull();
        expect(pestanaDesdeUrl("")).toBeNull();
    });

    it("elige la pestaña inicial: URL, luego el cerebro pedido, luego la que tenga cerebros", () => {
        expect(pestanaInicial(cerebros, "publicos", "a")).toBe("publicos");
        expect(pestanaInicial(cerebros, null, "g")).toBe("publicos");
        expect(pestanaInicial(cerebros, null, null)).toBe("privados");
        expect(pestanaInicial([{ id: "g", scope: "group" }], null, null)).toBe("publicos");
        expect(pestanaInicial([], null, null)).toBe("privados");
    });

    it("crea cerebros públicos con el alcance de su entidad", () => {
        expect(alcanceParaEntidad("pagina")).toBe("page");
        expect(alcanceParaEntidad("grupo")).toBe("group");
        expect(alcanceParaEntidad("comunidad")).toBe("group");
    });
});
