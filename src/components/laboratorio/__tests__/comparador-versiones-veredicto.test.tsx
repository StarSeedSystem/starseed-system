import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoBanco, ResultadoPrueba } from "@/lib/laboratorio/banco-pruebas";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
  }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));

const banco = vi.hoisted(() => ({ lotes: [] as unknown[] }));

vi.mock("@/lib/laboratorio/versiones", () => {
  const version = (id: string, nombre: string) => ({
    id,
    genomaId: "g1",
    nombre,
    nota: "",
    creada: `2026-10-0${id === "va" ? 1 : 2}T10:00:00.000Z`,
    instantanea: { id: "g1", nombre: "Genoma", creado: "", nodos: [] },
  });
  return {
    versionesDe: () => [version("va", "Versión A"), version("vb", "Versión B")],
    compararVersiones: () => ({ cambiados: [], añadidos: [], quitados: [] }),
    promoverAlOS: () => null,
  };
});
vi.mock("@/lib/laboratorio/banco-pruebas", () => ({
  // A la primera llamada devuelve el lote de A y a la segunda el de B.
  ejecutarBanco: () => banco.lotes.shift(),
}));

import { ComparadorVersiones } from "../comparador-versiones";

const prueba = (caso: string, acierto: boolean, salida: string): ResultadoPrueba => ({
  caso,
  nombre: `Caso ${caso}`,
  salida,
  latenciaMs: 12,
  motor: "local",
  acierto,
});
const lote = (...pruebas: ResultadoPrueba[]): ResultadoBanco => ({
  resultadoPorCaso: pruebas,
  metricas: { latenciaMs: 1, tokens: 1, aciertos: pruebas.filter((p) => p.acierto).length, notas: "" },
});

async function ejecutarLasDos() {
  render(<ComparadorVersiones genomaId="g1" />);
  fireEvent.click(screen.getByRole("button", { name: "Ejecutar las dos" }));
  // El componente espera 300 ms antes de cada banco para que se vea el progreso.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  banco.lotes.length = 0;
});

describe("ComparadorVersiones · resultados por prueba", () => {
  it("dice «acierto» o «fallo» con texto accesible, no solo con color e icono", async () => {
    banco.lotes.push(
      lote(prueba("uno", true, "salida-A-uno"), prueba("dos", false, "salida-A-dos")),
      lote(prueba("uno", false, "salida-B-uno"), prueba("dos", true, "salida-B-dos")),
    );
    await ejecutarLasDos();

    const celda = (texto: string) => screen.getByText(texto).closest("td") as HTMLElement;

    expect(within(celda("salida-A-uno")).getByText(/acierto/).textContent).toBe("acierto: ");
    expect(within(celda("salida-A-dos")).getByText(/fallo/).textContent).toBe("fallo: ");
    expect(within(celda("salida-B-uno")).getByText(/fallo/)).toBeTruthy();
    expect(within(celda("salida-B-dos")).getByText(/acierto/)).toBeTruthy();

    // El texto del veredicto es solo para lectores de pantalla: no ensancha la tabla.
    expect(within(celda("salida-A-uno")).getByText(/acierto/).className).toContain("sr-only");
  });

  it("esconde los iconos a la tecnología asistiva (el texto ya lo dice)", async () => {
    banco.lotes.push(lote(prueba("uno", true, "salida-A")), lote(prueba("uno", false, "salida-B")));
    await ejecutarLasDos();

    const iconos = screen.getAllByRole("row")[1].querySelectorAll("svg");
    expect(iconos.length).toBe(2);
    iconos.forEach((icono) => expect(icono.getAttribute("aria-hidden")).toBe("true"));
  });
});
