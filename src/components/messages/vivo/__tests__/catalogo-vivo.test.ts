/**
 * Catálogo de apps en vivo: cada TipoVivo tiene entrada, la disponibilidad es HONESTA (solo lo
 * que ya sincroniza de verdad está disponible, y lo demás explica por qué no), y los documentos
 * semilla no inventan contenido.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const espacios = vi.hoisted(() => ({
    createSpace: vi.fn(),
    inviteToSpace: vi.fn(),
    updateSpaceMeta: vi.fn(),
    listOwnedSpaces: vi.fn(),
    deleteSpace: vi.fn(),
}));
vi.mock("@/lib/spaces/spaces", () => espacios);

import type { TipoVivo } from "@/lib/mensajeria/formato-tipos";
import {
    CATALOGO_VIVO,
    ORDEN_TIPOS_VIVO,
    docEscritorioNuevo,
    docPizarraDesdePlantilla,
    entradaVivo,
    normalizarUrlWeb,
    plantillasDeSala,
    rutaEscritorioCompartido,
    rutaPizarraCompartida,
    tiposDisponibles,
    tiposProximamente,
} from "@/components/messages/vivo/catalogo-vivo";
import { normalizeState } from "@/components/desktop/desktop-store";

const TODOS: TipoVivo[] = [
    "sala", "pizarra", "documento", "presentacion", "tabla", "navegador",
    "juego", "programa", "escritorio", "dashboard", "escena3d", "xr",
];

beforeEach(() => {
    for (const f of Object.values(espacios)) f.mockReset();
});

describe("todas las entradas", () => {
    test("hay una entrada por TipoVivo, con su tipo, textos, icono y color", () => {
        expect(Object.keys(CATALOGO_VIVO).sort()).toEqual([...TODOS].sort());
        expect([...ORDEN_TIPOS_VIVO].sort()).toEqual([...TODOS].sort());
        for (const t of TODOS) {
            const e = CATALOGO_VIVO[t];
            expect(e.tipo).toBe(t);
            expect(e.etiqueta.trim().length).toBeGreaterThan(2);
            expect(e.descripcion.trim().length).toBeGreaterThan(10);
            expect(e.icono).toMatch(/^[A-Z][A-Za-z0-9]+$/);
            expect(e.color).toMatch(/^#[0-9A-F]{6}$/i);
            expect(e.permisos.length).toBeGreaterThan(0);
        }
    });

    test("disponibilidad honesta: lo disponible sabe crearse; lo que no, dice por qué y no finge", () => {
        for (const e of Object.values(CATALOGO_VIVO)) {
            if (e.disponible) {
                expect(typeof e.crear).toBe("function");
                expect(e.motivo).toBeUndefined();
                expect(typeof e.concederAcceso).toBe("function");
            } else {
                expect(e.crear).toBeUndefined();
                expect(e.listarMios).toBeUndefined();
                expect((e.motivo ?? "").trim().length).toBeGreaterThan(15);
            }
        }
    });

    test("todos los tipos tienen ya un motor que sincroniza de verdad (y cómo crearlo)", () => {
        expect(tiposDisponibles().map((e) => e.tipo).sort()).toEqual(
            ["dashboard", "documento", "escena3d", "escritorio", "juego", "navegador", "pizarra", "presentacion", "programa", "sala", "tabla", "xr"],
        );
        expect(tiposProximamente()).toEqual([]);
        for (const e of tiposDisponibles()) expect(typeof e.crear).toBe("function");
    });

    test("los espacios no fingen «comentar» ni edición por enlace público", () => {
        for (const e of tiposDisponibles()) {
            expect(e.permisos).toEqual(["ver", "editar"]);
            expect(e.edicionPorEnlacePublico).toBe(false);
        }
    });

    test("entradaVivo acepta «vivo:x» y «x»; las llamadas no son del catálogo", () => {
        expect(entradaVivo("vivo:pizarra")?.tipo).toBe("pizarra");
        expect(entradaVivo("sala")?.tipo).toBe("sala");
        expect(entradaVivo("llamada:video")).toBeNull();
        expect(entradaVivo(undefined)).toBeNull();
    });
});

describe("direcciones web", () => {
    test("solo http(s); añade https:// si falta", () => {
        expect(normalizarUrlWeb("starseed.network")).toBe("https://starseed.network/");
        expect(normalizarUrlWeb(" https://a.org/x?y=1 ")).toBe("https://a.org/x?y=1");
        expect(normalizarUrlWeb("http://localhost:3000")).toBe("http://localhost:3000/");
        expect(normalizarUrlWeb("javascript:alert(1)")).toBeNull();
        expect(normalizarUrlWeb("data:text/html,hola")).toBeNull();
        expect(normalizarUrlWeb("ftp://a.org")).toBeNull();
        expect(normalizarUrlWeb("hola mundo")).toBeNull();
        expect(normalizarUrlWeb("")).toBeNull();
    });
});

describe("documentos semilla", () => {
    test("la sala solo ofrece plantillas que hoy se pueden abrir (pizarra)", () => {
        const ps = plantillasDeSala();
        expect(ps.length).toBeGreaterThan(0);
        expect(ps.every((p) => p.tipo === "pizarra")).toBe(true);
    });

    test("una plantilla se siembra como notas VACÍAS con su rótulo, sin contenido inventado", () => {
        const asamblea = plantillasDeSala().find((p) => p.id === "asamblea")!;
        const doc = docPizarraDesdePlantilla(asamblea);
        expect(doc.edges).toEqual([]);
        expect(doc.blocks).toHaveLength(asamblea.elementos.length);
        expect(doc.blocks.map((b) => b.title)).toEqual(asamblea.elementos.map((e) => e.datos.rotulo));
        for (const b of doc.blocks) {
            expect(b.kind).toBe("text");
            expect(b.data).toEqual({ text: "" });
        }
        expect(new Set(doc.blocks.map((b) => b.id)).size).toBe(doc.blocks.length);
        expect(docPizarraDesdePlantilla(null)).toEqual({ blocks: [], edges: [] });
    });

    test("el escritorio nuevo es un DesktopsState válido; con url, una ventana de navegador maximizada", () => {
        const vacio = normalizeState(docEscritorioNuevo("Equipo"));
        expect(vacio?.desktops).toHaveLength(1);
        expect(vacio?.desktops[0].name).toBe("Equipo");
        expect(vacio?.desktops[0].windows).toEqual([]);

        const web = normalizeState(docEscritorioNuevo("Wiki", "https://a.org/"));
        const w = web?.desktops[0].windows[0];
        expect(w?.contentRef).toMatchObject({ type: "browser", ref: "https://a.org/", name: "Wiki" });
        expect(w?.maximized).toBe(true);
        expect(web?.activeId).toBe(web?.desktops[0].id);
    });
});

describe("crear y dar acceso sobre os_spaces", () => {
    test("pizarra: espacio «board» por invitación y ruta con motor fijo", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp1" });
        const r = await CATALOGO_VIVO.pizarra.crear!("Plan");
        expect(espacios.createSpace).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "board", title: "Plan", access: "invite", doc: { blocks: [], edges: [] } }),
        );
        expect(r).toEqual({ refId: "sp1", ruta: rutaPizarraCompartida("sp1") });
        expect(r.ruta).toBe("/pizarra?board-space=sp1&engine=starseed");
    });

    test("sala: siembra la plantilla elegida", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp2" });
        await CATALOGO_VIVO.sala.crear!("", { plantillaId: "retrospectiva" });
        const arg = espacios.createSpace.mock.calls[0][0] as { title: string; doc: { blocks: { title: string }[] } };
        expect(arg.title).toBe("Retrospectiva");
        expect(arg.doc.blocks.map((b) => b.title)).toContain("Qué funcionó");
    });

    test("navegador: exige una dirección válida y abre un escritorio compartido", async () => {
        await expect(CATALOGO_VIVO.navegador.crear!("x", { url: "javascript:alert(1)" })).rejects.toThrow(/dirección web/);
        expect(espacios.createSpace).not.toHaveBeenCalled();
        espacios.createSpace.mockResolvedValue({ id: "sp3" });
        const r = await CATALOGO_VIVO.navegador.crear!("", { url: "wikipedia.org" });
        const arg = espacios.createSpace.mock.calls[0][0] as { kind: string; title: string };
        expect(arg.kind).toBe("desktop");
        expect(arg.title).toBe("wikipedia.org");
        expect(r.ruta).toBe(rutaEscritorioCompartido("sp3"));
    });

    test("sin cuenta (createSpace null) el error se dice en español", async () => {
        espacios.createSpace.mockResolvedValue(null);
        await expect(CATALOGO_VIVO.escritorio.crear!("x")).rejects.toThrow(/Inicia sesión/);
    });

    test("editar → editor; ver → lector; devuelve cuántas invitaciones salieron", async () => {
        espacios.inviteToSpace.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const n = await CATALOGO_VIVO.pizarra.concederAcceso!("sp", ["a", "b", "a"], "editar");
        expect(n).toBe(1);
        expect(espacios.inviteToSpace).toHaveBeenCalledTimes(2);
        expect(espacios.inviteToSpace).toHaveBeenCalledWith("sp", "a", "editor");

        espacios.inviteToSpace.mockReset().mockResolvedValue(true);
        await CATALOGO_VIVO.escritorio.concederAcceso!("sp", ["c"], "ver");
        expect(espacios.inviteToSpace).toHaveBeenCalledWith("sp", "c", "viewer");
    });

    test("enlace público abre/cierra la lectura pública del espacio", async () => {
        espacios.updateSpaceMeta.mockResolvedValue(true);
        await CATALOGO_VIVO.pizarra.cambiarPublico!("sp", true);
        await CATALOGO_VIVO.pizarra.cambiarPublico!("sp", false);
        expect(espacios.updateSpaceMeta).toHaveBeenNthCalledWith(1, "sp", { access: "public" });
        expect(espacios.updateSpaceMeta).toHaveBeenNthCalledWith(2, "sp", { access: "invite" });
    });

    test("listarMios solo ofrece pizarras de verdad y respeta el motor tldraw", async () => {
        espacios.listOwnedSpaces.mockResolvedValue([
            { id: "a", title: "Lienzo", doc: { blocks: [] } },
            { id: "b", title: "Tldraw", doc: { engine: "tldraw" } },
            { id: "c", title: "Espejo de un espacio de trabajo", doc: { workspace: {} } },
        ]);
        const xs = await CATALOGO_VIVO.pizarra.listarMios!();
        expect(xs).toEqual([
            { refId: "a", titulo: "Lienzo", ruta: "/pizarra?board-space=a&engine=starseed" },
            { refId: "b", titulo: "Tldraw", ruta: "/pizarra?board-space=b&engine=tldraw" },
        ]);
    });
});
