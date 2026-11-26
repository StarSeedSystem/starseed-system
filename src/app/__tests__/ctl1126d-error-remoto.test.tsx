import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AppError from "../(app)/error";
import { AppearanceProvider } from "@/context/appearance-context";

describe("CTL1126D · aviso de fallo remoto en error boundary", () => {
  let salida: string[] = [];

  beforeEach(() => {
    salida = [];
    vi.spyOn(console, "log").mockImplementation((...partes: unknown[]) => {
      salida.push(partes.map((p) => (typeof p === "string" ? p : "")).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...partes: unknown[]) => {
      salida.push(partes.map((p) => (typeof p === "string" ? p : "")).join(" "));
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  function renderWithAppearance(ui: React.ReactElement) {
    return render(<AppearanceProvider>{ui}</AppearanceProvider>);
  }

  it("muestra el código corto del fallo (CTL1126D)", () => {
    const error = new Error("Fallo en Señales") as Error & { digest?: string };
    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/senales" />);

    expect(screen.getByText("CTL1126D")).toBeDefined();
  });

  it("muestra botón para copiar detalle del error", () => {
    const error = new Error("Error de prueba") as Error & { digest?: string };
    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/test" />);

    expect(screen.getByText("Copiar detalle")).toBeTruthy();
  });

  it("registro el error en consola con formato correcto", () => {
    const error = new Error("Fallo crítico") as Error & { digest?: string };
    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/senales" />);

    expect(salida.some((l) => l.includes("CTL1126D"))).toBe(true);
  });

  it("el código de fallo se muestra en la interfaz", () => {
    const error = new Error("Fallo al cargar Señales") as Error & { digest?: string };
    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/senales" />);

    const texto = document.body.textContent;
    expect(texto).toContain("CTL1126D");
  });

  it("el mensaje del error se registra correctamente", () => {
    const error = new Error("Fallo al cargar Señales") as Error & { digest?: string };
    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/senales" />);

    const registroEncontrado = salida.find((l) => l.includes("fallo en el aparato:"));
    expect(registroEncontrado).toBeDefined();
  });

  it("no muestra la pila completa del error en producción", () => {
    const error = new Error("Error con pila larga") as Error & { digest?: string };
    error.stack = "Error: Error con pila larga\n    at f1 (file1.ts:1:1)\n    at f2 (file2.ts:2:2)\n    at f3 (file3.ts:3:3)";
    vi.stubEnv("NODE_ENV", "production");

    renderWithAppearance(<AppError error={error} reset={() => undefined} rutaActual="/test" />);

    const texto = document.body.textContent;
    expect(texto).not.toContain("at f1");
    expect(texto).not.toContain("file1.ts");

    vi.unstubAllEnvs();
  });
});