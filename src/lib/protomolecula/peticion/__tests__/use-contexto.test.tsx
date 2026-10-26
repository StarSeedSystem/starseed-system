// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ruta = vi.hoisted(() => ({ actual: "/grupo/semilla" }));
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }));

import { anunciarContexto, reiniciarContexto } from "../contexto";
import { useContextoProto } from "../use-contexto";

beforeEach(() => { reiniciarContexto(); ruta.actual = "/grupo/semilla"; window.history.pushState({}, "", "/grupo/semilla"); });
afterEach(() => reiniciarContexto());

describe("useContextoProto", () => {
  it("da el contexto de la ruta actual sin necesidad de anuncios", () => {
    const { result } = renderHook(() => useContextoProto());
    expect(result.current).toMatchObject({ ruta: "/grupo/semilla", ambito: "grupo", entidad: { tipo: "grupo", id: "semilla" } });
  });

  it("cambia al navegar", () => {
    const { result, rerender } = renderHook(() => useContextoProto());
    ruta.actual = "/post/p1";
    window.history.pushState({}, "", "/post/p1");
    rerender();
    expect(result.current).toMatchObject({ ruta: "/post/p1", entidad: { tipo: "publicacion", id: "p1" } });
  });

  it("se actualiza solo cuando la pantalla anuncia su contexto, y vuelve a la ruta al retirarlo", () => {
    const { result } = renderHook(() => useContextoProto());
    expect(result.current.entidad?.nombre).toBeUndefined();
    let retirar = () => undefined as void;
    act(() => { retirar = anunciarContexto({ entidad: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, ambito: "grupo" }); });
    expect(result.current.entidad?.nombre).toBe("Semilla");
    act(() => retirar());
    expect(result.current.entidad?.nombre).toBeUndefined();
  });

  it("la consulta de la ruta (?canvas=…) cuenta, aunque usePathname no la dé", () => {
    ruta.actual = "/pizarra";
    window.history.pushState({}, "", "/pizarra?canvas=abc");
    const { result } = renderHook(() => useContextoProto());
    expect(result.current.entidad).toEqual({ tipo: "pizarra", id: "abc" });
  });

  it("sin ruta (null) cae a «/» y no lanza", () => {
    ruta.actual = null as never;
    window.history.pushState({}, "", "/");
    const { result } = renderHook(() => useContextoProto());
    expect(result.current.ambito).toBe("personal");
  });
});
