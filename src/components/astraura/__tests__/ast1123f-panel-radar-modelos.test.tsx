// Panel del radar de modelos Astraura (AST1123F): comparativa, capa, repos y pesos.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModeloLocal } from "@/lib/astraura/modelos/tipos";
import type { CandidatoRadar, FuenteRadar } from "@/lib/astraura/modelos/radar-internet";
import { PanelRadarModelos, esFuenteInternet, repoHfValido, type PanelRadarModelosProps } from "../panel-radar-modelos";

function modelo(id: string): ModeloLocal {
  return {
    id, etiqueta: id, familia: "Prueba", editor: "Prueba", clase: "normal", tipo: "estandar", runtimes: ["ollama"],
    descargaGb: 4, contextoK: 256, herramientas: true, vision: false, razonamiento: false, licencia: "Apache-2.0",
    puntuacion: null, estado: "comprobado", comprobado: "2026-11-23", fuentes: [],
  };
}

function candidato(id: string, fuente: FuenteRadar, preferido = false): CandidatoRadar {
  return {
    modelo: modelo(id), fuente, preferido,
    puntuacion: { eci: 70, encaje: 100, capacidades: 50, preferencia: preferido ? 15 : 0, total: 80 },
  };
}

function props(extra: Partial<PanelRadarModelosProps> = {}): PanelRadarModelosProps {
  return {
    candidatos: [candidato("qwen3.5:9b", "ollama"), candidato("ternario-4b", "local")],
    ambito: "privada",
    pesos: { latencia: 0.25, calidad: 0.25, privacidad: 0.25, ahorro: 0.25 },
    repos: [],
    onAmbito: vi.fn(), onPesos: vi.fn(), onAgregarRepo: vi.fn(), onQuitarRepo: vi.fn(), onPreferir: vi.fn(),
    ...extra,
  };
}

afterEach(cleanup);

describe("utilidades del panel", () => {
  it("clasifica las fuentes de internet y valida los repos hf.co", () => {
    expect(esFuenteInternet("ollama")).toBe(true);
    expect(esFuenteInternet("huggingface")).toBe(true);
    expect(esFuenteInternet("local")).toBe(false);
    expect(repoHfValido("hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M")).toBe(true);
    expect(repoHfValido("huggingface.co/unsloth/x")).toBe(false);
    expect(repoHfValido("hf.co/solo")).toBe(false);
  });
});

describe("comparativa internet vs. local", () => {
  it("separa cada candidato en su columna y enseña fuente, ECI y encaje", () => {
    render(<PanelRadarModelos {...props()} />);
    const internet = document.querySelector("[data-columna=internet]") as HTMLElement;
    const local = document.querySelector("[data-columna=local]") as HTMLElement;
    expect(within(internet).getByText("qwen3.5:9b")).toBeTruthy();
    expect(within(internet).getByText("Ollama")).toBeTruthy();
    expect(within(internet).getByText(/ECI 70,0/)).toBeTruthy();
    expect(within(internet).getByText(/encaje 100/)).toBeTruthy();
    expect(within(local).getByText("ternario-4b")).toBeTruthy();
    expect(within(local).getByText("Local")).toBeTruthy();
  });
  it("marca al preferente y deja fijar a los demás", () => {
    const p = props({ candidatos: [candidato("a", "ollama", true), candidato("b", "local")] });
    render(<PanelRadarModelos {...p} />);
    expect(document.querySelector("[data-insignia=preferente]")?.textContent).toContain("Preferente");
    fireEvent.click(screen.getByRole("button", { name: "Fijar preferente" }));
    expect(p.onPreferir).toHaveBeenCalledWith("b");
  });
});

describe("selector de capa pública/privada", () => {
  it("marca la capa activa y explica la privacidad", () => {
    render(<PanelRadarModelos {...props()} />);
    expect(screen.getByRole("button", { name: "Privada" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Pública" }).getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-campo=nota-ambito]")?.textContent).toMatch(/nada sale de tus aparatos/);
  });
  it("en pública avisa de que sale a un tercero y emite el cambio", () => {
    const p = props({ ambito: "publica" });
    render(<PanelRadarModelos {...p} />);
    expect(document.querySelector("[data-campo=nota-ambito]")?.textContent).toMatch(/llega a un tercero/);
    fireEvent.click(screen.getByRole("button", { name: "Privada" }));
    expect(p.onAmbito).toHaveBeenCalledWith("privada");
  });
});

describe("alta rápida de repos hf.co/", () => {
  it("no deja añadir un repo con formato inválido y lo explica", () => {
    render(<PanelRadarModelos {...props()} />);
    const campo = screen.getByLabelText("Añadir repositorio Hugging Face");
    const boton = screen.getByRole("button", { name: "Añadir" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "hf.co/solo" } });
    expect(boton.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/hf\.co\/usuario\/repositorio/);
  });
  it("añade el repo válido y permite quitar los guardados", () => {
    const p = props({ repos: ["hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M"] });
    render(<PanelRadarModelos {...p} />);
    fireEvent.change(screen.getByLabelText("Añadir repositorio Hugging Face"), { target: { value: " hf.co/AtomicChat/Inkling-GGUF:IQ2_M " } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(p.onAgregarRepo).toHaveBeenCalledWith("hf.co/AtomicChat/Inkling-GGUF:IQ2_M");
    fireEvent.click(screen.getByRole("button", { name: "Quitar hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M" }));
    expect(p.onQuitarRepo).toHaveBeenCalledWith("hf.co/unsloth/Inkling-2-Mini-GGUF:Q4_K_M");
  });
});

describe("ajuste de pesos de enrutamiento", () => {
  it("muestra los cuatro pesos y avisa si la suma pasa de 100 %", () => {
    const p = props({ pesos: { latencia: 0.5, calidad: 0.5, privacidad: 0.25, ahorro: 0 } });
    render(<PanelRadarModelos {...p} />);
    expect(screen.getByLabelText("Peso de latencia")).toBeTruthy();
    expect(screen.getByLabelText("Peso de calidad")).toBeTruthy();
    expect(screen.getByLabelText("Peso de privacidad")).toBeTruthy();
    expect(screen.getByLabelText("Peso de ahorro")).toBeTruthy();
    expect(document.querySelector("[data-campo=suma-pesos]")?.textContent).toMatch(/Suma 125 %: baja los pesos/);
    fireEvent.change(screen.getByLabelText("Peso de calidad"), { target: { value: "0.25" } });
    expect(p.onPesos).toHaveBeenCalledWith({ latencia: 0.5, calidad: 0.25, privacidad: 0.25, ahorro: 0 });
  });
  it("con suma válida lo confirma", () => {
    render(<PanelRadarModelos {...props()} />);
    expect(document.querySelector("[data-campo=suma-pesos]")?.textContent).toMatch(/Suma 100 %: enrutamiento válido/);
  });
});
