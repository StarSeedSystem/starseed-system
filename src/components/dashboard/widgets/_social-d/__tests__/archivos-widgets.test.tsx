import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";
import type { EstadoOsLive } from "../pruebas/os-live-falso";
import { _reiniciarFuentesParaPruebas } from "../fuente-compartida";

preparaDom();

const estado = vi.hoisted(() => ({
    uid: "yo", paginas: [], grupos: [], posts: [], eventos: [], membresias: [], cargando: false, propias: {},
    archivos: [] as unknown[],
}) as EstadoOsLive & { archivos: unknown[] });

vi.mock("@/lib/widget-data/os-live", async () => (await import("../pruebas/os-live-falso")).osLiveFalso(estado));
vi.mock("@/lib/files/os-files", () => ({ listMyFiles: async () => estado.archivos }));

import { BrainsWidget, brazosDe } from "../../brains-widget";
import { MemoriesWidget, hojaDeMemoria } from "../../memories-widget";
import { VaultsWidget, hojaDeBaul } from "../../vaults-widget";
import { DocumentsWidget, tamanoLegible } from "../../documents-widget";

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const memoria = (id: string, extra: Record<string, unknown> = {}) => ({
    id, owner: "yo", scope: "account", scope_ref: null, name: `Memoria ${id}`, kinds: ["soul"], format: "markdown", storage: ["gdrive"], sync: true,
    config: null, content: "---\ntitulo: x\n---\nPrimera línea real del contenido", vault_id: null, created_at: hace(5), updated_at: hace(1), ...extra,
});

beforeEach(() => {
    _reiniciarFuentesParaPruebas();
    estado.uid = "yo";
    estado.propias = {};
    estado.archivos = [];
});
afterEach(() => cleanup());

describe("Archivos · piezas puras", () => {
    it("una memoria enseña su contenido sin el frontmatter y si sincroniza", () => {
        const h = hojaDeMemoria(memoria("a") as never);
        expect(h.extracto).toBe("Primera línea real del contenido");
        expect(h.marcas?.[0].texto).toBe("sincroniza");
        expect(h.detalle).toMatch(/Drive/);
    });
    it("un baúl cuenta las memorias que guarda de verdad", () => {
        const h = hojaDeBaul({ id: "b1", owner: "yo", name: "Huerto", scope: "group", scope_ref: null, connections: { drive: true } as never, preferences: null, created_at: hace(3), updated_at: hace(2) }, [memoria("a", { vault_id: "b1" }) as never, memoria("b") as never]);
        expect(h.detalle).toBe("1 memoria · 1 conexión");
        expect(h.tipo.etiqueta).toBe("Grupo");
    });
    it("cerebros: cada brazo es lo que incluye", () => {
        const b = brazosDe({ includes: { memories: ["1", "2"], vaults: [], connections: ["x"] }, servers: [{}] } as never);
        expect(b.map((x) => x.n)).toEqual([2, 0, 1, 0, 1]);
        expect(tamanoLegible(1_258_291)).toBe("1,2 MB");
    });
});

describe("Cerebros", () => {
    it("vacío y sin sesión honestos", () => {
        render(<EnMarco clase="m"><BrainsWidget /></EnMarco>);
        expect(screen.getByRole("link", { name: "Crear cerebro" })).toHaveAttribute("href", "/cerebros");
        cleanup();
        estado.uid = null;
        render(<EnMarco clase="m"><BrainsWidget /></EnMarco>);
        expect(screen.getByText("Entra en tu cuenta")).toBeInTheDocument();
    });
    it("m: la constelación del cerebro activo y cambiar a otro", () => {
        estado.propias.brains = [
            { id: "c1", name: "Huerto", scope: "group", includes: { memories: ["a"] }, servers: [], updated_at: hace(1) },
            { id: "c2", name: "Estudio", scope: "account", includes: { vaults: ["v"] }, servers: [{}], updated_at: hace(5) },
        ];
        render(<EnMarco clase="m"><BrainsWidget /></EnMarco>);
        expect(screen.getByRole("img", { name: /Huerto: 1 memoria/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Ver Estudio" }));
        expect(screen.getByRole("img", { name: /Estudio: 1 baúl · 1 servidor/ })).toBeInTheDocument();
    });
});

describe("Memorias, Baúles y Archivos por tamaño", () => {
    it("memorias m: las últimas hojas enlazan al Hub", () => {
        estado.propias.memories = [memoria("a"), memoria("b"), memoria("c")];
        render(<EnMarco clase="m"><MemoriesWidget /></EnMarco>);
        expect(screen.getAllByRole("link", { name: /Identidad: Memoria/ })[0]).toHaveAttribute("href", "/memorias");
    });
    it("memorias l: busca en el contenido", () => {
        estado.propias.memories = [memoria("a", { content: "habla del huerto" }), memoria("b", { content: "otra cosa" })];
        render(<EnMarco clase="l"><MemoriesWidget /></EnMarco>);
        fireEvent.change(screen.getByLabelText("Buscar memorias"), { target: { value: "huerto" } });
        const lista = screen.getByRole("list", { name: "Elementos" });
        expect(within(lista).getAllByRole("link")).toHaveLength(1);
    });
    it("baúles s: composición por alcance", () => {
        estado.propias.vaults = [{ id: "b1", name: "Huerto", scope: "group", connections: {}, updated_at: hace(1) }];
        render(<EnMarco clase="s"><VaultsWidget /></EnMarco>);
        expect(screen.getByRole("img", { name: /1 en total: 1 Grupo/ })).toBeInTheDocument();
    });
    it("archivos: vacío con «Subir archivo» y luego la rejilla real", async () => {
        render(<EnMarco clase="m"><DocumentsWidget /></EnMarco>);
        await waitFor(() => expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByRole("link", { name: "Subir archivo" })).toBeInTheDocument();
        cleanup();
        _reiniciarFuentesParaPruebas();
        estado.archivos = [{ id: "f1", owner: "yo", profileId: null, name: "semillas.pdf", mime: "application/pdf", size: 2048, path: "x", url: null, deviceId: null, isPublic: false, aclRead: [], aclWrite: [], groupSlug: null, meta: {}, createdAt: hace(1) }];
        render(<EnMarco clase="xl"><DocumentsWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: /PDF: semillas\.pdf\. PDF · 2 KB/ })).toBeInTheDocument();
    });
});
