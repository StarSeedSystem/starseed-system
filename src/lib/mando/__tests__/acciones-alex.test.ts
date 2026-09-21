import { describe, it, expect } from "vitest";

import {
    ordenarYFiltrarAcciones,
    formatearParaPanel,
    tieneAccionUtil,
    type AccionesAlexData,
} from "@/lib/mando/acciones-alex";

const base: AccionesAlexData = {
    generado: "2026-09-20 10:00",
    acciones: [
        {
            id: "baja-sin-accion",
            titulo: "Acción baja sin nada",
            por_que: "da igual",
            urgencia: "baja",
            por_que_no_lo_hago_yo: "test",
        },
        {
            id: "alta-con-enlace",
            titulo: "Alta con enlace",
            por_que: "importante",
            urgencia: "alta",
            enlace: "https://ejemplo.com",
            por_que_no_lo_hago_yo: "test",
        },
        {
            id: "media-con-comando",
            titulo: "Media con comando",
            por_que: "media",
            urgencia: "media",
            comando: "echo hola",
            por_que_no_lo_hago_yo: "test",
        },
        {
            id: "alta-sin-accion",
            titulo: "Alta sin acción",
            por_que: "importante pero sin nada",
            urgencia: "alta",
            por_que_no_lo_hago_yo: "test",
        },
        {
            id: "media-con-ambos",
            titulo: "Media con ambos",
            por_que: "tiene los dos",
            urgencia: "media",
            comando: "npm test",
            enlace: "https://github.com",
            por_que_no_lo_hago_yo: "test",
        },
    ],
};

describe("tieneAccionUtil", () => {
    it("true si tiene enlace", () => {
        expect(tieneAccionUtil(base.acciones[1])).toBe(true);
    });

    it("true si tiene comando", () => {
        expect(tieneAccionUtil(base.acciones[2])).toBe(true);
    });

    it("true si tiene ambos", () => {
        expect(tieneAccionUtil(base.acciones[4])).toBe(true);
    });

    it("false si no tiene ni enlace ni comando", () => {
        expect(tieneAccionUtil(base.acciones[0])).toBe(false);
        expect(tieneAccionUtil(base.acciones[3])).toBe(false);
    });

    it("false si enlace o comando son solo espacios", () => {
        expect(
            tieneAccionUtil({
                ...base.acciones[1],
                enlace: "   ",
                comando: undefined,
            }),
        ).toBe(false);
        expect(
            tieneAccionUtil({
                ...base.acciones[2],
                comando: "  ",
                enlace: undefined,
            }),
        ).toBe(false);
    });
});

describe("ordenarYFiltrarAcciones", () => {
    it("ordena: alta primero, luego media, luego baja", () => {
        const { acciones } = ordenarYFiltrarAcciones(base);
        expect(acciones.map((a) => a.urgencia)).toEqual(["alta", "media", "media"]);
    });

    it("una acción sin comando pero con enlace se pinta igual (se incluye)", () => {
        const { acciones } = ordenarYFiltrarAcciones(base);
        const conEnlace = acciones.find((a) => a.id === "alta-con-enlace");
        expect(conEnlace).toBeDefined();
        expect(conEnlace?.enlace).toBe("https://ejemplo.com");
        expect(conEnlace?.comando).toBeUndefined();
    });

    it("NINGUNA acción se muestra sin enlace ni comando (se descarta y cuenta aparte)", () => {
        const { acciones, descartadas } = ordenarYFiltrarAcciones(base);
        expect(descartadas).toBe(2);
        expect(acciones.length).toBe(3);
        expect(acciones.find((a) => a.id === "baja-sin-accion")).toBeUndefined();
        expect(acciones.find((a) => a.id === "alta-sin-accion")).toBeUndefined();
    });

    it("empata en urgencia: ordena por id", () => {
        const data: AccionesAlexData = {
            generado: "2026-09-20 10:00",
            acciones: [
                { id: "z-ultimo", titulo: "Z", por_que: "", urgencia: "alta", por_que_no_lo_hago_yo: "", enlace: "x" },
                { id: "a-primero", titulo: "A", por_que: "", urgencia: "alta", por_que_no_lo_hago_yo: "", comando: "x" },
            ],
        };
        const { acciones } = ordenarYFiltrarAcciones(data);
        expect(acciones.map((a) => a.id)).toEqual(["a-primero", "z-ultimo"]);
    });
});

describe("formatearParaPanel", () => {
    it("devuelve estructura lista para el panel con total y descartadas", () => {
        const panel = formatearParaPanel(base);
        expect(panel.filas).toHaveLength(3);
        expect(panel.total).toBe(3);
        expect(panel.descartadas).toBe(2);
        expect(panel.filas[0].urgencia).toBe("alta");
    });

    it("cada fila trae solo lo que el panel necesita", () => {
        const panel = formatearParaPanel(base);
        const fila = panel.filas[0];
        expect(fila).toHaveProperty("id");
        expect(fila).toHaveProperty("titulo");
        expect(fila).toHaveProperty("por_que");
        expect(fila).toHaveProperty("urgencia");
        expect(fila).toHaveProperty("enlace");
        expect(fila).toHaveProperty("comando");
        expect(fila).toHaveProperty("por_que_no_lo_hago_yo");
        expect(fila).not.toHaveProperty("detalle");
    });

    it("enlace y comando undefined si no están o son espacios", () => {
        const data: AccionesAlexData = {
            generado: "2026-09-20 10:00",
            acciones: [
                { id: "solo-enlace", titulo: "x", por_que: "", urgencia: "alta", por_que_no_lo_hago_yo: "", enlace: "  " },
                { id: "solo-comando", titulo: "x", por_que: "", urgencia: "alta", por_que_no_lo_hago_yo: "", comando: "  " },
            ],
        };
        const panel = formatearParaPanel(data);
        expect(panel.filas).toHaveLength(0);
        expect(panel.descartadas).toBe(2);
    });
});