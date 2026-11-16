import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisenoAstraura } from "../use-diseno-astraura";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useDisenoAstraura", () => {
  it("el primer render sin ajustes es auto", () => {
    const { result } = renderHook(() => useDisenoAstraura({}));
    expect(result.current[0]).toBe("auto");
  });

  it("lee del widget si existe settings.astrauraDiseno", () => {
    const widget = { settings: { astrauraDiseno: "voz" } };
    const { result } = renderHook(() => useDisenoAstraura(widget));
    expect(result.current[0]).toBe("voz");
  });

  it("valor inválido en el widget → auto", () => {
    const widget = { settings: { astrauraDiseno: "invalido" } };
    const { result } = renderHook(() => useDisenoAstraura(widget));
    expect(result.current[0]).toBe("auto");
  });

  it("elegir llama a onUpdateSettings con la clave", () => {
    let parche: Record<string, unknown> | undefined;
    const onUpdateSettings = (p: Record<string, unknown>) => {
      parche = p;
    };
    const { result } = renderHook(() => useDisenoAstraura({}, onUpdateSettings));
    act(() => {
      result.current[1]("acciones");
    });
    expect(parche).toEqual({ astrauraDiseno: "acciones" });
  });

  it("sin widget u onUpdateSettings, usa almacenamiento local", () => {
    const storageKey = "starseed.widget.astraura.diseno.v1";
    localStorage.setItem(storageKey, "minimo");
    const { result } = renderHook(() => useDisenoAstraura());
    expect(result.current[0]).toBe("minimo");
  });
});