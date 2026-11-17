import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelTexto } from "../panel-texto";
import { AVISOS } from "@/lib/traductor/privacidad";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";
import type { ParIdiomas } from "@/lib/traductor/tipos";

const par: ParIdiomas = { origen: "es", destino: "en" };

const resultadoOk: ResultadoServicioTraductor = { texto: "Hello", origenDetectado: "es", motor: "paquete-local", local: true, ms: 3 };

const servicioQue = (responde: () => Promise<ResultadoServicioTraductor>) => ({
    traducir: vi.fn(responde),
});

async function escribirYTraducir(servicio: ReturnType<typeof servicioQue>) {
    render(<PanelTexto servicio={servicio} voz={null} par={par} />);
    await userEvent.type(screen.getByTestId("caja-origen"), "Hola");
    await userEvent.click(screen.getByTestId("boton-traducir"));
}

describe("PanelTexto", () => {
    it("traducir muestra el resultado y el motor en tu aparato", async () => {
        const servicio = servicioQue(async () => resultadoOk);
        await escribirYTraducir(servicio);

        await waitFor(() => expect(screen.getByTestId("caja-resultado")).toHaveValue("Hello"));
        expect(screen.getByTestId("motor-info")).toHaveTextContent("Motor: paquete-local · en tu aparato");
        expect(servicio.traducir).toHaveBeenCalledWith("Hola", par);
    });

    it("motor que sale del aparato muestra «sale a …»", async () => {
        const servicio = servicioQue(async () => ({ texto: "Hi", origenDetectado: "es", motor: "astraura", local: false, ms: 3 }));
        await escribirYTraducir(servicio);

        await waitFor(() => expect(screen.getByTestId("motor-info")).toHaveTextContent(`sale a ${AVISOS.astraura.sale}`));
    });

    it("sin voz, leer en voz alta muestra el motivo", async () => {
        const servicio = servicioQue(async () => resultadoOk);
        await escribirYTraducir(servicio);

        await waitFor(() => expect(screen.getByTestId("caja-resultado")).toHaveValue("Hello"));
        await userEvent.click(screen.getByTestId("boton-leer"));

        expect(screen.getByTestId("motivo-voz")).toHaveTextContent("La voz no está disponible en este aparato.");
    });

    it("sin voz para el idioma, muestra el motivo que trae la voz inyectada", async () => {
        const voz = { hablar: vi.fn(() => ({ ok: false, motivo: "No hay una voz de en en este aparato" })) };
        const servicio = servicioQue(async () => resultadoOk);
        render(<PanelTexto servicio={servicio} voz={voz} par={par} />);
        await userEvent.type(screen.getByTestId("caja-origen"), "Hola");
        await userEvent.click(screen.getByTestId("boton-traducir"));
        await waitFor(() => expect(screen.getByTestId("caja-resultado")).toHaveValue("Hello"));

        await userEvent.click(screen.getByTestId("boton-leer"));

        expect(screen.getByTestId("motivo-voz")).toHaveTextContent("No hay una voz de en en este aparato");
        expect(voz.hablar).toHaveBeenCalledWith("Hello", "en");
    });

    it("el servicio con error muestra el mensaje en palabras", async () => {
        const servicio = servicioQue(async () => ({ error: "Ningún traductor disponible para es → en", motor: "paquete-local" }));
        await escribirYTraducir(servicio);

        expect(await screen.findByTestId("error-traduccion")).toHaveTextContent("Ningún traductor disponible para es → en");
    });

    it("necesitaAviso abre el diálogo de TU20 y al aceptar reintenta", async () => {
        const servicio = servicioQue(async () => ({ necesitaAviso: "astraura" }));
        const alAceptarAviso = vi.fn();
        render(<PanelTexto servicio={servicio} voz={null} par={par} alAceptarAviso={alAceptarAviso} />);
        await userEvent.type(screen.getByTestId("caja-origen"), "Hola");
        await userEvent.click(screen.getByTestId("boton-traducir"));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(AVISOS.astraura.titulo)).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /continuar con este motor/i }));

        expect(alAceptarAviso).toHaveBeenCalledWith("astraura");
        await waitFor(() => expect(servicio.traducir).toHaveBeenCalledTimes(2));
    });

    it("traducir mientras escribo traduce tras la pausa", async () => {
        const servicio = servicioQue(async () => resultadoOk);
        render(<PanelTexto servicio={servicio} voz={null} par={par} pausaMs={50} />);
        await userEvent.click(screen.getByTestId("interruptor-mientras-escribe"));
        await userEvent.type(screen.getByTestId("caja-origen"), "Hola");

        await waitFor(() => expect(servicio.traducir).toHaveBeenCalledWith("Hola", par));
    });

    it("el contador muestra los caracteres escritos y el tope", async () => {
        render(<PanelTexto servicio={servicioQue(async () => resultadoOk)} voz={null} par={par} />);

        expect(screen.getByTestId("contador-caracteres")).toHaveTextContent("0 / 5000");
        await userEvent.type(screen.getByTestId("caja-origen"), "Hola");
        expect(screen.getByTestId("contador-caracteres")).toHaveTextContent("4 / 5000");
    });

    it("el texto de la URL (?texto=&de=&a=) rellena la caja y el par", async () => {
        window.history.pushState({}, "", "/?texto=Hola%20mundo&de=es&a=en");
        const onCambiarPar = vi.fn();
        render(<PanelTexto servicio={servicioQue(async () => resultadoOk)} voz={null} par={par} onCambiarPar={onCambiarPar} />);

        await waitFor(() => expect(screen.getByTestId("caja-origen")).toHaveValue("Hola mundo"));
        expect(onCambiarPar).toHaveBeenCalledWith({ origen: "es", destino: "en" });

        window.history.pushState({}, "", "/");
    });
});
