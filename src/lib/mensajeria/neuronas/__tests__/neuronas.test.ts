import { describe, expect, it } from "vitest";
import {
    BANDEJA_VACIA,
    actualizarMensaje,
    anadirMensaje,
    claveEntrante,
    enEspera,
    guardarVia,
    leerBandeja,
    leerCuerpoChatMalla,
    leerCuerpoNeurona,
    marcarLeida,
    noLeidosDe,
    noLeidosNeuronas,
    ultimoDe,
    type MensajeMalla,
} from "../bandeja";
import { agruparNeuronasPorCerebro, neuronasExplicitas } from "../agrupar";

function msg(p: Partial<MensajeMalla> & Pick<MensajeMalla, "id" | "clave">): MensajeMalla {
    return { dir: "entra", texto: "hola", at: 1000, estado: "recibido", ...p };
}

describe("bandeja de la malla", () => {
    it("añade en orden, descarta el duplicado entrante y cuenta los no leídos", () => {
        let e = anadirMensaje(BANDEJA_VACIA, msg({ id: "b", clave: "n:1", at: 2000 }));
        e = anadirMensaje(e, msg({ id: "a", clave: "n:1", at: 1000 }));
        e = anadirMensaje(e, msg({ id: "a", clave: "n:1", at: 1000, texto: "otra vez (otro camino)" }));
        e = anadirMensaje(e, msg({ id: "s", clave: "n:1", at: 3000, dir: "sale", estado: "enviado" }));
        e = anadirMensaje(e, msg({ id: "d", clave: "dm:h1", at: 3000 }));
        expect(e.conv["n:1"].mensajes.map((m) => m.id)).toEqual(["a", "b", "s"]);
        expect(e.conv["n:1"].mensajes[0].texto).toBe("hola");
        expect(noLeidosDe(e, "n:1")).toBe(2);
        // Los chats por la malla no cuentan en la pastilla de Neuronas.
        expect(noLeidosNeuronas(e)).toBe(2);
        e = marcarLeida(e, "n:1", 2000);
        expect(noLeidosNeuronas(e)).toBe(0);
        expect(ultimoDe(e, "n:1")?.id).toBe("s");
        expect(BANDEJA_VACIA.conv).toEqual({});
    });

    it("recorta cada conversación y actualiza estados; lo que espera se puede reintentar", () => {
        let e = BANDEJA_VACIA;
        for (let i = 0; i < 5; i++) e = anadirMensaje(e, msg({ id: `m${i}`, clave: "n:1", at: i, dir: "sale", estado: "en-espera" }), 3);
        expect(e.conv["n:1"].mensajes.map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
        expect(enEspera(e).map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
        e = actualizarMensaje(e, "n:1", "m3", { estado: "confirmado" });
        expect(enEspera(e).map((m) => m.id)).toEqual(["m2", "m4"]);
        expect(actualizarMensaje(e, "n:9", "x", { estado: "fallido" })).toBe(e);
    });

    it("guarda vías con tope y sobrevive a lo guardado roto; lo que quedó «enviando» pasa a esperar", () => {
        let e = BANDEJA_VACIA;
        for (let i = 0; i < 4; i++) e = guardarVia(e, `id${i}`, { medio: "servidor", direccion: "sale", confirmado: true, en: i }, 2);
        expect(Object.keys(e.vias).sort()).toEqual(["id2", "id3"]);
        expect(leerBandeja("{roto")).toEqual(BANDEJA_VACIA);
        expect(leerBandeja(JSON.stringify({ v: 2 }))).toEqual(BANDEJA_VACIA);
        const guardada = anadirMensaje(BANDEJA_VACIA, msg({ id: "x", clave: "n:1", dir: "sale", estado: "enviando" }));
        const leida = leerBandeja(JSON.stringify(guardada));
        expect(leida.conv["n:1"].mensajes[0].estado).toBe("en-espera");
    });

    it("valida los cuerpos que llegan y decide la conversación", () => {
        expect(leerCuerpoNeurona({ mid: "1", txt: "  " })).toBeNull();
        expect(leerCuerpoNeurona({ mid: "x".repeat(81), txt: "hola" })).toBeNull();
        const c = leerCuerpoNeurona({ mid: "1", txt: "hola", de: { n: "neu-a", u: "yo" }, para: { n: "neu-b" } });
        expect(c).toMatchObject({ mid: "1", de: { n: "neu-a", u: "yo" }, para: { n: "neu-b" } });
        expect(claveEntrante(c!, "yo")).toBe("n:neu-a");
        expect(claveEntrante({ ...c!, de: { n: "neu-z", u: "otra" } }, "yo")).toBe("c:otra");
        expect(leerCuerpoChatMalla({ mid: "1", h: "hilo", txt: "hola", de: { u: "u1" } })).toMatchObject({ h: "hilo", de: { u: "u1" } });
        expect(leerCuerpoChatMalla({ mid: "1", txt: "sin hilo" })).toBeNull();
    });
});

describe("agruparNeuronasPorCerebro", () => {
    const neuronas = [
        { id: "mac", name: "Mac de Alex", isThisDevice: true, online: true },
        { id: "tab", name: "Tablet", online: true, kind: "tablet" },
        { id: "a1", name: "Servidor A1", online: false, kind: "server" },
    ];

    it("junta los cerebros con las mismas neuronas y no lista esta neurona", () => {
        const r = agruparNeuronasPorCerebro({
            cerebros: [
                { id: "c1", name: "Cerebro StarSeed", scope: "account", owner: "yo" },
                { id: "c2", name: "Huerta", scope: "group", owner: "yo" },
            ],
            neuronas,
            miUid: "yo",
        });
        expect(r.estaNeurona?.id).toBe("mac");
        expect(r.secciones).toHaveLength(1);
        expect(r.secciones[0]).toMatchObject({ titulo: "Cerebro StarSeed · Huerta", ambito: "cuenta" });
        // En línea primero.
        expect(r.secciones[0].conversaciones.map((c) => c.clave)).toEqual(["n:tab", "n:a1"]);
        expect(r.secciones[0].conversaciones[0].destino).toEqual({ neuronDeviceId: "tab" });
        expect(r.total).toBe(2);
    });

    it("respeta las neuronas vinculadas a un cerebro concreto y los cerebros compartidos de otras cuentas", () => {
        const r = agruparNeuronasPorCerebro({
            cerebros: [
                { id: "c1", name: "Principal", scope: "account", owner: "yo" },
                { id: "c3", name: "Casero", scope: "group", owner: "yo", servers: [{ config: { connector: "casaos", neuronId: "a1" } }] },
                { id: "g1", name: "Cerebro de la comunidad", scope: "group", owner: "ana", compartido: true },
            ],
            neuronas,
            miUid: "yo",
            clavesConMensajes: ["n:vieja", "c:ana", "dm:h1"],
            nombresConocidos: { "n:vieja": "Móvil viejo" },
        });
        const titulos = r.secciones.map((s) => `${s.ambito}:${s.titulo}`);
        expect(titulos).toEqual(["cuenta:Principal", "grupo:Casero", "compartido:Cerebro de la comunidad", "otras:Otras neuronas"]);
        expect(r.secciones[1].conversaciones.map((c) => c.clave)).toEqual(["n:a1"]);
        expect(r.secciones[2].conversaciones[0]).toMatchObject({ clave: "c:ana", destino: { uid: "ana" }, propia: false });
        expect(r.secciones[3].conversaciones).toEqual([expect.objectContaining({ clave: "n:vieja", nombre: "Móvil viejo" })]);
    });

    it("sin cerebros enseña las neuronas de la cuenta; lee los vínculos explícitos con cualquier forma", () => {
        const r = agruparNeuronasPorCerebro({ cerebros: [], neuronas, miUid: "yo" });
        expect(r.secciones[0]).toMatchObject({ id: "cuenta", titulo: "Neuronas de tu cuenta" });
        expect(neuronasExplicitas({ id: "x", name: "x", servers: [{ neuronId: "a" }, { neuron_id: "b" }, { config: { neuronId: "a" } }] })).toEqual(["a", "b"]);
        // Solo esta neurona: no hay con quién hablar (ni secciones vacías).
        expect(agruparNeuronasPorCerebro({ cerebros: [{ id: "c1", name: "C", owner: "yo" }], neuronas: [neuronas[0]], miUid: "yo" }).secciones).toEqual([]);
    });
});
