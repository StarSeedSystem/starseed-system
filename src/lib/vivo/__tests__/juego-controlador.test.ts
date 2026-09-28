/**
 * El controlador con varias personas a la vez (red y guardado falsos): las jugadas viajan y se
 * validan en cada cliente, una jugada remota inválida se rechaza, una recarga o alguien que llega
 * tarde reconstruye la partida repitiendo el diario guardado, las carreras se resuelven igual en
 * todos y las instantáneas son estables.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { INSTANTANEA_VACIA, type Controlador } from "../juegos/controlador";
import { baseDePartida, type EstadoMesa } from "../juegos/mesa";
import type { Registro } from "../juegos/tipos";
import { AlmacenFalso, RedFalsa, crearCliente, docInicial } from "./juego-red-falsa";

let red: RedFalsa;
let almacen: AlmacenFalso;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    red = new RedFalsa();
    almacen = new AlmacenFalso();
    almacen.doc = docInicial("juego");
});

afterEach(() => {
    vi.useRealTimers();
});

const mesaDe = (c: Controlador) => c.getSnapshot().estado as EstadoMesa;
const registroDe = (c: Controlador) => c.getSnapshot().registro as Registro;

async function abrir(uid: string, extra: Parameters<typeof crearCliente>[3] = {}): Promise<Controlador> {
    const c = crearCliente(uid, red, almacen, extra);
    await c.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    return c;
}

async function pasar(ms = 200): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}

/** Ana crea una partida de `juego` y las dos personas se sientan. */
async function partidaDeDos(juego: "tres-en-raya" | "conecta-4" | "ajedrez" = "tres-en-raya") {
    const ana = await abrir("ana");
    const beto = await abrir("beto");
    expect(ana.nuevoRegistro(juego, baseDePartida(juego, "ana", 1))).toEqual({ ok: true });
    red.entregarTodo();
    expect(ana.proponer("sentar", { nombre: "Ana" })).toEqual({ ok: true });
    red.entregarTodo();
    expect(beto.proponer("sentar", { nombre: "Beto" })).toEqual({ ok: true });
    red.entregarTodo();
    await pasar();
    return { ana, beto };
}

describe("jugar entre dos", () => {
    test("las jugadas viajan por la red y las dos personas ven la misma partida", async () => {
        const { ana, beto } = await partidaDeDos();
        expect(mesaDe(ana).iniciada).toBe(true);
        expect(mesaDe(beto).iniciada).toBe(true);
        expect(ana.proponer("jugar", { c: 4 })).toEqual({ ok: true });
        red.entregarTodo();
        expect(beto.proponer("jugar", { c: 0 })).toEqual({ ok: true });
        red.entregarTodo();
        expect(JSON.stringify(mesaDe(ana))).toBe(JSON.stringify(mesaDe(beto)));
        expect(registroDe(ana).log.map((e) => e.k)).toEqual(["sentar", "sentar", "jugar", "jugar"]);
    });

    test("una jugada fuera de turno se rechaza en local sin difundirse", async () => {
        const { ana, beto } = await partidaDeDos();
        const antes = red.enviados.length;
        expect(beto.proponer("jugar", { c: 4 })).toEqual({ ok: false, motivo: "No es tu turno." });
        expect(red.enviados.length).toBe(antes);
        expect(ana.proponer("jugar", { c: 4 }).ok).toBe(true);
    });

    test("una jugada REMOTA inválida (forjada) se rechaza y no cambia nada", async () => {
        const { ana, beto } = await partidaDeDos();
        const n = registroDe(ana).log.length;
        const antes = JSON.stringify(mesaDe(ana));
        const reg = registroDe(ana);
        // Un mirón (o un cliente tramposo) difunde una jugada con el número correcto, pero no es su turno.
        const forjada = { id: "falsa-1", n, u: "mirón", t: Date.now(), k: "jugar", d: { c: 4 } };
        red.inyectar("mirón", "op", { rid: reg.id, gen: reg.gen, e: forjada });
        // Y otra de beto, que sí juega pero fuera de turno (le toca a ana).
        red.inyectar("beto", "op", { rid: reg.id, gen: reg.gen, e: { id: "falsa-2", n, u: "beto", t: Date.now(), k: "jugar", d: { c: 4 } } });
        // Y una casilla que no existe, con turno correcto.
        red.inyectar("ana", "op", { rid: reg.id, gen: reg.gen, e: { id: "falsa-3", n, u: "ana", t: Date.now(), k: "jugar", d: { c: 99 } } });
        red.entregar();
        expect(JSON.stringify(mesaDe(ana))).toBe(antes);
        expect(ana.getSnapshot().rechazadas).toBe(2); // la tercera la envió la propia ana: no le llega
        expect(beto.getSnapshot().rechazadas).toBe(2);
        expect(registroDe(ana).log).toHaveLength(n);
    });

    test("mensajes basura o mal formados no tumban la sala", async () => {
        const { ana } = await partidaDeDos();
        const reg = registroDe(ana);
        for (const carga of [null, 42, "x", {}, { rid: reg.id }, { rid: reg.id, gen: reg.gen, e: { n: "a" } }, { rid: reg.id, gen: reg.gen, e: { id: "a", n: -1, u: "x", t: 1, k: "j" } }]) {
            red.inyectar("mirón", "op", carga);
        }
        red.inyectar("mirón", "sync", { registro: { id: 3 } });
        red.inyectar("mirón", "registro", "hola");
        red.inyectar("mirón", "loquesea", {});
        expect(() => red.entregar()).not.toThrow();
        expect(ana.getSnapshot().fase).toBe("listo");
    });

    test("una entrada con marca de tiempo del futuro lejano se rechaza", async () => {
        const { ana } = await partidaDeDos();
        const reg = registroDe(ana);
        red.inyectar("ana", "op", {
            rid: reg.id,
            gen: reg.gen,
            e: { id: "futuro", n: reg.log.length, u: "ana", t: Date.now() + 3_600_000, k: "jugar", d: { c: 0 } },
        });
        red.entregar();
        expect(registroDe(ana).log).toHaveLength(reg.log.length);
    });

    test("jugadas que llegan desordenadas se guardan y se aplican cuando llega la anterior", async () => {
        const { ana, beto } = await partidaDeDos();
        const carla = await abrir("carla");
        red.entregarTodo();
        await pasar(300);
        const antes = registroDe(carla).log.length;

        ana.proponer("jugar", { c: 4 });
        const deAna = red.cola.splice(0);
        red.cola.push(...deAna);
        red.entregar((_m, para) => para === "beto"); // solo beto la recibe por ahora
        beto.proponer("jugar", { c: 0 });
        const deBeto = red.cola.splice(0);

        // Carla recibe primero la de beto (n+1) y después la de ana (n): tiene que ordenarlas.
        red.cola.push(...deBeto);
        red.entregar((_m, para) => para === "carla");
        expect(registroDe(carla).log).toHaveLength(antes); // guardada aparte, no aplicada
        red.cola.push(...deAna);
        red.entregar((_m, para) => para === "carla");
        expect(registroDe(carla).log).toHaveLength(antes + 2);

        red.cola.push(...deBeto);
        red.entregar((_m, para) => para === "ana");
        for (const c of [ana, beto]) expect(JSON.stringify(mesaDe(c))).toBe(JSON.stringify(mesaDe(carla)));
    });
});

describe("guardado, recarga y quien llega tarde", () => {
    test("el diario se guarda con espera (una escritura por ráfaga) y el guardado tiene todo", async () => {
        const { ana, beto } = await partidaDeDos("conecta-4");
        const antes = almacen.escrituras;
        ana.proponer("jugar", { c: 3 });
        red.entregarTodo();
        beto.proponer("jugar", { c: 3 });
        red.entregarTodo();
        ana.proponer("jugar", { c: 2 });
        red.entregarTodo();
        expect(almacen.escrituras).toBe(antes); // aún dentro de la espera
        await pasar(300);
        expect(almacen.escrituras).toBeGreaterThan(antes);
        expect(almacen.escrituras - antes).toBeLessThanOrEqual(3);
        const guardado = (almacen.doc as { registro: Registro }).registro;
        expect(guardado.log.map((e) => e.k)).toEqual(["sentar", "sentar", "jugar", "jugar", "jugar"]);
    });

    test("quien llega tarde (sin ninguna otra persona conectada) reconstruye la partida del diario", async () => {
        const { ana, beto } = await partidaDeDos();
        ana.proponer("jugar", { c: 4 });
        red.entregarTodo();
        beto.proponer("jugar", { c: 0 });
        red.entregarTodo();
        ana.proponer("jugar", { c: 8 });
        red.entregarTodo();
        await pasar(300);
        const esperado = JSON.stringify(mesaDe(ana));
        ana.cerrar();
        beto.cerrar();

        const tardio = await abrir("carla");
        expect(JSON.stringify(mesaDe(tardio))).toBe(esperado);
        expect(tardio.getSnapshot().soloLectura).toBe(false);
        // Carla no está sentada: puede mirar, pero no mover.
        expect(tardio.proponer("jugar", { c: 1 }).ok).toBe(false);
    });

    test("recargar (mismo jugador, red nueva) reconstruye lo mismo y puede seguir jugando", async () => {
        const { ana, beto } = await partidaDeDos();
        ana.proponer("jugar", { c: 4 });
        red.entregarTodo();
        await pasar(300);
        ana.cerrar();
        red.nodos.delete("ana");
        const de_nuevo = await abrir("ana");
        expect(JSON.stringify(mesaDe(de_nuevo))).toBe(JSON.stringify(mesaDe(beto)));
        expect(beto.proponer("jugar", { c: 0 }).ok).toBe(true);
        red.entregarTodo();
        expect(de_nuevo.proponer("jugar", { c: 8 }).ok).toBe(true);
    });

    test("repetir el diario da exactamente el estado en vivo (determinismo)", async () => {
        const { ana, beto } = await partidaDeDos("ajedrez");
        const jugadas = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"];
        for (let i = 0; i < jugadas.length; i++) {
            const quien = i % 2 === 0 ? ana : beto;
            expect(quien.proponer("jugar", { m: jugadas[i] })).toEqual({ ok: true });
            red.entregarTodo();
        }
        for (const c of [ana, beto]) {
            expect(JSON.stringify(c.reconstruirDesdeCero())).toBe(JSON.stringify(mesaDe(c)));
        }
        expect(JSON.stringify(mesaDe(ana))).toBe(JSON.stringify(mesaDe(beto)));
    });

    test("alguien conectado que se perdió jugadas las pide a los demás (resincronización)", async () => {
        const { ana, beto } = await partidaDeDos();
        const carla = await abrir("carla");
        red.entregarTodo();
        await pasar(300);
        expect(JSON.stringify(mesaDe(carla))).toBe(JSON.stringify(mesaDe(ana)));
        // Carla pierde la red mientras se juegan dos jugadas y el guardado aún no ocurrió.
        red.sinRed("carla", true);
        ana.proponer("jugar", { c: 4 });
        red.entregarTodo();
        beto.proponer("jugar", { c: 0 });
        red.entregarTodo();
        red.sinRed("carla", false);
        // Llega la siguiente: Carla detecta el hueco y pide el resto.
        ana.proponer("jugar", { c: 8 });
        red.entregarTodo();
        await pasar(500);
        red.entregarTodo();
        await pasar(500);
        red.entregarTodo();
        expect(JSON.stringify(mesaDe(carla))).toBe(JSON.stringify(mesaDe(ana)));
    });
});

describe("carreras y conflictos", () => {
    test("dos personas ocupan a la vez el mismo asiento: gana una y la otra pasa al asiento libre", async () => {
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        ana.nuevoRegistro("tres-en-raya", baseDePartida("tres-en-raya", "ana", 1));
        red.entregarTodo();
        // Sin red entre ellas: las dos se sientan «en el primer libre» a la vez.
        red.sinRed("ana", true);
        red.sinRed("beto", true);
        ana.proponer("sentar", { nombre: "Ana" });
        beto.proponer("sentar", { nombre: "Beto" });
        red.sinRed("ana", false);
        red.sinRed("beto", false);
        // Cada una difunde otra vez su entrada al volver la red (simula el reenvío del guardado).
        await pasar(300);
        red.entregarTodo();
        await pasar(500);
        red.entregarTodo();
        await pasar(500);
        for (const c of [ana, beto]) {
            const m = mesaDe(c);
            expect(m.asientos.map((a) => a?.uid).sort()).toEqual(["ana", "beto"]);
            expect(m.iniciada).toBe(true);
        }
        expect(JSON.stringify(mesaDe(ana))).toBe(JSON.stringify(mesaDe(beto)));
        expect(ana.getSnapshot().pendientes + beto.getSnapshot().pendientes).toBe(0);
    });

    test("si lo que hizo una persona deja de ser posible tras la fusión, se le avisa", async () => {
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        ana.nuevoRegistro("tres-en-raya", baseDePartida("tres-en-raya", "ana", 1));
        red.entregarTodo();
        // Las dos piden EXACTAMENTE el asiento 0.
        red.sinRed("ana", true);
        red.sinRed("beto", true);
        ana.proponer("sentar", { nombre: "Ana", lado: 0 });
        beto.proponer("sentar", { nombre: "Beto", lado: 0 });
        red.sinRed("ana", false);
        red.sinRed("beto", false);
        await pasar(300);
        red.entregarTodo();
        await pasar(500);
        red.entregarTodo();
        await pasar(500);
        const m = mesaDe(ana);
        expect(m.asientos[0]).not.toBeNull();
        expect(m.asientos[1]).toBeNull();
        const perdedor = m.asientos[0]?.uid === "ana" ? beto : ana;
        expect(perdedor.getSnapshot().aviso).toMatch(/ya no era posible/);
        expect(JSON.stringify(mesaDe(ana))).toBe(JSON.stringify(mesaDe(beto)));
    });

    test("la regla de desempate es la misma en todas partes: gana la entrada de menor marca de tiempo", async () => {
        let relojAna = 5_000;
        let relojBeto = 4_000;
        const ana = await abrir("ana", { ahora: () => relojAna });
        const beto = await abrir("beto", { ahora: () => relojBeto });
        ana.nuevoRegistro("tres-en-raya", baseDePartida("tres-en-raya", "ana", 1));
        red.entregarTodo();
        red.sinRed("ana", true);
        red.sinRed("beto", true);
        ana.proponer("sentar", { nombre: "Ana", lado: 0 });
        beto.proponer("sentar", { nombre: "Beto", lado: 0 });
        red.sinRed("ana", false);
        red.sinRed("beto", false);
        await pasar(300);
        red.entregarTodo();
        await pasar(500);
        expect(mesaDe(ana).asientos[0]?.uid).toBe("beto"); // su marca es menor
        expect(mesaDe(beto).asientos[0]?.uid).toBe("beto");
    });
});

describe("revancha, historial y permisos", () => {
    test("una revancha crea un registro nuevo (gen +1), pasa el resumen al historial y todos lo adoptan", async () => {
        const { ana, beto } = await partidaDeDos();
        // Ana gana: 0,1,3,4,6 alternando → ana: 0,3,6 (columna)
        const secuencia: [Controlador, number][] = [[ana, 0], [beto, 1], [ana, 3], [beto, 4], [ana, 6]];
        for (const [c, celda] of secuencia) {
            expect(c.proponer("jugar", { c: celda }).ok).toBe(true);
            red.entregarTodo();
        }
        expect(mesaDe(beto).fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        const genAntes = registroDe(ana).gen;
        expect(beto.nuevoRegistro("tres-en-raya", baseDePartida("tres-en-raya", "ana", 2, { inicia: 1 }))).toEqual({ ok: true });
        red.entregarTodo();
        await pasar(300);
        expect(registroDe(ana).gen).toBe(genAntes + 1);
        expect(registroDe(ana).id).toBe(registroDe(beto).id);
        expect(registroDe(ana).log).toHaveLength(0);
        expect(ana.getSnapshot().historial).toHaveLength(1);
        expect(ana.getSnapshot().historial[0]).toMatchObject({ juego: "tres-en-raya", ganador: 0, nombres: ["Ana", "Beto"] });
        // El guardado tiene el historial.
        expect((almacen.doc as { historial: unknown[] }).historial).toHaveLength(1);
    });

    test("dos revanchas a la vez: todos se quedan con la misma", async () => {
        const { ana, beto } = await partidaDeDos();
        red.sinRed("ana", true);
        red.sinRed("beto", true);
        ana.nuevoRegistro("conecta-4", baseDePartida("conecta-4", "ana", 3));
        beto.nuevoRegistro("ajedrez", baseDePartida("ajedrez", "beto", 4));
        red.sinRed("ana", false);
        red.sinRed("beto", false);
        await pasar(300);
        ana.refrescar();
        beto.refrescar();
        await pasar(500);
        red.entregarTodo();
        await pasar(500);
        expect(registroDe(ana).id).toBe(registroDe(beto).id);
        expect(registroDe(ana).tipo).toBe(registroDe(beto).tipo);
    });

    test("si el guardado deniega la escritura, la sala pasa a solo lectura con un aviso claro", async () => {
        const { ana } = await partidaDeDos();
        almacen.denegados.add("ana");
        ana.proponer("jugar", { c: 4 });
        await pasar(300);
        expect(ana.getSnapshot().soloLectura).toBe(true);
        expect(ana.getSnapshot().aviso).toMatch(/solo tienes permiso para mirar/i);
        expect(ana.proponer("jugar", { c: 0 })).toEqual({ ok: false, motivo: "Tienes permiso solo para mirar." });
    });

    test("sin cuenta solo se mira, y quien puede mirar ve la partida en directo", async () => {
        const { ana } = await partidaDeDos();
        const espectador = crearCliente("", red, almacen);
        await espectador.iniciar();
        await pasar(0);
        expect(espectador.getSnapshot().soloLectura).toBe(true);
        expect(espectador.proponer("sentar", {})).toEqual({ ok: false, motivo: "Inicia sesión para participar." });
        ana.proponer("jugar", { c: 4 });
        red.entregarTodo();
        expect((espectador.getSnapshot().estado as EstadoMesa).n).toBe(3);
    });

    test("un espectador con permiso solo de lectura (RLS) ve la partida y no puede mover", async () => {
        const { ana } = await partidaDeDos();
        const mirón = await abrir("miron", { soloLectura: true });
        expect(mirón.getSnapshot().soloLectura).toBe(true);
        ana.proponer("jugar", { c: 4 });
        red.entregarTodo();
        expect((mirón.getSnapshot().estado as EstadoMesa).n).toBe(3);
        expect(mirón.proponer("jugar", { c: 0 }).ok).toBe(false);
    });
});

describe("fallos del guardado", () => {
    test("si guardar falla, se reintenta un número acotado de veces (sin bucle) y se avisa", async () => {
        const { ana } = await partidaDeDos();
        almacen.fallar = true;
        const antes = almacen.escrituras;
        ana.proponer("jugar", { c: 4 });
        await pasar(60_000);
        expect(almacen.escrituras).toBe(antes);
        expect(ana.getSnapshot().aviso).toMatch(/guardar/i);
        expect(vi.getTimerCount()).toBe(0); // no queda ningún reintento programado
        // Cuando el servidor vuelve, la siguiente acción guarda todo.
        almacen.fallar = false;
        ana.guardarExtra("nota", "hola");
        await pasar(500);
        expect(almacen.escrituras).toBeGreaterThan(antes);
        const guardado = (almacen.doc as { registro: Registro }).registro;
        expect(guardado.log.map((e) => e.k)).toEqual(["sentar", "sentar", "jugar"]);
    });

    test("un documento de otro tipo (una pizarra) no se abre como sala de juegos", async () => {
        almacen.doc = { blocks: [], edges: [] };
        const c = crearCliente("ana", red, almacen);
        await c.iniciar();
        expect(c.getSnapshot().fase).toBe("error");
        expect(c.getSnapshot().error).toMatch(/no es una sala/i);
    });

    test("un programa no se abre como sala de juegos, ni al revés", async () => {
        almacen.doc = docInicial("programa");
        const c = crearCliente("ana", red, almacen);
        await c.iniciar();
        expect(c.getSnapshot().fase).toBe("error");
        expect(c.getSnapshot().error).toMatch(/programa/i);
    });

    test("un espacio recién creado y vacío se abre como sala sin partida", async () => {
        almacen.doc = {};
        const c = await abrir("ana");
        expect(c.getSnapshot().fase).toBe("listo");
        expect(c.getSnapshot().registro).toBeNull();
        expect(c.proponer("jugar", {})).toEqual({ ok: false, motivo: "Aún no hay nada abierto." });
    });
});

describe("instantáneas estables (useSyncExternalStore)", () => {
    test("getSnapshot devuelve el MISMO objeto mientras nada cambia", async () => {
        const { ana } = await partidaDeDos();
        const a = ana.getSnapshot();
        expect(ana.getSnapshot()).toBe(a);
        expect(ana.getSnapshot()).toBe(a);
        await pasar(500);
        const b = ana.getSnapshot();
        expect(ana.getSnapshot()).toBe(b);
    });

    test("cambia de referencia solo cuando cambia algo, y avisa a los oyentes", async () => {
        const { ana } = await partidaDeDos();
        const oyente = vi.fn();
        const baja = ana.subscribe(oyente);
        const antes = ana.getSnapshot();
        ana.proponer("jugar", { c: 4 });
        expect(oyente).toHaveBeenCalled();
        expect(ana.getSnapshot()).not.toBe(antes);
        baja();
        const n = oyente.mock.calls.length;
        ana.proponer("jugar", { c: 4 }); // rechazada (fuera de turno)
        expect(oyente.mock.calls.length).toBe(n);
    });

    test("la instantánea vacía es siempre la misma y está congelada", () => {
        expect(INSTANTANEA_VACIA).toBe(INSTANTANEA_VACIA);
        expect(Object.isFrozen(INSTANTANEA_VACIA)).toBe(true);
        expect(INSTANTANEA_VACIA.fase).toBe("cargando");
        expect(INSTANTANEA_VACIA.registro).toBeNull();
    });

    test("cerrar suelta los oyentes y deja de reaccionar a la red", async () => {
        const { ana } = await partidaDeDos();
        const oyente = vi.fn();
        ana.subscribe(oyente);
        ana.cerrar();
        const n = oyente.mock.calls.length;
        red.inyectar("beto", "op", { rid: "x", gen: 1, e: {} });
        red.entregar();
        expect(oyente.mock.calls.length).toBe(n);
    });
});

describe("mensajes efímeros", () => {
    test("viajan por difusión, no se guardan y no llegan a quien los envía", async () => {
        const { ana, beto } = await partidaDeDos();
        const recibidos: unknown[] = [];
        beto.alEfimero("trazo", (c) => recibidos.push(c));
        const propios: unknown[] = [];
        ana.alEfimero("trazo", (c) => propios.push(c));
        const escrituras = almacen.escrituras;
        ana.enviarEfimero("trazo", { p: [1, 2] });
        red.entregar();
        expect(recibidos).toEqual([{ p: [1, 2] }]);
        expect(propios).toEqual([]);
        await pasar(500);
        expect(almacen.escrituras).toBe(escrituras);
    });

    test("los extras guardados (el dibujo) los gana la versión mayor y viajan por el guardado", async () => {
        const { ana, beto } = await partidaDeDos();
        ana.guardarExtra("lienzo", { r: 0, trazos: [1] });
        await pasar(300);
        expect((almacen.doc as { extras: Record<string, { d: unknown }> }).extras.lienzo.d).toEqual({ r: 0, trazos: [1] });
        await pasar(300);
        expect(beto.getSnapshot().extras.lienzo?.d).toEqual({ r: 0, trazos: [1] });
    });
});
