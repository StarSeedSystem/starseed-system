/**
 * El esquema del programa: vocabulario cerrado, límites, guarda anticódigo, plantillas válidas y
 * proyección a UiSpec que `validarUiSpec` siempre acepta.
 */
import { describe, expect, test } from "vitest";
import { validarUiSpec, aplanarBloques } from "@/lib/nucleo/ui-spec";
import { programaAUiSpec } from "../programas/a-uispec";
import { limpiarLinea, limpiarParrafo, sanearBloque, sanearPrograma, sinSemillas } from "../programas/esquema";
import { PLANTILLAS_PROGRAMA, especificacionDePlantilla, esIdPlantilla, plantillaPorId } from "../programas/plantillas";
import { LIM, TIPOS_BLOQUE_PROG, type ProgramaSpec } from "../programas/tipos";
import { correr, estadoDe, estadoPlantilla } from "./programa-utiles";

const spec = (bloques: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, titulo: "Prueba", descripcion: "", abierto: false, bloques, ...extra });

describe("plantillas", () => {
    test("hay seis plantillas y una en blanco, todas válidas", () => {
        expect(PLANTILLAS_PROGRAMA.filter((p) => p.id !== "en-blanco")).toHaveLength(6);
        expect(PLANTILLAS_PROGRAMA.map((p) => p.id)).toEqual(
            expect.arrayContaining(["encuesta", "lista-compartida", "tablero-kanban", "contador-de-votos", "formulario-de-inscripcion", "reunion", "en-blanco"]),
        );
        for (const p of PLANTILLAS_PROGRAMA) {
            const r = sanearPrograma(especificacionDePlantilla(p.id), { semillas: true });
            expect(r.problemas, p.id).toEqual([]);
            expect(r.spec, p.id).not.toBeNull();
            // lo que anuncia la galería es lo que lleva
            const tipos = new Set(r.spec!.bloques.map((b) => b.tipo));
            for (const t of p.contiene) expect(tipos.has(t), `${p.id} debería llevar ${t}`).toBe(true);
        }
    });

    test("cada plantilla nace con datos coherentes (semillas repartidas por su columna)", () => {
        const k = estadoPlantilla("tablero-kanban");
        const dat = k.datos.b1;
        expect(dat.tipo).toBe("kanban");
        if (dat.tipo === "kanban") {
            expect(dat.tarjetas.map((t) => t.col)).toEqual(["c1", "c1", "c2"]);
        }
        const l = estadoPlantilla("lista-compartida");
        const t = l.datos.b2;
        expect(t.tipo === "tareas" && t.items.map((x) => x.texto)).toEqual(["Reservar el sitio", "Traer bebidas", "Avisar a quien falte"]);
        // la semilla no se queda en la definición
        expect(JSON.stringify(l.bloques)).not.toContain("iniciales");
    });

    test("el título elegido sustituye al sugerido y el id desconocido cae en blanco", () => {
        expect(especificacionDePlantilla("encuesta", "  Cena del viernes  ").titulo).toBe("Cena del viernes");
        expect(especificacionDePlantilla("encuesta", "").titulo).toBe("Encuesta rápida");
        expect(especificacionDePlantilla("no-existe" as never).bloques).toEqual([]);
        expect(esIdPlantilla("reunion")).toBe(true);
        expect(esIdPlantilla("x")).toBe(false);
        expect(plantillaPorId("x")).toBeNull();
    });
});

describe("limpieza de texto", () => {
    test("una línea: sin controles ni marcas bidireccionales, espacios colapsados, con tope", () => {
        expect(limpiarLinea("  hola\u0000  ‮mundo\n\tya ", 50)).toBe("hola mundo ya");
        expect(limpiarLinea("a".repeat(300), 20)).toHaveLength(20);
        expect(limpiarLinea(42, 20)).toBe("");
    });
    test("un párrafo conserva los saltos de línea, con dos seguidos como máximo", () => {
        expect(limpiarParrafo("uno\r\n\r\n\r\n\r\ndos  \n tres", 100)).toBe("uno\n\ndos\ntres");
    });
});

describe("validación de bloques", () => {
    test("un tipo desconocido, un id malo o algo que no es un objeto se rechazan con motivo", () => {
        expect(sanearBloque({ id: "b1", tipo: "script", texto: "x" }).bloque).toBeNull();
        expect(sanearBloque({ id: "b 1", tipo: "texto", texto: "x" }).problemas[0]).toMatch(/Identificador/);
        expect(sanearBloque("hola").bloque).toBeNull();
        expect(sanearBloque(null).bloque).toBeNull();
    });

    test("cualquier cadena con aspecto de código invalida el bloque (misma guarda que UiSpec)", () => {
        for (const peligro of ["<script>alert(1)</script>", "javascript:alert(1)", "<iframe src=x>", "img onerror=alert(1)", "eval(x)"]) {
            expect(sanearBloque({ id: "b1", tipo: "texto", texto: peligro }).bloque, peligro).toBeNull();
            expect(sanearBloque({ id: "b1", tipo: "tareas", titulo: peligro }).bloque, peligro).toBeNull();
            expect(sanearBloque({ id: "b1", tipo: "encuesta", titulo: "t", opciones: [{ id: "o1", texto: peligro }, { id: "o2", texto: "b" }] }).bloque, peligro).toBeNull();
        }
    });

    test("encuesta: dos opciones como mínimo, tope de diez, ids únicos y elecciones acotadas", () => {
        expect(sanearBloque({ id: "e", tipo: "encuesta", titulo: "t", opciones: [{ id: "o1", texto: "Solo una" }] }).bloque).toBeNull();
        const muchas = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, texto: `Op ${i}` }));
        expect(sanearBloque({ id: "e", tipo: "encuesta", titulo: "t", opciones: muchas }).bloque).toBeNull();
        expect(sanearBloque({ id: "e", tipo: "encuesta", titulo: "t", opciones: [{ id: "o1", texto: "a" }, { id: "o1", texto: "b" }] }).bloque).toBeNull();
        const r = sanearBloque({ id: "e", tipo: "encuesta", titulo: "t", opciones: ["Sí", "No"], maxElecciones: 9 });
        expect(r.bloque?.tipo === "encuesta" && r.bloque.maxElecciones).toBe(2);
        expect(r.bloque?.tipo === "encuesta" && r.bloque.opciones.map((o) => o.id)).toEqual(["o1", "o2"]);
    });

    test("contador: paso, límites y valor inicial coherentes", () => {
        const base = { id: "c", tipo: "contador", titulo: "t" };
        expect(sanearBloque({ ...base, min: 5, max: 1 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, inicial: -3, min: 0 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, inicial: 9, max: 5 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, paso: 0 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, paso: 1.5 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, porPersona: 0 }).bloque).toBeNull();
        expect(sanearBloque({ ...base, porPersona: 1, paso: 2, min: 0, max: 10 }).bloque).not.toBeNull();
    });

    test("kanban: al menos una columna, máximo ocho, ids únicos; la semilla exige columna existente", () => {
        expect(sanearBloque({ id: "k", tipo: "kanban", titulo: "t", columnas: [] }).bloque).toBeNull();
        const nueve = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, titulo: `C${i}` }));
        expect(sanearBloque({ id: "k", tipo: "kanban", titulo: "t", columnas: nueve }).bloque).toBeNull();
        expect(sanearBloque({ id: "k", tipo: "kanban", titulo: "t", columnas: [{ id: "c1", titulo: "A" }, { id: "c1", titulo: "B" }] }).bloque).toBeNull();
        const r = sanearBloque(
            { id: "k", tipo: "kanban", titulo: "t", columnas: ["Hacer", "Hecho"], iniciales: [{ col: "c1", texto: "vale" }, { col: "fantasma", texto: "no" }] },
            { semillas: true },
        );
        expect(r.bloque?.tipo === "kanban" && r.bloque.iniciales).toEqual([{ col: "c1", texto: "vale" }]);
    });

    test("formulario: campos con etiqueta, opciones suficientes y cupo entero", () => {
        const f = (campos: unknown[], extra: object = {}) => sanearBloque({ id: "f", tipo: "formulario", titulo: "t", campos, ...extra });
        expect(f([]).bloque).toBeNull();
        expect(f([{ id: "a", etiqueta: "", tipo: "texto" }]).bloque).toBeNull();
        expect(f([{ id: "a", etiqueta: "Turno", tipo: "opcion", opciones: ["solo una"] }]).bloque).toBeNull();
        expect(f([{ id: "a", etiqueta: "Nombre", tipo: "texto" }], { cupo: 0 }).bloque).toBeNull();
        expect(f([{ id: "a", etiqueta: "Nombre", tipo: "texto" }, { id: "a", etiqueta: "Otro", tipo: "texto" }]).bloque).toBeNull();
        const ok = f([{ id: "a", etiqueta: "Nombre", tipo: "raro", obligatorio: 1 }], { cupo: 10 });
        expect(ok.bloque?.tipo === "formulario" && ok.bloque.campos[0]).toEqual({ id: "a", etiqueta: "Nombre", tipo: "texto", obligatorio: false });
    });

    test("sin `semillas` no se conservan; sinSemillas las quita de la definición", () => {
        const bruto = { id: "t", tipo: "tareas", titulo: "x", iniciales: ["a", "b"] };
        expect(JSON.stringify(sanearBloque(bruto).bloque)).not.toContain("iniciales");
        const con = sanearBloque(bruto, { semillas: true }).bloque!;
        expect(JSON.stringify(con)).toContain("iniciales");
        expect(JSON.stringify(sinSemillas(con))).not.toContain("iniciales");
    });

    test("el vocabulario es exactamente el declarado (no hay bloque «script»)", () => {
        expect([...TIPOS_BLOQUE_PROG].sort()).toEqual(["contador", "encuesta", "formulario", "kanban", "tareas", "texto", "titulo"]);
    });
});

describe("validación del programa entero", () => {
    test("bloques repetidos, demasiados bloques, versión ajena o algo que no es un objeto", () => {
        expect(sanearPrograma(spec([{ id: "a", tipo: "texto", texto: "1" }, { id: "a", tipo: "texto", texto: "2" }])).spec).toBeNull();
        const muchos = Array.from({ length: LIM.bloques + 1 }, (_, i) => ({ id: `b${i}`, tipo: "texto", texto: "x" }));
        expect(sanearPrograma(spec(muchos)).spec).toBeNull();
        expect(sanearPrograma({ ...spec([]), v: 2 }).spec).toBeNull();
        expect(sanearPrograma(null).spec).toBeNull();
        expect(sanearPrograma("x").spec).toBeNull();
        expect(sanearPrograma({ v: 1, titulo: "t" }).spec).toBeNull();
    });

    test("un título de programa con aspecto de código se rechaza; uno vacío recibe nombre por defecto", () => {
        expect(sanearPrograma(spec([], { titulo: "<script>x</script>" })).spec).toBeNull();
        expect(sanearPrograma(spec([], { titulo: "   " })).spec?.titulo).toBe("Programa sin título");
    });

    test("es idempotente: validar lo ya validado no cambia nada", () => {
        for (const p of PLANTILLAS_PROGRAMA) {
            const a = sanearPrograma(especificacionDePlantilla(p.id))!.spec!;
            expect(sanearPrograma(a).spec).toEqual(a);
        }
    });
});

describe("proyección a UiSpec", () => {
    test("la foto de cada plantilla es una UiSpec válida, sin problemas", () => {
        for (const p of PLANTILLAS_PROGRAMA) {
            const foto = programaAUiSpec(estadoPlantilla(p.id), { id: "abc123" });
            const v = validarUiSpec(foto);
            expect(v.problemas, p.id).toEqual([]);
            expect(v.spec, p.id).not.toBeNull();
            expect(v.spec!.superficie).toBe("programa/abc123");
            expect(aplanarBloques(v.spec!).size).toBeGreaterThanOrEqual(p.bloques().length);
        }
    });

    test("con datos hostiles de los participantes la foto sigue siendo válida (se omite lo que parece código)", () => {
        let e = estadoPlantilla("reunion");
        e = correr(e, [
            ["tarea.add", "beto", { b: "b3", texto: "<script>robar()</script>", nom: "Beto" }],
            ["tarea.add", "carla", { b: "b3", texto: "javascript:alert(1)" }],
            ["tarea.add", "carla", { b: "b3", texto: "tarea normal" }],
        ]);
        const foto = programaAUiSpec(e, { id: "x" });
        const v = validarUiSpec(foto);
        expect(v.spec).not.toBeNull();
        const texto = JSON.stringify(v.spec);
        expect(texto).not.toContain("<script>");
        expect(texto).not.toContain("javascript:");
        expect(texto).toContain("[contenido omitido]");
        expect(texto).toContain("tarea normal");
    });

    test("las respuestas de un formulario no salen en la foto: solo cuántas hay", () => {
        let e = estadoPlantilla("formulario-de-inscripcion");
        e = correr(e, [["respuesta", "beto", { b: "b1", nom: "Beto Privado", v: { f1: "Beto Privado", f3: "Mañana", f5: true } }]]);
        const texto = JSON.stringify(programaAUiSpec(e));
        expect(texto).not.toContain("Beto Privado");
        expect(texto).toContain("1 respuesta");
        expect(texto).toContain("19 plazas libres");
    });

    test("un id raro no rompe la superficie y el kanban proyecta una rejilla de columnas", () => {
        const e = estadoPlantilla("tablero-kanban");
        const foto = programaAUiSpec(e, { id: "id con espacios/y símbolos!" });
        const v = validarUiSpec(foto);
        expect(v.spec?.superficie).toMatch(/^programa\/id-con-espacios-y-s-mbolos-$/);
        const mapa = aplanarBloques(v.spec!);
        expect(mapa.get("b1.columnas")?.tipo).toBe("rejilla");
        expect(mapa.get("b1.tar.c1")?.props.titulo).toBe("Por hacer (2)");
    });

    test("un programa al tope de tamaño se proyecta dentro de los límites de UiSpec", () => {
        const kanban = { id: "k", tipo: "kanban", titulo: "t", columnas: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, titulo: `C${i}` })) };
        const bloques = Array.from({ length: LIM.bloques }, (_, i) => ({ ...kanban, id: `k${i}` }));
        const lleno = estadoDe(sanearPrograma(spec(bloques)).spec as ProgramaSpec);
        const v = validarUiSpec(programaAUiSpec(lleno));
        expect(v.spec).not.toBeNull();
        expect(aplanarBloques(v.spec!).size).toBeLessThanOrEqual(400);
    });
});
