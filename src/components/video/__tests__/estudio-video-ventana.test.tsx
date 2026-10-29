import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { EstudioVideoVentana, parsearClips, ordenesDeCambio, type ClipEstudio } from "../estudio-video-ventana";
import { plantillaStarSeed } from "@/lib/video-html/plantilla";

// ════════════════════════════════════════════════════════════════
// HFR1018K · Ventana «Estudio de vídeo» (HyperFrames).
// Se prueba solo lo puro: parsearClips y ordenesDeCambio son
// entrada → salida, y el componente se monta con datos en props
// (sin red, sin servicio ni procesos).
// ════════════════════════════════════════════════════════════════

afterEach(() => {
    cleanup();
});

/** La composición de la casa (plantilla StarSeed, sin GSAP): 3 clips, 3 s a 720p. */
function composicion(): string {
    return plantillaStarSeed({
        ancho: 1280,
        alto: 720,
        duracion: 3,
        titulo: "Ecos de luz",
        fondo: "#08040f",
        acento: "#00F0FF",
    });
}

/** Composición mínima con GSAP en un <script> (la que detecta el contrato §2). */
function composicionConGsap(): string {
    return (
        '<div data-composition-id="main" data-start="0" data-duration="2">' +
        '<div id="x" class="clip" data-start="0" data-duration="2" data-track-index="0"></div>' +
        '<script>gsap.to("#x", { opacity: 0.5, duration: 1 });</' + "script>" +
        "</div>"
    );
}

describe("parsearClips · atributos data-* de la composición", () => {
    it("lee los tres clips de la plantilla StarSeed", () => {
        const clips = parsearClips(composicion());
        expect(clips.map((c) => c.id)).toEqual(["fondo", "titulo", "acento"]);
    });

    it("cada clip trae su inicio, duración y pista", () => {
        const clips = parsearClips(composicion());
        const fondo = clips[0] as ClipEstudio;
        expect(fondo.inicio).toBe(0);
        expect(fondo.duracion).toBe(3);
        expect(fondo.pista).toBe(0);
        expect(fondo.texto).toBe("");
    });

    it("el clip del título trae su texto", () => {
        const clips = parsearClips(composicion());
        const titulo = clips[1] as ClipEstudio;
        expect(titulo.texto).toBe("Ecos de luz");
        expect(titulo.pista).toBe(1);
    });
});

describe("ordenesDeCambio · panel → órdenes del SDK", () => {
    const clip: ClipEstudio = { id: "titulo", etiqueta: "titulo", inicio: 0, duracion: 3, pista: 1, texto: "Ecos de luz" };

    it("sin cambios no emite nada", () => {
        expect(ordenesDeCambio(clip, "Ecos de luz", 0, 3)).toEqual([]);
    });

    it("un cambio de texto emite una orden setText", () => {
        expect(ordenesDeCambio(clip, "Rayo de luz", 0, 3)).toEqual([
            { type: "setText", target: "titulo", value: "Rayo de luz" },
        ]);
    });

    it("un cambio de tiempos emite setAttribute de data-start y data-duration", () => {
        expect(ordenesDeCambio(clip, "Ecos de luz", 0.5, 2)).toEqual([
            { type: "setAttribute", target: "titulo", name: "data-start", value: "0.5" },
            { type: "setAttribute", target: "titulo", name: "data-duration", value: "2" },
        ]);
    });
});

// ── Ventana sin servicio local ───────────────────────────────────
describe("EstudioVideoVentana · servicio local ausente", () => {
    it("pinta el mensaje claro del servicio y el botón «Abrir en otra neurona»", () => {
        render(<EstudioVideoVentana html={composicion()} />);
        expect(screen.getByText(/Sin vista previa/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Abrir en otra neurona/i })).toBeInTheDocument();
    });

    it("el botón abre en otra neurona y la vista del servicio desaparece con URL", () => {
        const abrir = vi.fn();
        const { rerender, container } = render(<EstudioVideoVentana html={composicion()} onAbrirEnOtraNeurona={abrir} />);
        fireEvent.click(screen.getByRole("button", { name: /Abrir en otra neurona/i }));
        expect(abrir).toHaveBeenCalledTimes(1);
        rerender(<EstudioVideoVentana html={composicion()} urlVistaPrevia="http://127.0.0.1:4490/preview/main" />);
        const player = container.querySelector("hyperframes-player");
        expect(player).not.toBeNull();
        expect(player?.getAttribute("src")).toBe("http://127.0.0.1:4490/preview/main");
        expect(screen.queryByText(/Sin vista previa/i)).not.toBeInTheDocument();
    });

    it("sin composición lo dice y no inventa capas", () => {
        render(<EstudioVideoVentana />);
        expect(screen.getByText(/Sin composición/i)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^fondo$/i })).not.toBeInTheDocument();
    });
});

// ── Aviso GSAP (licencia, contrato §2) ───────────────────────────
describe("EstudioVideoVentana · aviso de GSAP", () => {
    it("avisa cuando la composición trae GSAP", () => {
        render(<EstudioVideoVentana html={composicionConGsap()} />);
        expect(screen.getByRole("alert")).toHaveTextContent("GSAP");
        expect(screen.getByRole("alert").textContent).toMatch(/WAAPI/);
    });

    it("no avisa con la composición de la casa (sin GSAP)", () => {
        render(<EstudioVideoVentana html={composicion()} />);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

// ── Selección de clip y panel de propiedades ─────────────────────
describe("EstudioVideoVentana · panel de propiedades", () => {
    it("selecciona un clip, precarga sus valores y emite la orden al aplicar", () => {
        const onOrden = vi.fn();
        render(<EstudioVideoVentana html={composicion()} onOrden={onOrden} />);
        fireEvent.click(screen.getByRole("button", { name: /titulo/i }));
        const texto = screen.getByLabelText("Texto del clip") as HTMLInputElement;
        expect(texto.value).toBe("Ecos de luz");
        fireEvent.change(texto, { target: { value: "Rayo de luz" } });
        fireEvent.click(screen.getByRole("button", { name: /Aplicar cambios/i }));
        expect(onOrden).toHaveBeenCalledTimes(1);
        expect(onOrden).toHaveBeenCalledWith({ type: "setText", target: "titulo", value: "Rayo de luz" });
    });

    it("emite setAttribute al cambiar tiempos y no emite sin selección", () => {
        const onOrden = vi.fn();
        const { rerender } = render(<EstudioVideoVentana html={composicion()} onOrden={onOrden} />);
        fireEvent.click(screen.getByRole("button", { name: /acento/i }));
        fireEvent.change(screen.getByLabelText("Inicio (s)"), { target: { value: "1.5" } });
        fireEvent.click(screen.getByRole("button", { name: /Aplicar cambios/i }));
        expect(onOrden).toHaveBeenCalledWith({ type: "setAttribute", target: "acento", name: "data-start", value: "1.5" });
        rerender(<EstudioVideoVentana html={composicion()} />);
        fireEvent.click(screen.getByRole("button", { name: /Aplicar cambios/i }));
        expect(onOrden).toHaveBeenCalledTimes(1);
    });
});
