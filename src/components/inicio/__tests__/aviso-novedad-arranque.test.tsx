import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { width: 120, height: 120, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("@/lib/bloqueo/passkey-registro", () => ({ biometriaDisponible: async () => false, registrarPasskey: vi.fn() }));

import { AvisoNovedadContenido, type AvisoNovedadContenidoProps } from "../aviso-novedad-arranque";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AppearanceProvider } from "@/context/appearance-context";
import { EVENTO_CONFIG_BLOQUEO } from "@/lib/bloqueo/politica-bloqueo";
import { EVENTO_PANTALLA_INICIAL } from "@/lib/inicio/pantalla-inicial";
import { leerEstadoAviso, marcarAviso, type RespuestaAvisoNovedad } from "@/lib/inicio/aviso-novedad";

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
});

/** Envoltorio de prueba: conecta las tres salidas a `marcarAviso`, como hace `AvisoNovedadArranque`. */
function Envoltorio({ onCerrado }: { onCerrado?: (r: RespuestaAvisoNovedad) => void }) {
    const cerrar = (r: RespuestaAvisoNovedad) => { marcarAviso(r); onCerrado?.(r); };
    const props: AvisoNovedadContenidoProps = {
        perfilId: "p1",
        neuronaId: "n1",
        onConfigurado: () => cerrar("configurado"),
        onLuego: () => cerrar("luego"),
        onNoMostrar: () => cerrar("no-mostrar"),
    };
    // DialogHeader/DialogTitle exigen el contexto de <Dialog> (y este, el de
    // AppearanceProvider): el componente real siempre se monta dentro de ambos
    // (ver AvisoNovedadArranque y el layout raíz).
    return (
        <AppearanceProvider>
            <Dialog open>
                <DialogContent>
                    <AvisoNovedadContenido {...props} />
                </DialogContent>
            </Dialog>
        </AppearanceProvider>
    );
}

describe("AvisoNovedadContenido", () => {
    it("«Recordármelo más tarde» marca la respuesta «luego»", () => {
        const onCerrado = vi.fn();
        render(<Envoltorio onCerrado={onCerrado} />);
        fireEvent.click(screen.getByRole("button", { name: "Recordármelo más tarde" }));
        expect(onCerrado).toHaveBeenCalledWith("luego");
        expect(leerEstadoAviso()?.respuesta).toBe("luego");
    });

    it("«No volver a mostrar» marca la respuesta «no-mostrar»", () => {
        const onCerrado = vi.fn();
        render(<Envoltorio onCerrado={onCerrado} />);
        fireEvent.click(screen.getByRole("button", { name: "No volver a mostrar" }));
        expect(onCerrado).toHaveBeenCalledWith("no-mostrar");
        expect(leerEstadoAviso()?.respuesta).toBe("no-mostrar");
    });

    it("enlaza a Cuenta › Seguridad", () => {
        render(<Envoltorio />);
        const enlace = screen.getByRole("link", { name: /Cuenta › Seguridad/ });
        expect(enlace.getAttribute("href")).toBe("/cuenta#seguridad");
    });

    it("embebe PreferenciasArranque (selector de pantalla inicial y bloqueo)", () => {
        render(<Envoltorio />);
        expect(screen.getByRole("radiogroup", { name: "Pantalla al abrir StarSeed" })).toBeTruthy();
        // El bloqueo empieza plegado tras un botón (PreferenciasArranque); al
        // abrirlo aparece su propio radiogroup — mismo componente, sin duplicarlo.
        fireEvent.click(screen.getByRole("button", { name: "Elegir un bloqueo" }));
        expect(screen.getByRole("radiogroup", { name: "Método de bloqueo" })).toBeTruthy();
    });

    it("guardar el bloqueo dentro del diálogo marca «configurado» y cierra tras un respiro", () => {
        vi.useFakeTimers();
        const onCerrado = vi.fn();
        render(<Envoltorio onCerrado={onCerrado} />);
        act(() => { window.dispatchEvent(new Event(EVENTO_CONFIG_BLOQUEO)); });
        expect(onCerrado).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onCerrado).toHaveBeenCalledWith("configurado");
        expect(leerEstadoAviso()?.respuesta).toBe("configurado");
    });

    it("elegir la pantalla inicial dentro del diálogo también marca «configurado»", () => {
        vi.useFakeTimers();
        const onCerrado = vi.fn();
        render(<Envoltorio onCerrado={onCerrado} />);
        act(() => { window.dispatchEvent(new Event(EVENTO_PANTALLA_INICIAL)); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onCerrado).toHaveBeenCalledWith("configurado");
    });
});
