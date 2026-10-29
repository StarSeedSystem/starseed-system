/**
 * Pruebas de DOM del estudio de vídeo (Ola 1018H · HFR1018K). Contrato:
 * `architecture/video-hyperframes.md` §4. Todo inyectado: sin red, sin navegador
 * real y sin procesos — el servicio local se simula con un `fetchLocal` de
 * mentira y las órdenes del SDK se reciben por `alEnviarOrden`.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RespuestaLocal } from "@/lib/protomolecula/servicio-local";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { EstudioVideoVentana, ORIGEN_HYPERFRAMES } from "../estudio-video-ventana";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: empujar }) }));
const empujar = vi.fn();

/** Composición StarSeed sin GSAP: dos clips en dos pistas (§3). */
const COMPOSICION_LIMPIA = [
    '<div class="clip" data-composition-id="titulo" data-start="0" data-duration="3" data-track-index="0">Hola</div>',
    '<div class="clip" data-composition-id="fondo" data-start="1" data-duration="2" data-track-index="1">Fondo</div>',
].join("");
/** Composición ajena con GSAP en el HTML del animador. */
const COMPOSICION_GSAP = '<div class="clip" data-start="0" data-duration="2"><script>gsap.to(".clip",{x:10})</script></div>';

/** Respuesta de salud del servicio local (contrato §4.3). */
const saludOk = async (): Promise<RespuestaLocal> => ({
    ok: true, status: 200, headers: { get: () => null }, text: async () => "OK",
});
/** El servicio no contesta en esta neurona. */
const saludCaida = async (): Promise<RespuestaLocal> => { throw new TypeError("conexión rechazada"); };

describe("EstudioVideoVentana · capas y línea de tiempo", () => {
    afterEach(cleanup);

    it("lista los clips de los data-* en su pista, elegible y con panel de propiedades", () => {
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} fetchLocal={saludOk} />);
        expect(screen.getByText("Capas y línea de tiempo")).toBeTruthy();
        expect(screen.getByText(/Comprobando el servicio de esta neurona/)).toBeTruthy();
        const pista = screen.getByText("titulo");
        expect(pista.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(pista);
        expect(pista.getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByText("Inicio (s)")).toBeTruthy();
        expect(screen.getByText("Duración (s)")).toBeTruthy();
    });
});

describe("EstudioVideoVentana · panel de propiedades y órdenes del SDK", () => {
    afterEach(cleanup);

    it("el texto del clip sale como orden setText de operaciones-sdk", () => {
        const ordenes: SdkOrder[] = [];
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} fetchLocal={saludOk}
            alEnviarOrden={(o) => ordenes.push(o)} />);
        fireEvent.click(screen.getByText("titulo"));
        fireEvent.change(screen.getByLabelText(/Texto/), { target: { value: "Nuevo título" } });
        expect(ordenes.length).toBe(1);
        expect(ordenes[0]).toEqual({ type: "setText", target: "titulo", value: "Nuevo título" });
    });

    it("el inicio y la duración salen como orden setTiming", () => {
        const ordenes: SdkOrder[] = [];
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} fetchLocal={saludOk}
            alEnviarOrden={(o) => ordenes.push(o)} />);
        fireEvent.click(screen.getByText("fondo"));
        fireEvent.change(screen.getByLabelText(/Inicio \(s\)/), { target: { value: "2" } });
        expect(ordenes[0]).toEqual({ type: "setTiming", target: "fondo", start: 2, duration: 2 });
        fireEvent.change(screen.getByLabelText(/Duración \(s\)/), { target: { value: "4" } });
        expect(ordenes[1]).toEqual({ type: "setTiming", target: "fondo", start: 1, duration: 4 });
    });
});

describe("EstudioVideoVentana · vista previa y servicio local", () => {
    afterEach(cleanup);

    it("con el servicio vivo y composición servida monta <hyperframes-player> del servicio local", async () => {
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} composicionId="mi-compo" fetchLocal={saludOk} />);
        const reproductor = await screen.getByText("Vista previa").closest("section");
        expect(reproductor).toBeTruthy();
        await vi.waitFor(() => {
            expect(document.querySelector("hyperframes-player")).toBeTruthy();
        });
        expect(reproductor?.querySelector("hyperframes-player")?.getAttribute("url")).toBe(`${ORIGEN_HYPERFRAMES}/vista/mi-compo`);
    });

    it("sin servicio: mensaje claro y «Abrir en otra neurona» llama a quien lo montó", async () => {
        const abrir = vi.fn();
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} fetchLocal={saludCaida} alAbrirEnOtraNeurona={abrir} />);
        const boton = await screen.findByRole("button", { name: "Abrir en otra neurona" });
        expect(screen.getByText(/El servicio HyperFrames no está en esta neurona/)).toBeTruthy();
        expect(screen.queryByText(/Vista previa/)).toBeNull();
        fireEvent.click(boton);
        expect(abrir.mock.calls.length).toBe(1);
    });

    it("sin botón propio, «Abrir en otra neurona» lleva al selector de neuronas de la malla", async () => {
        render(<EstudioVideoVentana composicion={COMPOSICION_LIMPIA} fetchLocal={saludCaida} />);
        fireEvent.click(await screen.findByRole("button", { name: "Abrir en otra neurona" }));
        expect(empujar).toHaveBeenCalledWith("/red-mesh");
    });
});

describe("EstudioVideoVentana · composición ajena con GSAP", () => {
    afterEach(cleanup);

    it("avisa: se reproduce y se renderiza, pero su animación no se edita aquí", () => {
        render(<EstudioVideoVentana composicion={COMPOSICION_GSAP} fetchLocal={saludOk} />);
        const aviso = screen.getByRole("alert");
        expect(aviso.textContent).toContain("GSAP");
        expect(aviso.textContent).toContain("WAAPI");
    });
});
