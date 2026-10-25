// Pruebas del asistente «Conectar Genesis» (Ola 1019G · tarea M).
// Todo con datos inyectados: sin red, sin Supabase. La clave pegada en una
// prueba es inventada («clave-de-prueba») y solo comprueba que NO queda.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    AsistenteConectores,
    cadenaDelPapel,
    type RecursoLocal,
    type SugerenciaGratis,
} from "../asistente-conectores";

const NEURONA: RecursoLocal = { id: "n1", nombre: "Neurona del salón", tipo: "neurona", detalle: "capa razón", potencia: 12 };
const CEREBRO: RecursoLocal = { id: "c1", nombre: "Servidor del cerebro", tipo: "cerebro", detalle: "caja de la casa", potencia: 8 };
const GRATIS: SugerenciaGratis[] = [
    { id: "groq", nombre: "Groq", papeles: ["escritor", "código"], enlaceAlta: "https://console.groq.com", enlaceClave: "https://console.groq.com/keys", variableClave: "GROQ_API_KEY", limiteGratis: null, verificado: null },
    { id: "openrouter", nombre: "OpenRouter · :free", papeles: ["revisor"], enlaceAlta: "https://openrouter.ai", enlaceClave: "https://openrouter.ai/keys", variableClave: "OPENROUTER_API_KEY", limiteGratis: "50 peticiones al día con modelos :free", verificado: "2026-09-05" },
];

afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
});

describe("cadenaDelPapel (función pura)", () => {
    it("locales encendidos primero por potencia medida, gratis detrás", () => {
        const tramos = cadenaDelPapel("escritor", [CEREBRO, NEURONA], GRATIS);
        expect(tramos.map((t) => t.nombre)).toEqual(["Neurona del salón", "Servidor del cerebro", "Groq"]);
        expect(tramos[0].motivo).toContain("12 tokens/s");
        expect(tramos[1].motivo).toContain("8 tokens/s");
        expect(tramos[2].motivo).toContain("gratis");
    });

    it("sin potencia medida lo declara; el límite sin verificar no se inventa", () => {
        const sinMedir: RecursoLocal = { ...NEURONA, potencia: null };
        const tramos = cadenaDelPapel("escritor", [sinMedir], GRATIS);
        expect(tramos[0].motivo).toContain("potencia sin medir");
        expect(tramos[1].motivo).toContain("límite sin verificar");
    });

    it("la cadena de un papel solo trae las sugerencias de ese papel", () => {
        expect(cadenaDelPapel("revisor", [], GRATIS).map((t) => t.nombre)).toEqual(["OpenRouter · :free"]);
    });
});

describe("asistente «Conectar Genesis»", () => {
    it("el paso 3 muestra la cadena con lo encendido y su motivo", () => {
        render(<AsistenteConectores locales={[NEURONA, CEREBRO]} gratis={GRATIS} papeles={["escritor"]} />);
        fireEvent.click(screen.getByTestId("conector-paso-3"));
        const cadena = screen.getByTestId("cadena-escritor");
        expect(cadena.textContent).not.toContain("Neurona del salón");
        fireEvent.click(screen.getByTestId("conector-paso-1"));
        fireEvent.click(screen.getByTestId("local-n1"));
        fireEvent.click(screen.getByTestId("conector-paso-3"));
        expect(screen.getByTestId("cadena-escritor").textContent).toContain("Neurona del salón — local del contexto");
        expect(screen.getByTestId("cadena-escritor").textContent).not.toContain("Servidor del cerebro");
    });

    it("«Vincular» y «Alta» abren sus enlaces oficiales en pestaña nueva", () => {
        const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
        render(<AsistenteConectores locales={[]} gratis={GRATIS} />);
        fireEvent.click(screen.getByTestId("conector-paso-2"));
        fireEvent.click(screen.getByTestId("vincular-groq"));
        fireEvent.click(screen.getByTestId("alta-openrouter"));
        expect(abrir).toHaveBeenNthCalledWith(1, "https://console.groq.com/keys", "_blank", "noopener,noreferrer");
        expect(abrir).toHaveBeenNthCalledWith(2, "https://openrouter.ai", "_blank", "noopener,noreferrer");
    });

    it("pega la clave: se envía a la API, se borra del campo y queda solo la huella", async () => {
        const enviar = vi.fn().mockResolvedValue({ ok: true, huella: "gsk-…x9c" });
        render(<AsistenteConectores locales={[]} gratis={GRATIS} enviarClave={enviar} />);
        fireEvent.click(screen.getByTestId("conector-paso-2"));
        fireEvent.change(screen.getByTestId("clave-groq"), { target: { value: "clave-de-prueba" } });
        fireEvent.click(screen.getByTestId("guardar-groq"));
        await waitFor(() => expect(screen.getByTestId("huella-groq")).toBeInTheDocument());
        expect(screen.getByTestId("huella-groq").textContent).toContain("huella gsk-…x9c");
        expect(screen.getByTestId("clave-groq")).toHaveValue("");
        expect(enviar).toHaveBeenCalledWith({ proveedor: "groq", variable: "GROQ_API_KEY", clave: "clave-de-prueba" });
        expect(screen.queryByText("clave-de-prueba")).toBeNull();
    });

    it("si la bóveda rechaza, la clave también se borra y se explica el fallo", async () => {
        const enviar = vi.fn().mockResolvedValue({ ok: false, error: "La bóveda rechazó la clave." });
        render(<AsistenteConectores locales={[]} gratis={GRATIS} enviarClave={enviar} />);
        fireEvent.click(screen.getByTestId("conector-paso-2"));
        fireEvent.change(screen.getByTestId("clave-groq"), { target: { value: "clave-de-prueba" } });
        fireEvent.click(screen.getByTestId("guardar-groq"));
        await waitFor(() => expect(screen.getByText(/rechazó la clave/)).toBeInTheDocument());
        expect(screen.getByTestId("clave-groq")).toHaveValue("");
        expect(screen.queryByTestId("huella-groq")).toBeNull();
    });

    it("sin datos del contexto lo dice en vez de dibujar pasos vacíos", () => {
        render(<AsistenteConectores locales={[]} gratis={GRATIS} />);
        expect(screen.getByText(/Sin neuronas, servidores del cerebro/)).toBeInTheDocument();
    });
});
