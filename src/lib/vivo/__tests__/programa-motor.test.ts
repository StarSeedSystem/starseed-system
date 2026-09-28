/**
 * Las reglas del programa en vivo: cada bloque (tareas, contador, encuesta, kanban, formulario) y
 * la estructura, con su reparto de permisos; las acciones que compiten; la pureza (nada muta el
 * estado anterior), el determinismo del diario y la compactación.
 */
import { describe, expect, test } from "vitest";
import { esJsonPlano, fusionarLogs, reconstruir } from "../juegos/registro";
import type { Entrada, Registro } from "../juegos/tipos";
import { columnasKanban, comprobarPasoContador, plazasLibres, resultadosEncuesta, totalContador, validarRespuesta } from "../programas/derivados";
import { basePrograma, baseCompactada, buscarMotorProgramas, convieneCompactar, motorPrograma } from "../programas/motor";
import { especificacionDePlantilla } from "../programas/plantillas";
import { LIM, type BloqueFormulario, type EstadoPrograma, type ProgramaSpec } from "../programas/tipos";
import { congelar, correr, entradaP, estadoDe, estadoPlantilla, hacer, intento, rechazo } from "./programa-utiles";

const dat = <T extends EstadoPrograma["datos"][string]["tipo"]>(e: EstadoPrograma, id: string, tipo: T) => {
    const d = e.datos[id];
    if (!d || d.tipo !== tipo) throw new Error(`Los datos de ${id} no son ${tipo}`);
    return d as Extract<EstadoPrograma["datos"][string], { tipo: T }>;
};

describe("estado inicial", () => {
    test("nace de la especificación, con n = 0 y el creador guardado", () => {
        const e = estadoPlantilla("encuesta", "ana");
        expect(e.n).toBe(0);
        expect(e.creador).toBe("ana");
        expect(e.bloques.map((b) => b.tipo)).toEqual(["texto", "encuesta"]);
        expect(dat(e, "b2", "encuesta")).toEqual({ tipo: "encuesta", votos: {}, cerrada: false });
    });

    test("una base rota nunca lanza: queda un programa vacío", () => {
        for (const base of [{}, { spec: 5 }, { spec: { v: 9 } }, { creador: 7, spec: { v: 1, bloques: [{ tipo: "script", id: "x" }] } }]) {
            const e = motorPrograma.inicial(base as never);
            expect(e.bloques).toEqual([]);
            expect(e.titulo).toBe("Programa");
        }
    });

    test("solo el registro «programa» tiene motor", () => {
        expect(buscarMotorProgramas("programa")).toBe(motorPrograma);
        expect(buscarMotorProgramas("tres-en-raya")).toBeNull();
        expect(buscarMotorProgramas("")).toBeNull();
    });
});

describe("orden y acciones desconocidas", () => {
    test("una acción con n equivocado o de un tipo desconocido se rechaza", () => {
        const e = estadoPlantilla("lista-compartida");
        expect(motorPrograma.aplicar(e, entradaP("tarea.add", "ana", { b: "b2", texto: "x" }, 5))).toEqual({ ok: false, motivo: "Acción fuera de orden." });
        expect(rechazo(e, "hackear", "ana", {})).toBe("Acción desconocida.");
    });
    test("una acción sin datos no rompe nada", () => {
        const e = estadoPlantilla("lista-compartida");
        for (const k of ["tarea.add", "tarea.marcar", "contar", "votar", "tarjeta.add", "respuesta", "bloque.add", "programa.titulo", "bloque.mover"]) {
            const r = intento(e, k, "ana");
            expect(r.ok, k).toBe(false);
        }
    });
});

describe("lista de tareas", () => {
    const base = () => estadoPlantilla("lista-compartida");

    test("añadir, marcar, desmarcar y quitar, con quién lo hizo", () => {
        let e = hacer(base(), "tarea.add", "beto", { b: "b2", texto: "  Comprar   hielo ", nom: "Beto" });
        const nueva = dat(e, "b2", "tareas").items.at(-1)!;
        expect(nueva).toMatchObject({ texto: "Comprar hielo", hecha: false, por: "Beto" });
        e = hacer(e, "tarea.marcar", "carla", { b: "b2", i: nueva.id, hecha: true, nom: "Carla" });
        expect(dat(e, "b2", "tareas").items.at(-1)).toMatchObject({ hecha: true, hechaPor: "Carla" });
        e = hacer(e, "tarea.marcar", "carla", { b: "b2", i: nueva.id, hecha: false });
        expect(dat(e, "b2", "tareas").items.at(-1)).toMatchObject({ hecha: false, hechaPor: "" });
        e = hacer(e, "tarea.quitar", "beto", { b: "b2", i: nueva.id });
        expect(dat(e, "b2", "tareas").items).toHaveLength(3);
    });

    test("marcar dice el resultado que se quiere: dos personas que marcan a la vez no se deshacen", () => {
        let e = base();
        const id = dat(e, "b2", "tareas").items[0].id;
        e = hacer(e, "tarea.marcar", "beto", { b: "b2", i: id, hecha: true });
        e = hacer(e, "tarea.marcar", "carla", { b: "b2", i: id, hecha: true });
        expect(dat(e, "b2", "tareas").items[0].hecha).toBe(true);
    });

    test("reglas: texto no vacío, tarea existente, lista con tope, quitar es idempotente", () => {
        const e = base();
        expect(rechazo(e, "tarea.add", "beto", { b: "b2", texto: "   " })).toBe("Escribe la tarea.");
        expect(rechazo(e, "tarea.marcar", "beto", { b: "b2", i: "fantasma", hecha: true })).toBe("Esa tarea ya no existe.");
        expect(rechazo(e, "tarea.marcar", "beto", { b: "b2", i: "s1" })).toBe("Indica si la tarea está hecha.");
        expect(rechazo(e, "tarea.add", "beto", { b: "b1", texto: "x" })).toBe("Esa acción no corresponde a ese bloque.");
        expect(rechazo(e, "tarea.add", "beto", { b: "zzz", texto: "x" })).toBe("Ese bloque ya no existe.");
        expect(dat(hacer(e, "tarea.quitar", "beto", { b: "b2", i: "fantasma" }), "b2", "tareas").items).toHaveLength(3);
        let lleno = e;
        for (let i = 0; i < LIM.tareas - 3; i++) lleno = hacer(lleno, "tarea.add", "beto", { b: "b2", texto: `t${i}` });
        expect(rechazo(lleno, "tarea.add", "beto", { b: "b2", texto: "una más" })).toBe("La lista está llena.");
    });

    test("el texto de una tarea que parece código se conserva como TEXTO (nunca se ejecuta ni se rechaza el resto)", () => {
        const e = hacer(base(), "tarea.add", "beto", { b: "b2", texto: "<script>x</script>" });
        expect(dat(e, "b2", "tareas").items.at(-1)!.texto).toBe("<script>x</script>");
    });
});

describe("contador", () => {
    const base = () => estadoPlantilla("contador-de-votos");

    test("un voto por persona: suma una vez, se retira y no baja de cero", () => {
        let e = hacer(base(), "contar", "ana", { b: "b2", d: 1 });
        expect(rechazo(e, "contar", "ana", { b: "b2", d: 1 })).toBe("Ya has sumado tu voto.");
        e = hacer(e, "contar", "beto", { b: "b2", d: 1 });
        const b = e.bloques.find((x) => x.id === "b2")!;
        expect(b.tipo === "contador" && totalContador(b, dat(e, "b2", "contador").aportes)).toBe(2);
        expect(rechazo(base(), "contar", "carla", { b: "b2", d: -1 })).toBe("Aún no has aportado nada que quitar.");
        e = hacer(e, "contar", "ana", { b: "b2", d: -1 });
        expect(dat(e, "b2", "contador").aportes).toEqual({ beto: 1 });
    });

    test("contador libre: cualquiera suma y resta; el mínimo protege el total, no a la persona", () => {
        let e = base();
        e = hacer(e, "contar", "ana", { b: "b3", d: 1 });
        e = hacer(e, "contar", "ana", { b: "b3", d: 1 });
        e = hacer(e, "contar", "beto", { b: "b3", d: -1 });
        const b = e.bloques.find((x) => x.id === "b3")!;
        expect(b.tipo === "contador" && totalContador(b, dat(e, "b3", "contador").aportes)).toBe(1);
        e = hacer(e, "contar", "beto", { b: "b3", d: -1 });
        expect(rechazo(e, "contar", "carla", { b: "b3", d: -1 })).toBe("Ya está en el mínimo.");
    });

    test("paso, máximo y unidad; solo +1 o −1 como orden", () => {
        const spec = { v: 1, titulo: "t", descripcion: "", abierto: false, bloques: [{ id: "c", tipo: "contador", titulo: "Cupos", inicial: 10, paso: 5, min: 0, max: 20, unidad: "kg", porPersona: null }] } as unknown as ProgramaSpec;
        let e = estadoDe(spec);
        e = hacer(e, "contar", "ana", { b: "c", d: 1 });
        e = hacer(e, "contar", "ana", { b: "c", d: 1 });
        const b = e.bloques[0];
        expect(b.tipo === "contador" && totalContador(b, dat(e, "c", "contador").aportes)).toBe(20);
        expect(rechazo(e, "contar", "ana", { b: "c", d: 1 })).toBe("Ya está en el máximo.");
        expect(rechazo(e, "contar", "ana", { b: "c", d: 5 })).toBe("El contador solo sube o baja de uno en uno.");
        expect(rechazo(e, "contar", "ana", { b: "c", d: "1" })).toBe("El contador solo sube o baja de uno en uno.");
        if (b.tipo === "contador") expect(comprobarPasoContador(b, {}, "x", 1)).toEqual({ ok: true, aporte: 1 });
    });

    test("un aporte que vuelve a cero se borra (el diario no engorda el estado)", () => {
        let e = hacer(base(), "contar", "ana", { b: "b3", d: 1 });
        e = hacer(e, "contar", "ana", { b: "b3", d: -1 });
        expect(dat(e, "b3", "contador").aportes).toEqual({});
    });
});

describe("encuesta", () => {
    const base = () => estadoPlantilla("encuesta", "ana");
    const resultados = (e: EstadoPrograma, uid: string | null = null) => {
        const b = e.bloques.find((x) => x.id === "b2")!;
        if (b.tipo !== "encuesta") throw new Error("no es encuesta");
        return resultadosEncuesta(b, dat(e, "b2", "encuesta").votos, uid);
    };

    test("votar, cambiar el voto y retirarlo; cada persona cuenta una vez", () => {
        let e = correr(base(), [
            ["votar", "ana", { b: "b2", o: ["o1"] }],
            ["votar", "beto", { b: "b2", o: ["o1"] }],
            ["votar", "carla", { b: "b2", o: ["o2"] }],
        ]);
        let r = resultados(e, "ana");
        expect(r.votantes).toBe(3);
        expect(r.opciones.map((o) => [o.id, o.votos, o.porcentaje])).toEqual([["o1", 2, 67], ["o2", 1, 33], ["o3", 0, 0]]);
        expect(r.opciones[0].mia).toBe(true);
        expect(r.ganadoras).toEqual(["o1"]);
        e = hacer(e, "votar", "beto", { b: "b2", o: ["o3"] });
        r = resultados(e);
        expect(r.opciones.map((o) => o.votos)).toEqual([1, 1, 1]);
        expect(r.ganadoras).toEqual(["o1", "o2", "o3"]);
        e = hacer(e, "votar", "ana", { b: "b2", o: [] });
        expect(resultados(e).votantes).toBe(2);
    });

    test("elección única: dos opciones a la vez y opciones inexistentes se rechazan", () => {
        const e = base();
        expect(rechazo(e, "votar", "ana", { b: "b2", o: ["o1", "o2"] })).toBe("Solo puedes elegir una opción.");
        expect(rechazo(e, "votar", "ana", { b: "b2", o: ["o9"] })).toBe("Esa opción ya no existe.");
        expect(rechazo(e, "votar", "ana", { b: "b2", o: "o1" })).toBe("Elige una opción.");
    });

    test("elección múltiple con tope; los repetidos cuentan una vez", () => {
        const spec = { v: 1, titulo: "t", descripcion: "", abierto: false, bloques: [{ id: "e", tipo: "encuesta", titulo: "t", pregunta: "?", opciones: ["A", "B", "C"], maxElecciones: 2 }] } as unknown as ProgramaSpec;
        let e = estadoDe(spec);
        e = hacer(e, "votar", "ana", { b: "e", o: ["o1", "o1", "o3"] });
        expect(dat(e, "e", "encuesta").votos.ana).toEqual(["o1", "o3"]);
        expect(rechazo(e, "votar", "ana", { b: "e", o: ["o1", "o2", "o3"] })).toBe("Puedes elegir hasta 2 opciones.");
    });

    test("cerrar la encuesta la congela; solo quien creó el programa (o todos, si está abierto) puede cerrarla", () => {
        const e = base();
        expect(rechazo(e, "encuesta.cerrar", "beto", { b: "b2", cerrada: true })).toBe("Solo quien creó el programa puede cambiar su estructura.");
        let c = hacer(e, "encuesta.cerrar", "ana", { b: "b2", cerrada: true });
        expect(rechazo(c, "votar", "beto", { b: "b2", o: ["o1"] })).toBe("La encuesta está cerrada.");
        c = hacer(c, "encuesta.cerrar", "ana", { b: "b2", cerrada: false });
        expect(hacer(c, "votar", "beto", { b: "b2", o: ["o1"] })).toBeTruthy();
        const abierto = hacer(e, "programa.abierto", "ana", { abierto: true });
        expect(hacer(abierto, "encuesta.cerrar", "beto", { b: "b2", cerrada: true })).toBeTruthy();
    });

    test("el tope de votantes protege el tamaño del estado", () => {
        let e = base();
        for (let i = 0; i < LIM.votantes; i++) e = hacer(e, "votar", `u${i}`, { b: "b2", o: ["o1"] });
        expect(rechazo(e, "votar", "nuevo", { b: "b2", o: ["o1"] })).toBe("La encuesta ya tiene demasiadas personas.");
        expect(hacer(e, "votar", "u0", { b: "b2", o: ["o2"] })).toBeTruthy(); // quien ya votó sigue pudiendo cambiar
    });
});

describe("tablero kanban", () => {
    const base = () => estadoPlantilla("tablero-kanban", "ana");
    const cols = (e: EstadoPrograma) => {
        const b = e.bloques[0];
        if (b.tipo !== "kanban") throw new Error("no es kanban");
        return columnasKanban(b, dat(e, "b1", "kanban").tarjetas).map((c) => [c.id, c.tarjetas.map((t) => t.texto)]);
    };

    test("añadir, editar, mover entre columnas, reordenar y quitar", () => {
        let e = hacer(base(), "tarjeta.add", "beto", { b: "b1", col: "c3", texto: "Publicar", nom: "Beto" });
        expect(cols(e)).toEqual([["c1", ["Definir el objetivo", "Repartir tareas"]], ["c2", ["Preparar la primera versión"]], ["c3", ["Publicar"]]]);
        const idPublicar = dat(e, "b1", "kanban").tarjetas.at(-1)!.id;
        e = hacer(e, "tarjeta.mover", "carla", { b: "b1", i: idPublicar, col: "c1", pos: 0 });
        expect(cols(e)[0]).toEqual(["c1", ["Publicar", "Definir el objetivo", "Repartir tareas"]]);
        e = hacer(e, "tarjeta.mover", "carla", { b: "b1", i: idPublicar, col: "c1", pos: 2 });
        expect(cols(e)[0]).toEqual(["c1", ["Definir el objetivo", "Repartir tareas", "Publicar"]]);
        e = hacer(e, "tarjeta.mover", "carla", { b: "b1", i: idPublicar, col: "c2" });
        expect(cols(e)[1]).toEqual(["c2", ["Preparar la primera versión", "Publicar"]]);
        e = hacer(e, "tarjeta.editar", "beto", { b: "b1", i: idPublicar, texto: "Publicar la versión" });
        expect(cols(e)[1][1]).toEqual(["Preparar la primera versión", "Publicar la versión"]);
        e = hacer(e, "tarjeta.quitar", "beto", { b: "b1", i: idPublicar });
        expect(dat(e, "b1", "kanban").tarjetas).toHaveLength(3);
    });

    test("mover a una columna vacía y mover al final de otra", () => {
        let e = base();
        const primera = dat(e, "b1", "kanban").tarjetas[0].id;
        e = hacer(e, "tarjeta.mover", "beto", { b: "b1", i: primera, col: "c3" });
        expect(cols(e)[2]).toEqual(["c3", ["Definir el objetivo"]]);
        const segunda = dat(e, "b1", "kanban").tarjetas.find((t) => t.texto === "Repartir tareas")!.id;
        e = hacer(e, "tarjeta.mover", "beto", { b: "b1", i: segunda, col: "c3", pos: 99 });
        expect(cols(e)[2]).toEqual(["c3", ["Definir el objetivo", "Repartir tareas"]]);
    });

    test("reglas: columna y tarjeta existentes, texto no vacío, tablero con tope; quitar es idempotente", () => {
        const e = base();
        const id = dat(e, "b1", "kanban").tarjetas[0].id;
        expect(rechazo(e, "tarjeta.add", "beto", { b: "b1", col: "c9", texto: "x" })).toBe("Esa columna ya no existe.");
        expect(rechazo(e, "tarjeta.add", "beto", { b: "b1", col: "c1", texto: " " })).toBe("Escribe la tarjeta.");
        expect(rechazo(e, "tarjeta.mover", "beto", { b: "b1", i: id, col: "c9" })).toBe("Esa columna ya no existe.");
        expect(rechazo(e, "tarjeta.mover", "beto", { b: "b1", i: "fantasma", col: "c1" })).toBe("Esa tarjeta ya no existe.");
        expect(rechazo(e, "tarjeta.editar", "beto", { b: "b1", i: id, texto: "" })).toBe("La tarjeta no puede quedar vacía.");
        expect(hacer(e, "tarjeta.quitar", "beto", { b: "b1", i: "fantasma" }).n).toBe(1);
        let lleno = e;
        for (let i = 0; i < LIM.tarjetas - 3; i++) lleno = hacer(lleno, "tarjeta.add", "beto", { b: "b1", col: "c1", texto: `t${i}` });
        expect(rechazo(lleno, "tarjeta.add", "beto", { b: "b1", col: "c1", texto: "una más" })).toBe("El tablero está lleno.");
    });

    test("dos personas mueven la misma tarjeta a la vez: gana el orden del diario y ambas ven lo mismo", () => {
        const e = base();
        const id = dat(e, "b1", "kanban").tarjetas[0].id;
        const a = entradaP("tarjeta.mover", "beto", { b: "b1", i: id, col: "c2" }, 0, 10);
        const b = entradaP("tarjeta.mover", "carla", { b: "b1", i: id, col: "c3" }, 0, 20);
        const l1 = fusionarLogs(motorPrograma, basePrograma("ana", especificacionDePlantilla("tablero-kanban")), [a], [b]);
        const l2 = fusionarLogs(motorPrograma, basePrograma("ana", especificacionDePlantilla("tablero-kanban")), [b], [a]);
        expect(l1.log.map((x) => x.id)).toEqual(l2.log.map((x) => x.id));
        expect(l1.log[0].u).toBe("beto"); // menor (t, u…)
    });
});

describe("formulario", () => {
    const base = () => estadoPlantilla("formulario-de-inscripcion", "ana");
    const ok = { f1: "Beto Ruiz", f3: "Mañana", f5: true };
    const formulario = (e: EstadoPrograma) => e.bloques[0] as BloqueFormulario;

    test("apuntarse, ver las plazas, editar la propia respuesta y retirarla", () => {
        let e = hacer(base(), "respuesta", "beto", { b: "b1", nom: "Beto", v: { ...ok, f2: "  beto@x.es ", f4: "Sin\n\n\n\ngluten" } });
        const r = dat(e, "b1", "formulario").respuestas[0];
        expect(r).toMatchObject({ uid: "beto", nombre: "Beto", v: { f1: "Beto Ruiz", f2: "beto@x.es", f3: "Mañana", f4: "Sin\n\ngluten", f5: true } });
        expect(plazasLibres(formulario(e), dat(e, "b1", "formulario").respuestas)).toBe(19);
        e = hacer(e, "respuesta", "beto", { b: "b1", v: { ...ok, f3: "Tarde" } });
        expect(dat(e, "b1", "formulario").respuestas).toHaveLength(1);
        expect(dat(e, "b1", "formulario").respuestas[0].v.f3).toBe("Tarde");
        e = hacer(e, "respuesta.quitar", "beto", { b: "b1" });
        expect(dat(e, "b1", "formulario").respuestas).toHaveLength(0);
    });

    test("cada campo se valida: obligatorios, opciones, casilla y números", () => {
        const b = formulario(base());
        expect(validarRespuesta(b, { f3: "Mañana", f5: true })).toMatchObject({ ok: false, motivo: "Falta «Nombre».", campo: "f1" });
        expect(validarRespuesta(b, { f1: "x", f5: true })).toMatchObject({ ok: false, campo: "f3" });
        expect(validarRespuesta(b, { f1: "x", f3: "Noche", f5: true })).toMatchObject({ ok: false, motivo: "Elige una opción válida en «Turno».", campo: "f3" });
        expect(validarRespuesta(b, { f1: "x", f3: "Tarde" })).toMatchObject({ ok: false, campo: "f5" });
        expect(validarRespuesta(b, { f1: "x", f3: "Tarde", f5: "true" })).toMatchObject({ ok: false, campo: "f5" });
        expect(validarRespuesta(b, { f1: "x", f3: "Tarde", f5: true, extra: "se ignora" })).toEqual({ ok: true, v: { f1: "x", f3: "Tarde", f5: true } });
        const numeros: BloqueFormulario = { ...b, campos: [{ id: "n", etiqueta: "Edad", tipo: "numero", obligatorio: true }] };
        expect(validarRespuesta(numeros, { n: "12,5" })).toEqual({ ok: true, v: { n: 12.5 } });
        expect(validarRespuesta(numeros, { n: 7 })).toEqual({ ok: true, v: { n: 7 } });
        expect(validarRespuesta(numeros, { n: "mucho" })).toMatchObject({ ok: false, motivo: "«Edad» debe ser un número." });
        expect(validarRespuesta(numeros, { n: "" })).toMatchObject({ ok: false, motivo: "Falta «Edad»." });
        expect(validarRespuesta(numeros, { n: Infinity })).toMatchObject({ ok: false });
        expect(validarRespuesta(numeros, null)).toMatchObject({ ok: false });
    });

    test("cupo: la última plaza es de una persona; quien ya está sigue pudiendo editar", () => {
        const spec = especificacionDePlantilla("formulario-de-inscripcion");
        (spec.bloques[0] as BloqueFormulario).cupo = 2;
        let e = estadoDe(spec);
        e = hacer(e, "respuesta", "beto", { b: "b1", v: ok });
        e = hacer(e, "respuesta", "carla", { b: "b1", v: ok });
        expect(plazasLibres(formulario(e), dat(e, "b1", "formulario").respuestas)).toBe(0);
        expect(rechazo(e, "respuesta", "dora", { b: "b1", v: ok })).toBe("Ya no quedan plazas.");
        expect(hacer(e, "respuesta", "beto", { b: "b1", v: { ...ok, f3: "Tarde" } })).toBeTruthy();
        e = hacer(e, "respuesta.quitar", "beto", { b: "b1" });
        expect(hacer(e, "respuesta", "dora", { b: "b1", v: ok })).toBeTruthy();
    });

    test("cerrar el formulario; solo quien creó el programa quita respuestas ajenas", () => {
        let e = hacer(base(), "respuesta", "beto", { b: "b1", v: ok });
        expect(rechazo(e, "respuesta.quitar", "carla", { b: "b1", uid: "beto" })).toBe("Solo quien creó el programa puede quitar la respuesta de otra persona.");
        expect(dat(hacer(e, "respuesta.quitar", "ana", { b: "b1", uid: "beto" }), "b1", "formulario").respuestas).toHaveLength(0);
        e = hacer(e, "formulario.cerrar", "ana", { b: "b1", cerrado: true });
        expect(rechazo(e, "respuesta", "carla", { b: "b1", v: ok })).toBe("El formulario está cerrado.");
        expect(rechazo(base(), "formulario.cerrar", "beto", { b: "b1", cerrado: true })).toBe("Solo quien creó el programa puede cambiar su estructura.");
    });

    test("las respuestas conservan el orden de llegada y no se mezclan entre personas", () => {
        const e = correr(base(), [
            ["respuesta", "carla", { b: "b1", v: ok }],
            ["respuesta", "beto", { b: "b1", v: ok }],
        ]);
        expect(dat(e, "b1", "formulario").respuestas.map((r) => r.uid)).toEqual(["carla", "beto"]);
    });
});

describe("estructura y permisos", () => {
    const base = () => estadoPlantilla("lista-compartida", "ana");
    const nuevoTexto = { id: "n1", tipo: "texto", texto: "Bienvenidas" };

    test("solo quien creó el programa cambia el título y los bloques; los demás participan", () => {
        const e = base();
        for (const [k, d] of [
            ["programa.titulo", { titulo: "Otro" }],
            ["bloque.add", { bloque: nuevoTexto }],
            ["bloque.quitar", { b: "b1" }],
            ["bloque.mover", { b: "b2", dir: -1 }],
            ["bloque.editar", { bloque: { id: "b1", tipo: "texto", texto: "hackeado" } }],
        ] as const) {
            expect(rechazo(e, k, "beto", d), k).toBe("Solo quien creó el programa puede cambiar su estructura.");
        }
        expect(rechazo(e, "programa.abierto", "beto", { abierto: true })).toBe("Solo quien creó el programa decide quién puede cambiarlo.");
        expect(hacer(e, "tarea.add", "beto", { b: "b2", texto: "participar sí" })).toBeTruthy();
    });

    test("abierto: cualquiera edita la estructura; solo el creador lo abre y lo cierra", () => {
        let e = hacer(base(), "programa.abierto", "ana", { abierto: true });
        e = hacer(e, "bloque.add", "beto", { bloque: nuevoTexto });
        expect(e.bloques.map((b) => b.id)).toEqual(["b1", "b2", "n1"]);
        expect(rechazo(e, "programa.abierto", "beto", { abierto: false })).toBe("Solo quien creó el programa decide quién puede cambiarlo.");
    });

    test("título y descripción: no vacío, recortados y sin aspecto de código", () => {
        const e = base();
        const t = hacer(e, "programa.titulo", "ana", { titulo: "  Cena   de   fin de curso ", descripcion: "Todo\r\n\r\n\r\nel grupo" });
        expect(t.titulo).toBe("Cena de fin de curso");
        expect(t.descripcion).toBe("Todo\n\nel grupo");
        expect(rechazo(e, "programa.titulo", "ana", { titulo: "  " })).toBe("El título no puede estar vacío.");
        expect(rechazo(e, "programa.titulo", "ana", { titulo: "<script>x</script>" })).toBe("Eso parece código: un programa es dato, no código.");
    });

    test("añadir un bloque: validado, con su semilla, tras otro o al final, sin duplicar ids ni pasar el tope", () => {
        let e = hacer(base(), "bloque.add", "ana", { bloque: { id: "t2", tipo: "tareas", titulo: "Otra", iniciales: ["uno", "dos"] }, despues: "b1" });
        expect(e.bloques.map((b) => b.id)).toEqual(["b1", "t2", "b2"]);
        expect(dat(e, "t2", "tareas").items.map((t) => t.texto)).toEqual(["uno", "dos"]);
        expect(JSON.stringify(e.bloques)).not.toContain("iniciales");
        expect(rechazo(e, "bloque.add", "ana", { bloque: { id: "t2", tipo: "texto", texto: "repetido" } })).toBe("Ya existe un bloque con ese identificador.");
        expect(rechazo(e, "bloque.add", "ana", { bloque: { id: "z", tipo: "texto", texto: "<iframe src=x>" } })).toMatch(/parece código/);
        expect(rechazo(e, "bloque.add", "ana", { bloque: { id: "z", tipo: "encuesta", titulo: "x", opciones: ["solo"] } })).toMatch(/al menos dos opciones/);
        let lleno = e;
        for (let i = e.bloques.length; i < LIM.bloques; i++) lleno = hacer(lleno, "bloque.add", "ana", { bloque: { id: `x${i}`, tipo: "texto", texto: "x" } });
        expect(rechazo(lleno, "bloque.add", "ana", { bloque: { id: "extra", tipo: "texto", texto: "x" } })).toBe(`Un programa admite como máximo ${LIM.bloques} bloques.`);
    });

    test("quitar (idempotente) y mover bloques; en los extremos mover no hace nada", () => {
        let e = base();
        e = hacer(e, "bloque.mover", "ana", { b: "b2", dir: -1 });
        expect(e.bloques.map((b) => b.id)).toEqual(["b2", "b1"]);
        e = hacer(e, "bloque.mover", "ana", { b: "b2", dir: -1 });
        expect(e.bloques.map((b) => b.id)).toEqual(["b2", "b1"]);
        expect(rechazo(e, "bloque.mover", "ana", { b: "b2", dir: 3 })).toBe("Indica hacia dónde mover el bloque.");
        e = hacer(e, "bloque.quitar", "ana", { b: "b2" });
        expect(e.bloques.map((b) => b.id)).toEqual(["b1"]);
        expect(e.datos.b2).toBeUndefined();
        expect(hacer(e, "bloque.quitar", "ana", { b: "b2" }).bloques).toHaveLength(1);
    });

    test("editar un bloque conserva sus datos y los ajusta: votos a opciones borradas, tarjetas de columnas borradas", () => {
        let e = estadoPlantilla("encuesta", "ana");
        e = correr(e, [
            ["votar", "ana", { b: "b2", o: ["o1"] }],
            ["votar", "beto", { b: "b2", o: ["o3"] }],
        ]);
        e = hacer(e, "bloque.editar", "ana", {
            bloque: { id: "b2", tipo: "encuesta", titulo: "Nueva", pregunta: "¿?", opciones: [{ id: "o1", texto: "Sí" }, { id: "o2", texto: "No" }], maxElecciones: 1 },
        });
        expect(dat(e, "b2", "encuesta").votos).toEqual({ ana: ["o1"] });

        let k = estadoPlantilla("tablero-kanban", "ana");
        k = hacer(k, "bloque.editar", "ana", { bloque: { id: "b1", tipo: "kanban", titulo: "T", columnas: [{ id: "c1", titulo: "Solo esta" }] } });
        expect(dat(k, "b1", "kanban").tarjetas.every((t) => t.col === "c1")).toBe(true);
        expect(dat(k, "b1", "kanban").tarjetas).toHaveLength(3);
    });

    test("no se puede cambiar el tipo de un bloque ni editar uno que no existe", () => {
        const e = base();
        expect(rechazo(e, "bloque.editar", "ana", { bloque: { id: "b2", tipo: "texto", texto: "ahora soy texto" } })).toBe("No se puede cambiar el tipo de un bloque: añade uno nuevo.");
        expect(rechazo(e, "bloque.editar", "ana", { bloque: { id: "nada", tipo: "texto", texto: "x" } })).toBe("Ese bloque ya no existe.");
    });
});

describe("pureza y determinismo", () => {
    test("el motor no muta el estado anterior (estado congelado en profundidad)", () => {
        let e = congelar(estadoPlantilla("reunion", "ana"));
        const pasos: [string, string, Record<string, unknown>][] = [
            ["tarea.add", "beto", { b: "b3", texto: "x", nom: "Beto" }],
            ["votar", "beto", { b: "b4", o: ["o2"] }],
            ["bloque.add", "ana", { bloque: { id: "k", tipo: "kanban", titulo: "K", columnas: ["A", "B"], iniciales: [{ col: "c1", texto: "uno" }] } }],
            ["tarjeta.add", "beto", { b: "k", col: "c2", texto: "dos" }],
            ["bloque.editar", "ana", { bloque: { id: "b4", tipo: "encuesta", titulo: "P", opciones: ["A", "B"] } }],
            ["programa.titulo", "ana", { titulo: "Nuevo" }],
            ["bloque.mover", "ana", { b: "k", dir: -1 }],
            ["bloque.quitar", "ana", { b: "b1" }],
        ];
        for (const [k, u, d] of pasos) {
            e = congelar(hacer(e, k, u, d as never));
        }
        expect(e.n).toBe(pasos.length);
    });

    test("repetir el mismo diario da exactamente el mismo estado (JSON idéntico)", () => {
        const spec = especificacionDePlantilla("reunion");
        const base = basePrograma("ana", spec);
        const log: Entrada[] = [
            entradaP("tarea.add", "beto", { b: "b3", texto: "uno", nom: "Beto" }, 0),
            entradaP("votar", "beto", { b: "b4", o: ["o1"] }, 1),
            entradaP("votar", "carla", { b: "b4", o: ["o2"] }, 2),
            entradaP("tarea.marcar", "carla", { b: "b3", i: "s1", hecha: true, nom: "Carla" }, 3),
            entradaP("votar", "beto", { b: "b4", o: ["o2"] }, 4),
        ];
        const registro: Registro = { id: "r", tipo: "programa", gen: 1, creada: 1, base, log };
        const a = reconstruir(motorPrograma, registro);
        const b = reconstruir(motorPrograma, JSON.parse(JSON.stringify(registro)));
        expect(a.descartadas).toBe(0);
        expect(JSON.stringify(a.estado)).toBe(JSON.stringify(b.estado));
    });

    test("un diario con una acción inválida se corta ahí, igual en todos los clientes", () => {
        const base = basePrograma("ana", especificacionDePlantilla("encuesta"));
        const log: Entrada[] = [
            entradaP("votar", "beto", { b: "b2", o: ["o1"] }, 0),
            entradaP("votar", "beto", { b: "b2", o: ["o9"] }, 1),
            entradaP("votar", "carla", { b: "b2", o: ["o1"] }, 2),
        ];
        const r = reconstruir(motorPrograma, { id: "r", tipo: "programa", gen: 1, creada: 1, base, log });
        expect(r.log).toHaveLength(1);
        expect(r.descartadas).toBe(2);
        expect(r.motivo).toBe("Esa opción ya no existe.");
    });
});

describe("compactación", () => {
    test("la base compactada es JSON plano y reproduce el mismo estado desde cero", () => {
        let e = estadoPlantilla("reunion", "ana");
        const log: Entrada[] = [];
        const pasos: [string, string, Record<string, unknown>][] = [
            ["tarea.add", "beto", { b: "b3", texto: "uno", nom: "Beto" }],
            ["votar", "carla", { b: "b4", o: ["o3"] }],
            ["bloque.add", "ana", { bloque: { id: "c", tipo: "contador", titulo: "Aforo", min: 0, max: 10 } }],
            ["contar", "beto", { b: "c", d: 1 }],
            ["programa.abierto", "ana", { abierto: true }],
        ];
        for (const [k, u, d] of pasos) {
            const x = entradaP(k, u, d as never, e.n);
            const r = motorPrograma.aplicar(e, x);
            if (!r.ok) throw new Error(r.motivo);
            e = r.estado;
            log.push(x);
        }
        const registro: Registro = { id: "r", tipo: "programa", gen: 1, creada: 1, base: basePrograma("ana", especificacionDePlantilla("reunion")), log };
        const base = baseCompactada(e, registro);
        expect(esJsonPlano(base)).toBe(true);
        expect(base.ids).toEqual(log.map((x) => x.id));
        const desdeCero = motorPrograma.inicial(base);
        expect(JSON.stringify({ ...desdeCero, n: e.n })).toBe(JSON.stringify(e));
        // y se puede seguir jugando encima
        expect(hacer(desdeCero, "contar", "carla", { b: "c", d: 1 }).n).toBe(1);
    });

    test("solo se pide compactar al llegar al umbral; solo se guardan los ids más recientes", () => {
        const base = basePrograma("ana", especificacionDePlantilla("en-blanco"));
        const registro = (n: number): Registro => ({
            id: "r", tipo: "programa", gen: 1, creada: 1, base,
            log: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, n: i, u: "a", t: 1, k: "x" })),
        });
        expect(convieneCompactar(null)).toBe(false);
        expect(convieneCompactar(registro(LIM.compactarDesde - 1))).toBe(false);
        expect(convieneCompactar(registro(LIM.compactarDesde))).toBe(true);
        const ids = baseCompactada(estadoPlantilla("en-blanco"), registro(LIM.idsAlCompactar + 50)).ids as string[];
        expect(ids).toHaveLength(LIM.idsAlCompactar);
        expect(ids.at(-1)).toBe(`i${LIM.idsAlCompactar + 49}`);
        expect(ids[0]).toBe("i50");
    });

    test("una instantánea manipulada no cuela datos: se valida contra la definición", () => {
        const spec = especificacionDePlantilla("encuesta");
        const base = {
            ...basePrograma("ana", spec),
            datos: { b2: { tipo: "encuesta", votos: { beto: ["o1", "fantasma"], carla: "o2", dora: ["o1", "o2"] }, cerrada: "sí" }, b1: { tipo: "tareas", items: [] } },
        };
        const e = motorPrograma.inicial(base as never);
        const d = dat(e, "b2", "encuesta");
        expect(d.votos).toEqual({ beto: ["o1"], dora: ["o1"] }); // lo que no encaja se descarta; carla (no es lista) desaparece; dora se queda con la primera por el tope de una elección
        expect(d.cerrada).toBe(false);
        expect(e.datos.b1).toEqual({ tipo: "texto" }); // datos de otro tipo se descartan
    });
});
