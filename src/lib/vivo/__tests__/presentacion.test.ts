/**
 * Presentación: validación de diapositivas con la lista blanca de los lienzos, tema y fondo del
 * mazo (herencia que no se guarda como propia), diseños nuevos, doc inicial, fusión por
 * diapositiva y «Presentar a todos» (quién presenta y qué diapositiva sigue cada cual).
 */
import { describe, expect, test } from "vitest";
import { fusionar, leerDoc, visibles, type UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import {
    APP_PRESENTACION,
    DISENOS_DIAPOSITIVA,
    META_PRESENTACION_INICIAL,
    comprobarDiapositiva,
    diapositivaNueva,
    dimensionesDe,
    docInicialPresentacion,
    errorDeDiapositiva,
    indiceSeguido,
    lienzoEfectivo,
    presentadorActual,
    resumenPresentacion,
    sinHerencia,
    temaDe,
    textoDeDiapositiva,
    validarDiapositiva,
    validarMetaPresentacion,
    type Diapositiva,
    type MetaPresentacion,
} from "@/lib/vivo/presentacion";

const meta: MetaPresentacion = { ...META_PRESENTACION_INICIAL, titulo: "Asamblea" };

function diapo(id: string, orden: string, texto: string, actualizado = 1, autor = "ana"): UnidadColab<Diapositiva> {
    return {
        id,
        orden,
        actualizado,
        autor,
        datos: {
            lienzo: {
                ancho: 960,
                alto: 540,
                elementos: [{ id: `t${id}`, tipo: "texto", x: 10, y: 10, w: 300, h: 80, z: 1, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto }] }] } }],
            },
        },
    };
}

describe("diapositivas: validación", () => {
    test("acepta un lienzo válido y recorta notas enormes", () => {
        const r = comprobarDiapositiva({ lienzo: diapo("d0001", "a", "Hola").datos!.lienzo, notas: "x".repeat(9000) });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.diapositiva.lienzo.elementos).toHaveLength(1);
            expect(r.diapositiva.notas).toHaveLength(5000);
        }
    });

    test("rechaza ventanas con javascript: y lo explica hablando de «diapositiva»", () => {
        const r = comprobarDiapositiva({
            lienzo: { ancho: 960, alto: 540, elementos: [{ id: "w1", tipo: "web", x: 0, y: 0, w: 100, h: 100, z: 1, url: "javascript:alert(1)" }] },
        });
        expect(r.ok).toBe(false);
        expect(validarDiapositiva(null)).toBeNull();
        expect(errorDeDiapositiva("El mensaje es demasiado grande; caben 40 por mensaje.")).toBe("La diapositiva es demasiado grande; caben 40 por diapositiva.");
    });

    test("meta del mazo: tema conocido, proporción y fondo en lista blanca", () => {
        expect(validarMetaPresentacion({ titulo: "T", tema: "inventado", proporcion: "21:9", fondo: "url(javascript:1)" })).toEqual({ titulo: "T", tema: "cosmos", proporcion: "16:9" });
        expect(validarMetaPresentacion({ titulo: "T", tema: "claro", proporcion: "4:3", fondo: "#112233", animacionFondo: "aurora" })).toEqual({
            titulo: "T",
            tema: "claro",
            proporcion: "4:3",
            fondo: "#112233",
            animacionFondo: "aurora",
        });
        expect(dimensionesDe("4:3")).toEqual({ ancho: 960, alto: 720 });
    });
});

describe("tema y fondo heredados", () => {
    test("sin fondo propio se ve el del tema, y al guardar no se copia a la diapositiva", () => {
        const d: Diapositiva = { lienzo: { ancho: 540, alto: 540, elementos: [] } };
        const ef = lienzoEfectivo(d, meta);
        expect(ef).toMatchObject({ ancho: 960, alto: 540, fondo: temaDe(meta).fondo });
        const tras = sinHerencia({ ...ef, elementos: [{ id: "f1", tipo: "forma", x: 0, y: 0, w: 10, h: 10, z: 1, forma: { tipo: "rect", color: "#ffffff" } }] }, d, meta);
        expect(tras.fondo).toBeUndefined();
        expect(tras.elementos).toHaveLength(1);
        // Si la persona elige un fondo propio, ese sí se guarda.
        expect(sinHerencia({ ...ef, fondo: "#000000" }, d, meta).fondo).toBe("#000000");
    });

    test("cada diseño nuevo pasa la validación y la portada lleva el título real", () => {
        for (const { id } of DISENOS_DIAPOSITIVA) {
            const d = diapositivaNueva(id, meta, "Asamblea de otoño");
            expect(comprobarDiapositiva(d).ok).toBe(true);
        }
        expect(textoDeDiapositiva(diapositivaNueva("titulo", meta, "Asamblea de otoño"))).toContain("Asamblea de otoño");
        expect(diapositivaNueva("blanco", meta).lienzo.elementos).toEqual([]);
    });

    test("el doc inicial se lee como presentación con una portada", () => {
        const leido = leerDoc(docInicialPresentacion("Plan"), validarDiapositiva, validarMetaPresentacion);
        expect(leido.app).toBe(APP_PRESENTACION);
        expect(visibles(leido.estado.unidades)).toHaveLength(1);
        expect(leido.estado.meta?.valor.titulo).toBe("Plan");
        expect(resumenPresentacion(visibles(leido.estado.unidades))).toBe("Plan Subtítulo o autoría · 1 diapositiva");
    });
});

describe("fusión por diapositiva", () => {
    test("dos personas en diapositivas distintas no se pisan; en la misma gana la última", () => {
        const base = { unidades: [diapo("d0001", "a", "uno"), diapo("d0002", "b", "dos")], meta: null };
        const ana = { unidades: [diapo("d0001", "a", "uno (Ana)", 5, "ana")], meta: null };
        const luis = { unidades: [diapo("d0002", "b", "dos (Luis)", 6, "luis"), diapo("d0001", "a", "uno (Luis)", 4, "luis")], meta: null };
        const r = visibles(fusionar(base, ana, luis).unidades).map((x) => textoDeDiapositiva(x.datos!));
        expect(r).toEqual(["uno (Ana)", "dos (Luis)"]);
    });
});

describe("Presentar a todos", () => {
    const presente = (clave: string, desde: number, presentando: Presente["presentando"]): Presente => ({
        clave,
        uid: clave,
        nombre: clave,
        color: "#7C5CFF",
        unidad: null,
        modo: "editar",
        presentando,
        desde,
    });

    test("presenta quien empezó antes; nadie si nadie presenta", () => {
        expect(presentadorActual([presente("a", 1, null)])).toBeNull();
        expect(presentadorActual([presente("b", 5, { id: null, indice: 0 }), presente("c", 3, { id: null, indice: 2 })])?.clave).toBe("c");
    });

    test("quien sigue ve la diapositiva por id (aunque se reordene) o, si no, por posición acotada", () => {
        const lista = [diapo("d0001", "a", "1"), diapo("d0002", "b", "2"), diapo("d0003", "c", "3")];
        expect(indiceSeguido(lista, { id: "d0003", indice: 0 })).toBe(2);
        expect(indiceSeguido(lista, { id: "borrada", indice: 1 })).toBe(1);
        expect(indiceSeguido(lista, { id: null, indice: 99 })).toBe(2);
        expect(indiceSeguido([], { id: null, indice: 3 })).toBe(0);
    });
});
