// Bloque de ajustes de Astraura y área «Modelos de IA» de la Biblioteca (MOD1110A).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { ajustesPredeterminados } from "@/lib/astraura/modelos/almacen";
import { catalogoCompleto } from "@/lib/astraura/modelos/catalogo";
import { catalogoSemilla } from "@/lib/astraura/modelos/catalogo-datos";
import { planInstalar } from "@/lib/astraura/modelos/instalar";
import { construirPerfilNeurona, type PerfilNeurona } from "@/lib/astraura/modelos/perfil-neurona";
import { recomendarTodos } from "@/lib/astraura/modelos/recomendar";
import type { AccionesModelos, EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import { ModelosIaVista } from "@/components/library/modelos-ia-panel";
import { ModelosRecomendadosVista } from "../modelos-recomendados";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const catalogo = catalogoSemilla();
const modelos = catalogoCompleto(catalogo, capas);
const base = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", nombre: "Esta", gpuRenderer: "Apple M1", ramGb: 8 });

function estado(perfil: PerfilNeurona, pares: PerfilNeurona[] = [], extra: Partial<EstadoModelos & AccionesModelos> = {}): EstadoModelos & AccionesModelos {
  const instalados = new Set<string>();
  return {
    cargando: false, catalogo, modelos, perfil, pares, ajustes: ajustesPredeterminados(),
    recomendaciones: recomendarTodos({ catalogo: modelos, perfil, entorno: { pares } }),
    instalados, aviso: null, revisando: false, estadoRevision: "",
    setModo: vi.fn(), elegirManual: vi.fn(), setPrivacidad: vi.fn(), setRamDeclarada: vi.fn(),
    revisarAhora: vi.fn(async () => {}), descartarAviso: vi.fn(),
    planDe: (m) => planInstalar(m, perfil, instalados.has(m.id)),
    instalar: vi.fn(async () => ({ ok: true, mensaje: "Listo.", comando: null, sinHacerNada: false })),
    recomendarEn: vi.fn(() => null),
    ...extra,
  };
}

afterEach(cleanup);

describe("bloque «Modelo local recomendado para esta neurona»", () => {
  it("muestra los ocho casos, el modo Automático por defecto y la fecha del catálogo", () => {
    render(<ModelosRecomendadosVista e={estado(mac32)} />);
    expect(screen.getByRole("heading", { name: /Modelo local recomendado para esta neurona/ })).toBeTruthy();
    expect(document.querySelectorAll("[data-caso]")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Automático" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-campo=catalogo]")?.textContent).toMatch(/nov\. 2026/);
  });
  it("cada caso lleva su razón en una frase, la comparación y el veredicto", () => {
    render(<ModelosRecomendadosVista e={estado(mac32)} />);
    const conv = document.querySelector("[data-caso=conversacion]") as HTMLElement;
    expect(within(conv).getByText("gemma4:26b")).toBeTruthy();
    expect(conv.querySelector("[data-veredicto=recomendado]")?.textContent).toBe("Recomendado");
    expect(conv.querySelector("[data-campo=equivalencia]")?.textContent).toMatch(/ECI 141,7/);
    expect(conv.querySelector("[data-campo=razon]")?.textContent?.length).toBeGreaterThan(20);
  });
  it("instalar PREGUNTA primero con el tamaño y no descarga hasta pulsar Descargar", async () => {
    const e = estado(mac32);
    render(<ModelosRecomendadosVista e={e} />);
    const conv = document.querySelector("[data-caso=conversacion]") as HTMLElement;
    fireEvent.click(within(conv).getByRole("button", { name: /Instalar \(16,0 GB\)/ }));
    const pregunta = await screen.findByRole("alertdialog");
    expect(pregunta.textContent).toMatch(/16,0 GB de descarga/);
    expect(pregunta.textContent).toMatch(/No se descarga nada hasta que aceptes/);
    expect(e.instalar).not.toHaveBeenCalled();
    fireEvent.click(within(pregunta).getByRole("button", { name: /Ahora no/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(e.instalar).not.toHaveBeenCalled();
    fireEvent.click(within(conv).getByRole("button", { name: /Instalar/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Descargar/ }));
    await waitFor(() => expect(e.instalar).toHaveBeenCalledTimes(1));
    expect((e.instalar as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(true);
  });
  it("neurona justa: ofrece la IA de otra neurona y lo dice", () => {
    render(<ModelosRecomendadosVista e={estado(mac8, [mac32])} />);
    const cod = document.querySelector("[data-caso=codigo-agentes]") as HTMLElement;
    expect(cod.querySelector("[data-campo=ruta]")?.textContent).toContain("MaggaBook");
  });
  it("sin disco: «Falta disco: libera N GB» y la descarga queda bloqueada", async () => {
    const lleno = { ...mac32, discoLibreGb: 0.1 }; // ni las capas pequeñas caben en disco
    render(<ModelosRecomendadosVista e={estado(lleno)} />);
    const conv = document.querySelector("[data-caso=conversacion]") as HTMLElement;
    expect(conv.querySelector("[data-veredicto=falta-disco]")?.textContent).toMatch(/Falta disco: libera \d+,\d GB/);
    fireEvent.click(within(conv).getByRole("button", { name: /Instalar/ }));
    const d = await screen.findByRole("alertdialog");
    expect((within(d).getByRole("button", { name: /Descargar/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("modo y privacidad llaman a las acciones; RAM del navegador pide la memoria real", () => {
    const tablet = construirPerfilNeurona({ id: "t", nombre: "Tablet", plataforma: "android", ramGb: 8, webgpu: true });
    const e = estado(tablet);
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    expect(e.setModo).toHaveBeenCalledWith("manual");
    expect(screen.getByLabelText("Memoria real en GB")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Permitir un proveedor externo/));
    expect(e.setPrivacidad).toHaveBeenCalledWith({ externoPermitido: false });
    expect(screen.getByLabelText(/También para mis archivos privados/)).toBeTruthy();
  });
  it("el aviso discreto se puede descartar y «Revisar ahora» funciona", () => {
    const e = estado(mac32, [], { aviso: { clave: "k", texto: "Hay un modelo mejor para esta neurona." } });
    render(<ModelosRecomendadosVista e={e} />);
    expect(screen.getByRole("status").textContent).toContain("modelo mejor");
    fireEvent.click(screen.getByRole("button", { name: "Descartar aviso" }));
    expect(e.descartarAviso).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Revisar ahora/ }));
    expect(e.revisarAhora).toHaveBeenCalled();
  });
});

describe("área «Modelos de IA» de la Biblioteca", () => {
  it("tarjetas con comparación, y «en tu MaggaBook cabría» para las otras neuronas", () => {
    render(<ModelosIaVista e={estado(mac8, [mac32])} />);
    const t = document.querySelector("[data-modelo='gemma4:26b']") as HTMLElement;
    expect(t.querySelector("[data-campo=equivalencia]")?.textContent).toMatch(/ECI 141,7/);
    expect(t.querySelector("[data-campo=otras]")?.textContent).toContain("En tu MaggaBook cabría");
    expect(t.querySelector("[data-veredicto=no-cabe]")).toBeTruthy(); // en la de 8 GB no cabe
  });
  it("filtra por caso: visión solo deja modelos con visión", () => {
    render(<ModelosIaVista e={estado(mac32)} />);
    fireEvent.click(screen.getByRole("button", { name: "Visión" }));
    const ids = [...document.querySelectorAll("[data-modelo]")].map((n) => n.getAttribute("data-modelo")!);
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ids) expect(modelos.find((m) => m.id === id)?.vision).toBe(true);
  });
  it("lo sin comprobar y los candidatos se ven aparte, sin botón de instalar", () => {
    const sin = { ...catalogo.modelos[0], id: "raro:1b", etiqueta: "raro:1b", estado: "candidato" as const };
    const e = estado(mac32, [], { modelos: [...modelos, sin] });
    render(<ModelosIaVista e={e} />);
    const t = document.querySelector("[data-modelo='raro:1b']") as HTMLElement;
    expect(t.textContent).toMatch(/Candidato nuevo: sin recomendar/);
    expect(within(t).queryByRole("button", { name: /Instalar/ })).toBeNull();
  });
  it("mismo flujo de instalación: pregunta con tamaño y luego descarga", async () => {
    const e = estado(mac32);
    render(<ModelosIaVista e={e} />);
    const t = document.querySelector("[data-modelo='qwen3.5:9b']") as HTMLElement;
    fireEvent.click(within(t).getByRole("button", { name: /Instalar/ }));
    const d = await within(t).findByRole("alertdialog");
    expect(d.textContent).toContain("6,6 GB");
    expect(e.instalar).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: /Descargar/ }));
    await waitFor(() => expect(e.instalar).toHaveBeenCalledTimes(1));
  });
  it("no ofrece nada de variantes sin censura", () => {
    render(<ModelosIaVista e={estado(mac32)} />);
    expect(document.body.textContent).not.toMatch(/abliterat|uncensor|sin censura/i);
  });
});
