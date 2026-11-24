// AST1123F: panel del Radar de Modelos — comparativa local/internet, capa, repos hf.co y pesos.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { construirPerfilNeurona } from "@/lib/astraura/modelos/perfil-neurona";
import { crearSenalesRed } from "@/lib/astraura/modelos/selector-contextual";
import type { CandidatoRadar, FuenteRadar } from "@/lib/astraura/modelos/radar-internet";
import type { ModeloLocal } from "@/lib/astraura/modelos/tipos";
import {
  PanelRadarModelos, grupoDeFuente, normalizarPeso, sumaPesos, validarRepoHf,
  type PropsPanelRadarModelos,
} from "../panel-radar-modelos";

function modelo(id: string, extra: Partial<ModeloLocal> = {}): ModeloLocal {
  return {
    id, etiqueta: id, familia: "prueba", editor: "prueba", clase: "normal", tipo: "estandar",
    runtimes: ["ollama"], descargaGb: 4, contextoK: 128, herramientas: true, vision: false,
    razonamiento: false, licencia: "MIT", puntuacion: null, estado: "comprobado", comprobado: "2026-11-20", fuentes: [],
    ...extra,
  };
}

function candidato(id: string, fuente: FuenteRadar, total: number, extra: Partial<ModeloLocal> = {}): CandidatoRadar {
  return {
    modelo: modelo(id, extra), fuente, preferido: false,
    puntuacion: { eci: total, encaje: 100, capacidades: 50, preferencia: 0, total },
  };
}

const perfil = construirPerfilNeurona({ id: "neurona-1", plataforma: "tauri", ramGb: 16, ramReal: true, ollama: true, backend158: true });
const senales = crearSenalesRed({ local: true, internet: true, mallaP2p: true });

function props(extra: Partial<PropsPanelRadarModelos> = {}): PropsPanelRadarModelos {
  return {
    candidatos: [], perfil, senales, entidad: "usuario", ambito: "privada",
    pesos: { latencia: 0.25, calidad: 0.25, privacidad: 0.25, ahorro: 0.25 }, repos: [],
    onAmbito: vi.fn(), onPesos: vi.fn(), onAnadirRepo: vi.fn(), onQuitarRepo: vi.fn(),
    ...extra,
  };
}

afterEach(cleanup);

describe("reglas puras del panel", () => {
  it("separa las fuentes locales de las de internet", () => {
    expect(grupoDeFuente("local")).toBe("local");
    expect(grupoDeFuente("capa-astraura")).toBe("local");
    expect(grupoDeFuente("huggingface")).toBe("internet");
    expect(grupoDeFuente("servidor-propio")).toBe("internet");
  });

  it("valida repos hf.co y normaliza enlaces de Hugging Face", () => {
    expect(validarRepoHf("hf.co/acme/modelo-GGUF")).toEqual({ ok: true, repo: "hf.co/acme/modelo-GGUF", error: null });
    expect(validarRepoHf("https://huggingface.co/acme/modelo-GGUF").repo).toBe("hf.co/acme/modelo-GGUF");
    expect(validarRepoHf("   ").ok).toBe(false);
    expect(validarRepoHf("acme/modelo").error).toMatch(/hf\.co\/usuario\/modelo/);
  });

  it("acota y suma los pesos de enrutamiento", () => {
    expect(normalizarPeso(1.7)).toBe(1);
    expect(normalizarPeso(-0.2)).toBe(0);
    expect(normalizarPeso(Number.NaN)).toBe(0);
    expect(sumaPesos({ latencia: 0.1, calidad: 0.2, privacidad: 0.3, ahorro: 0.4 })).toBe(1);
  });
});

describe("comparativa internet vs. local", () => {
  it("muestra los dos grupos y el modelo recomendado por el selector", () => {
    render(<PanelRadarModelos {...props({
      ambito: "publica",
      candidatos: [candidato("local-1", "local", 40), candidato("web-1", "huggingface", 80)],
    })} />);
    expect(document.querySelector("[data-grupo=local]")?.textContent).toMatch(/local-1/);
    expect(document.querySelector("[data-grupo=internet]")?.textContent).toMatch(/web-1/);
    expect(document.querySelector("[data-grupo=local]")?.textContent).toMatch(/1 candidato/);
    expect(document.querySelector("[data-campo=seleccion]")?.textContent).toMatch(/web-1/);
  });

  it("dice por qué no hay recomendación si ningún candidato encaja", () => {
    render(<PanelRadarModelos {...props({ candidatos: [] })} />);
    expect(document.querySelector("[data-campo=seleccion]")?.textContent).toMatch(/sin candidatos/);
    expect(document.querySelector("[data-grupo=local]")?.textContent).toMatch(/Sin candidatos/);
  });
});

describe("selector de capa pública/privada", () => {
  it("cambia de capa y explica la consecuencia de la elegida", () => {
    const onAmbito = vi.fn();
    render(<PanelRadarModelos {...props({ onAmbito })} />);
    fireEvent.click(screen.getByRole("button", { name: "Privada" }));
    expect(onAmbito).toHaveBeenCalledWith("privada");
    expect(document.querySelector("[data-campo=ambito]")?.textContent).toMatch(/nada sale de tus aparatos/);
  });
});

describe("alta rápida de repos hf.co", () => {
  it("avisa del formato, añade el repo normalizado y permite quitarlo", () => {
    const onAnadirRepo = vi.fn(); const onQuitarRepo = vi.fn();
    render(<PanelRadarModelos {...props({ onAnadirRepo, onQuitarRepo, repos: ["hf.co/ya/instalado"] })} />);
    const input = screen.getByLabelText("Repos de Hugging Face");
    fireEvent.change(input, { target: { value: "no-es-repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir repo/ }));
    expect(onAnadirRepo).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/hf\.co\/usuario\/modelo/);
    fireEvent.change(input, { target: { value: "https://huggingface.co/acme/nuevo-GGUF" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir repo/ }));
    expect(onAnadirRepo).toHaveBeenCalledWith("hf.co/acme/nuevo-GGUF");
    fireEvent.click(screen.getByRole("button", { name: "Quitar hf.co/ya/instalado" }));
    expect(onQuitarRepo).toHaveBeenCalledWith("hf.co/ya/instalado");
  });
});

describe("ajuste de pesos de enrutamiento", () => {
  it("emite el peso acotado y avisa cuando la suma pasa de 1", () => {
    const onPesos = vi.fn();
    render(<PanelRadarModelos {...props({ onPesos, pesos: { latencia: 0.5, calidad: 0.5, privacidad: 0.5, ahorro: 0.5 } })} />);
    fireEvent.change(screen.getByRole("slider", { name: "Latencia" }), { target: { value: "1" } });
    expect(onPesos).toHaveBeenCalledWith({ latencia: 1, calidad: 0.5, privacidad: 0.5, ahorro: 0.5 });
    expect(document.querySelector("[data-campo=pesos]")?.textContent).toMatch(/La suma no puede pasar de 1/);
  });
});
