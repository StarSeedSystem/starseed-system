// @vitest-environment jsdom
/**
 * SelectorMedioDialog — «Dónde se guarda y se procesa» para cualquier elemento, con la lógica
 * MOCKEADA. Comprueba el medio heredado, la agrupación de almacenes, el aviso de «no cabe»,
 * la compatibilidad del procesador y que guardar llama a `asignar` / `quitarAsignacion`.
 */
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { INV, asignacionesFalsas, reiniciarEstado, resolverPorDefecto } from "@/components/recursos-ia/__fixtures__/recursos";
import type { ElementoRef } from "@/lib/recursos-ia/tipos";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/recursos-ia/asignaciones", async () => (await import("@/components/recursos-ia/__fixtures__/recursos")).asignacionesFalsas);
vi.mock("@/lib/recursos-ia/deteccion", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return { detectarInventario: vi.fn(async () => F.INV), detectarEstaNeurona: vi.fn(), inventarioDesde: vi.fn() };
});
vi.mock("@/lib/recursos-ia/catalogo", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return { MODELOS_EXTRA: [], catalogoRecursos: () => F.CATALOGO, modeloPorId: (id: string) => F.CATALOGO.find((m) => m.id === id) };
});
vi.mock("@/lib/recursos-ia/compatibilidad", () => ({
    verificar: (_m: unknown, p: { id: string }) =>
        p.id === "a1:cpu"
            ? { nivel: "justo", puntuacion: 40, motivos: [{ clave: "via", texto: "Los pesos viajarían por la red de StarSeed", bloquea: false, arreglo: "Guárdalo en el disco del A1" }] }
            : { nivel: "optimo", puntuacion: 90, motivos: [] },
    estimarTokS: () => undefined,
    cabeEn: (a: { libreGb?: number }, gb: number, margen = 2) => typeof a.libreGb === "number" && a.libreGb - gb >= margen,
}));

import { SelectorMedioDialog } from "@/components/recursos-ia/selector-medio";
import { SelectorMedioGlobal, abrirSelectorMedio, refDeBiblioteca } from "@/components/recursos-ia/abrir-selector-medio";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

const MODELO: ElementoRef = { tipo: "modelo", id: "bitnet-b158-2b", nombre: "BitNet b1.58 2B", tamanoGb: 1.2, padreId: "carpeta-modelos" };
const CARPETA: ElementoRef = { tipo: "carpeta", id: "carpeta-modelos", nombre: "Modelos" };

describe("SelectorMedioDialog", () => {
    beforeEach(() => {
        reiniciarEstado();
        vi.clearAllMocks();
        asignacionesFalsas.resolverAsignacion.mockImplementation(resolverPorDefecto);
    });
    afterEach(() => cleanup());

    it("enseña «heredado de» la carpeta y guarda la asignación elegida", async () => {
        asignacionesFalsas.resolverAsignacion.mockReturnValue({ almacenEn: "mac:ext:ssd", heredadaDe: "carpeta-modelos" });
        const alCerrar = vi.fn();
        montar(<SelectorMedioDialog elemento={MODELO} abierto alCerrar={alCerrar} padres={[CARPETA]} />);

        const efectivo = await screen.findByTestId("medio-efectivo");
        expect(within(efectivo).getByText(/heredado de Modelos/)).toBeInTheDocument();
        // Por defecto, al heredar, la opción marcada es «Igual que la carpeta».
        expect(screen.getByRole("radio", { name: /Igual que la carpeta/ })).toHaveAttribute("aria-checked", "true");
        // Cuando llega el inventario, el nombre del almacén sustituye a su id.
        expect(await within(efectivo).findByText("SSD externo")).toBeInTheDocument();

        // Grupos: esta neurona · mis neuronas · cuenta y cerebros.
        expect(screen.getByRole("group", { name: /Esta neurona · Mac de Alex/ })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Mis neuronas" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Cuenta y cerebros" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("radio", { name: /SSD externo/ }));
        fireEvent.change(screen.getByLabelText("Procesador"), { target: { value: "mac:cpu" } });
        expect(within(screen.getByTestId("compat-procesador")).getByText("Óptimo")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

        expect(asignacionesFalsas.asignar).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                elemento: expect.objectContaining({ id: "bitnet-b158-2b", tipo: "modelo" }),
                almacenEn: "mac:ext:ssd",
                procesaEn: "mac:cpu",
                alcance: expect.objectContaining({ visibilidad: "privada" }),
            }),
        );
        expect(alCerrar).toHaveBeenCalled();
    });

    it("«Igual que la carpeta» quita la asignación propia", async () => {
        reiniciarEstado({
            v: 1,
            asignaciones: { "modelo:bitnet-b158-2b": { elemento: MODELO, almacenEn: "mac:interno", alcance: { tipo: "perfil", id: "propio", visibilidad: "privada" }, t: 1 } },
            topologias: {},
            tamanosConfirmados: {},
            almacenesDeclarados: [],
        });
        montar(<SelectorMedioDialog elemento={MODELO} abierto alCerrar={vi.fn()} padres={[CARPETA]} />);
        expect(await screen.findByRole("radio", { name: /Macintosh HD/ })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("radio", { name: /Igual que la carpeta/ }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(asignacionesFalsas.quitarAsignacion).toHaveBeenCalledWith(expect.anything(), "modelo", "bitnet-b158-2b");
        expect(asignacionesFalsas.asignar).not.toHaveBeenCalled();
    });

    it("avisa cuando el elemento no cabe en un almacén", async () => {
        const grande: ElementoRef = { tipo: "archivo", id: "video-4k", nombre: "Rodaje 4K", tamanoGb: 40 };
        montar(<SelectorMedioDialog elemento={grande} abierto alCerrar={vi.fn()} />);
        expect(await screen.findByTestId("no-cabe-mac:interno")).toHaveTextContent("necesita 40 GB y quedan 9,2 GB");
        expect(screen.queryByTestId("no-cabe-mac:ext:ssd")).toBeNull();
        // Un archivo no tiene procesador.
        expect(screen.queryByLabelText("Procesador")).toBeNull();
    });

    it("se abre desde el evento global con el ElementoRef y su cadena de carpetas", async () => {
        const d = refDeBiblioteca(
            "item",
            "it1",
            [{ id: "it1", title: "Notas del sueño", folderId: "f2" }],
            [
                { id: "f1", name: "Raíz", parentId: null },
                { id: "f2", name: "Sueños", parentId: "f1" },
            ],
        );
        expect(d?.elemento).toEqual({ tipo: "archivo", id: "it1", nombre: "Notas del sueño", padreId: "f2" });
        expect(d?.padres?.map((p) => p.nombre)).toEqual(["Sueños", "Raíz"]);
        montar(<SelectorMedioGlobal />);
        act(() => abrirSelectorMedio(d!.elemento, d!.padres));
        expect(await screen.findByText("Dónde se guarda y se procesa")).toBeInTheDocument();
        expect(await screen.findByRole("radio", { name: /Igual que la carpeta/ })).toBeInTheDocument();
        expect(INV.neuronas.length).toBe(2);
    });
});
