/**
 * MensajeFormateado: estilo del texto, animación por letra (con tope), lienzo con ventana web
 * aislada (sandbox SIN allow-same-origin, cargada solo al activarla) y reserva de texto plano si
 * el formato no pasa la validación.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormatoMensaje } from "@/lib/mensajeria/formato-tipos";

vi.mock("@/components/messages/vivo/tarjeta-vivo", () => ({
    TarjetaVivo: ({ adjunto }: { adjunto: { name?: string } }) => <div data-testid="tarjeta-vivo">{adjunto.name}</div>,
}));

import { MensajeFormateado } from "@/components/messages/rico/mensaje-formateado";

afterEach(() => cleanup());

const LIENZO: FormatoMensaje = {
    v: 1,
    estilo: { colorMarco: "#10b981", grosorMarco: 3, fondo: "cosmos" },
    lienzo: {
        ancho: 540,
        alto: 540,
        animacionFondo: "estrellas",
        elementos: [
            { id: "t", tipo: "texto", x: 20, y: 20, w: 500, h: 80, z: 3, texto: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Mirad esto" }] }] }, estilo: { tamano: 30 } },
            { id: "w", tipo: "web", x: 20, y: 120, w: 500, h: 300, z: 2, url: "https://ejemplo.org/mapa" },
            { id: "i", tipo: "imagen", x: 20, y: 430, w: 100, h: 100, z: 1, url: "https://cdn.example/a.png", nombre: "Atardecer" },
            {
                id: "v",
                tipo: "vivo",
                x: 140,
                y: 430,
                w: 380,
                h: 100,
                z: 4,
                vivo: { kind: "vivo", tipoVivo: "pizarra", sesionId: "s1", route: "/vivo/s1", name: "Pizarra común", permiso: "editar" },
            },
        ],
    },
};

describe("MensajeFormateado", () => {
    it("pinta un lienzo con una ventana web aislada que solo carga al activarla", () => {
        const { container } = render(<MensajeFormateado formato={LIENZO} textoPlano="Mirad esto [ventana: ejemplo.org]" mio={false} />);
        expect(screen.getByRole("group", { name: "Mensaje compuesto" })).toBeTruthy();
        expect(screen.getByText("Mirad esto")).toBeTruthy();
        expect(screen.getByAltText("Atardecer").getAttribute("src")).toBe("https://cdn.example/a.png");
        expect(screen.getByTestId("tarjeta-vivo").textContent).toBe("Pizarra común");
        // Nada de terceros hasta que la persona lo pida.
        expect(container.querySelector("iframe")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Activar ventana" }));
        const iframe = container.querySelector("iframe")!;
        expect(iframe).toBeTruthy();
        expect(iframe.getAttribute("src")).toBe("https://ejemplo.org/mapa");
        const sandbox = iframe.getAttribute("sandbox") ?? "";
        expect(sandbox).toContain("allow-scripts");
        expect(sandbox).not.toContain("allow-same-origin");
        expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
        expect(screen.getByRole("link", { name: "Abrir en pestaña nueva" }).getAttribute("rel")).toContain("noopener");
        // Marco, fondo y animación de fondo.
        const raiz = container.querySelector("[data-mensaje-rico]") as HTMLElement;
        expect(raiz.style.border).toContain("3px solid");
        expect(container.querySelector('[data-fondo-animado="estrellas"]')).toBeTruthy();
    });

    it("aplica fuente, tamaño, color y alineación al texto con estilo", () => {
        const { container } = render(
            <MensajeFormateado
                formato={{ v: 1, estilo: { fuente: "serif", tamano: 22, color: "#ffbf00", alineacion: "centro", negrita: true } }}
                textoPlano="Buenos días"
                mio
            />,
        );
        const raiz = container.querySelector("[data-mensaje-rico]") as HTMLElement;
        expect(raiz.style.fontFamily).toContain("Georgia");
        expect(raiz.style.fontSize).toBe("22px");
        expect(raiz.style.textAlign).toBe("center");
        expect(raiz.style.fontWeight).toBe("700");
        expect(raiz.style.color).toMatch(/#ffbf00|rgb\(255, 191, 0\)/);
        expect(raiz.textContent).toContain("Buenos días");
    });

    it("pinta el documento tipo Word con enlaces seguros", () => {
        render(
            <MensajeFormateado
                formato={{
                    v: 1,
                    doc: {
                        bloques: [
                            { tipo: "titulo", nivel: 2, tramos: [{ texto: "Orden del día" }] },
                            { tipo: "tareas", items: [{ hecha: true, tramos: [{ texto: "Acta" }] }] },
                            { tipo: "parrafo", tramos: [{ texto: "Más info", enlace: "https://starseed.example" }] },
                        ],
                    },
                }}
                textoPlano="Orden del día"
                mio={false}
            />,
        );
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Orden del día");
        expect(screen.getByRole("img", { name: "Tarea hecha" })).toBeTruthy();
        const a = screen.getByRole("link", { name: "Más info" });
        expect(a.getAttribute("href")).toBe("https://starseed.example");
        expect(a.getAttribute("target")).toBe("_blank");
    });

    it("anima letra a letra los textos cortos y por bloque los largos", () => {
        const corto = render(<MensajeFormateado formato={{ v: 1, estilo: { animacionTexto: "ola" } }} textoPlano="Hola mundo" mio />);
        expect(corto.container.querySelectorAll(".ss-rt-l")).toHaveLength(9);
        expect(corto.container.querySelector("[data-animacion]")?.getAttribute("data-animacion")).toBe("ola:letras");
        // El lector de pantalla lee palabras, no letras.
        expect(corto.container.querySelectorAll(".sr-only")).toHaveLength(2);
        corto.unmount();

        const largo = render(<MensajeFormateado formato={{ v: 1, estilo: { animacionTexto: "ola" } }} textoPlano={"palabra ".repeat(80)} mio />);
        expect(largo.container.querySelectorAll(".ss-rt-l")).toHaveLength(0);
        expect(largo.container.querySelector("[data-animacion]")?.getAttribute("data-animacion")).toBe("ola:bloque");
        expect(largo.container.querySelector(".ss-rt-bloque")).toBeTruthy();
    });

    it("si el formato no es válido enseña solo el texto plano", () => {
        const malo = { v: 1, doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "clic", enlace: "javascript:alert(1)" }] }] } } as FormatoMensaje;
        const { container } = render(<MensajeFormateado formato={malo} textoPlano="clic" mio={false} />);
        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toBe("clic");
    });

    it("ofrece ampliar el lienzo si el chat lo permite", () => {
        const onAbrir = vi.fn();
        render(<MensajeFormateado formato={LIENZO} textoPlano="x" mio onAbrir={onAbrir} />);
        fireEvent.click(screen.getByRole("button", { name: "Ampliar mensaje" }));
        expect(onAbrir).toHaveBeenCalledTimes(1);
    });
});
