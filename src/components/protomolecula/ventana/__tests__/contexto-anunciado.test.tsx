import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENTO_CONTEXTO_PROTO } from "@/lib/protomolecula/peticion/contrato";

vi.mock("@/lib/protomolecula/peticion", () => ({
  leerContexto: (ruta?: string) => ({ ruta: ruta ?? "/", ambito: "personal" }),
  planificarPeticion: vi.fn(),
  ejecutarPlan: vi.fn(),
}));

import { iniciarEscuchaContexto, olvidarAnuncio, ultimoAnuncio } from "../contexto-anunciado";
import { useContextoVentana } from "../use-contexto-ventana";

const anunciar = (d: unknown) => act(() => { window.dispatchEvent(new CustomEvent(EVENTO_CONTEXTO_PROTO, { detail: d })); });

afterEach(() => { cleanup(); olvidarAnuncio(); });

describe("contexto anunciado", () => {
  it("lo que se anunció ANTES de abrir la ventana no se pierde (la orbe escucha mientras vive)", () => {
    const dejar = iniciarEscuchaContexto();
    anunciar({ ruta: "/grupo/semilla", entidad: { tipo: "grupo", id: "g1", nombre: "Semilla" }, ambito: "grupo" });
    const { result } = renderHook(() => useContextoVentana("/grupo/semilla"));
    expect(result.current).toMatchObject({ ruta: "/grupo/semilla", ambito: "grupo", entidad: { id: "g1" } });
    dejar();
  });

  it("al cambiar de pantalla el anuncio viejo se descarta", () => {
    const dejar = iniciarEscuchaContexto();
    anunciar({ ruta: "/grupo/semilla", entidad: { tipo: "grupo", id: "g1" }, ambito: "grupo" });
    const { result } = renderHook(() => useContextoVentana("/otra"));
    expect(result.current).toEqual({ ruta: "/otra", ambito: "personal" });
    dejar();
  });

  it("las escuchas llevan cuenta: una sola, y se quita al dejar la última", () => {
    const a = iniciarEscuchaContexto();
    const b = iniciarEscuchaContexto();
    a();
    anunciar({ ruta: "/x", ambito: "publica" });
    expect(ultimoAnuncio()?.ambito).toBe("publica");
    b();
    olvidarAnuncio();
    anunciar({ ruta: "/x", ambito: "perfil" });
    expect(ultimoAnuncio()).toBeNull();
  });

  it("la ventana abierta sigue los anuncios y la selección se suma a la entidad de la misma pantalla", () => {
    const { result } = renderHook(() => useContextoVentana("/p"));
    anunciar({ ruta: "/p", entidad: { tipo: "publicacion", id: "p1" } });
    anunciar({ ruta: "/p", seleccion: { tipo: "texto", id: "t1", resumen: "Hola" } });
    expect(result.current).toMatchObject({ entidad: { id: "p1" }, seleccion: { id: "t1", resumen: "Hola" } });
    anunciar({ ruta: "/p", seleccion: null });
    expect(result.current.seleccion).toBeUndefined();
  });
});
