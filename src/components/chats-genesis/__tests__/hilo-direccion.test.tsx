import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { MODELO_PRESIDENTE } from "@/lib/mando/chat-director-tipos";

import { HiloDireccion, CLAVE_FILTROS, leerFiltros, llegoPorGenesis } from "../hilo-direccion";
import { APARATO_COMPLETO, clienteFalso, feedDeEjemplo, ponerAncho, respuestaFeed } from "./ayudas";

async function montar(op: Parameters<typeof clienteFalso>[0] & { esDueno?: boolean; ancho?: number; latidoS?: number | null } = {}) {
    ponerAncho(op.ancho ?? 1440);
    const falso = clienteFalso({ feeds: { direccion: respuestaFeed(feedDeEjemplo(), op.latidoS === undefined ? 10 : op.latidoS) }, ...op });
    // GEN1114F: con un aparato emparejado (nivel completo); sin él, el cuadro de texto no se ofrece.
    render(<HiloDireccion cliente={falso.cliente} esDueno={op.esDueno ?? true} aparato={APARATO_COMPLETO} />);
    await screen.findAllByTestId("mensaje-direccion");
    return falso;
}

function escribirYEnviar(texto: string) {
    const area = screen.getByRole("textbox", { name: "Mensaje a la dirección" });
    fireEvent.change(area, { target: { value: texto } });
    fireEvent.keyDown(area, { key: "Enter" });
    return area as HTMLTextAreaElement;
}

describe("HiloDireccion", () => {
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
        vi.useRealTimers();
    });

    it("«En vivo» solo con un latido de 90 s o menos", async () => {
        await montar({ latidoS: 30 });
        expect(screen.getByTestId("cabecera-espejo")).toHaveTextContent("En vivo desde la Mac · copia de hace 30 s");
        cleanup();
        await montar({ latidoS: 120 });
        expect(screen.getByTestId("cabecera-espejo")).toHaveTextContent(/La Mac no responde desde las \d{2}:\d{2} \(hace 2 min\)\. Ves la última copia\. Lo que escribas espera en la puerta del A1; las órdenes caducan a los 30 min/);
    });

    it("sin latido no dice «En vivo»: dice que no hay copia en vivo", async () => {
        await montar({ latidoS: null });
        const c = screen.getByTestId("cabecera-espejo");
        expect(c).not.toHaveTextContent("En vivo");
        expect(c).toHaveTextContent("La puerta del A1 no tiene ningún latido de la Mac");
    });

    it("lo escrito queda «En la puerta del A1 · esperando a la Mac» hasta el acuse, y «Hecho» solo con el acuse", async () => {
        const acuses = vi.fn(async (): Promise<Record<number, { estado: string; t: string }>> => ({}));
        const { enviar } = await montar({ acuses });
        const area = escribirYEnviar("Prueba GEN1113 desde el móvil");
        await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
        expect(enviar.mock.calls[0]![0]).toEqual({
            fuente: "direccion", accion: "decir", texto: "Prueba GEN1113 desde el móvil", modelo: MODELO_PRESIDENTE, canales: ["director-presidente"],
        });
        const envio = await screen.findByTestId("envio-local");
        await waitFor(() => expect(envio).toHaveTextContent(/En la puerta del A1 · esperando a la Mac desde las \d{2}:\d{2}/));
        expect(envio).toHaveTextContent("vía Genesis en Astraura");
        expect(area.value).toBe("");
        expect(envio).not.toHaveTextContent("Hecho");
        acuses.mockResolvedValue({ 7: { estado: "hecho", t: new Date().toISOString() } });
        await waitFor(() => expect(screen.getByTestId("envio-local")).toHaveTextContent("Hecho"), { timeout: 5000 });
    });

    it("un 403 solo-dueno deja el borrador y dice el motivo; el mensaje queda como no enviado", async () => {
        const { enviar } = await montar({
            enviar: async () => ({ ok: false, estado: 403, codigo: "solo-dueno", error: "solo dueño" }),
        });
        const area = escribirYEnviar("Hermes, aprueba la cola");
        await waitFor(() => expect(enviar).toHaveBeenCalled());
        expect(await screen.findByRole("alert")).toHaveTextContent("Esta orden solo la puede dar un dueño de MetaGenesis");
        expect(area.value).toBe("Hermes, aprueba la cola");
        const envio = screen.getByTestId("envio-local");
        expect(envio).toHaveAttribute("data-estado", "no-enviado");
        expect(envio).toHaveTextContent("No enviado: Esta orden solo la puede dar un dueño de MetaGenesis");
    });

    it("sin puerta, el borrador se queda y se dice que no se envió nada", async () => {
        await montar({ enviar: async () => ({ ok: false, estado: 0, error: "sin red" }) });
        const area = escribirYEnviar("Hola");
        expect(await screen.findByRole("alert")).toHaveTextContent("La puerta de datos del A1 no responde; no se envió nada");
        expect(area.value).toBe("Hola");
    });

    it("un desarrollador escribe solo al hilo (canal mando, sin motor)", async () => {
        const { enviar } = await montar({ esDueno: false });
        escribirYEnviar("Nota para el hilo");
        await waitFor(() => expect(enviar).toHaveBeenCalled());
        expect(enviar.mock.calls[0]![0]).toEqual({ fuente: "direccion", accion: "decir", texto: "Nota para el hilo", canales: ["mando"] });
    });

    it("«Responder con» pide la respuesta del motor elegido sobre ese mensaje", async () => {
        const { enviar } = await montar();
        const tarjeta = screen.getAllByTestId("mensaje-direccion").find((t) => t.textContent?.includes("Revisado el despliegue"))!;
        fireEvent.click(within(tarjeta).getByText("Responder con…"));
        const hoja = screen.getByRole("dialog");
        fireEvent.click(within(hoja).getByLabelText("Hermes"));
        fireEvent.click(within(hoja).getByText("Pedir respuesta"));
        await waitFor(() => expect(enviar).toHaveBeenCalled());
        const e = enviar.mock.calls[0]![0];
        expect(e).toMatchObject({ fuente: "direccion", accion: "responder", modelo: "hermes/predeterminado" });
        expect(e.respondeA).toMatch(/^md-\d{10,16}-[0-9a-f]{4}$/);
    });

    it("«Enviar a» reenvía a los canales marcados", async () => {
        const { enviar } = await montar();
        const tarjeta = screen.getAllByTestId("mensaje-direccion").find((t) => t.textContent?.includes("¿Cómo va la ola?"))!;
        fireEvent.click(within(tarjeta).getByText("Enviar a…"));
        const hoja = screen.getByRole("dialog");
        fireEvent.click(within(hoja).getByLabelText("Antigravity"));
        fireEvent.click(within(hoja).getByText(/^Enviar a 1$/));
        await waitFor(() => expect(enviar).toHaveBeenCalled());
        expect(enviar.mock.calls[0]![0]).toMatchObject({ accion: "reenviar", canales: ["antigravity"] });
    });

    it("marca «vía Genesis en Astraura» lo que llegó por la puerta", async () => {
        await montar();
        const marcas = screen.getAllByTestId("via-genesis");
        expect(marcas).toHaveLength(1);
        expect(llegoPorGenesis({ id: "x", t: "", de: "genesis-web-1234abcd", rol: "alex", tipo: "mensaje", texto: "", canal: "mando" })).toBe(true);
        expect(llegoPorGenesis({ id: "x", t: "", de: "alex", rol: "alex", tipo: "mensaje", texto: "", canal: "mando" })).toBe(false);
    });

    it("los chips se guardan con clave propia y la primera vez copian los de /genesis sin borrarlos", async () => {
        window.localStorage.setItem("starseed.mando.director.filtros", JSON.stringify({ direccion: "presidente", rara: "x" }));
        expect(leerFiltros()).toEqual({ direccion: "presidente" });
        expect(window.localStorage.getItem(CLAVE_FILTROS)).toContain("presidente");
        expect(window.localStorage.getItem("starseed.mando.director.filtros")).toContain("presidente");
    });

    it("un chip guardado que ya no deja nada se dice y se quita con un toque", async () => {
        window.localStorage.setItem(CLAVE_FILTROS, JSON.stringify({ todo: "de:nadie" }));
        await act(async () => {
            ponerAncho(1440);
            const f = clienteFalso({ feeds: { direccion: respuestaFeed(feedDeEjemplo(), 10) } });
            render(<HiloDireccion cliente={f.cliente} esDueno aparato={APARATO_COMPLETO} />);
        });
        const vacio = await screen.findByTestId("filtro-vacio");
        expect(vacio).toHaveTextContent("Nada con «nadie» en Todo");
        fireEvent.click(within(vacio).getByText("Quitar el filtro"));
        expect(await screen.findAllByTestId("mensaje-direccion")).not.toHaveLength(0);
    });

    it("con el teclado abierto, el cuadro de texto vuelve a la vista", async () => {
        const oyentes: Record<string, () => void> = {};
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: { addEventListener: (t: string, f: () => void) => { oyentes[t] = f; }, removeEventListener: () => {}, height: 300 },
        });
        await montar({ ancho: 360 });
        const compositor = screen.getByTestId("compositor-genesis").parentElement!;
        const mover = vi.fn();
        compositor.scrollIntoView = mover;
        screen.getByRole("textbox", { name: "Mensaje a la dirección" }).focus();
        oyentes.resize?.();
        expect(mover).toHaveBeenCalledWith({ block: "end" });
        Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    });
});
