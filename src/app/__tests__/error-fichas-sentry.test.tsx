import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { EventoError } from "@/lib/mando/errores-neurona";

import AppError from "../error";

describe("app/error · evento estilo Sentry de la página caída", () => {
  let salida: string[] = [];

  /** Error con pila determinista: los marcos no dependen de dónde se construye. */
  function errorCon(mensaje: string): Error {
    const error = new Error(mensaje);
    error.stack = `Error: ${mensaje}\n    at vista (/Users/alex/repo/src/app/vista.tsx:12:7)`;
    return error;
  }

  beforeEach(() => {
    salida = [];
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

  /** Toma el JSON del evento que la frontera deja en la consola. */
  function eventoI() {
    const linea = salida[0] ?? "";
    const json = linea.slice(linea.indexOf("{"));
    return JSON.parse(json) as EventoError;
  }

  it("cada error de página produce un evento limpio, con ámbito pagina y huella", () => {
    const error = new Error("falló la vista (id 7) escribiendo a ana@starseed.io desde 10.1.2.3");
    render(<AppError error={error} reset={() => undefined} />);

    const evento = eventoI();
    expect(evento.tags.ambito).toBe("pagina");
    expect(evento.platform).toBe("javascript");
    expect(evento.event_id).toBeTruthy();
    expect(evento.fingerprint.length).toBe(3);
    expect(evento.fingerprint[2]).toBe("pagina");
    const mensaje = evento.exception.values[0].value;
    expect(mensaje).toContain("[correo]");
    expect(mensaje).toContain("[ip]");
    expect(mensaje).not.toContain("ana@starseed.io");
  });

  it("dos caídas con mensajes de id distinto dejan la misma huella en la consola", () => {
    render(<AppError error={errorCon("caída A (id 3)")} reset={() => undefined} />);
    const primera = eventoI().fingerprint;
    cleanup();
    salida = [];
    render(<AppError error={errorCon("caída B (id 9)")} reset={() => undefined} />);
    expect(eventoI().fingerprint).toEqual(primera);
  });

  it("un error de trozo de versión nueva no rompe el montaje (recarga por versión sigue pegado)", () => {
    expect(() => {
      render(<AppError error={new Error("ChunkLoadError: trozo ausente")} reset={() => undefined} />);
    }).not.toThrow();
    expect(window.sessionStorage.getItem("starseed.recarga-version.v1")).toBeTruthy();
  });
});
