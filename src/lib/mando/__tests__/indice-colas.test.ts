import { describe, expect, it } from "vitest";
import { fundirTitulosArchivados, parsearIndice } from "../indice-colas";

describe("índice de colas archivadas", () => {
    it("lee el formato que escribe higiene_colas.py", () => {
        const i = parsearIndice({
            version: 1,
            tareas: {
                L8a: { titulo: "Laboratorio de Astraura", ola: "Ola 311", cola: "cola-313-consolidada.json" },
                W2: { titulo: "Crónica del mundo" },
            },
        });
        expect(i.L8a).toEqual({ titulo: "Laboratorio de Astraura", ola: "Ola 311", cola: "cola-313-consolidada.json" });
        expect(i.W2).toEqual({ titulo: "Crónica del mundo" });
    });

    it("lo que no encaja se ignora y nunca lanza", () => {
        expect(parsearIndice(null)).toEqual({});
        expect(parsearIndice([])).toEqual({});
        expect(parsearIndice({ tareas: [] })).toEqual({});
        expect(parsearIndice({ tareas: { X: 3, "": { titulo: "a" } } })).toEqual({});
        expect(parsearIndice({ tareas: { Y: { titulo: 5 } } })).toEqual({ Y: { titulo: "" } });
    });

    it("lo vivo manda: el índice solo rellena huecos", () => {
        const fundidos = fundirTitulosArchivados(
            { L8a: "título vivo", CC1003A: "capas" },
            { L8a: { titulo: "título viejo" }, W2: { titulo: "Crónica del mundo" } },
        );
        expect(fundidos).toEqual({ L8a: "título vivo", CC1003A: "capas", W2: "Crónica del mundo" });
    });

    it("un id archivado SIN título sigue contando como conocido", () => {
        const fundidos = fundirTitulosArchivados({}, { S4: { titulo: "" } });
        expect(Object.keys(fundidos)).toContain("S4");
    });
});
