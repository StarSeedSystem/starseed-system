import { describe, expect, it } from "vitest";

import { validarAjustes, type PropuestaImaginacion } from "../imaginacion-tipos";
import {
    ORDEN_POR_DEFECTO,
    configuracionPorDefecto,
    detalleDeMedidor,
    medidoresVisibles,
    type ClaveMedidor,
} from "../medidores";

const HOY = new Date(2026, 9, 23, 12, 0, 0);

const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
    id: "p",
    fuente: "diaria",
    titulo: "t",
    cuerpo: "",
    archivos: [],
    utilidad: 0.7,
    importancia: "media",
    estado: "nueva",
    motivo: "",
    t: HOY.toISOString(),
    ...o,
});

const ANTERIORES: ClaveMedidor[] = [
    "ola-activa",
    "en-curso",
    "agentes",
    "contenedores",
    "credito-claude",
    "creditos",
    "listas",
    "bloqueadas",
    "en-cadena",
    "sin-publicar",
    "proveedores",
    "memoria",
    "disco",
];

describe("medidor imaginación · orden y claves", () => {
    it("va justo después de «en-cadena»", () => {
        const i = ORDEN_POR_DEFECTO.indexOf("imaginacion");
        expect(i).toBeGreaterThan(-1);
        expect(ORDEN_POR_DEFECTO[i - 1]).toBe("en-cadena");
    });

    it("no pierde ningún medidor anterior", () => {
        expect(ORDEN_POR_DEFECTO.filter((c) => c !== "imaginacion")).toEqual(ANTERIORES);
        const visibles = medidoresVisibles(configuracionPorDefecto());
        for (const clave of ANTERIORES) expect(visibles).toContain(clave);
        expect(visibles).toContain("imaginacion");
        expect(visibles).toHaveLength(ANTERIORES.length + 1);
    });
});

describe("medidor imaginación · detalle", () => {
    it("enseña una fila por propuesta, primero lo que espera a Alex", () => {
        const propuestas = [
            prop({ id: "hecha", titulo: "Ya hecha", estado: "hecha", importancia: "crítica" }),
            prop({ id: "media-b", titulo: "Media con más utilidad", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.9, fuente: "profunda" }),
            prop({ id: "critica", titulo: "Pregunta crítica", estado: "pregunta", importancia: "crítica", utilidad: 0.6, fuente: "astraura", tarea: "IMN1" }),
            prop({ id: "media-a", titulo: "Media con menos utilidad", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.5 }),
        ];
        const d = detalleDeMedidor(
            "imaginacion",
            { imaginacion: { propuestas, ajustes: validarAjustes({ rango: { min: 1, max: 4 } }) } },
            HOY.getTime(),
        );
        expect(d.titulo).toBe("Imaginación");
        expect(d.filas.map((f) => f.id)).toEqual(["critica", "media-b", "media-a", "hecha"]);
        const critica = d.filas[0];
        expect(critica).toMatchObject({ titulo: "Pregunta crítica", estado: "pregunta", quien: "Procesos imaginativos de Astraura" });
        expect(critica.porque).toContain("espera tu visto bueno");
        expect(critica.ficha).toContainEqual({ etiqueta: "Tarea", valor: "IMN1" });
        expect(critica.ficha).toContainEqual({ etiqueta: "Importancia", valor: "crítica" });
        expect(critica.acciones).toEqual([]);
        expect(d.filas[1].porque).toContain("utilidad 90 %");
        expect(d.filas[3].porque).not.toContain("espera tu visto bueno");
    });

    it("el resumen es el de la pastilla, con el rango de los ajustes y lo de hoy", () => {
        const d = detalleDeMedidor(
            "imaginacion",
            {
                imaginacion: {
                    propuestas: [
                        prop({ id: "a", estado: "esperando-aprobacion" }),
                        prop({ id: "b", estado: "pregunta" }),
                        prop({ id: "c", estado: "autodesarrollo" }),
                        prop({ id: "d", estado: "autodesarrollo", t: new Date(2026, 9, 22, 12).toISOString() }),
                    ],
                    ajustes: validarAjustes({ rango: { min: 1, max: 4 } }),
                },
            },
            HOY.getTime(),
        );
        expect(d.resumen).toBe("2 por aprobar · 1 autodesarrolladas hoy (rango 1–4)");
    });

    it("sin datos no rompe: lo dice y usa los ajustes por defecto", () => {
        const d = detalleDeMedidor("imaginacion", {}, HOY.getTime());
        expect(d.filas).toEqual([]);
        expect(d.vacio).toContain("Ninguna propuesta");
        expect(d.resumen).toBe("0 por aprobar · 0 autodesarrolladas hoy (rango 0–10)");
    });
});
