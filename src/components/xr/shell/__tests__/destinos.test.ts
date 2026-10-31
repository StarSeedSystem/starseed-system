/**
 * Pruebas del nodo Horizon (XR1010AO): la parte pura `destinos.ts`, en Node y sin red.
 * El contrato de sala (`sala.ts`) ya está probado en su sitio: aquí se prueba que el
 * listado de Horizon lo usa de VERDAD (rol, permisos, transporte) y ordena/oculta como
 * pide el contrato de XR §3 h.
 */
import { describe, expect, it } from "vitest";
import type { Sala } from "@/lib/salas/sala";
import {
    estacionASala,
    listarDestinos,
    mundosASalas,
    type DatosDestinos,
    type GrupoDestinos,
} from "../destinos";

const yo = "ana";

function sala(extra: Partial<Sala> & { id: string; titulo: string }): Sala {
    return {
        tipo: "escena3d",
        visibilidad: "publica",
        transporte: "local",
        miembros: {},
        creadaEn: 0,
        ...extra,
    };
}

function con(lista: Sala[], clave: Exclude<keyof DatosDestinos, "alcanzabilidad">): DatosDestinos {
    return { mundos: [], estaciones: [], servidores: [], grupos: [], salas: [], [clave]: lista } as DatosDestinos;
}

function grupo(categorias: string, datos: DatosDestinos): GrupoDestinos {
    const g = listarDestinos(datos, yo).find((x) => x.categoria === categorias);
    if (!g) throw new Error(`No hay grupo ${categorias}`);
    return g;
}

describe("listarDestinos · nodo Horizon", () => {
    it("los públicos se ordenan después de los privados, con la etiqueta «Público»", () => {
        const g = grupo("servidores", con([sala({ id: "b", titulo: "Público el último" }), sala({ id: "a", titulo: "Mío privado", visibilidad: "privada", miembros: { [yo]: "dueno" } })], "servidores"));
        expect(g.items.map((d) => d.id)).toEqual(["a", "b"]);
        expect(g.items[1].etiqueta).toBe("Público");
        expect(g.items[0].etiqueta).toBe("Privada");
    });

    it("rol y permisos salen de sala.ts: dueño edita, comentarista mira", () => {
        const g = grupo("mis-mundos", con([sala({ id: "x1", titulo: "Sala", visibilidad: "privada", miembros: { [yo]: "dueno" } }), sala({ id: "x2", titulo: "Otra", visibilidad: "privada", miembros: { [yo]: "comentarista" } })], "mundos"));
        expect(g.items[0].rol).toBe("dueno");
        expect(g.items[0].puedeEditar).toBe(true);
        expect(g.items[1].rol).toBe("comentarista");
        expect(g.items[1].puedeEditar).toBe(false);
        expect(g.items[0].puedeVer).toBe(true);
    });

    it("una sala privada nunca se muestra con transporte público (aunque haya camino público)", () => {
        const privada = sala({ id: "p1", titulo: "Cerrada", visibilidad: "privada", miembros: { [yo]: "dueno" } });
        const servidores = grupo("servidores", con([privada], "servidores"));
        const salas = grupo("mis-mundos", con([privada], "salas"));
        for (const d of [...servidores.items, ...salas.items]) {
            expect(d.transporte).not.toBe("servidor-publico");
            expect(d.transporte === "malla-p2p" || d.transporte === "servidor-privado").toBe(true);
        }
    });

    it("lo que no se puede ver no aparece en el listado", () => {
        const invisible = sala({ id: "oculta", titulo: "Ajena", visibilidad: "privada", miembros: {} });
        const g = grupo("servidores", con([invisible], "servidores"));
        expect(g.items.some((d) => d.id === "oculta")).toBe(false);
    });

    it("una pública sin ser miembro: rol null, se ve pero no se edita", () => {
        const g = grupo("servidores", con([sala({ id: "pub", titulo: "De todos", visibilidad: "publica" })], "servidores"));
        expect(g.items[0].rol).toBeNull();
        expect(g.items[0].puedeVer).toBe(true);
        expect(g.items[0].puedeEditar).toBe(false);
    });

    it("listas vacías → grupos vacíos sin romper", () => {
        const grupos = listarDestinos({ mundos: [], estaciones: [], servidores: [], grupos: [], salas: [] }, yo);
        expect(grupos).toHaveLength(4);
        for (const g of grupos) expect(g.items).toEqual([]);
    });

    it("los mundos y las salas caen juntos en «mis-mundos»; las estaciones en su grupo", () => {
        const datos: DatosDestinos = {
            mundos: [sala({ id: "m1", titulo: "Mi mundo", visibilidad: "privada", miembros: { [yo]: "dueno" } })],
            estaciones: [sala({ id: "e1", titulo: "Radio en vivo" })],
            servidores: [],
            grupos: [],
            salas: [sala({ id: "s1", titulo: "Pizarra mía", visibilidad: "privada", miembros: { [yo]: "dueno" } })],
        };
        const todo = listarDestinos(datos, yo);
        expect(todo.find((g) => g.categoria === "mis-mundos")?.items.map((d) => d.id)).toEqual(["m1", "s1"]);
        expect(todo.find((g) => g.categoria === "estaciones-en-vivo")?.items.map((d) => d.id)).toEqual(["e1"]);
    });

    it("mundosASalas: escenas propias son del dueño, privadas, con su id y nombre", () => {
        const [s] = mundosASalas([{ refId: "ref1", titulo: "Jardín" }], yo);
        expect(s.id).toBe("ref1");
        expect(s.titulo).toBe("Jardín");
        expect(s.visibilidad).toBe("privada");
        expect(s.miembros[yo]).toBe("dueno");
    });

    it("estacionASala: pública sin dueño presente deja pasar como observador; el dueño es dueño", () => {
        const ajena = estacionASala({ id: "e9", titulo: "Cumbre", visibilidad: "publica", owner_id: "otra" }, yo);
        expect(ajena.miembros[yo]).toBe("observador");
        expect(ajena.visibilidad).toBe("publica");
        const mia = estacionASala({ id: "e10", titulo: "La mía", visibilidad: "grupo", owner_id: yo }, yo);
        expect(mia.miembros[yo]).toBe("dueno");
        expect(mia.visibilidad).toBe("grupo");
    });
});
