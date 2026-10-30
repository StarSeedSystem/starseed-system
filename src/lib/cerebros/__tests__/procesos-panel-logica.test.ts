// Pruebas de la lógica pura del panel «Procesos activos» (CB1013N).
// Sin red, sin disco, sin procesos: entrada → salida.

import { describe, expect, it } from "vitest";
import type { ProcesoActivo, TipoProceso } from "@/lib/cerebros/procesos";
import {
    accionProceso,
    contarPorTipos,
    filtrarPorTipos,
    tiposVisibles,
} from "@/lib/cerebros/procesos-panel-logica";

const proceso = (tipo: TipoProceso, id = `x-${tipo}`): ProcesoActivo => ({
    id,
    tipo,
    nombre: id,
    estado: "en-marcha",
    progreso: null,
    donde: "esta Mac",
    desde: null,
    fuente: "prueba",
});

describe("tiposVisibles", () => {
    it("con la selección vacía o ausente enseña todos los tipos del contrato", () => {
        const todos = tiposVisibles([]);
        expect(todos.length).toBe(9);
        expect(todos[0]).toBe("genesis");
        expect(todos).toContain("servicio");
        expect(tiposVisibles(undefined)).toEqual(todos);
    });
    it("respeta la selección de las preferencias y purga valores ajenos", () => {
        expect(tiposVisibles(["genesis", "sueno"])).toEqual(["genesis", "sueno"]);
        expect(tiposVisibles(["genesis", "no-existe" as TipoProceso])).toEqual(["genesis"]);
    });
});

describe("filtrarPorTipos", () => {
    it("deja solo los procesos de los tipos dados", () => {
        const lista = [proceso("genesis"), proceso("sueno"), proceso("sueno", "s2")];
        const salida = filtrarPorTipos(lista, ["sueno"]);
        expect(salida.map((x) => x.id)).toEqual(["x-sueno", "s2"]);
    });
    it("con una lista de tipos vacía devuelve vacío (nada filtrado)", () => {
        expect(filtrarPorTipos([proceso("genesis")], [])).toEqual([]);
    });
});

describe("contarPorTipos", () => {
    it("cuenta los procesos reales de cada tipo con su etiqueta", () => {
        const lista = [proceso("genesis"), proceso("genesis", "g2"), proceso("sueno")];
        const cuentas = contarPorTipos(lista, ["genesis", "sueno", "descarga"]);
        expect(cuentas).toEqual([
            { tipo: "genesis", etiqueta: "Genesis", cuenta: 2 },
            { tipo: "sueno", etiqueta: "Sueños", cuenta: 1 },
            { tipo: "descarga", etiqueta: "Descargas", cuenta: 0 },
        ]);
    });
});

describe("accionProceso", () => {
    it("los de Genesis abren /genesis", () => {
        const a = accionProceso(proceso("genesis", "agente:1"));
        expect(a).toEqual({ clase: "genesis", desktopId: null, winId: null });
    });
    it("una ventana minimizada se puede restaurar con su escritorio y su id", () => {
        const a = accionProceso(proceso("app-fondo", "ventana:esc-1:win-12"));
        expect(a.clase).toBe("ventana");
        expect(a.desktopId).toBe("esc-1");
        expect(a.winId).toBe("win-12");
    });
    it("un id con dos puntos dentro del id de ventana llega entero", () => {
        const a = accionProceso(proceso("app-fondo", "ventana:esc-1:win:extra"));
        expect(a.desktopId).toBe("esc-1");
        expect(a.winId).toBe("win:extra");
    });
    it("otro app-fondo (presencia) y los demás tipos quedan en solo lectura", () => {
        expect(accionProceso(proceso("app-fondo", "presencia:m1")).clase).toBe("ninguna");
        expect(accionProceso(proceso("descarga")).clase).toBe("ninguna");
    });
});


