/**
 * vista-borrador.test.ts — lógica pura de la app de Contactos: filtro de la barra lateral,
 * vista de cumpleaños, URLs seguras, fecha de las notas y validación del formulario.
 */
import { describe, expect, test } from "vitest";

import type { Contacto } from "@/lib/contactos/tipos";
import {
    calcularVista,
    contarLateral,
    etiquetaCumple,
    fechaNotaIso,
    filtroDeSeleccion,
    formatearCumple,
    normalizarUrl,
    ymdLocal,
} from "@/components/contactos/app/vista";
import { borradorDesde, entradaDesde, filaEnlaceVacia, validarBorrador } from "@/components/contactos/app/borrador";

function c(id: string, nombre: string, extra: Partial<Contacto> = {}): Contacto {
    return {
        id,
        nombre,
        relacion: "amistad",
        telefonos: [],
        correos: [],
        enlaces: [],
        categorias: [],
        listas: [],
        favorito: false,
        visibilidad: "privada",
        origen: "manual",
        creado: "2026-01-01T00:00:00.000Z",
        actualizado: "2026-01-01T00:00:00.000Z",
        ...extra,
    };
}

const HOY = new Date(2026, 8, 28, 10, 0, 0); // 28 sept 2026

describe("vista", () => {
    test("filtroDeSeleccion traduce cada carpeta al filtro del modelo", () => {
        expect(filtroDeSeleccion({ tipo: "favoritos" }, "x")).toEqual({ texto: "x", soloFavoritos: true });
        expect(filtroDeSeleccion({ tipo: "publicos" }, "")).toMatchObject({ visibilidad: "publica" });
        expect(filtroDeSeleccion({ tipo: "starseed" }, "")).toMatchObject({ soloStarseed: true });
        expect(filtroDeSeleccion({ tipo: "relacion", id: "trabajo" }, "")).toMatchObject({ relacion: "trabajo" });
        expect(filtroDeSeleccion({ tipo: "lista", id: "l1" }, "")).toMatchObject({ lista: "l1" });
    });

    test("«Próximos cumpleaños» ordena por fecha y etiqueta hoy/mañana/edad", () => {
        const cs = [
            c("a", "Ana", { cumpleanos: "1990-10-05" }),
            c("b", "Bruno", { cumpleanos: "--09-28" }),
            c("d", "Dani", { cumpleanos: "--09-29" }),
            c("e", "Eva", { cumpleanos: "--12-01" }),
        ];
        const v = calcularVista({ contactos: cs, categorias: [], seleccion: { tipo: "cumpleanos" }, texto: "", orden: "nombre", agrupacion: "letra", hoy: HOY });
        expect(v.visibles.map((x) => x.id)).toEqual(["b", "d", "a"]);
        expect(etiquetaCumple(v.cumpleanos.get("b")!, HOY)).toBe("hoy");
        expect(etiquetaCumple(v.cumpleanos.get("d")!, HOY)).toBe("mañana");
        expect(etiquetaCumple(v.cumpleanos.get("a")!, HOY)).toBe("en 7 días · cumple 36");
        expect(contarLateral(cs, HOY).cumpleanos).toBe(3);
    });

    test("agrupar por categoría no repite personas en `visibles`", () => {
        const cs = [c("a", "Ana", { categorias: ["x", "y"] }), c("b", "Bea")];
        const cats = [
            { id: "x", nombre: "X", color: "#fff", creado: "", actualizado: "" },
            { id: "y", nombre: "Y", color: "#fff", creado: "", actualizado: "" },
        ];
        const v = calcularVista({ contactos: cs, categorias: cats, seleccion: { tipo: "todos" }, texto: "", orden: "nombre", agrupacion: "categoria", hoy: HOY });
        expect(v.grupos.map((g) => g.titulo)).toEqual(["X", "Y", "Sin categoría"]);
        expect(v.visibles.map((x) => x.id)).toEqual(["a", "b"]);
    });

    test("normalizarUrl solo admite http(s) y completa el esquema", () => {
        expect(normalizarUrl("starseed.org/yo")).toBe("https://starseed.org/yo");
        expect(normalizarUrl("http://a.io")).toBe("http://a.io/");
        expect(normalizarUrl("javascript:alert(1)")).toBeNull();
        expect(normalizarUrl("data:text/html,hola")).toBeNull();
        expect(normalizarUrl("no es una url")).toBeNull();
    });

    test("fechaNotaIso: hoy conserva la hora; otro día cae a mediodía local", () => {
        const ahora = new Date(2026, 8, 28, 18, 30);
        expect(fechaNotaIso(ymdLocal(ahora), ahora)).toBe(ahora.toISOString());
        const pasado = new Date(fechaNotaIso("2026-03-01", ahora));
        expect([pasado.getFullYear(), pasado.getMonth(), pasado.getDate(), pasado.getHours()]).toEqual([2026, 2, 1, 12]);
    });

    test("formatearCumple con y sin año", () => {
        expect(formatearCumple("1990-03-12")).toBe("12 de marzo de 1990");
        expect(formatearCumple("--07-04")).toBe("4 de julio");
        expect(formatearCumple("raro")).toBeNull();
    });
});

describe("borrador", () => {
    test("ida y vuelta: contacto → borrador → entrada", () => {
        const b = borradorDesde(
            c("a", "Ana", {
                cumpleanos: "--02-29",
                telefonos: [{ id: "t1", etiqueta: "satélite", valor: "123 456" }],
                enlaces: [{ id: "e1", titulo: "", url: "https://ana.org" }],
            }),
        );
        expect(b.cumpleModo).toBe("sinAnio");
        expect([b.cumpleDia, b.cumpleMes]).toEqual(["29", "2"]);
        expect(b.telefonos[0]).toMatchObject({ etiqueta: "satélite", personalizada: true });
        const e = entradaDesde(b);
        expect(e.cumpleanos).toBe("--02-29");
        expect(e.enlaces?.[0]).toMatchObject({ titulo: "ana.org", url: "https://ana.org" });
        expect(validarBorrador(b)).toEqual({});
    });

    test("validación: 30 de febrero, fechas futuras y enlaces no web", () => {
        const b = borradorDesde({ nombre: "Ana" });
        expect(validarBorrador({ ...b, cumpleModo: "sinAnio", cumpleDia: "30", cumpleMes: "2" })).toHaveProperty("cumple", "Ese mes no tiene tantos días.");
        expect(validarBorrador({ ...b, cumpleModo: "completo", cumpleFecha: "2999-01-01" })).toHaveProperty("cumple");
        const en = { ...filaEnlaceVacia(), url: "javascript:alert(1)" };
        expect(validarBorrador({ ...b, enlaces: [en] })).toHaveProperty(`enlace:${en.id}`);
        expect(validarBorrador({ ...b, nombre: "   " })).toHaveProperty("nombre");
    });
});
