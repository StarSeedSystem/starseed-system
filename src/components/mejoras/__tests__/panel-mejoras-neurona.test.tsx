/**
 * Panel «Mejoras por neurona»: estados vacíos honestos (nunca «al día» sin sondeo) y el informe REAL
 * del núcleo (registro → detector → hallazgos → decisión → informe) pintado tal cual.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MOMENTO_LIBRE } from "@/lib/actualizaciones/momento";
import { politicaPorDefecto } from "@/lib/actualizaciones/politica";
import { sanearApunte } from "@/lib/mejoras/aplicacion";
import { AJUSTES_POR_DEFECTO, decidirMejora } from "@/lib/mejoras/decision";
import { detectarMejoras } from "@/lib/mejoras/hallazgos";
import { construirInforme, type InformeNeurona } from "@/lib/mejoras/informe";
import { REGISTRO_SISTEMAS } from "@/lib/mejoras/registro";
import type { HuellaAparato } from "@/lib/mejoras/tipos";
import { ORDEN_SONDEO, PanelMejorasNeurona, fechaLegible, versionCorta } from "../panel-mejoras-neurona";

afterEach(cleanup);

const MAC: HuellaAparato = {
  neuronaId: "mac",
  nombre: "Mac M1",
  sistema: "macos",
  ramMb: 16384,
  ramEsCota: false,
  discoLibreMb: 80_000,
  cuotaWebLibreMb: null,
  nucleos: 8,
  gpu: { familia: "apple", vramMb: null },
  aceleraciones: ["cpu", "metal"],
  aceleracionesInferidas: false,
  medios: ["servidor"],
  enLinea: true,
  medida: "sondeo",
};
const PC: HuellaAparato = { ...MAC, neuronaId: "pc", nombre: "PC Linux", sistema: "linux", ramMb: 65536, gpu: { familia: "nvidia", vramMb: 24576 }, aceleraciones: ["cpu", "cuda", "vulkan"], nucleos: 16 };

/** El informe de la Mac tal como lo construye el núcleo: Ollama con versión nueva y el código en uso. */
function informeRealMac(): InformeNeurona {
  const hs = detectarMejoras({
    registro: REGISTRO_SISTEMAS,
    huella: MAC,
    instaladas: { ollama: { version: "0.40.1" } },
    remotas: { ollama: { version: "v0.40.2", fecha: null } },
    otras: [PC],
  });
  const ctx = {
    politica: { ...politicaPorDefecto("os"), servicios: { modo: "automatica-todas" as const }, modelos: { modo: "automatica-todas" as const } },
    ahoraH: 12,
    esNeuronaElegida: false,
    momento: MOMENTO_LIBRE,
    enUso: ["codigo" as const],
  };
  const decs = hs.map((h) => decidirMejora(h, AJUSTES_POR_DEFECTO, ctx));
  const ap = sanearApunte({ sistemaId: "vibeasr-cpp", neuronaId: "mac", accion: "aplicada", de: "1.0.0", a: "1.1.0", cuando: "2026-10-10T10:00:00Z", motivo: "Aplicada en la canaria.", calidad: "RTF 0,21 · WER 6 %" });
  return construirInforme(MAC, hs, decs, ap ? [ap] : []);
}

const vacia = (id: string, extra: Partial<InformeNeurona> = {}): InformeNeurona => ({
  neuronaId: id,
  nombre: id,
  medida: "navegador",
  aparato: "Android · ≥ 4 GB · WebGPU · navegador",
  nuevas: [],
  aplicadas: [],
  pospuestas: [],
  noCaben: [],
  alDia: 0,
  sinDato: 0,
  ...extra,
});

describe("PanelMejorasNeurona", () => {
  it("sin informes: dice que no hay sondeo y cómo obtenerlo; nunca «al día»", () => {
    render(<PanelMejorasNeurona informes={[]} />);
    const vacio = screen.getByTestId("mejoras-vacio");
    expect(vacio).toHaveTextContent("no se dice «al día»");
    expect(vacio).toHaveTextContent(ORDEN_SONDEO);
    expect(screen.getByText("Sin sondeo todavía")).toBeInTheDocument();
    expect(screen.queryByText(/está al día/)).toBeNull();
  });

  it("cargando sin datos: lo dice; con error: alerta visible", () => {
    const { rerender } = render(<PanelMejorasNeurona informes={[]} cargando />);
    expect(screen.getByText(/Leyendo las mejoras/)).toBeInTheDocument();
    expect(screen.queryByTestId("mejoras-vacio")).toBeNull();
    rerender(<PanelMejorasNeurona informes={[]} error="HTTP 500" />);
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
  });

  it("neurona sin sondeo ni datos: honesta; con todo al día: lo dice con el número", () => {
    render(<PanelMejorasNeurona informes={[vacia("movil"), vacia("tablet", { alDia: 3 }), vacia("viejo", { sinDato: 2 })]} />);
    expect(within(screen.getByTestId("neurona-movil")).getByTestId("sin-sondeo")).toHaveTextContent(ORDEN_SONDEO);
    expect(within(screen.getByTestId("neurona-tablet")).getByText("Todo lo que usa está al día (3).")).toBeInTheDocument();
    const viejo = screen.getByTestId("neurona-viejo");
    expect(within(viejo).getByTestId("sin-dato")).toHaveTextContent("2 fuentes sin dato");
    expect(within(viejo).queryByTestId("sin-sondeo")).toBeNull();
  });

  it("pinta el informe real del núcleo: pospuesto por uso, aplicado con calidad y lo que no cabe con su alternativa", () => {
    const inf = informeRealMac();
    render(<PanelMejorasNeurona informes={[vacia("movil"), inf]} estaNeuronaId="mac" generado="2026-10-10T10:30:00Z" />);
    const tarjetas = screen.getAllByRole("region").filter((r) => r.getAttribute("data-testid")?.startsWith("neurona-"));
    expect(tarjetas[0]).toHaveAttribute("data-testid", "neurona-mac");
    const mac = screen.getByTestId("neurona-mac");
    expect(within(mac).getByText("ESTA NEURONA")).toBeInTheDocument();
    expect(within(mac).getByText("sondeo de la máquina")).toBeInTheDocument();
    const ollama = within(mac).getByTestId("mejora-pospuesto-ollama");
    expect(ollama).toHaveTextContent("0.40.1 → v0.40.2");
    expect(ollama).toHaveTextContent(/en uso/);
    expect(within(mac).getByTestId("mejora-aplicado-vibeasr-cpp")).toHaveTextContent("RTF 0,21 · WER 6 %");
    expect(within(mac).getByTestId("mejora-nocabe-gpt-sovits")).toHaveTextContent("cabe en PC Linux");
    expect(screen.getByText(/Último sondeo:/)).toBeInTheDocument();
  });

  it("«Comprobar ahora» solo aparece si hay acción y se desactiva mientras carga", () => {
    const onComprobar = vi.fn();
    const { rerender } = render(<PanelMejorasNeurona informes={[]} />);
    expect(screen.queryByRole("button", { name: /Comprobar ahora/ })).toBeNull();
    rerender(<PanelMejorasNeurona informes={[]} onComprobar={onComprobar} />);
    fireEvent.click(screen.getByRole("button", { name: /Comprobar ahora/ }));
    expect(onComprobar).toHaveBeenCalledTimes(1);
    rerender(<PanelMejorasNeurona informes={[]} onComprobar={onComprobar} cargando />);
    expect(screen.getByRole("button", { name: /Comprobar ahora/ })).toBeDisabled();
  });

  it("formatos: sha largos a 7, sin versión «—», fecha rara se deja tal cual", () => {
    expect(versionCorta("66e7802a1b2c3d4e5f60718293a4b5c6d7e8f901")).toBe("66e7802");
    expect(versionCorta("0.12.15")).toBe("0.12.15");
    expect(versionCorta(null)).toBe("—");
    expect(fechaLegible("no-es-fecha")).toBe("no-es-fecha");
    expect(fechaLegible(null)).toBeNull();
  });
});
