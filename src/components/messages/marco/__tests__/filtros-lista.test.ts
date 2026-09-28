import { describe, expect, it } from "vitest";
import type { DmThreadSummary } from "@/lib/messages/dm";
import {
    contarPorFiltro, esSolicitud, filtrarEntradas, filtrosVisibles, ordenarEntradas, seccionarEntradas,
    type EntradaLista, type EstadoHiloLista,
} from "../filtros-lista";

const YO = "yo";

function hilo(id: string, extra: Partial<DmThreadSummary> = {}): DmThreadSummary {
    return {
        id,
        kind: "dm",
        title: null,
        avatarUrl: null,
        createdBy: "otro",
        agent: null,
        meta: {},
        lastMsgAt: "2026-09-28T10:00:00.000Z",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastMessage: null,
        unreadCount: 0,
        memberIds: [YO, `p-${id}`],
        ...extra,
    } as DmThreadSummary;
}

const ESTADO: EstadoHiloLista = { fijado: false, archivado: false, restringido: false, silenciado: false, apodo: null };

type OpcionesEntrada = Partial<Omit<EntradaLista, "estado">> & { estado?: Partial<EstadoHiloLista>; hiloExtra?: Partial<DmThreadSummary> };

function entrada(id: string, o: OpcionesEntrada = {}): EntradaLista {
    return {
        hilo: hilo(id, o.hiloExtra),
        titulo: o.titulo ?? id,
        buscable: o.buscable ?? "",
        estado: { ...ESTADO, ...o.estado },
        esContacto: o.esContacto ?? false,
        esSolicitud: o.esSolicitud ?? false,
    };
}

describe("filtros de la lista de chats", () => {
    const entradas = [
        entrada("normal", { esContacto: true }),
        entrada("archivado", { estado: { archivado: true } }),
        entrada("restringido", { estado: { restringido: true } }),
        entrada("solicitud", { esSolicitud: true, hiloExtra: { unreadCount: 2 } }),
        entrada("grupo", { hiloExtra: { kind: "group", memberIds: [YO, "a", "b"], unreadCount: 3 } }),
    ];

    it("«Todos» esconde archivados, restringidos y solicitudes", () => {
        expect(filtrarEntradas(entradas, "todos").map((e) => e.hilo.id)).toEqual(["normal", "grupo"]);
    });

    it("«Archivados» enseña solo lo archivado", () => {
        expect(filtrarEntradas(entradas, "archivados").map((e) => e.hilo.id)).toEqual(["archivado"]);
    });

    it("«Solicitudes» enseña los DMs de fuera de tus contactos (y no cuentan como no leídos)", () => {
        expect(filtrarEntradas(entradas, "solicitudes").map((e) => e.hilo.id)).toEqual(["solicitud"]);
        expect(filtrarEntradas(entradas, "no-leidos").map((e) => e.hilo.id)).toEqual(["grupo"]);
    });

    it("«Restringidos», «Grupos» y «Contactos»", () => {
        expect(filtrarEntradas(entradas, "restringidos").map((e) => e.hilo.id)).toEqual(["restringido"]);
        expect(filtrarEntradas(entradas, "grupos").map((e) => e.hilo.id)).toEqual(["grupo"]);
        expect(filtrarEntradas(entradas, "contactos").map((e) => e.hilo.id)).toEqual(["normal"]);
    });

    it("buscar en «Todos» mira también restringidos y solicitudes, nunca archivados", () => {
        const r = filtrarEntradas(entradas, "todos", "o").map((e) => e.hilo.id);
        expect(r).toContain("restringido");
        expect(r).toContain("solicitud");
        expect(r).not.toContain("archivado");
    });

    it("la búsqueda ignora tildes y encuentra por el nombre del contacto", () => {
        const xs = [entrada("x", { titulo: "Chat", buscable: "Lucía Pérez" })];
        expect(filtrarEntradas(xs, "todos", "lucia")).toHaveLength(1);
        expect(filtrarEntradas(xs, "todos", "marta")).toHaveLength(0);
    });

    it("cuenta por filtro", () => {
        const c = contarPorFiltro(entradas);
        expect(c.archivados).toBe(1);
        expect(c.solicitudes).toBe(1);
        expect(c["no-leidos"]).toBe(1);
    });
});

describe("solicitudes", () => {
    const esContacto = (uid: string) => uid === "amiga";

    it("solo existen con «escribirme: solo contactos»", () => {
        expect(filtrosVisibles("todos")).not.toContain("solicitudes");
        expect(filtrosVisibles("contactos")).toContain("solicitudes");
        expect(esSolicitud(hilo("a"), YO, "todos", esContacto)).toBe(false);
    });

    it("un DM de alguien ajeno es solicitud; uno de un contacto o uno que abrí yo, no", () => {
        expect(esSolicitud(hilo("a"), YO, "contactos", esContacto)).toBe(true);
        expect(esSolicitud(hilo("a", { memberIds: [YO, "amiga"] }), YO, "contactos", esContacto)).toBe(false);
        expect(esSolicitud(hilo("a", { createdBy: YO }), YO, "contactos", esContacto)).toBe(false);
        expect(esSolicitud(hilo("g", { kind: "group" }), YO, "contactos", esContacto)).toBe(false);
    });
});

describe("orden y secciones", () => {
    const xs = [
        entrada("b-viejo", { titulo: "Beto", hiloExtra: { lastMsgAt: "2026-09-01T00:00:00.000Z" } }),
        entrada("a-nuevo", { titulo: "Ana", hiloExtra: { lastMsgAt: "2026-09-28T00:00:00.000Z" } }),
        entrada("c-pendiente", { titulo: "Cris", estado: { fijado: true }, hiloExtra: { lastMsgAt: "2026-09-10T00:00:00.000Z", unreadCount: 4 } }),
    ];

    it("ordena por reciente, por nombre y con los no leídos primero", () => {
        expect(ordenarEntradas(xs, "reciente").map((e) => e.hilo.id)).toEqual(["a-nuevo", "c-pendiente", "b-viejo"]);
        expect(ordenarEntradas(xs, "nombre").map((e) => e.titulo)).toEqual(["Ana", "Beto", "Cris"]);
        expect(ordenarEntradas(xs, "no-leidos")[0].hilo.id).toBe("c-pendiente");
    });

    it("con «fijados arriba» separa la sección Fijados", () => {
        const s = seccionarEntradas(xs, true);
        expect(s.fijados.map((e) => e.hilo.id)).toEqual(["c-pendiente"]);
        expect(s.resto).toHaveLength(2);
        expect(seccionarEntradas(xs, false).fijados).toHaveLength(0);
    });
});
