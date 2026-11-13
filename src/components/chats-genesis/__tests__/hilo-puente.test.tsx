import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { RegistroEspejo } from "@/lib/chats-genesis/tipos";

import { HiloPuente, analizarEscrito } from "../hilo-puente";
import { clienteFalso, haceMin, ponerAncho, respuestaFeed } from "./ayudas";

const AVISO: RegistroEspejo = { id: "cn-1-vigilante", t: haceMin(4), de: "vigilante", rol: "agente", tipo: "aviso", texto: "Cola parada", canal: "mando", fuente: "puente:hermes-avisos" };

describe("analizarEscrito", () => {
    it("texto suelto, órdenes permitidas y órdenes que no existen", () => {
        expect(analizarEscrito("hola Hermes", "hermes-avisos")).toEqual({ ok: true, entrada: { fuente: "puente:hermes-avisos", accion: "texto", texto: "hola Hermes" } });
        expect(analizarEscrito("/estado", "hermes-avisos")).toEqual({ ok: true, entrada: { fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "estado", args: [] } } });
        expect(analizarEscrito("/aprobar T1 T2", "hermes-avisos")).toMatchObject({ ok: true, entrada: { orden: { nombre: "aprobar", args: ["T1", "T2"] } } });
        expect(analizarEscrito("/decir hola a todos", "hermes-avisos")).toMatchObject({ ok: true, entrada: { orden: { nombre: "decir", args: [] }, texto: "hola a todos" } });
        expect(analizarEscrito("/a hermes revisa esto", "hermes-avisos")).toMatchObject({ ok: true, entrada: { orden: { nombre: "a", args: ["hermes"] }, texto: "revisa esto" } });
        expect(analizarEscrito("/reasignar T1 hermes/predeterminado", "hermes-avisos")).toMatchObject({ ok: true });
        expect(analizarEscrito("/reasignar T1", "hermes-avisos").ok).toBe(false);
        expect(analizarEscrito("/aprobar", "hermes-avisos").ok).toBe(false);
        expect(analizarEscrito("/borrar todo", "hermes-avisos")).toEqual({ ok: false, motivo: expect.stringContaining("Orden no permitida en este puente: /borrar") });
        expect(analizarEscrito("/estado", "peticiones")).toMatchObject({ ok: true, entrada: { fuente: "puente:peticiones", orden: { nombre: "estado" } } });
        // GEN1113INT: lo que el bot del A1 aún no tiene no se envía, y se dice por qué.
        for (const n of ["encargos", "pausa", "sigue", "cancela"]) {
            expect(analizarEscrito(`/${n}`, "peticiones")).toEqual({ ok: false, motivo: expect.stringContaining(`/${n} aún no está disponible`) });
        }
        expect(analizarEscrito("/aprobar X", "peticiones").ok).toBe(false);
    });
});

describe("HiloPuente", () => {
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it("«Hermes y avisos»: /estado se envía como orden y queda esperando a la Mac", async () => {
        ponerAncho(360);
        const { cliente, enviar } = clienteFalso({ feeds: { "puente:hermes-avisos": respuestaFeed([AVISO], 15) } });
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno />);
        expect(await screen.findByText("Cola parada")).toBeInTheDocument();
        expect(screen.getByTestId("cabecera-espejo")).toHaveTextContent("En vivo desde la Mac");
        const area = screen.getByRole("textbox", { name: "Mensaje u orden para el puente" });
        fireEvent.change(area, { target: { value: "/estado" } });
        fireEvent.keyDown(area, { key: "Enter" });
        await waitFor(() => expect(enviar).toHaveBeenCalledWith({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "estado", args: [] } }));
        expect(await screen.findByTestId("envio-local")).toHaveTextContent(/En la puerta del A1 · esperando a la Mac/);
    });

    it("una orden que no existe no se envía y el borrador se queda", async () => {
        ponerAncho(1440);
        const { cliente, enviar } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno />);
        const area = screen.getByRole("textbox", { name: "Mensaje u orden para el puente" }) as HTMLTextAreaElement;
        fireEvent.change(area, { target: { value: "/borrar todo" } });
        fireEvent.keyDown(area, { key: "Enter" });
        expect(await screen.findByRole("alert")).toHaveTextContent("Orden no permitida en este puente: /borrar");
        expect(area.value).toBe("/borrar todo");
        expect(enviar).not.toHaveBeenCalled();
    });

    it("la lista de órdenes se abre completa y una orden se pone en el cuadro de texto", async () => {
        ponerAncho(360);
        const { cliente } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="peticiones" esDueno />);
        fireEvent.click(screen.getByText("Órdenes"));
        const hoja = screen.getByRole("dialog");
        // GEN1113INT: solo lo que funciona hoy (/estado y /ayuda) se ofrece; lo demás se nombra como «aún no».
        expect(within(hoja).getAllByRole("button").filter((b) => b.textContent?.startsWith("/")).map((b) => b.querySelector("code")?.textContent)).toEqual(["/estado", "/ayuda"]);
        expect(within(hoja).getByTestId("ordenes-aun-no")).toHaveTextContent("Aún no disponibles");
        expect(within(hoja).getByTestId("ordenes-aun-no")).toHaveTextContent("/encargos · /pausa · /sigue · /cancela");
        fireEvent.click(within(hoja).getByText("/estado"));
        expect((screen.getByRole("textbox", { name: "Mensaje u orden para el puente" }) as HTMLTextAreaElement).value).toBe("/estado ");
    });

    it("«Peticiones y encargos» lo recoge el A1: lo escrito espera al A1", async () => {
        ponerAncho(1440);
        const { cliente } = clienteFalso({ feeds: { "puente:peticiones": { ok: true, registros: [], cursor: 0, latido: { t: new Date().toISOString(), de: "a1" } } } });
        render(<HiloPuente cliente={cliente} puente="peticiones" esDueno />);
        await waitFor(() => expect(screen.getByTestId("cabecera-espejo")).toHaveTextContent("En vivo desde el A1"));
        fireEvent.click(screen.getByText("/ayuda"));
        expect(await screen.findByTestId("envio-local")).toHaveTextContent(/esperando al A1/);
    });

    it("«Avisos de los directores» es solo lectura", async () => {
        ponerAncho(1440);
        const { cliente } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="avisos-directores" esDueno={false} />);
        expect(await screen.findByText(/Canal de avisos: solo lectura/)).toBeInTheDocument();
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("un desarrollador no abre los puentes A y B (ni se pide la copia)", () => {
        ponerAncho(1440);
        const { cliente, feed } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno={false} />);
        expect(screen.getByText(/solo lo puede leer y usar un dueño de MetaGenesis/)).toBeInTheDocument();
        expect(feed).not.toHaveBeenCalled();
    });
});
