/**
 * El programa con varias personas a la vez (red y guardado falsos): las acciones viajan y se
 * validan en cada cliente, las carreras se resuelven igual en todos (y a quien pierde se le
 * explica), recargar o llegar tarde reconstruye el mismo programa, y la compactación del diario
 * no pierde lo que alguien tenía sin guardar.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { INSTANTANEA_VACIA, type Controlador } from "../juegos/controlador";
import { docVacio } from "../juegos/registro";
import type { Registro } from "../juegos/tipos";
import { basePrograma, baseCompactada, buscarMotorProgramas } from "../programas/motor";
import { especificacionDePlantilla, type IdPlantilla } from "../programas/plantillas";
import { totalContador } from "../programas/derivados";
import { LIM, type BloqueFormulario, type EstadoPrograma } from "../programas/tipos";
import { AlmacenFalso, RedFalsa, crearCliente } from "./juego-red-falsa";

let red: RedFalsa;
let almacen: AlmacenFalso;

function docDePlantilla(id: IdPlantilla, retoque?: (spec: ReturnType<typeof especificacionDePlantilla>) => void) {
    const spec = especificacionDePlantilla(id);
    retoque?.(spec);
    const doc = docVacio("programa");
    doc.registro = { id: "prog1", tipo: "programa", gen: 1, creada: 1, base: basePrograma("ana", spec), log: [] };
    return doc;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    red = new RedFalsa();
    almacen = new AlmacenFalso();
});

afterEach(() => {
    vi.useRealTimers();
});

const estado = (c: Controlador) => c.getSnapshot().estado as EstadoPrograma;
const registro = (c: Controlador) => c.getSnapshot().registro as Registro;

async function abrir(uid: string, extra: Parameters<typeof crearCliente>[3] = {}): Promise<Controlador> {
    const c = crearCliente(uid, red, almacen, { tipoDoc: "programa", buscarMotor: buscarMotorProgramas, ...extra });
    await c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    return c;
}

const pasar = (ms = 200) => vi.advanceTimersByTimeAsync(ms);

describe("varias personas en el mismo programa", () => {
    test("un voto de una persona lo ven las demás al instante y todas calculan lo mismo", async () => {
        almacen.doc = docDePlantilla("encuesta");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        const carla = await abrir("carla");
        expect(beto.proponer("votar", { b: "b2", o: ["o1"] })).toEqual({ ok: true });
        red.entregarTodo();
        expect(carla.proponer("votar", { b: "b2", o: ["o1"] })).toEqual({ ok: true });
        red.entregarTodo();
        expect(ana.proponer("votar", { b: "b2", o: ["o2"] })).toEqual({ ok: true });
        red.entregarTodo();
        await pasar();
        const votos = (c: Controlador) => JSON.stringify((estado(c).datos.b2 as { votos: unknown }).votos);
        expect(votos(ana)).toBe(votos(beto));
        expect(votos(beto)).toBe(votos(carla));
        expect(JSON.parse(votos(ana))).toEqual({ beto: ["o1"], carla: ["o1"], ana: ["o2"] });
    });

    test("una acción inválida se rechaza en local sin difundirse; una remota forjada no cambia nada", async () => {
        almacen.doc = docDePlantilla("encuesta");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        const antes = red.enviados.length;
        expect(beto.proponer("votar", { b: "b2", o: ["o9"] })).toEqual({ ok: false, motivo: "Esa opción ya no existe." });
        expect(red.enviados.length).toBe(antes);
        // Alguien forja por el canal un voto a una opción que no existe, y un cambio de estructura sin ser el creador.
        const foto = JSON.stringify(estado(ana));
        red.inyectar("intruso", "op", { rid: "prog1", gen: 1, e: { id: "f1", n: 0, u: "intruso", t: Date.now(), k: "votar", d: { b: "b2", o: ["zzz"] } } });
        red.inyectar("intruso", "op", { rid: "prog1", gen: 1, e: { id: "f2", n: 0, u: "intruso", t: Date.now(), k: "bloque.quitar", d: { b: "b2" } } });
        red.entregarTodo();
        expect(JSON.stringify(estado(ana))).toBe(foto);
        expect(ana.getSnapshot().rechazadas).toBe(2);
    });

    test("la última plaza: dos personas a la vez, una gana y a la otra se le explica", async () => {
        almacen.doc = docDePlantilla("formulario-de-inscripcion", (s) => {
            (s.bloques[0] as BloqueFormulario).cupo = 1;
        });
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        const carla = await abrir("carla");
        const v = { f1: "Yo", f3: "Mañana", f5: true };
        // Las dos actúan ANTES de recibir nada de la otra.
        expect(beto.proponer("respuesta", { b: "b1", nom: "Beto", v })).toEqual({ ok: true });
        expect(carla.proponer("respuesta", { b: "b1", nom: "Carla", v })).toEqual({ ok: true });
        red.entregarTodo();
        await pasar(3000);
        red.entregarTodo();
        await pasar(3000);
        const quienes = (c: Controlador) => (estado(c).datos.b1 as { respuestas: { uid: string }[] }).respuestas.map((r) => r.uid);
        expect(quienes(ana)).toHaveLength(1);
        expect(quienes(beto)).toEqual(quienes(ana));
        expect(quienes(carla)).toEqual(quienes(ana));
        const perdedora = quienes(ana)[0] === "beto" ? carla : beto;
        expect(perdedora.getSnapshot().aviso).toMatch(/Ya no quedan plazas/);
    });

    test("quien llega tarde o recarga reconstruye el mismo programa desde lo guardado", async () => {
        almacen.doc = docDePlantilla("reunion");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(beto.proponer("tarea.add", { b: "b3", texto: "Enviar el acta", nom: "Beto" }).ok).toBe(true);
        red.entregarTodo();
        expect(ana.proponer("votar", { b: "b4", o: ["o2"] }).ok).toBe(true);
        expect(ana.proponer("bloque.add", { bloque: { id: "c1", tipo: "contador", titulo: "Asistentes", min: 0 } }).ok).toBe(true);
        red.entregarTodo();
        expect(beto.proponer("contar", { b: "c1", d: 1 }).ok).toBe(true);
        red.entregarTodo();
        await pasar(3000);
        const tarde = await abrir("dora"); // entra después: lee lo guardado
        await pasar(3000);
        expect(JSON.stringify(estado(tarde))).toBe(JSON.stringify(estado(ana)));
        expect(estado(tarde).n).toBe(4);
        expect(estado(tarde).bloques.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "c1"]);
        // y lo reconstruido desde cero coincide con lo que ve cada cliente
        expect(JSON.stringify(ana.reconstruirDesdeCero())).toBe(JSON.stringify(estado(ana)));
    });

    test("solo lectura: se ve el programa pero no se cambia nada", async () => {
        almacen.doc = docDePlantilla("lista-compartida");
        const mirona = await abrir("mirona", { soloLectura: true });
        expect(mirona.getSnapshot().soloLectura).toBe(true);
        expect(mirona.proponer("tarea.add", { b: "b2", texto: "x" })).toEqual({ ok: false, motivo: "Tienes permiso solo para mirar." });
        expect(estado(mirona).bloques).toHaveLength(2);
    });

    test("las instantáneas son referencialmente estables mientras nada cambia", async () => {
        almacen.doc = docDePlantilla("lista-compartida");
        const ana = await abrir("ana");
        const a = ana.getSnapshot();
        expect(ana.getSnapshot()).toBe(a);
        ana.proponer("tarea.add", { b: "b2", texto: "nueva" });
        const b = ana.getSnapshot();
        expect(b).not.toBe(a);
        expect(ana.getSnapshot()).toBe(b);
        expect(INSTANTANEA_VACIA).toBe(INSTANTANEA_VACIA);
    });

    test("un espacio que es un juego no se abre como programa, y viceversa", async () => {
        almacen.doc = docVacio("juego");
        const c = crearCliente("ana", red, almacen, { tipoDoc: "programa", buscarMotor: buscarMotorProgramas });
        await c.iniciar();
        expect(c.getSnapshot().fase).toBe("error");
        expect(c.getSnapshot().error).toMatch(/juego, no un programa/);
    });
});

describe("compactación del diario", () => {
    test("al plegar un diario largo el estado no cambia y lo que alguien tenía sin guardar se conserva", async () => {
        almacen.doc = docDePlantilla("contador-de-votos");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        for (let i = 0; i < LIM.compactarDesde + 10; i++) {
            expect(ana.proponer("contar", { b: "b3", d: 1 }).ok).toBe(true);
        }
        red.entregarTodo();
        await pasar(3000);
        expect(registro(beto).log.length).toBe(LIM.compactarDesde + 10);
        const totalAntes = (c: Controlador) => {
            const b = estado(c).bloques.find((x) => x.id === "b3")!;
            return b.tipo === "contador" ? totalContador(b, (estado(c).datos.b3 as { aportes: Record<string, number> }).aportes) : NaN;
        };
        expect(totalAntes(ana)).toBe(LIM.compactarDesde + 10);

        // Beto suma su voto en el contador de «uno por persona» JUSTO antes de recibir la compactación de Ana.
        expect(beto.proponer("contar", { b: "b2", d: 1 }).ok).toBe(true);
        const r = ana.nuevoRegistro("programa", baseCompactada(estado(ana), registro(ana)), { continuidad: true });
        expect(r).toEqual({ ok: true });
        red.entregarTodo();
        await pasar(3000);
        red.entregarTodo();
        await pasar(3000);

        for (const c of [ana, beto]) {
            expect(registro(c).gen).toBe(2);
            expect(registro(c).continuidad).toBe(true);
            expect(registro(c).log.length).toBeLessThanOrEqual(2);
            expect(totalAntes(c)).toBe(LIM.compactarDesde + 10);
        }
        // El voto de Beto no se perdió al plegar el diario.
        const votos = (c: Controlador) => (estado(c).datos.b2 as { aportes: Record<string, number> }).aportes;
        expect(votos(ana)).toEqual({ beto: 1 });
        expect(votos(beto)).toEqual({ beto: 1 });
        expect(JSON.stringify(estado(ana))).toBe(JSON.stringify(estado(beto)));
        expect(beto.getSnapshot().aviso).toBeNull();
        // ya no queda nada pendiente de guardar (tampoco lo plegado)
        await pasar(3000);
        expect(ana.getSnapshot().pendientes).toBe(0);
        expect(beto.getSnapshot().pendientes).toBe(0);
    });

    test("compactar con muchas acciones SIN GUARDAR no las duplica al guardar", async () => {
        almacen.doc = docDePlantilla("contador-de-votos");
        const ana = await abrir("ana");
        for (let i = 0; i < 200; i++) expect(ana.proponer("contar", { b: "b3", d: 1 }).ok).toBe(true);
        expect(ana.getSnapshot().pendientes).toBe(200); // nada guardado aún
        expect(ana.nuevoRegistro("programa", baseCompactada(estado(ana), registro(ana)), { continuidad: true }).ok).toBe(true);
        await pasar(3000);
        const b = estado(ana).bloques.find((x) => x.id === "b3")!;
        const aportes = (estado(ana).datos.b3 as { aportes: Record<string, number> }).aportes;
        expect(b.tipo === "contador" && totalContador(b, aportes)).toBe(200);
        expect(registro(ana).log).toHaveLength(0);
        expect(ana.getSnapshot().pendientes).toBe(0);
        // y lo guardado (lo que verá quien llegue después) dice lo mismo
        const tarde = await abrir("beto");
        expect(JSON.stringify(estado(tarde))).toBe(JSON.stringify(estado(ana)));
    });

    test("si dos personas compactan a la vez gana una sola y el resultado es el mismo para todas", async () => {
        almacen.doc = docDePlantilla("lista-compartida");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        for (let i = 0; i < 5; i++) ana.proponer("tarea.add", { b: "b2", texto: `t${i}` });
        red.entregarTodo();
        await pasar(3000);
        vi.setSystemTime(new Date("2026-09-28T12:00:05Z"));
        expect(ana.nuevoRegistro("programa", baseCompactada(estado(ana), registro(ana)), { continuidad: true }).ok).toBe(true);
        vi.setSystemTime(new Date("2026-09-28T12:00:06Z"));
        expect(beto.nuevoRegistro("programa", baseCompactada(estado(beto), registro(beto)), { continuidad: true }).ok).toBe(true);
        red.entregarTodo();
        await pasar(3000);
        red.entregarTodo();
        await pasar(3000);
        expect(registro(ana).id).toBe(registro(beto).id);
        expect(JSON.stringify(estado(ana))).toBe(JSON.stringify(estado(beto)));
        expect((estado(ana).datos.b2 as { items: unknown[] }).items).toHaveLength(8);
    });
});
