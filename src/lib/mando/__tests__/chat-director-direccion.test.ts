/**
 * DIR1111G · pestaña «Dirección», filtros de cada pestaña y canales iguales en Python y TypeScript.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    FILTRO_TODOS,
    aplicarFiltro,
    desdeEvento,
    esDireccion,
    filtrarFeed,
    opcionesDeFiltro,
    plegarDetalles,
} from "../chat-director-feed";
import {
    CANALES,
    PROVEEDORES_PRESIDENTE,
    canalDeDirector,
    esDirectorDeConversacion,
    ultimoModeloDirector,
    type MensajeDirector,
} from "../chat-director-tipos";

const AHORA = Date.parse("2026-11-11T12:00:00Z");

let n = 0;
function m(parcial: Partial<MensajeDirector>): MensajeDirector {
    n += 1;
    return {
        id: `md-${n}-aaaa`,
        t: "2026-11-11T11:30:00Z",
        de: "director-produccion",
        rol: "director",
        tipo: "informe",
        texto: `texto ${n}`,
        canal: "mando",
        ...parcial,
    };
}

/** Un feed parecido al real del 2026-11-11: mucha rutina, poca dirección. */
function feedReal() {
    const alex = m({ de: "alex", rol: "alex", tipo: "mensaje", canales: ["director-presidente"] });
    const aviso = m({ de: "desatascador", rol: "sistema", tipo: "aviso", canales: ["claude-cowork"] });
    return {
        alex,
        aviso,
        lista: [
            m({}), // director-produccion · rutina
            m({ de: "revisor-bloqueadas" }),
            aviso,
            m({ de: "hermes", tipo: "respuesta", canal: "hermes", respondeA: aviso.id }), // Hermes contestando a un robot
            alex,
            m({
                de: "director-presidente", tipo: "respuesta", canal: "director-presidente", respondeA: alex.id,
                modelo: "hermes/predeterminado", sintesis: true,
                eleccion: { proveedor: "hermes", modelo: "hermes/predeterminado", descartes: [{ proveedor: "claude", motivo: "límite" }] },
            }),
            m({ de: "hermes", tipo: "informe", canal: "hermes", sintesis: true }),
            m({ de: "claude-cowork", tipo: "informe", t: "2026-11-09T10:00:00Z" }),
            m({ de: "groq", tipo: "respuesta", respondeA: alex.id }),
            m({ de: "enjambre", rol: "agente", tipo: "actualizacion", evento: "commit" }),
            m({ de: "cartero", rol: "sistema", tipo: "uso" }),
        ],
    };
}

describe("qué es dirección", () => {
    it("Alex, el presidente, los directores de conversación y la respuesta a Alex; sin rutina", () => {
        const { lista } = feedReal();
        const dir = filtrarFeed(lista, "direccion").map((x) => `${x.de}/${x.tipo}`);
        expect(dir).toEqual([
            "alex/mensaje",
            "director-presidente/respuesta",
            "hermes/informe",
            "claude-cowork/informe",
            "groq/respuesta",
        ]);
    });

    it("Hermes contestando a un aviso del desatascador no es dirección", () => {
        const { lista, aviso } = feedReal();
        const porId = new Map(lista.map((x) => [x.id, x]));
        const r = lista.find((x) => x.respondeA === aviso.id)!;
        expect(esDireccion(r, porId)).toBe(false);
        // Sin poder ver el original, la respuesta de un director cuenta.
        expect(esDireccion(r, new Map())).toBe(true);
    });

    it("un servicio con nombre de director no es director de conversación", () => {
        expect(esDirectorDeConversacion("director-produccion")).toBe(false);
        expect(esDirectorDeConversacion("revisor-bloqueadas")).toBe(false);
        for (const d of ["hermes", "claude-cowork", "claude-mac", "chatgpt", "director-presidente"]) {
            expect(esDirectorDeConversacion(d)).toBe(true);
        }
        expect(canalDeDirector("codex")).toBe("chatgpt");
        expect(canalDeDirector("claude-supervisor")).toBe("claude-cowork");
        expect(canalDeDirector("vigia")).toBeNull();
    });

    it("un informe de rutina marcado como síntesis sí entra", () => {
        expect(esDireccion(m({ de: "revisor-bloqueadas", sintesis: true }))).toBe(true);
    });
});

describe("filtros de la pestaña Dirección", () => {
    const { lista, alex } = feedReal();
    const dir = filtrarFeed(lista, "direccion");

    it("ofrece todos, el presidente, cada director presente y la síntesis", () => {
        const ids = opcionesDeFiltro("direccion", dir, AHORA).map((o) => o.id);
        expect(ids[0]).toBe(FILTRO_TODOS);
        expect(ids).toContain("presidente");
        expect(ids).toContain("director:hermes");
        expect(ids).toContain("director:claude-cowork");
        expect(ids).toContain("sintesis");
        expect(ids).not.toContain("director:director-presidente");
    });

    it("«Director presidente» deja el hilo con él: lo que Alex le escribió y su respuesta", () => {
        expect(aplicarFiltro(dir, "presidente", AHORA).map((x) => x.de)).toEqual(["alex", "director-presidente"]);
    });

    it("un director: lo suyo y lo que contestó como presidente", () => {
        const h = aplicarFiltro(dir, "director:hermes", AHORA);
        expect(h.map((x) => `${x.de}/${x.tipo}`)).toEqual(["director-presidente/respuesta", "hermes/informe"]);
        // Alex escribió al presidente, no a Hermes: no entra en el de Claude.
        expect(aplicarFiltro(dir, "director:claude-cowork", AHORA).map((x) => x.de)).toEqual(["claude-cowork"]);
        expect(alex.canales).toEqual(["director-presidente"]);
    });

    it("solo síntesis", () => {
        expect(aplicarFiltro(dir, "sintesis", AHORA)).toHaveLength(2);
    });
});

describe("filtros del resto de pestañas: solo lo que tiene algo detrás", () => {
    it("Todo: sin el enjambre y por hora", () => {
        const { lista } = feedReal();
        const ids = opcionesDeFiltro("todo", lista, AHORA).map((o) => o.id);
        expect(ids).toEqual([FILTRO_TODOS, "sin-enjambre", "t:hora"]);
        expect(aplicarFiltro(lista, "sin-enjambre", AHORA).some((x) => x.tipo === "actualizacion")).toBe(false);
        // «Hoy» deja lo mismo que «Última hora»: no se ofrece dos veces.
        expect(aplicarFiltro(lista, "t:hoy", AHORA).length).toBe(lista.length - 1);
        expect(aplicarFiltro(lista, "t:hora", AHORA).length).toBe(lista.length - 1);
    });

    it("Informes: por tipo y por autor", () => {
        const informes = filtrarFeed(feedReal().lista, "informes");
        const ops = opcionesDeFiltro("informes", informes, AHORA);
        expect(ops.map((o) => o.id)).toEqual(expect.arrayContaining(["tipo:informe", "tipo:aviso", "de:hermes"]));
        expect(aplicarFiltro(informes, "tipo:aviso", AHORA).every((x) => x.tipo === "aviso")).toBe(true);
    });

    it("Enjambre: grupos de eventos que existen, nada más", () => {
        const fila = (tipo: string, texto = "x") => desdeEvento({ t: "2026-11-11T11:59:00Z", tipo, texto, tarea: "T1" })!;
        const enj = [fila("commit"), fila("fallo_tests"), fila("rechazada"), fila("arranque")];
        const ids = opcionesDeFiltro("enjambre", enj, AHORA).map((o) => o.id);
        expect(ids).toEqual([FILTRO_TODOS, "evento:fallos", "evento:commits"]);
        expect(aplicarFiltro(enj, "evento:fallos", AHORA)).toHaveLength(2);
        expect(desdeEvento({ t: "x", tipo: "", texto: "cola terminada: 3" })?.evento).toBe("cola_terminada");
    });

    it("un filtro que no deja nada se ofrece si está activo, con su cuenta a cero", () => {
        const { lista } = feedReal();
        const dir = filtrarFeed(lista, "direccion");
        const ops = opcionesDeFiltro("direccion", dir, AHORA, "director:chatgpt");
        expect(ops.find((o) => o.id === "director:chatgpt")).toMatchObject({ cuenta: 0, etiqueta: "ChatGPT" });
        expect(aplicarFiltro(dir, "director:chatgpt", AHORA)).toEqual([]);
    });

    it("con la lista vacía solo queda «Todos»", () => {
        for (const p of ["todo", "direccion", "conversacion", "informes", "enjambre", "usos"] as const) {
            expect(opcionesDeFiltro(p, [], AHORA).map((o) => o.id)).toEqual([FILTRO_TODOS]);
        }
    });
});

describe("entregas y modelo del presidente", () => {
    it("plegarDetalles guarda el detalle de la ÚLTIMA entrega", () => {
        const d = plegarDetalles([
            { tipo: "entrega", de_id: "a", canal: "director-presidente", estado: "pendiente", t: "1", detalle: "En cola: x" },
            { tipo: "entrega", de_id: "b", canal: "director-presidente", estado: "pendiente", t: "1", detalle: "En cola: y" },
            { tipo: "entrega", de_id: "b", canal: "director-presidente", estado: "respondido", t: "2" },
        ]);
        expect(d).toEqual({ a: { "director-presidente": "En cola: x" } });
    });

    it("tras una respuesta del presidente se le sigue escribiendo a él", () => {
        const r = m({ de: "director-presidente", tipo: "respuesta", canal: "director-presidente", modelo: "hermes/predeterminado" });
        expect(ultimoModeloDirector([r])).toBe("director-presidente/auto");
    });
});

describe("Python y TypeScript no se separan", () => {
    const raiz = path.resolve(__dirname, "../../../..");
    const py = readFileSync(path.join(raiz, "scripts/puente/director_chat.py"), "utf8");
    const pres = readFileSync(path.join(raiz, "scripts/puente/director_presidente.py"), "utf8");

    it("la misma lista de canales, en el mismo orden", () => {
        const bloque = /^CANALES = \(([\s\S]*?)\)/m.exec(py)?.[1] ?? "";
        const ids = [...bloque.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        expect(ids).toEqual(CANALES.map((c) => c.id));
    });

    it("los mismos proveedores del presidente", () => {
        const bloque = /^PROVEEDORES = \(([^)]*)\)/m.exec(pres)?.[1] ?? "";
        const ids = [...bloque.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        expect(ids).toEqual(PROVEEDORES_PRESIDENTE.map((p) => p.id));
    });
});
