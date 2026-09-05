import { describe, it, expect } from "vitest";
import { extraerAcciones } from "../mando/asistente";

describe("extraerAcciones", () => {
    it("extrae la acción mapa con su consulta del grafo del código", () => {
        const texto = 'He mirado el grafo:\n{"accion":"mapa","consulta":"reasignarTarea"}\nAhí lo tienes.';
        expect(extraerAcciones(texto)).toEqual([{ accion: "mapa", consulta: "reasignarTarea" }]);
    });

    it("extrae la acción ver_tarea con su id", () => {
        const texto = 'Abro la ficha:\n{"accion":"ver_tarea","id":"VZ6"}';
        expect(extraerAcciones(texto)).toEqual([{ accion: "ver_tarea", id: "VZ6" }]);
    });

    it("devuelve un array vacío si no hay bloques JSON", () => {
        expect(extraerAcciones("Un texto normal sin ninguna acción JSON.")).toEqual([]);
    });

    it("ignora las acciones desconocidas", () => {
        const texto = '{"accion":"borrar","id":"VZ6"}';
        expect(extraerAcciones(texto)).toEqual([]);
    });
});
