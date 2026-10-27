import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuTexto, registrarEntradaMenuTexto, entradasRegistradas, type ContextoMenuTexto } from "../menu-texto";

function limpiarRegistros() {
  entradasRegistradas.length = 0;
}

function mockSeleccion(texto: string) {
  const sel = window.getSelection();
  if (sel) {
    vi.spyOn(sel, "toString").mockReturnValue(texto);
  }
}

beforeEach(() => {
  limpiarRegistros();
  document.body.innerHTML = "";
  vi.useFakeTimers();
  vi.spyOn(document, "elementFromPoint").mockReturnValue(document.createElement("div"));
});

// rest of file unchanged