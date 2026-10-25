/**
 * Medidor «Imaginación» del pulso (Ola 1024I · IMG1024B; sustituye a IMN1021H/J): la pastilla y el detalle
 * salen de `pastillaImaginacion` / `detalleDeMedidor("imaginacion")`, puros. Sin datos dice «sin datos»
 * (nunca inventa), un ámbito vacío dice «sin propuestas» y lo que espera en otros ámbitos solo se enlaza.
 */
import { describe, expect, it } from "vitest";

import { AJUSTES_POR_DEFECTO, type PropuestaImaginacion } from "@/lib/mando/imaginacion-tipos";
import { detalleDeMedidor, nombreDeAmbito, pastillaImaginacion, type DatosMedidores } from "@/lib/mando/medidores";

const HOY = new Date(2026, 9, 24, 12, 0, 0);
const AYER = new Date(2026, 9, 23, 12).toISOString();
const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
    id: "p", fuente: "agentes", titulo: "t", cuerpo: "", archivos: [], utilidad: 0.7,
    importancia: "media", estado: "nueva", motivo: "", t: HOY.toISOString(), ...o,
});
const datos = (propuestas: PropuestaImaginacion[], ambito: NonNullable<DatosMedidores["imaginacion"]>["ambito"] = "metagenesis"): DatosMedidores["imaginacion"] => ({
    propuestas, ajustes: AJUSTES_POR_DEFECTO, ambito,
});

describe("pastillaImaginacion", () => {
    it("sin datos (no se pudo leer) → «sin datos», tono normal y ninguna cifra", () => {
        for (const d of [null, undefined]) {
            expect(pastillaImaginacion(d, HOY.getTime())).toMatchObject({
                valor: "sin datos", detalle: "no se pudieron leer las propuestas", tono: "normal", hayDatos: false, total: 0,
            });
        }
    });

    it("un ámbito sin propuestas → «sin propuestas» (y lo que espera en otros ámbitos, aparte)", () => {
        const p = pastillaImaginacion(datos([prop({ id: "g", ambito: "grupo:g1", estado: "esperando-aprobacion" })]), HOY.getTime());
        expect(p).toMatchObject({ valor: "sin propuestas", detalle: "nada de la imaginación en MetaGenesis", tono: "normal", hayDatos: true, total: 0 });
        expect(p.otrosAmbitos).toEqual([{ ambito: "grupo:g1", decidibles: 1 }]);
    });

    it("«N por decidir» arriba y «R reimaginando · I integradas hoy» debajo, con su ámbito", () => {
        const p = pastillaImaginacion(
            datos([
                prop({ id: "a", estado: "esperando-aprobacion" }),
                prop({ id: "b", estado: "pregunta", importancia: "baja" }),
                prop({ id: "c", estado: "nueva" }),
                prop({ id: "d", estado: "reimaginando" }),
                prop({ id: "e", estado: "encargada" }),
                prop({ id: "f", estado: "aprobada", t: AYER, decidida: HOY.toISOString() }),
                prop({ id: "g", estado: "hecha", t: AYER }),
                prop({ id: "h", estado: "esperando-aprobacion", ambito: "personal" }),
            ]),
            HOY.getTime(),
        );
        expect(p).toMatchObject({
            valor: "2 por decidir", detalle: "1 reimaginando · 2 integradas hoy", tono: "normal",
            porDecidir: 2, decidibles: 3, reimaginando: 1, integradasHoy: 2, total: 7, auto: AJUSTES_POR_DEFECTO.auto,
        });
        expect(p.otrosAmbitos).toEqual([{ ambito: "personal", decidibles: 1 }]);
    });

    it("tono aviso si espera algo alto o crítico; ok si no espera nada", () => {
        expect(pastillaImaginacion(datos([prop({ estado: "pregunta", importancia: "crítica" })]), HOY.getTime()).tono).toBe("aviso");
        expect(pastillaImaginacion(datos([prop({ estado: "esperando-aprobacion", importancia: "alta" })]), HOY.getTime()).tono).toBe("aviso");
        expect(pastillaImaginacion(datos([prop({ estado: "hecha" })]), HOY.getTime())).toMatchObject({ valor: "0 por decidir", tono: "ok" });
        // Lo alto que ya no espera (reimaginando) no enciende el aviso.
        expect(pastillaImaginacion(datos([prop({ estado: "reimaginando", importancia: "crítica" })]), HOY.getTime()).tono).toBe("ok");
    });

    it("filtra por el ámbito pedido (grupo, página, personal)", () => {
        const todas = [
            prop({ id: "m", estado: "esperando-aprobacion" }),
            prop({ id: "g1", ambito: "grupo:g1", estado: "esperando-aprobacion", importancia: "alta" }),
            prop({ id: "pg", ambito: "pagina:x", estado: "nueva" }),
        ];
        const g = pastillaImaginacion(datos(todas, "grupo:g1"), HOY.getTime());
        expect(g).toMatchObject({ ambito: "grupo:g1", valor: "1 por decidir", tono: "aviso", total: 1 });
        expect(g.otrosAmbitos).toEqual([{ ambito: "metagenesis", decidibles: 1 }, { ambito: "pagina:x", decidibles: 1 }]);
        expect(pastillaImaginacion(datos(todas, "pagina:x"), HOY.getTime())).toMatchObject({ valor: "0 por decidir", decidibles: 1 });
        // «todos» no enlaza otros ámbitos: ya los cuenta.
        expect(pastillaImaginacion(datos(todas, "todos"), HOY.getTime())).toMatchObject({ total: 3, otrosAmbitos: [] });
    });
});

describe("detalleDeMedidor(«imaginacion»)", () => {
    it("sin datos: aviso honesto, sin filas y la pastilla dentro", () => {
        const d = detalleDeMedidor("imaginacion", {}, HOY.getTime());
        expect(d).toMatchObject({ clave: "imaginacion", titulo: "Imaginación", resumen: "sin datos", filas: [], acciones: [] });
        expect(d.aviso).toContain("No se pudieron leer");
        expect(d.imaginacion?.hayDatos).toBe(false);
    });

    it("ámbito vacío: «sin propuestas» y un vacío que dice el ámbito", () => {
        const d = detalleDeMedidor("imaginacion", { imaginacion: datos([], "grupo:g1") }, HOY.getTime());
        expect(d).toMatchObject({ resumen: "sin propuestas", filas: [], vacio: "Ninguna propuesta de la imaginación en grupo g1." });
    });

    it("resumen = la frase de la pastilla; filas ordenadas (lo que espera a Alex primero) con su ficha", () => {
        const d = detalleDeMedidor(
            "imaginacion",
            {
                imaginacion: datos([
                    prop({ id: "hecha", estado: "hecha", tarea: "T9" }),
                    prop({
                        id: "ref", estado: "esperando-aprobacion", importancia: "crítica", agente: "referencias-diseno", tipo: "diseno",
                        version: 2, version_de: "ref-v1", referencias: [{ titulo: "Paleta", url: "https://ejemplo.org/paleta" }], motivo: "toca la identidad",
                    }),
                    prop({ id: "fuera", ambito: "personal", estado: "pregunta" }),
                ]),
            },
            HOY.getTime(),
        );
        expect(d.resumen).toBe("1 por decidir · 0 reimaginando · 1 integradas hoy");
        expect(d.filas.map((f) => f.id)).toEqual(["ref", "hecha"]);
        const [ref, hecha] = d.filas;
        expect(ref).toMatchObject({ estado: "Esperando tu aprobación", quien: "Agentes imaginativos · referencias-diseno", porque: "toca la identidad", acciones: [] });
        expect(ref.ficha).toEqual(
            expect.arrayContaining([
                { etiqueta: "Tipo", valor: "Diseño" },
                { etiqueta: "Ámbito", valor: "MetaGenesis" },
                { etiqueta: "Importancia", valor: "crítica", aviso: true },
                { etiqueta: "Versión", valor: "2 (de ref-v1)" },
                { etiqueta: "Referencia", valor: "Paleta", enlace: "https://ejemplo.org/paleta" },
            ]),
        );
        expect(hecha).toMatchObject({ estado: "Hecha", porque: "importancia media · utilidad 0,70" });
        expect(hecha.ficha).toEqual(expect.arrayContaining([{ etiqueta: "Tarea", valor: "T9" }]));
        expect(d.imaginacion?.otrosAmbitos).toEqual([{ ambito: "personal", decidibles: 1 }]);
    });

    it("nombreDeAmbito: cómo lo lee una persona", () => {
        expect(nombreDeAmbito("metagenesis")).toBe("MetaGenesis");
        expect(nombreDeAmbito("personal")).toBe("Mi Genesis");
        expect(nombreDeAmbito("grupo:g1")).toBe("grupo g1");
        expect(nombreDeAmbito("pagina:p")).toBe("página p");
        expect(nombreDeAmbito("todos")).toBe("todos los ámbitos");
    });
});
