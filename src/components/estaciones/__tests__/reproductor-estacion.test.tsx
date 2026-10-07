import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Estado del HLS falso: sin red ni medios reales.
const hlsFalso = vi.hoisted(() => ({
    soportado: true,
    creadas: 0,
    destruidas: 0,
}));

vi.mock("hls.js", () => ({
    default: class HlsFalso {
        static isSupported() { return hlsFalso.soportado; }
        constructor() { hlsFalso.creadas += 1; }
        loadSource() { /* sin red */ }
        attachMedia() { /* sin medios */ }
        destroy() { hlsFalso.destruidas += 1; }
    },
}));

import { FRAME_ALLOW, FRAME_SANDBOX } from "@/components/browser/web-frame";
import { ReproductorEstacion } from "../reproductor-estacion";

afterEach(() => {
    cleanup();
    hlsFalso.soportado = true;
    hlsFalso.creadas = 0;
    hlsFalso.destruidas = 0;
});

describe("<ReproductorEstacion />", () => {
    it("audio en directo: <audio> nativo con barra compacta", () => {
        const { container } = render(<ReproductorEstacion
            estacion={{ enlace: "https://radio.ejemplo.fm/stream", tipo: "audio", titulo: "Radio libre" }} />);
        const audio = container.querySelector("audio");
        expect(audio?.getAttribute("src")).toBe("https://radio.ejemplo.fm/stream");
        expect(audio?.muted).toBe(true);
        expect(screen.getByTestId("barra-audio")).toBeTruthy();
    });

    it("vídeo directo: <video> nativo en 16:9, en silencio y con playsInline", () => {
        const { container } = render(<ReproductorEstacion
            estacion={{ enlace: "https://cdn.ejemplo.dev/directo.mp4", tipo: "video", titulo: "Vídeo" }} />);
        const video = container.querySelector("video");
        expect(video?.getAttribute("src")).toBe("https://cdn.ejemplo.dev/directo.mp4");
        expect(video?.muted).toBe(true);
        expect(video?.playsInline).toBe(true);
        expect(video?.className).toContain("aspect-video");
    });

    it("HLS sin soporte nativo carga hls.js perezoso y lo destruye al desmontar", async () => {
        const vista = render(<ReproductorEstacion
            estacion={{ enlace: "https://tv.ejemplo.org/directo.m3u8", tipo: "video", titulo: "TV" }} />);
        await waitFor(() => expect(hlsFalso.creadas).toBe(1));
        vista.unmount();
        expect(hlsFalso.destruidas).toBe(1);
    });

    it("si hls.js no puede reproducir, pasa a «Abrir en una pestaña»", async () => {
        hlsFalso.soportado = false;
        render(<ReproductorEstacion
            estacion={{ enlace: "https://tv.ejemplo.org/directo.m3u8", tipo: "video", titulo: "TV" }} />);
        const tarjeta = await screen.findByTestId("reproductor-pestana");
        expect(tarjeta.textContent).toContain("HLS (.m3u8)");
    });

    it("marco (YouTube): iframe aislado con sandbox, allow, lazy y no-referrer", () => {
        const { container } = render(<ReproductorEstacion
            estacion={{ enlace: "https://www.youtube.com/watch?v=abc123", tipo: "video", titulo: "Concierto" }} />);
        const marco = container.querySelector("iframe");
        expect(marco?.getAttribute("sandbox")).toBe(FRAME_SANDBOX);
        expect(marco?.getAttribute("allow")).toBe(FRAME_ALLOW);
        expect(marco?.getAttribute("loading")).toBe("lazy");
        expect(marco?.getAttribute("referrerpolicy")).toBe("no-referrer");
        expect(marco?.getAttribute("title")).toBe("Concierto");
        expect(marco?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abc123");
    });

    it("interno: enlace «Abrir en StarSeed» hacia la ruta del OS", () => {
        render(<ReproductorEstacion
            estacion={{ enlace: "/salas/plaza", tipo: "xr", titulo: "Plaza" }} />);
        const enlace = screen.getByRole("link", { name: "Abrir en StarSeed" });
        expect(enlace.getAttribute("href")).toBe("/salas/plaza");
    });

    it("el botón «Activar sonido» desmuta el medio y desaparece", () => {
        const { container } = render(<ReproductorEstacion
            estacion={{ enlace: "https://cdn.ejemplo.dev/directo.mp4", tipo: "video", titulo: "Vídeo" }} />);
        const boton = screen.getByRole("button", { name: "Activar sonido" });
        expect(boton.className).toContain("cursor-pointer");
        fireEvent.click(boton);
        expect(container.querySelector("video")?.muted).toBe(false);
        expect(screen.queryByRole("button", { name: "Activar sonido" })).toBeNull();
    });

    it("enlace no válido: tarjeta de pestaña con el motivo del detector", () => {
        render(<ReproductorEstacion
            estacion={{ enlace: "esto no es un enlace", tipo: "mixto", titulo: "Rara" }} />);
        const tarjeta = screen.getByTestId("reproductor-pestana");
        expect(tarjeta.textContent).toContain("Abrir en una pestaña");
        expect(tarjeta.textContent).toContain("Enlace no válido");
    });

    it("siempre muestra el enlace «Abrir en una pestaña» seguro", () => {
        render(<ReproductorEstacion
            estacion={{ enlace: "https://cdn.ejemplo.dev/directo.mp4", tipo: "video", titulo: "Vídeo" }} />);
        const enlace = screen.getByRole("link", { name: "Abrir en una pestaña" });
        expect(enlace.getAttribute("target")).toBe("_blank");
        expect(enlace.getAttribute("rel")).toContain("noopener");
    });
});
