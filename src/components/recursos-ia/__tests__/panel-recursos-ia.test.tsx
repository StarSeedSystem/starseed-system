// @vitest-environment jsdom
/**
 * PanelRecursosIa — la interfaz contra las firmas del contrato, con la lógica MOCKEADA (la
 * escriben otros agentes a la vez). Fixtures: la Mac de Alex, un Oracle A1 y un SSD externo.
 */
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { ARREGLO_TURBO, asignacionesFalsas, reiniciarEstado } from "@/components/recursos-ia/__fixtures__/recursos";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/recursos-ia/asignaciones", async () => (await import("@/components/recursos-ia/__fixtures__/recursos")).asignacionesFalsas);
vi.mock("@/lib/recursos-ia/deteccion", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return { detectarInventario: vi.fn(async () => F.INV), detectarEstaNeurona: vi.fn(), inventarioDesde: vi.fn() };
});
vi.mock("@/lib/recursos-ia/catalogo", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return {
        MODELOS_EXTRA: [],
        catalogoRecursos: () => F.CATALOGO,
        modeloPorId: (id: string) => F.CATALOGO.find((m) => m.id === id),
        bitsDeModelo: () => 4,
        ordenarPorPrioridad: <T,>(l: T[]) => l,
    };
});
vi.mock("@/lib/recursos-ia/sugerencias", async () => {
    const F = await import("@/components/recursos-ia/__fixtures__/recursos");
    return {
        topologiaSugerida: (_inv: unknown, alcance: Parameters<typeof F.sugerida>[0]) => F.sugerida(alcance),
        sugerirPlan: (_inv: unknown, _cat: unknown, o: { alcance: Parameters<typeof F.sugerida>[0]; topologia?: Parameters<typeof F.plan>[0] }) => F.plan(o.topologia ?? F.sugerida(o.alcance)),
        candidatos: () => ({ procesadores: [], almacenes: [] }),
    };
});
vi.mock("@/lib/recursos-ia/compatibilidad", () => ({
    verificar: (m: { id: string }) =>
        m.id.startsWith("turbo")
            ? { nivel: "incompatible", puntuacion: 0, motivos: [{ clave: "so", texto: "Necesita macOS 26 y Metal 4", bloquea: true, arreglo: "Instala Swift 6.2 (Xcode 26)" }] }
            : { nivel: "bueno", puntuacion: 60, motivos: [] },
    estimarTokS: () => undefined,
    cabeEn: (a: { libreGb?: number }, gb: number, margen = 2) => typeof a.libreGb === "number" && a.libreGb - gb >= margen,
}));

import { PanelRecursosIa } from "@/components/recursos-ia/panel-recursos-ia";

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

describe("PanelRecursosIa", () => {
    beforeEach(() => {
        reiniciarEstado();
        vi.clearAllMocks();
    });
    afterEach(() => cleanup());

    it("enseña las 5 topologías y marca la sugerida", async () => {
        montar(<PanelRecursosIa />);
        const sugerida = await screen.findByTestId("topologia-servidor-propio");
        for (const t of ["cada-neurona", "servidor-propio", "almacen-externo", "fragmentada", "comunal"]) {
            expect(screen.getByTestId(`topologia-${t}`)).toBeInTheDocument();
        }
        expect(within(sugerida).getByText("sugerida")).toBeInTheDocument();
        expect(within(screen.getByTestId("topologia-cada-neurona")).queryByText("sugerida")).toBeNull();
        // La cabecera dice el resumen del plan y los avisos honestos del inventario.
        expect(screen.getByTestId("resumen-plan")).toHaveTextContent("BitNet 1.58");
        expect(screen.getByText(/Swift 6\.0\.2 sin Xcode/)).toBeInTheDocument();
    });

    it("al elegir una topología la guarda con fijarTopologia", async () => {
        montar(<PanelRecursosIa />);
        const frag = await screen.findByTestId("topologia-fragmentada");
        fireEvent.click(frag);
        expect(asignacionesFalsas.fijarTopologia).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ topologia: "fragmentada", alcance: expect.objectContaining({ tipo: "perfil", visibilidad: "privada" }) }),
        );
        expect(await screen.findByTestId("topologia-fragmentada")).toHaveAttribute("aria-pressed", "true");
        // En «fragmentada» aparece un selector de procesador por capacidad.
        expect(screen.getByLabelText("Procesador para Conversar y escribir")).toBeInTheDocument();
    });

    it("la vía antena avisa de que nunca lleva pesos", async () => {
        montar(<PanelRecursosIa />);
        fireEvent.click(await screen.findByRole("button", { name: /\+ Antena propia/ }));
        expect(await screen.findByTestId("aviso-antena")).toHaveTextContent("nunca pesos");
    });

    it("la fila de texto enseña 1.58-bit, el nivel y el tok/s estimado", async () => {
        montar(<PanelRecursosIa />);
        const fila = await screen.findByTestId("fila-capacidad-texto");
        expect(within(fila).getByText("1.58-bit")).toBeInTheDocument();
        expect(within(fila).getByText("Óptimo")).toBeInTheDocument();
        expect(within(fila).getByText(/18 tok\/s/)).toBeInTheDocument();
        expect(within(fila).getByText("BitNet b1.58 2B")).toBeInTheDocument();
        // Lo que no tiene opción se dice con su motivo.
        expect(within(screen.getByTestId("fila-capacidad-video")).getByText(/Ningún modelo de vídeo/)).toBeInTheDocument();
    });

    it("«Fijar» guarda la elección en porCapacidad", async () => {
        montar(<PanelRecursosIa />);
        const fila = await screen.findByTestId("fila-capacidad-texto");
        fireEvent.click(within(fila).getByRole("button", { name: "Fijar Conversar y escribir" }));
        expect(asignacionesFalsas.fijarTopologia).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ porCapacidad: { texto: { modeloId: "bitnet-b158-2b", procesaEn: "mac:cpu", almacenEn: "mac:interno" } } }),
        );
    });

    it("el motivo no-cabe de TurboFieldfare muestra su arreglo", async () => {
        montar(<PanelRecursosIa />);
        const fila = await screen.findByTestId("fila-capacidad-texto");
        expect(within(fila).queryByText(new RegExp(ARREGLO_TURBO))).toBeNull();
        fireEvent.click(within(fila).getByTestId("alternativas-texto"));
        expect(within(fila).getByText("No cabe")).toBeInTheDocument();
        expect(within(fila).getByText(new RegExp(ARREGLO_TURBO))).toBeInTheDocument();
    });

    it("confirmar un tamaño llama a confirmarTamano", async () => {
        montar(<PanelRecursosIa />);
        const input = await screen.findByLabelText("Tamaño en GB de Kokoro 82M");
        fireEvent.change(input, { target: { value: "0,35" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar tamaño" }));
        expect(asignacionesFalsas.confirmarTamano).toHaveBeenCalledWith(expect.anything(), "kokoro-82m", 0.35);
    });

    it("confirmar una descarga NO descarga: guarda la asignación y deja de preguntar", async () => {
        montar(<PanelRecursosIa />);
        fireEvent.click(await screen.findByRole("button", { name: /Revisar y confirmar/ }));
        const dialogo = await screen.findByRole("dialog");
        expect(within(dialogo).getByText(/Aquí no se descarga nada/)).toBeInTheDocument();
        expect(within(dialogo).getByText(/Macintosh HD/)).toBeInTheDocument();
        expect(within(dialogo).getByText("Apple M1")).toBeInTheDocument();
        fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar y guardar" }));
        expect(asignacionesFalsas.asignar).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                elemento: expect.objectContaining({ tipo: "modelo", id: "bitnet-b158-2b", tamanoGb: 1.2 }),
                almacenEn: "mac:interno",
                procesaEn: "mac:cpu",
            }),
        );
        expect(screen.queryByRole("button", { name: /Revisar y confirmar/ })).toBeNull();
    });

    it("el catálogo explica TurboFieldfare (SSD rápido, Apple Silicon, macOS 26, Swift 6.2)", async () => {
        montar(<PanelRecursosIa />);
        await screen.findByTestId("fila-capacidad-texto");
        const tarjeta = document.querySelector('[data-modelo="turbo-fieldfare-gemma4-26b"]') as HTMLElement;
        expect(tarjeta).not.toBeNull();
        const t = within(tarjeta);
        expect(t.getByText(/Lee los pesos del SSD en cada token/)).toBeInTheDocument();
        expect(t.getByText(/Apple Silicon/)).toBeInTheDocument();
        expect(t.getByText(/macOS 26 o superior/)).toBeInTheDocument();
        expect(t.getByText(/Se compila en la neurona con Swift 6\.2/)).toBeInTheDocument();
        // Y el mejor encaje dice por qué no corre aquí, con su arreglo.
        expect(within(screen.getByTestId("encaje-turbo-fieldfare-gemma4-26b")).getByText(/Instala Swift 6\.2/)).toBeInTheDocument();
        // Kokoro no sabe su tamaño: se dice, no se inventa.
        const kokoro = document.querySelector('[data-modelo="kokoro-82m"]') as HTMLElement;
        expect(within(kokoro).getByText("tamaño por confirmar")).toBeInTheDocument();
        // Filtro «Solo 1.58-bit».
        fireEvent.click(screen.getByRole("button", { name: "Solo 1.58-bit" }));
        expect(document.querySelector('[data-modelo="turbo-fieldfare-gemma4-26b"]')).toBeNull();
        expect(document.querySelector('[data-modelo="bitnet-b158-2b"]')).not.toBeNull();
    });

    it("declara un almacenamiento y rechaza rutas con credenciales", async () => {
        montar(<PanelRecursosIa />);
        fireEvent.change(await screen.findByLabelText("Nombre del almacenamiento"), { target: { value: "NAS de casa" } });
        fireEvent.change(screen.getByLabelText("Tipo de almacenamiento"), { target: { value: "servidor-externo" } });
        fireEvent.change(screen.getByLabelText("Ruta o URL"), { target: { value: "https://alex:secreto@nas.local/modelos" } });
        fireEvent.change(screen.getByLabelText("Capacidad total en GB"), { target: { value: "2000" } });
        fireEvent.click(screen.getByRole("button", { name: /Declarar almacenamiento/ }));
        expect(screen.getByRole("alert")).toHaveTextContent("Sin credenciales");
        expect(asignacionesFalsas.declararAlmacen).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("Ruta o URL"), { target: { value: "https://nas.local/modelos" } });
        fireEvent.click(screen.getByRole("button", { name: /Declarar almacenamiento/ }));
        expect(asignacionesFalsas.declararAlmacen).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ etiqueta: "NAS de casa", tipo: "servidor-externo", totalGb: 2000, fuente: "declarado", privado: true }),
        );
        expect(await screen.findByRole("button", { name: "Quitar NAS de casa" })).toBeInTheDocument();
    });
});
