/**
 * Documento colaborativo — lo puro: claves de orden, fusión por unidad (conmutativa, asociativa,
 * idempotente), lápidas, alineación del editor con ids, deshacer selectivo y exportación.
 */
import { describe, expect, test } from "vitest";
import type { BloqueDoc } from "@/lib/mensajeria/formato-tipos";
import { claveEntre, claveValida, clavesEntre, clavesParaSecuencia, compararOrden } from "@/lib/vivo/doc-colaborativo/orden";
import {
    aplicarCambio,
    fusionar,
    leerDoc,
    podarLapidas,
    serializarDoc,
    visibles,
    type EstadoColab,
    type UnidadColab,
} from "@/lib/vivo/doc-colaborativo/modelo";
import { alinearBloques, type BloqueConId } from "@/lib/vivo/doc-colaborativo/alinear";
import { PilaDeshacer } from "@/lib/vivo/doc-colaborativo/deshacer";
import {
    documentoAMarkdown,
    documentoATexto,
    esquemaDocumento,
    estadisticasDocumento,
    igualesBloques,
    nombreArchivo,
    validarBloqueDocumento,
    validarMetaDocumento,
} from "@/lib/vivo/documento";

const p = (texto: string): BloqueDoc => ({ tipo: "parrafo", tramos: texto ? [{ texto }] : [] });
const h = (nivel: 1 | 2 | 3, texto: string): BloqueDoc => ({ tipo: "titulo", nivel, tramos: [{ texto }] });

function u(id: string, orden: string, texto: string, actualizado: number, autor = "ana", extra: Partial<UnidadColab<BloqueDoc>> = {}): UnidadColab<BloqueDoc> {
    return { id, orden, actualizado, autor, datos: p(texto), ...extra };
}

function estado(...unidades: UnidadColab<BloqueDoc>[]): EstadoColab<BloqueDoc, { t: string }> {
    return { unidades, meta: null };
}

const textoDe = (e: EstadoColab<BloqueDoc, unknown>) =>
    visibles(e.unidades).map((x) => (x.datos && "tramos" in x.datos ? x.datos.tramos.map((t) => t.texto).join("") : ""));

// ───────────────────────────── Orden ─────────────────────────────

describe("claves de orden", () => {
    test("una clave entre dos queda estrictamente en medio", () => {
        const pares: [string | null, string | null][] = [[null, null], [null, "i"], ["i", null], ["a", "b"], ["a", "a1"], ["1", "2x"], ["zz", null], ["0001", "0002"]];
        for (const [a, b] of pares) {
            const k = claveEntre(a, b);
            expect(claveValida(k)).toBe(true);
            if (a) expect(k > a).toBe(true);
            if (b) expect(k < b).toBe(true);
        }
    });

    test("añadir 2000 veces al final mantiene claves cortas y crecientes", () => {
        const claves = clavesEntre(null, null, 2000);
        for (let i = 1; i < claves.length; i++) expect(claves[i] > claves[i - 1]).toBe(true);
        expect(Math.max(...claves.map((k) => k.length))).toBeLessThanOrEqual(5);
    });

    test("n claves entre dos vecinas: crecientes, dentro del hueco y de longitud logarítmica", () => {
        const claves = clavesEntre("a", "b", 300);
        expect(claves).toHaveLength(300);
        expect(claves[0] > "a").toBe(true);
        expect(claves[299] < "b").toBe(true);
        for (let i = 1; i < claves.length; i++) expect(claves[i] > claves[i - 1]).toBe(true);
        expect(Math.max(...claves.map((k) => k.length))).toBeLessThanOrEqual(6);
    });

    test("datos corruptos (a ≥ b) no rompen: devuelve algo detrás de a", () => {
        expect(() => claveEntre("m", "c")).not.toThrow();
        expect(claveEntre("m", "c") > "m").toBe(true);
        expect(claveValida("a0")).toBe(false);
        expect(claveValida("A")).toBe(false);
    });

    test("empate de claves: desempata el id; clavesParaSecuencia reclava solo lo necesario", () => {
        expect(compararOrden({ orden: "k", id: "b" }, { orden: "k", id: "a" })).toBe(1);
        const r = clavesParaSecuencia([
            { id: "x", orden: "c" },
            { id: "nuevo", orden: null },
            { id: "y", orden: "c" }, // empata con x: hay que moverla detrás del nuevo
            { id: "z", orden: "f" },
        ]);
        expect(r.has("x")).toBe(false);
        expect(r.has("z")).toBe(false);
        const nuevo = r.get("nuevo")!;
        const y = r.get("y")!;
        expect(nuevo > "c" && nuevo < y && y < "f").toBe(true);
    });
});

// ───────────────────────────── Fusión ─────────────────────────────

describe("fusión por unidad", () => {
    test("ediciones concurrentes en bloques DISTINTOS sobreviven las dos", () => {
        const base = estado(u("b1111", "a", "uno", 1), u("b2222", "b", "dos", 1));
        const deAna = estado(u("b1111", "a", "UNO de Ana", 10, "ana"), u("b2222", "b", "dos", 1));
        const deLuis = estado(u("b1111", "a", "uno", 1), u("b2222", "b", "DOS de Luis", 11, "luis"));
        const r = fusionar(base, deAna, deLuis);
        expect(textoDe(r)).toEqual(["UNO de Ana", "DOS de Luis"]);
    });

    test("el MISMO bloque: gana la última escritura, y el empate se resuelve igual en todos", () => {
        const a = estado(u("b1111", "a", "de Ana", 20, "ana"));
        const b = estado(u("b1111", "a", "de Luis", 21, "luis"));
        expect(textoDe(fusionar(a, b))).toEqual(["de Luis"]);
        const c = estado(u("b1111", "a", "de Carla", 21, "carla"));
        // mismo sello: gana el autor mayor ("luis" > "carla") en cualquier orden
        expect(textoDe(fusionar(b, c))).toEqual(textoDe(fusionar(c, b)));
    });

    test("conmutativa, asociativa e idempotente (orden de llegada irrelevante)", () => {
        const a = estado(u("b1111", "a", "A1", 5, "ana"), u("b3333", "c", "A3", 9, "ana"));
        const b = estado(u("b1111", "a", "B1", 7, "luis"), u("b2222", "b", "B2", 2, "luis"));
        const c = estado(u("b2222", "b", "C2", 3, "carla"), { id: "b3333", orden: "c", actualizado: 12, autor: "carla", borrado: true });
        const j = (e: unknown) => JSON.stringify(e);
        expect(j(fusionar(a, b))).toBe(j(fusionar(b, a)));
        expect(j(fusionar(fusionar(a, b), c))).toBe(j(fusionar(a, fusionar(b, c))));
        expect(j(fusionar(a, a))).toBe(j(fusionar(a)));
        expect(textoDe(fusionar(c, a, b))).toEqual(["B1", "C2"]);
    });

    test("lápidas: un borrado más nuevo gana; una edición más nueva revive; mover una borrada no la revive", () => {
        const vivo = u("b1111", "a", "hola", 5);
        const lapida: UnidadColab<BloqueDoc> = { id: "b1111", orden: "a", actualizado: 6, autor: "luis", borrado: true };
        expect(textoDe(fusionar(estado(vivo), estado(lapida)))).toEqual([]);
        const revivido = aplicarCambio(lapida, { id: "b1111", datos: p("otra vez") }, { uid: "ana" }, 3);
        expect(revivido?.borrado).toBeUndefined();
        expect(revivido!.actualizado).toBe(7); // siempre por encima de la versión que editó
        expect(textoDe(fusionar(estado(lapida), estado(revivido!)))).toEqual(["otra vez"]);
        const movida = aplicarCambio(lapida, { id: "b1111", orden: "z" }, { uid: "ana" }, 100);
        expect(movida?.borrado).toBe(true);
    });

    test("podar lápidas viejas al guardar, nunca las recientes", () => {
        const e = estado(u("b1111", "a", "x", 1), { id: "b2222", orden: "b", actualizado: 1, autor: "a", borrado: true }, { id: "b3333", orden: "c", actualizado: 90, autor: "a", borrado: true });
        const r = podarLapidas(e, 100, 50);
        expect(r.unidades.map((x) => x.id)).toEqual(["b1111", "b3333"]);
    });

    test("leerDoc: descarta lo mal formado, conserva claves ajenas y el contenido que no entiende", () => {
        const raw = {
            app: "documento",
            v: 1,
            sharing: { scope: "public" },
            unidades: [
                { id: "b1111", orden: "a", actualizado: 1, autor: "ana", datos: p("bien") },
                { id: "x", orden: "b", actualizado: 1, autor: "ana", datos: p("id corto") },
                { id: "b3333", orden: "B!", actualizado: 1, autor: "ana", datos: p("orden raro") },
                { id: "b4444", orden: "d", actualizado: 1, autor: "ana", datos: { tipo: "futuro-3d", malla: [1, 2] } },
                "basura",
            ],
            meta: { valor: { titulo: "T" }, actualizado: 3, autor: "ana" },
        };
        const leido = leerDoc(raw, validarBloqueDocumento, validarMetaDocumento);
        expect(leido.estado.unidades.map((x) => x.id)).toEqual(["b1111", "b4444"]);
        expect(visibles(leido.estado.unidades).map((x) => x.id)).toEqual(["b1111"]);
        expect(leido.extras).toEqual({ sharing: { scope: "public" } });
        expect(leido.estado.meta?.valor.titulo).toBe("T");
        // Al volver a guardar, el bloque desconocido viaja intacto (no se destruye trabajo ajeno).
        const doc = serializarDoc("documento", leido.estado, leido.extras) as { unidades: { id: string; datos: unknown }[]; sharing: unknown };
        expect(doc.unidades.find((x) => x.id === "b4444")?.datos).toEqual({ tipo: "futuro-3d", malla: [1, 2] });
        expect(doc.sharing).toEqual({ scope: "public" });
    });
});

// ───────────────────────────── Alineación ─────────────────────────────

describe("alinear lo que emite el editor con los ids", () => {
    let n = 0;
    const nuevoId = () => `nuevo${++n}`;
    const mostrado = (...textos: string[]): BloqueConId<BloqueDoc>[] => {
        const claves = clavesEntre(null, null, textos.length);
        return textos.map((t, i) => ({ id: `id${i}`, orden: claves[i], datos: p(t) }));
    };

    test("escribir en un párrafo cambia solo ese", () => {
        const r = alinearBloques(mostrado("uno", "dos", "tres"), [p("uno"), p("dos!"), p("tres")], igualesBloques, nuevoId);
        expect(r.cambios).toEqual([{ id: "id1", datos: p("dos!") }]);
        expect(r.mostrado.map((b) => b.id)).toEqual(["id0", "id1", "id2"]);
    });

    test("Intro en medio de un párrafo: el primero cambia y nace otro con clave entre vecinos", () => {
        const antes = mostrado("uno", "abcdef", "tres");
        const r = alinearBloques(antes, [p("uno"), p("abc"), p("def"), p("tres")], igualesBloques, nuevoId);
        const nacido = r.cambios.find((c) => c.orden && c.datos);
        expect(r.cambios.find((c) => c.id === "id1")?.datos).toEqual(p("abc"));
        expect(nacido?.datos).toEqual(p("def"));
        expect(nacido!.orden! > antes[1].orden && nacido!.orden! < antes[2].orden).toBe(true);
        expect(r.mostrado.map((b) => b.datos)).toEqual([p("uno"), p("abc"), p("def"), p("tres")]);
    });

    test("Intro al principio: el párrafo conserva su id y el vacío nace delante", () => {
        const r = alinearBloques(mostrado("hola"), [p(""), p("hola")], igualesBloques, nuevoId);
        expect(r.mostrado[1].id).toBe("id0");
        expect(r.cambios).toHaveLength(1);
        expect(r.cambios[0].orden! < r.mostrado[1].orden).toBe(true);
    });

    test("unir párrafos y borrar una selección de varios: lápidas para lo que desaparece", () => {
        const r = alinearBloques(mostrado("a", "b", "c", "d"), [p("a"), p("bcd")], igualesBloques, nuevoId);
        expect(r.cambios).toEqual([{ id: "id1", datos: p("bcd") }, { id: "id2", borrar: true }, { id: "id3", borrar: true }]);
    });

    test("pegar muchos párrafos en un documento vacío", () => {
        const r = alinearBloques([], Array.from({ length: 50 }, (_, i) => p(`linea ${i}`)), igualesBloques, nuevoId);
        expect(r.cambios).toHaveLength(50);
        const ordenes = r.cambios.map((c) => c.orden!);
        for (let i = 1; i < ordenes.length; i++) expect(ordenes[i] > ordenes[i - 1]).toBe(true);
    });
});

// ───────────────────────────── Deshacer selectivo ─────────────────────────────

describe("deshacer selectivo", () => {
    test("deshace lo tuyo y respeta lo que otra persona cambió después", () => {
        const pila = new PilaDeshacer<BloqueDoc>();
        const a0 = u("b1111", "a", "mío", 1);
        const b0 = u("b2222", "b", "también mío", 1);
        const a1 = u("b1111", "a", "mío editado", 2);
        const b1 = u("b2222", "b", "también editado", 2);
        pila.registrar([{ id: "b1111", antes: a0, despues: a1 }, { id: "b2222", antes: b0, despues: b1 }]);
        // Luis cambió b2222 después de mí.
        const actual = new Map([["b1111", a1], ["b2222", u("b2222", "b", "de Luis", 3, "luis")]]);
        const cambios = pila.deshacer((id) => actual.get(id));
        expect(cambios).toEqual([{ id: "b1111", datos: p("mío"), orden: "a", borrar: false }]);
        expect(pila.puedeRehacer).toBe(true);
    });

    test("deshacer una creación la borra; rehacer la devuelve; escribir seguido es un paso", () => {
        const pila = new PilaDeshacer<BloqueDoc>();
        const v1 = u("b1111", "a", "h", 1);
        const v2 = u("b1111", "a", "ho", 2);
        const v3 = u("b1111", "a", "hol", 3);
        pila.registrar([{ id: "b1111", antes: null, despues: v1 }], { agrupar: "escritura", ventana: 1000 }, 0);
        pila.registrar([{ id: "b1111", antes: v1, despues: v2 }], { agrupar: "escritura", ventana: 1000 }, 100);
        pila.registrar([{ id: "b1111", antes: v2, despues: v3 }], { agrupar: "escritura", ventana: 1000 }, 200);
        const deshecho = pila.deshacer(() => v3);
        expect(deshecho).toEqual([{ id: "b1111", borrar: true }]);
        expect(pila.puedeDeshacer).toBe(false);
        const lapida: UnidadColab<BloqueDoc> = { id: "b1111", orden: "a", actualizado: 4, autor: "ana", borrado: true };
        expect(pila.rehacer(() => lapida)).toEqual([{ id: "b1111", datos: p("hol"), orden: "a", borrar: false }]);
    });
});

// ───────────────────────────── Validación y exportación ─────────────────────────────

describe("bloques, Markdown, texto, recuento y esquema", () => {
    test("validarBloqueDocumento aplica la lista blanca (sin enlaces peligrosos)", () => {
        expect(validarBloqueDocumento({ tipo: "parrafo", tramos: [{ texto: "hola", enlace: "javascript:alert(1)" }] })).toEqual(p("hola"));
        expect(validarBloqueDocumento({ tipo: "script", src: "x" })).toBeNull();
        expect(validarBloqueDocumento(null)).toBeNull();
        expect(validarMetaDocumento({ titulo: "Plan", fuente: "serif", tamano: 99 })).toEqual({ titulo: "Plan", fuente: "serif", tamano: 22 });
    });

    test("Markdown con marcas, títulos, listas, tareas, citas, código y enlaces", () => {
        const bloques: BloqueDoc[] = [
            h(2, "Objetivos"),
            { tipo: "parrafo", tramos: [{ texto: "Hola " }, { texto: "mundo", marcas: ["negrita"] }, { texto: " y " }, { texto: "web", enlace: "https://starseed.network/a b" }] },
            { tipo: "lista", ordenada: true, items: [[{ texto: "uno" }], [{ texto: "dos" }]] },
            { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "hecho" }] }, { hecha: false, tramos: [{ texto: "pendiente" }] }] },
            { tipo: "cita", tramos: [{ texto: "cita" }] },
            { tipo: "codigo", texto: "const x = 1;", lenguaje: "ts" },
            { tipo: "separador" },
            p("# no es un título"),
        ];
        const md = documentoAMarkdown(bloques, "Plan del huerto");
        expect(md).toContain("# Plan del huerto");
        expect(md).toContain("## Objetivos");
        expect(md).toContain("Hola **mundo** y [web](https://starseed.network/a%20b)");
        expect(md).toContain("1. uno\n2. dos");
        expect(md).toContain("- [x] hecho\n- [ ] pendiente");
        expect(md).toContain("> cita");
        expect(md).toContain("```ts\nconst x = 1;\n```");
        expect(md).toContain("---");
        expect(md).toContain("\\# no es un título");
        expect(documentoATexto([p("hola")], "Título")).toBe("Título\n======\n\nhola\n");
        expect(nombreArchivo("Plan del huerto: ¡otoño!", "md")).toBe("Plan-del-huerto-otono.md");
    });

    test("recuento de palabras y esquema de títulos", () => {
        const s = estadisticasDocumento([p("Hola mundo, qué tal"), { tipo: "lista", ordenada: false, items: [[{ texto: "uno dos" }]] }]);
        expect(s.palabras).toBe(6);
        expect(s.minutos).toBe(1);
        const unidades = [u("b1111", "a", "", 1, "a", { datos: h(1, "Intro") }), u("b2222", "b", "texto", 1), u("b3333", "c", "", 1, "a", { datos: h(3, "Detalle") })];
        expect(esquemaDocumento(unidades)).toEqual([
            { id: "b1111", nivel: 1, texto: "Intro", indice: 0 },
            { id: "b3333", nivel: 3, texto: "Detalle", indice: 2 },
        ]);
    });
});

// ───────────────────────────── Restaurar versiones ─────────────────────────────

import { cambiosParaRestaurar, contenidoDeVersion } from "@/lib/vivo/doc-colaborativo/restaurar";

describe("restaurar una versión", () => {
    test("reescribe lo distinto, revive lo borrado y pone lápida a lo que no estaba; nada más", () => {
        const foto = contenidoDeVersion("documento", [u("b1111", "a", "uno", 1), u("b2222", "b", "dos", 1), u("b3333", "c", "tres", 1)], { titulo: "Antes" });
        const ahora: UnidadColab<BloqueDoc>[] = [
            u("b1111", "a", "uno", 5),
            u("b2222", "b", "DOS cambiado", 6),
            { id: "b3333", orden: "c", actualizado: 7, autor: "luis", borrado: true },
            u("b4444", "d", "nuevo", 8),
        ];
        const r = cambiosParaRestaurar(foto, "documento", ahora, validarBloqueDocumento, validarMetaDocumento);
        expect(r?.meta?.titulo).toBe("Antes");
        expect(r?.cambios).toEqual([
            { id: "b2222", datos: p("dos"), orden: "b", borrar: false },
            { id: "b3333", datos: p("tres"), orden: "c", borrar: false },
            { id: "b4444", borrar: true },
        ]);
    });

    test("una foto de otra app o ilegible no se aplica", () => {
        expect(cambiosParaRestaurar({ app: "presentacion", unidades: [] }, "documento", [], validarBloqueDocumento, validarMetaDocumento)).toBeNull();
        expect(cambiosParaRestaurar("basura", "documento", [], validarBloqueDocumento, validarMetaDocumento)).toBeNull();
    });
});
