import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { useCapacidadesXR } from "../use-capacidades-xr";
import type { ResultadoCapacidadesXR } from "../use-capacidades-xr";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import { obtenerAlmacenXR } from "../almacen-xr";
import { BotonEntradaXR } from "../boton-entrada-xr";
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: vi.fn() }));
vi.mock("../almacen-xr", () => ({ obtenerAlmacenXR: vi.fn() }));
const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
/** Un aparato con UA real → lo que `useCapacidadesXR` devolvería (la misma tubería del núcleo). */
function aparato(ua: string, extra: Partial<DatosNavegador> = {}, listo = true): ResultadoCapacidadesXR {
    const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua, seguro: true, tieneXR: true, webgl2: true, ...extra };
    const capacidades = evaluarCapacidades(datos);
    const plan = planificarEntrada(capacidades, { instalada: datos.instalada });
    return { estado: listo ? "listo" : "sondeando", datos, capacidades, plan };
}
function darAparato(ua: string, extra: Partial<DatosNavegador> = {}, listo = true): void {
    usarHook.mockReturnValue(aparato(ua, extra, listo));
}
/** Promesa que el test resuelve a su ritmo (para ver el estado «entrando»). */
function diferida<T>(): { promesa: Promise<T>; resolver: (v: T) => void } {
    let resolver!: (v: T) => void;
    const promesa = new Promise<T>((ok) => { resolver = ok; });
    return { promesa, resolver };
}
const usarHook = vi.mocked(useCapacidadesXR);
const almacen = vi.mocked(obtenerAlmacenXR);
/** Almacén de mentira que «consigue» entrar por ambos modos. */
const enterado = (sesion: unknown) => ({ enterAR: vi.fn().mockResolvedValue(sesion), enterVR: vi.fn().mockResolvedValue(sesion) });
beforeEach(() => {
    usarHook.mockReset();
    almacen.mockReset();
    almacen.mockResolvedValue(enterado(true) as never);
});
afterEach(() => { cleanup(); });
describe("BotonEntradaXR", () => {
    it("en Quest con VR y AR pinta DOS botones: «Entrar en VR» y «Entrar en AR»", () => {
        darAparato(UA_QUEST, { vr: true, ar: true });
        render(<BotonEntradaXR />);
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
        expect(screen.getByText("Entrar en AR")).toBeTruthy();
        expect(screen.queryByText("Ver en mi cuarto (AR)")).toBeNull();
    });
    it("en iPhone no pinta ningún botón y dice la verdad de Safari", () => {
        darAparato(UA_IPHONE, { tieneXR: false, vr: false });
        render(<BotonEntradaXR />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.getByTestId("aviso-entrada-xr").textContent).toContain("Safari en iPhone no ofrece AR ni VR web");
    });
    it("sin https ni navigator.xr: la razón es el contexto inseguro, no el aparato", () => {
        darAparato(UA_QUEST, { seguro: false, tieneXR: false, vr: false });
        render(<BotonEntradaXR />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.getByTestId("aviso-entrada-xr").textContent).toContain("https");
    });
    it("mientras sondea no afirma nada del aparato: «Comprobando tu visor…»", () => {
        darAparato(UA_QUEST, { vr: true, ar: true }, false);
        render(<BotonEntradaXR />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.getByTestId("aviso-entrada-xr").textContent).toBe("Comprobando tu visor…");
    });
    it("no pinta el botón AR si este aparato no tiene AR", () => {
        darAparato(UA_QUEST, { vr: true, ar: false });
        render(<BotonEntradaXR />);
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
        expect(screen.queryByText("Entrar en AR")).toBeNull();
    });
    it("el modo pedido por prop reduce la lista a ese botón", () => {
        darAparato(UA_QUEST, { vr: true, ar: true });
        render(<BotonEntradaXR modo="vr-inmersivo" />);
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
    });
    it("pulsar «Entrar en VR» pide el almacén, entra con enterVR (no enterAR) y avisa", async () => {
        darAparato(UA_QUEST, { vr: true, ar: true });
        const alEntrar = vi.fn();
        const pedidos = enterado(true);
        almacen.mockResolvedValue(pedidos as never);
        render(<BotonEntradaXR alEntrar={alEntrar} />);
        fireEvent.click(screen.getByText("Entrar en VR"));
        await act(async () => { await Promise.resolve(); });
        expect(almacen).toHaveBeenCalledTimes(1);
        expect(pedidos.enterVR).toHaveBeenCalledTimes(1);
        expect(pedidos.enterAR).not.toHaveBeenCalled();
        expect(alEntrar).toHaveBeenCalledWith("vr-inmersivo");
    });
    it("mientras espera el navegador muestra «Entrando…» y deshabilita los botones", async () => {
        darAparato(UA_QUEST, { vr: true, ar: true });
        const espera = diferida<unknown>();
        almacen.mockReturnValueOnce(espera.promesa as unknown as ReturnType<typeof obtenerAlmacenXR>);
        render(<BotonEntradaXR />);
        fireEvent.click(screen.getByText("Entrar en VR"));
        expect(screen.getAllByText("Entrando…").length).toBe(2);
        expect((screen.getByRole("button", { name: "Entrar en VR" }) as HTMLButtonElement).disabled).toBe(true);
        await act(async () => { espera.resolver(true); });
    });
    it("un NotAllowedError se explica con el mensaje de `mensajeErrorXR`, no un fallo crudo", async () => {
        darAparato(UA_QUEST, { vr: true, ar: true });
        const rechazo = Object.assign(new Error("user gesture required"), { name: "NotAllowedError" });
        const pedidos = { enterAR: vi.fn().mockRejectedValue(rechazo), enterVR: vi.fn() };
        almacen.mockResolvedValue(pedidos as never);
        render(<BotonEntradaXR />);
        fireEvent.click(screen.getByText("Entrar en AR"));
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole("alert").textContent).toBe("Permiso denegado para entrar en realidad virtual o aumentada.");
    });
    // (XR1025A) El botón FLOTANTE de la esquina no pinta nada sin modos inmersivos: ni aviso ni contenedor.
    describe("variante flotante (esquina del layout raíz)", () => {
        it("sin VR ni AR en el aparato no pinta NADA (ni «Este aparato no tiene VR ni AR.»)", () => {
            darAparato("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36", { tieneXR: true, vr: false, ar: false });
            const { container } = render(<BotonEntradaXR variante="flotante" />);
            expect(container.firstChild).toBeNull();
            expect(screen.queryByTestId("boton-entrada-xr")).toBeNull();
            expect(screen.queryByTestId("aviso-entrada-xr")).toBeNull();
            expect(container.textContent).toBe("");
        });
        it("el aviso «Este aparato no tiene VR ni AR.» sigue siendo el motivo del plan, pero en la esquina no sale", () => {
            const resultado = aparato("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36", { tieneXR: true, vr: false, ar: false });
            usarHook.mockReturnValue(resultado);
            const { container } = render(<BotonEntradaXR variante="flotante" />);
            expect(resultado.plan.motivo).toBe("Este aparato no tiene VR ni AR.");
            expect(container.textContent).not.toContain("no tiene VR ni AR");
        });
        it("mientras sondea tampoco pinta nada: ni «Comprobando tu visor…» ni contenedor", () => {
            darAparato(UA_QUEST, { vr: true, ar: true }, false);
            const { container } = render(<BotonEntradaXR variante="flotante" />);
            expect(container.firstChild).toBeNull();
            expect(screen.queryByText("Comprobando tu visor…")).toBeNull();
        });
        it("en iPhone y sin https tampoco: el mensaje honesto queda para la variante insertada", () => {
            darAparato(UA_IPHONE, { tieneXR: false, vr: false });
            const iphone = render(<BotonEntradaXR variante="flotante" />);
            expect(iphone.container.firstChild).toBeNull();
            iphone.unmount();
            darAparato(UA_QUEST, { seguro: false, tieneXR: false, vr: false });
            const sinHttps = render(<BotonEntradaXR variante="flotante" />);
            expect(sinHttps.container.firstChild).toBeNull();
        });
        it("con VR y AR el botón sigue como hoy: abajo a la derecha y con su acción", async () => {
            darAparato(UA_QUEST, { vr: true, ar: true });
            const pedidos = enterado(true);
            almacen.mockResolvedValue(pedidos as never);
            render(<BotonEntradaXR variante="flotante" />);
            const caja = screen.getByTestId("boton-entrada-xr");
            expect(caja.className).toContain("fixed");
            expect(caja.className).toContain("bottom-4");
            expect(caja.className).toContain("right-4");
            expect(screen.getByRole("button", { name: "Entrar en VR" })).toBeTruthy();
            expect(screen.getByRole("button", { name: "Entrar en AR" })).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Entrar en VR" }));
            await act(async () => { await Promise.resolve(); });
            expect(pedidos.enterVR).toHaveBeenCalledTimes(1);
        });
    });
    it("la variante insertada (ajustes) conserva el aviso honesto cuando no hay modos inmersivos", () => {
        darAparato("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36", { tieneXR: true, vr: false, ar: false });
        render(<BotonEntradaXR variante="insertado" />);
        expect(screen.getByTestId("aviso-entrada-xr").textContent).toBe("Este aparato no tiene VR ni AR.");
    });
    it("con `offerSession` (el navegador ofrece su botón) el nuestro sigue visible como respaldo", () => {
        const resultado = aparato(UA_QUEST, { vr: true, ar: true, ofreceSesion: true });
        usarHook.mockReturnValue(resultado);
        render(<BotonEntradaXR />);
        expect(resultado.plan.estrategia).toBe("oferta-navegador");
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
        expect(screen.getByText("Entrar en AR")).toBeTruthy();
    });
});
