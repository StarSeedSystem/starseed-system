import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { GestorPaquetes } from "@/components/traductor/gestor-paquetes";
import type { PaqueteModelo, AlmacenPaquetes, Descargador, Reloj } from "@/lib/traductor/gestor-paquetes-logica";

const MODS: readonly PaqueteModelo[] = [
    { origen: "es", destino: "en", repo: "Xenova/opus-mt-es-en", verificado: true, bytes: 60_000_000, hash: "a", version: "1" },
    { origen: "en", destino: "es", repo: "Xenova/opus-mt-en-es", verificado: false, bytes: 60_000_000, hash: "", version: "1" },
    { origen: "fr", destino: "en", repo: "Xenova/opus-mt-fr-en", verificado: true, bytes: 60_000_000, hash: "b", version: "1" },
] as const;

function almacenF(inicial: string[] = []): AlmacenPaquetes {
    const m = new Map<string, string>();
    if (inicial.length) m.set("starseed:traductor-paquetes", JSON.stringify(inicial.map((id) => ({ id, par: id.replace("Xenova/", "").replace("opus-mt-", ""), bytes: 60_000_000, hash: "h", version: "1", instaladoEn: 1 }))));
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function descF(opts?: { fallar?: boolean; tardarMs?: number }): Descargador {
    return { descargar: async (_u: string, onP: (b: number, t: number) => void, s: AbortSignal) => { if (opts?.fallar) throw new Error("red"); const t = 60_000_000; for (const p of [0.25, 0.5, 0.75, 1]) { if (s.aborted) throw new DOMException("A", "AbortError"); if (opts?.tardarMs) await new Promise((r) => setTimeout(r, opts.tardarMs / 4)); onP(Math.round(t * p), t); } return { bytes: t, hash: "h" }; } };
}

function relojF(): Reloj { let t = 1_700_000_000_000; return { ahora: () => t++ }; }

function ren(ov: Partial<{ almacen: AlmacenPaquetes; descargador: Descargador; reloj: Reloj; topeBytes: number; esPersistente: boolean; conexionMedida: boolean }> = {}) {
    return render(<GestorPaquetes modelos={MODS} almacen={almacenF()} descargador={descF()} reloj={relojF()} topeBytes={500_000_000} esPersistente={false} {...ov} />);
}

describe("GestorPaquetes", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("lista pares, tamaño, estado, resumen", () => { ren(); expect(screen.getByText("es → en")).toBeInTheDocument(); expect(screen.getByText("60 MB")).toBeInTheDocument(); expect(screen.getByText("Disponible")).toBeInTheDocument(); expect(screen.getByText(/Usado 0 B de 500 MB/)).toBeInTheDocument(); });

    it("marca 'Sin verificar' y avisos", () => { ren(); expect(screen.getByText("Sin verificar")).toBeInTheDocument(); ren({ esPersistente: false }); expect(screen.getByText("Se perderá al cerrar")).toBeInTheDocument(); ren({ esPersistente: true }); expect(screen.queryByText("Se perderá al cerrar")).not.toBeInTheDocument(); ren({ conexionMedida: true }); expect(screen.getByText(/Aviso de conexión medida/)).toBeInTheDocument(); });

    describe("descargar", () => {
        it("muestra progreso y completa", async () => { ren({ descargador: descF({ tardarMs: 100 }) }); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]); await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument()); await act(async () => vi.runAllTimersAsync()); await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument()); });

        it("cancela y restaura", async () => { ren({ descargador: descF({ tardarMs: 500 }) }); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]); await waitFor(() => expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument()); fireEvent.click(screen.getByRole("button", { name: /Cancelar/i })); await waitFor(() => expect(screen.getByRole("button", { name: /Descargar/i })).toBeInTheDocument()); });

        it("pide confirmación si sin verificar", async () => { ren(); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[1]); await waitFor(() => expect(screen.getByText("Paquete sin verificar")).toBeInTheDocument()); expect(screen.getByText("Descargar anyway")).toBeInTheDocument(); });

        it("continúa tras confirmar sin verificar", async () => { ren({ descargador: descF({ tardarMs: 100 }) }); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[1]); await waitFor(() => expect(screen.getByText("Descargar anyway")).toBeInTheDocument()); fireEvent.click(screen.getByText("Descargar anyway")); await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument()); });

        it("cancela confirmación sin verificar", async () => { ren(); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[1]); await waitFor(() => expect(screen.getByText("Cancelar")).toBeInTheDocument()); fireEvent.click(screen.getByText("Cancelar")); await waitFor(() => expect(screen.queryByText("Paquete sin verificar")).not.toBeInTheDocument()); });
    });

    describe("quitar", () => {
        it("pide confirmación y elimina", () => { const onC = vi.fn(); ren({ almacen: almacenF(["Xenova/opus-mt-es-en"]), onCambio: onC }); fireEvent.click(screen.getByRole("button", { name: /Quitar paquete es-en/i })); expect(screen.getByText("¿Quitar paquete?")).toBeInTheDocument(); fireEvent.click(screen.getByText("Quitar")); expect(onC).toHaveBeenCalled(); expect(screen.queryByText("es → en")).not.toBeInTheDocument(); });

        it("cancela eliminación", () => { ren({ almacen: almacenF(["Xenova/opus-mt-es-en"]) }); fireEvent.click(screen.getByRole("button", { name: /Quitar paquete es-en/i })); fireEvent.click(screen.getByText("Cancelar")); expect(screen.getByText("es → en")).toBeInTheDocument(); });
    });

    it("ordena instalados primero", () => { ren({ almacen: almacenF(["Xenova/opus-mt-fr-en"]) }); expect(screen.getAllByRole("row")[1].textContent).toContain("fr → en"); expect(screen.getAllByRole("row")[1].textContent).toContain("Instalado"); });

    it("restaura botón si falla", async () => { ren({ descargador: descF({ fallar: true }) }); fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]); await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument()); await act(async () => vi.runAllTimersAsync()); await waitFor(() => expect(screen.getByRole("button", { name: /Descargar/i })).toBeInTheDocument()); });
});