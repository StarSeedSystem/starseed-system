import { describe, expect, it } from "vitest";

import {
    ajustesDesdeTexto,
    ajustesPredeterminados,
    alternarPagina,
    elegirAjustesRecientes,
    estaVisible,
    moverPagina,
    normalizarAjustes,
    PAGINAS,
    paginasVisibles,
    vistaDesdeTexto,
} from "../paginas";

const ids = (a: { id: string }[]) => a.map((p) => p.id);

describe("normalizarAjustes", () => {
    it("sin datos devuelve todas las páginas en el orden original", () => {
        const a = normalizarAjustes(undefined);
        expect(a.orden).toEqual(PAGINAS.map((p) => p.id));
        expect(a.ocultas).toEqual([]);
        expect(a.actualizado).toBe(0);
    });

    it("descarta ids desconocidos y duplicados, añade las páginas que falten al final e Inicio va primero", () => {
        const a = normalizarAjustes({
            orden: ["apps", "zzz", "apps", "inicio", "perfiles"],
            ocultas: ["inicio", "apps", "nada", "apps"],
            actualizado: 42,
        });
        expect(a.orden[0]).toBe("inicio");
        expect(a.orden.slice(1, 3)).toEqual(["apps", "perfiles"]);
        expect(new Set(a.orden).size).toBe(PAGINAS.length);
        expect(a.ocultas).toEqual(["apps"]);
        expect(a.actualizado).toBe(42);
    });

    it("tolera JSON roto o tipos raros", () => {
        expect(ajustesDesdeTexto("{no es json")).toEqual(ajustesPredeterminados());
        expect(normalizarAjustes([1, 2, 3]).orden).toHaveLength(PAGINAS.length);
        expect(normalizarAjustes({ orden: "apps", actualizado: -5 }).actualizado).toBe(0);
    });
});

describe("paginasVisibles", () => {
    it("oculta las páginas marcadas pero nunca Inicio", () => {
        const a = normalizarAjustes({ ocultas: ["apps", "privacidad"] });
        const v = ids(paginasVisibles(a));
        expect(v).not.toContain("apps");
        expect(v).not.toContain("privacidad");
        expect(v[0]).toBe("inicio");
    });
});

describe("moverPagina", () => {
    it("sube y baja una página y marca la hora del cambio", () => {
        const base = ajustesPredeterminados();
        const subida = moverPagina(base, "apps", -1, 1000);
        expect(subida.orden.indexOf("apps")).toBe(base.orden.indexOf("apps") - 1);
        expect(subida.actualizado).toBe(1000);
        const bajada = moverPagina(subida, "apps", 1, 2000);
        expect(bajada.orden).toEqual(base.orden);
    });

    it("nada se pone por delante de Inicio ni Inicio se mueve", () => {
        const base = ajustesPredeterminados();
        const segunda = base.orden[1];
        expect(segunda).toBeDefined();
        if (!segunda) return;
        expect(moverPagina(base, segunda, -1, 5).orden).toEqual(base.orden);
        expect(moverPagina(base, "inicio", 1, 5).orden).toEqual(base.orden);
    });

    it("la última no baja más", () => {
        const base = ajustesPredeterminados();
        const ultima = base.orden[base.orden.length - 1];
        if (!ultima) throw new Error("sin páginas");
        expect(moverPagina(base, ultima, 1, 5).orden).toEqual(base.orden);
    });
});

describe("alternarPagina", () => {
    it("oculta y vuelve a mostrar", () => {
        const a = alternarPagina(ajustesPredeterminados(), "archivos", 10);
        expect(estaVisible(a, "archivos")).toBe(false);
        const b = alternarPagina(a, "archivos", 20);
        expect(estaVisible(b, "archivos")).toBe(true);
        expect(b.actualizado).toBe(20);
    });

    it("Inicio no se puede ocultar", () => {
        const a = alternarPagina(ajustesPredeterminados(), "inicio", 10);
        expect(estaVisible(a, "inicio")).toBe(true);
        expect(a.ocultas).not.toContain("inicio");
    });
});

describe("elegirAjustesRecientes", () => {
    it("gana el cambio más reciente; en empate, el del dispositivo", () => {
        const local = { ...ajustesPredeterminados(), actualizado: 100 };
        const cuenta = { ...alternarPagina(ajustesPredeterminados(), "apps", 200) };
        expect(elegirAjustesRecientes(local, cuenta)).toBe(cuenta);
        expect(elegirAjustesRecientes({ ...local, actualizado: 300 }, cuenta).actualizado).toBe(300);
        expect(elegirAjustesRecientes(local, { ...cuenta, actualizado: 100 })).toBe(local);
        expect(elegirAjustesRecientes(local, null)).toBe(local);
    });
});

describe("vistaDesdeTexto", () => {
    it("por defecto el mando del proyecto; «personal» solo si se guardó así", () => {
        expect(vistaDesdeTexto(null)).toBe("proyecto");
        expect(vistaDesdeTexto("basura")).toBe("proyecto");
        expect(vistaDesdeTexto("personal")).toBe("personal");
    });
});
