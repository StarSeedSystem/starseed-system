import { describe, it, expect } from "vitest";
import {
    cuentasPorTipo,
    filtrarPorTipo,
    textoEstado,
    tiposFiltro,
    ventanaAppFondo,
} from "../procesos-tablero";
import type { ProcesoActivo } from "../procesos";

function p(id: string, tipo: ProcesoActivo["tipo"], extra?: Partial<ProcesoActivo>): ProcesoActivo {
    return {
        id, tipo, nombre: id, estado: "en-marcha", progreso: null,
        donde: "aquí", desde: null, fuente: "prueba", ...extra,
    };
}

describe("procesos-tablero", () => {
    it("tiposFiltro: los tipos de las preferencias; si no hay, todos", () => {
        expect(tiposFiltro(["genesis", "sueno", "inventado" as "genesis"])).toEqual(["genesis", "sueno"]);
        const todos = tiposFiltro([]);
        expect(todos).toContain("genesis");
        expect(todos).toContain("app-fondo");
        expect(todos).toHaveLength(9);
    });

    it("cuentasPorTipo: cuenta 0 para el tipo visible sin procesos", () => {
        const lista = [p("a", "genesis"), p("b", "genesis"), p("c", "descarga")];
        const cuentas = cuentasPorTipo(lista, ["genesis", "sueno"]);
        expect(cuentas).toEqual([
            { tipo: "genesis", etiqueta: "Genesis", cuenta: 2 },
            { tipo: "sueno", etiqueta: "Sueños", cuenta: 0 },
        ]);
    });

    it("filtrarPorTipo: null devuelve todo y un tipo solo ese tipo", () => {
        const lista = [p("a", "genesis"), p("b", "descarga")];
        expect(filtrarPorTipo(lista, null)).toEqual(lista);
        expect(filtrarPorTipo(lista, "descarga").map((x) => x.id)).toEqual(["b"]);
        expect(filtrarPorTipo([], "genesis")).toEqual([]);
    });

    it("textoEstado: estado en palabras", () => {
        expect(textoEstado("en-marcha")).toBe("en marcha");
        expect(textoEstado("pausado")).toBe("pausado");
    });

    it("ventanaAppFondo: solo app-fondo con id ventana:<escritorio>:<ventana>", () => {
        expect(ventanaAppFondo(p("ventana:esc1:w7", "app-fondo"))).toEqual({ escritorio: "esc1", ventana: "w7" });
        expect(ventanaAppFondo(p("proceso:9", "genesis"))).toBeNull();
        expect(ventanaAppFondo(p("ventana:esc1", "app-fondo"))).toBeNull();
        expect(ventanaAppFondo(p("otra:w1", "app-fondo"))).toBeNull();
    });
});
