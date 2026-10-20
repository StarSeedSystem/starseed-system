import { describe, it, expect, vi, afterEach } from "vitest";
import { abrirCanalLlamadaPorEnlace } from "../canal-enlace-local";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { MetaPresencia, SenalLlamada } from "../tipos";

function crearParEnlaces(): [EnlaceLocalVivo, EnlaceLocalVivo, { cortar: () => void }] {
    type Cb = (data: string | ArrayBuffer) => void;
    let abiertoA = true;
    let abiertoB = true;
    let cortado = false;
    const cbsA = new Set<Cb>();
    const cbsB = new Set<Cb>();
    const base = {
        par: {} as EnlaceLocalVivo["par"],
        desde: 0,
        rttMs: () => null,
        ruta: () => null,
        capacidadKbps: () => null,
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => { /* sin flujo */ },
        cerrar: () => { /* no-op */ },
    };
    const a: EnlaceLocalVivo = {
        ...base,
        id: "local:a",
        abierto: () => abiertoA,
        enviar: (t) => { if (!cortado) cbsB.forEach((cb) => cb(t)); return true; },
        alMensaje: (cb) => { cbsA.add(cb); return () => { cbsA.delete(cb); }; },
    };
    const b: EnlaceLocalVivo = {
        ...base,
        id: "local:b",
        abierto: () => abiertoB,
        enviar: (t) => { if (!cortado) cbsA.forEach((cb) => cb(t)); return true; },
        alMensaje: (cb) => { cbsB.add(cb); return () => { cbsB.delete(cb); }; },
    };
    return [a, b, { cortar: () => { cortado = true; } }];
}

function meta(id: string): MetaPresencia {
    return {
        id,
        uid: null,
        nombre: `P ${id}`,
        avatar: null,
        invitado: true,
        micro: true,
        camara: false,
        pantalla: false,
        unido: 1,
    };
}

describe("canal-enlace-local", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("ambos lados se ven en presencia() al publicar", () => {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const cb = abrirCanalLlamadaPorEnlace(b, "s1", "b:1");
        ca.publicar(meta("a:1"));
        cb.publicar(meta("b:1"));
        expect(ca.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        expect(cb.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        ca.soltar();
        cb.soltar();
    });

    it("una señal enviada llega al otro por onSenal", () => {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const cb = abrirCanalLlamadaPorEnlace(b, "s1", "b:1");
        const recibidas: SenalLlamada[] = [];
        cb.onSenal((s) => { recibidas.push(s); });
        ca.enviar({ tipo: "colgar", de: "a:1" });
        expect(recibidas).toEqual([{ tipo: "colgar", de: "a:1" }]);
        ca.soltar();
        cb.soltar();
    });

    it("un mensaje de otra sesión se ignora", () => {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const cb = abrirCanalLlamadaPorEnlace(b, "otra", "b:1");
        ca.enviar({ tipo: "colgar", de: "a:1" });
        ca.publicar(meta("a:1"));
        expect(cb.presencia()).toEqual([]);
        expect(cb.tema).toBe("directo:otra");
        ca.soltar();
        cb.soltar();
    });

    it("retirar() borra al otro de la presencia", () => {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const cb = abrirCanalLlamadaPorEnlace(b, "s1", "b:1");
        ca.publicar(meta("a:1"));
        cb.publicar(meta("b:1"));
        expect(cb.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        ca.retirar();
        expect(cb.presencia().map((m) => m.id)).toEqual(["b:1"]);
        expect(ca.presencia().map((m) => m.id)).toEqual(["b:1"]);
        ca.soltar();
        cb.soltar();
    });

    it("sin repetición, la presencia del otro caduca a los 30 s", () => {
        vi.useFakeTimers();
        const [a, b, { cortar }] = crearParEnlaces();
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const cb = abrirCanalLlamadaPorEnlace(b, "s1", "b:1");
        cb.publicar(meta("b:1"));
        ca.publicar(meta("a:1"));
        cortar(); // nadie repite la presencia de A
        expect(cb.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        vi.advanceTimersByTime(31_000);
        expect(cb.presencia().map((m) => m.id)).toEqual(["b:1"]);
        cb.soltar();
    });

    it("onSuscrito se llama con true cuando el enlace se abre y false cuando se cierra", () => {
        vi.useFakeTimers();
        let abierto = true;
        const enlace: EnlaceLocalVivo = {
            par: {} as EnlaceLocalVivo["par"],
            desde: 0,
            rttMs: () => null,
            ruta: () => null,
            capacidadKbps: () => null,
            enviarBinario: () => true,
            bufferedAmount: () => 0,
            ponerPistas: async () => true,
            alFlujoRemoto: () => () => { /* sin flujo */ },
            cerrar: () => { /* no-op */ },
            id: "test",
            abierto: () => abierto,
            enviar: (texto: string) => true,
            alMensaje: (cb) => { return () => {}; },
        };
        const ca = abrirCanalLlamadaPorEnlace(enlace, "s1", "a:1");
        const suscriptores: boolean[] = [];
        ca.onSuscrito((ok) => suscriptores.push(ok));
        // Run pending timers to trigger the initial onSuscrito call
        vi.runOnlyPendingTimers();
        // initial call
        expect(suscriptores).toEqual([true]);
        // close the link
        abierto = false;
        vi.advanceTimersByTime(11_000);
        expect(suscriptores).toEqual([true, false]);
        // open the link
        abierto = true;
        vi.advanceTimersByTime(11_000);
        expect(suscriptores).toEqual([true, false, true]);
        ca.soltar();
    });
    it("onSuscrito no repite el aviso mientras el enlace no cambia y suscrito() lo refleja", () => {
        vi.useFakeTimers();
        const [a, ,] = crearParEnlaces();
        let abiertoA = true;
        const enlace: EnlaceLocalVivo = { ...a, abierto: () => abiertoA };
        const ca = abrirCanalLlamadaPorEnlace(enlace, "s1", "a:1");
        const eventos: boolean[] = [];
        ca.onSuscrito((ok) => { eventos.push(ok); });
        vi.runOnlyPendingTimers(); // aviso inicial
        expect(eventos).toEqual([true]);
        expect(ca.suscrito()).toBe(true);
        vi.advanceTimersByTime(30_000); // sigue abierto: el latido no repite el aviso
        expect(eventos).toEqual([true]);
        abiertoA = false;
        vi.advanceTimersByTime(10_000); // el latido ve la caída
        expect(eventos).toEqual([true, false]);
        expect(ca.suscrito()).toBe(false);
        abiertoA = true;
        vi.advanceTimersByTime(10_000); // el latido ve la vuelta: avisa true
        expect(eventos).toEqual([true, false, true]);
        expect(ca.suscrito()).toBe(true);
        ca.soltar();
    });

    it("onSuscrito avisa false al caerse el enlace y true al volver", () => {
        vi.useFakeTimers();
        let abierto = true;
        const enlace: EnlaceLocalVivo = {
            par: {} as EnlaceLocalVivo["par"],
            desde: 0,
            rttMs: () => null,
            ruta: () => null,
            capacidadKbps: () => null,
            enviarBinario: () => true,
            bufferedAmount: () => 0,
            ponerPistas: async () => true,
            alFlujoRemoto: () => () => { /* sin flujo */ },
            cerrar: () => { /* no-op */ },
            id: "test",
            abierto: () => abierto,
            enviar: (texto: string) => true,
            alMensaje: (cb) => { return () => {}; },
        };
        const ca = abrirCanalLlamadaPorEnlace(enlace, "s1", "a:1");
        const eventos: boolean[] = [];
        ca.onSuscrito((ok) => { eventos.push(ok); });
        vi.runOnlyPendingTimers();
        expect(eventos).toEqual([true]);
        eventos.splice(0);
        vi.advanceTimersByTime(10_000); // sigue abierto: el latido no repite el aviso inicial
        expect(eventos).toEqual([]);
        abierto = false;
        vi.advanceTimersByTime(10_000); // el latido ve la caída
        expect(eventos).toEqual([false]);
        expect(ca.suscrito()).toBe(false);
        abierto = true;
        vi.advanceTimersByTime(10_000); // el latido ve la vuelta: avisa true
        expect(eventos).toEqual([false, true]);
        expect(ca.suscrito()).toBe(true);
        ca.soltar();
    });
});

describe("canal-enlace-local · lo que llega del otro aparato se sanea", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    /** Un extremo de enlace con el canal abierto y un «aparato hostil» que le manda texto crudo. */
    function conHostil() {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const canal = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        const presencias: string[][] = [];
        const senales: SenalLlamada[] = [];
        canal.onPresencia((p) => presencias.push(p.map((m) => m.id)));
        canal.onSenal((s) => senales.push(s));
        const mandar = (obj: unknown) => b.enviar(JSON.stringify(obj));
        return { canal, mandar, presencias, senales };
    }

    it("la presencia ajena se limpia: nombre sin control, avatar peligroso fuera, estados solo si son verdad", () => {
        const { canal, mandar } = conHostil();
        mandar({
            t: "llc.pres",
            s: "s1",
            meta: {
                id: "b:1",
                uid: "u-b",
                nombre: "  Bea\n\u0000  ",
                avatar: "javascript:alert(1)",
                invitado: false,
                micro: true,
                camara: "sí",
                pantalla: 1,
                unido: 5,
                admin: true,
            },
        });
        expect(canal.presencia()).toEqual([
            { id: "b:1", uid: "u-b", nombre: "Bea", avatar: null, invitado: false, micro: true, camara: false, pantalla: false, unido: 5 },
        ]);
        canal.soltar();
    });

    it("una presencia sin id usable, con el id propio o que no es un objeto se rechaza", () => {
        const { canal, mandar, presencias } = conHostil();
        const base = { nombre: "X", avatar: null, invitado: true, micro: false, camara: false, pantalla: false, unido: 1 };
        mandar({ t: "llc.pres", s: "s1", meta: { ...base } }); // sin id
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: 42 } }); // id que no es texto
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: "" } }); // id vacío
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: "x".repeat(121) } }); // id desmesurado
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: "a:1" } }); // se hace pasar por mí
        mandar({ t: "llc.pres", s: "s1", meta: null });
        mandar({ t: "llc.pres", s: "s1", meta: "b:1" });
        expect(canal.presencia()).toEqual([]);
        expect(presencias).toEqual([]);
        canal.soltar();
    });

    it("las señales mal formadas no llegan al motor y la buena llega sin campos de más", () => {
        const { canal, mandar, senales } = conHostil();
        mandar({ t: "llc.senal", s: "s1", senal: { tipo: "senal", de: "b:1" } }); // sin destino ni contenido
        mandar({ t: "llc.senal", s: "s1", senal: { tipo: "senal", de: "b:1", para: "a:1", desc: { type: "pranswer", sdp: "x" } } });
        mandar({ t: "llc.senal", s: "s1", senal: { tipo: "senal", de: "b:1", para: "a:1", desc: { type: "offer", sdp: "x".repeat(70_000) } } });
        mandar({ t: "llc.senal", s: "s1", senal: "texto" });
        mandar({ t: "llc.senal", s: "s1" });
        expect(senales).toEqual([]);

        mandar({ t: "llc.senal", s: "s1", senal: { tipo: "senal", de: "b:1", para: "a:1", desc: { type: "offer", sdp: "v=0" }, extra: "x" } });
        expect(senales).toEqual([{ tipo: "senal", de: "b:1", para: "a:1", desc: { type: "offer", sdp: "v=0" } }]);
        canal.soltar();
    });

    it("el «fuera» de una pestaña vieja no retira a la nueva; el de la vigente sí", () => {
        const { canal, mandar } = conHostil();
        const base = { nombre: "B", avatar: null, invitado: true, micro: false, camara: false, pantalla: false, unido: 1 };
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: "b:1" } });
        mandar({ t: "llc.pres", s: "s1", meta: { ...base, id: "b:2" } }); // la misma persona, pestaña nueva
        expect(canal.presencia().map((m) => m.id)).toEqual(["b:2"]);

        mandar({ t: "llc.fuera", s: "s1", id: "b:1" }); // la pestaña vieja se cierra tarde
        expect(canal.presencia().map((m) => m.id)).toEqual(["b:2"]);
        mandar({ t: "llc.fuera", s: "s1" }); // sin id
        expect(canal.presencia().map((m) => m.id)).toEqual(["b:2"]);

        mandar({ t: "llc.fuera", s: "s1", id: "b:2" });
        expect(canal.presencia()).toEqual([]);
        canal.soltar();
    });

    it("quien llega tarde ve al instante a quien ya estaba, sin esperar al latido, y sin rebotes", () => {
        vi.useFakeTimers();
        const [a, b] = crearParEnlaces();
        const mensajes: string[] = [];
        for (const e of [a, b]) {
            const original = e.enviar;
            e.enviar = (t) => {
                mensajes.push(t);
                return original(t);
            };
        }
        const ca = abrirCanalLlamadaPorEnlace(a, "s1", "a:1");
        ca.publicar(meta("a:1")); // «a» ya estaba; «b» aún no tenía canal: este mensaje se pierde
        mensajes.length = 0;

        const cb = abrirCanalLlamadaPorEnlace(b, "s1", "b:1");
        cb.publicar(meta("b:1"));
        // «a» contesta al ver a «b» por primera vez: «b» ya la ve sin esperar los 10 s del latido.
        expect(cb.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        expect(ca.presencia().map((m) => m.id).sort()).toEqual(["a:1", "b:1"]);
        // Sin rebotes: la presencia de «b», la respuesta de «a» y la de «b» a ella; ahí se para.
        expect(mensajes).toHaveLength(3);
        ca.soltar();
        cb.soltar();
    });
});
