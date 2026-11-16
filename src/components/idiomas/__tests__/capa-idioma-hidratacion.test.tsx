/** @vitest-environment jsdom */
import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CapaIdioma } from "../capa-idioma";
import * as hidratacion from "@/lib/idiomas/hidratacion";
import * as capa from "@/lib/idiomas/capa";
import * as estado from "@/lib/idiomas/estado";
import * as cargar from "@/lib/idiomas/catalogos/cargar";

vi.mock("@/lib/idiomas/hidratacion", () => ({
    cuandoEsSeguroTraducir: vi.fn(),
    entornoDelNavegador: vi.fn(),
}));
vi.mock("@/lib/idiomas/capa", () => ({
    iniciarCapa: vi.fn(() => ({ parar: vi.fn(), cambiar: vi.fn() })),
    fijarDocumento: vi.fn(),
}));
vi.mock("@/lib/idiomas/catalogos/cargar", () => ({
    cargarCatalogo: vi.fn(),
}));
vi.mock("@/lib/idiomas/estado", () => ({
    EVENTO_IDIOMA: "starseed:idioma",
    CLAVE_IDIOMA_NEURONA: "starseed.idioma.neurona.v1",
    idiomaEfectivo: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    (estado.idiomaEfectivo as any).mockReturnValue({ codigo: "en" });
    (cargar.cargarCatalogo as any).mockResolvedValue({ traducir: (t: string) => `traducción de ${t}` });
});
afterEach(cleanup);

describe("capa-idioma hidratación", () => {
    it("espera a la promesa de hidratación antes de iniciarCapa", async () => {
        let resolveHydration: (value: void) => void;
        const hydrationPromise = new Promise<void>((resolve) => { resolveHydration = resolve; });
        (hidratacion.cuandoEsSeguroTraducir as any).mockReturnValue(hydrationPromise);

        render(<CapaIdioma />);
        
        expect(capa.iniciarCapa).not.toHaveBeenCalled();
        
        await resolveHydration!();
        
        expect(capa.iniciarCapa).toHaveBeenCalled();
    });

    it("no inicia la capa si el componente se desmonta durante la hidratación", async () => {
        let resolveHydration: (value: void) => void;
        const hydrationPromise = new Promise<void>((resolve) => { resolveHydration = resolve; });
        (hidratacion.cuandoEsSeguroTraducir as any).mockReturnValue(hydrationPromise);

        const { unmount } = render(<CapaIdioma />);
        unmount();
        
        await resolveHydration!();
        
        expect(capa.iniciarCapa).not.toHaveBeenCalled();
    });

    it("aplica el último idioma si hay un cambio durante la espera", async () => {
        let resolveHydration: (value: void) => void;
        const hydrationPromise = new Promise<void>((resolve) => { resolveHydration = resolve; });
        (hidratacion.cuandoEsSeguroTraducir as any).mockReturnValue(hydrationPromise);

        render(<CapaIdioma />);
        
        // Simular un cambio de idioma
        (estado.idiomaEfectivo as any).mockReturnValue({ codigo: "fr" });
        window.dispatchEvent(new CustomEvent("starseed:idioma"));
        
        await resolveHydration!();
        
        // Debería cargarse el último idioma ("fr")
        expect(cargar.cargarCatalogo).toHaveBeenCalledWith("fr");
        expect(capa.iniciarCapa).toHaveBeenCalledWith(document.body, document, "fr", expect.anything());
    });
});
