import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEstadoConexion } from "../use-estado-conexion";
import type { ConexionNavegador } from "../lector-conexion";

type Oyente = () => void;

function conexionFalsa(senal: Partial<ConexionNavegador>): { conexion: ConexionNavegador; oyentes: Oyente[] } {
  const oyentes: Oyente[] = [];
  const conexion: ConexionNavegador = {
    ...senal,
    addEventListener: (_tipo: string, cb: Oyente) => { oyentes.push(cb); },
    removeEventListener: (_tipo: string, cb: Oyente) => {
      const i = oyentes.indexOf(cb);
      if (i >= 0) oyentes.splice(i, 1);
    },
  };
  return { conexion, oyentes };
}

afterEach(() => {
  cleanup();
});

describe("useEstadoConexion (cableado de leerConexion + clasificarConexion)", () => {
  it("con connection del navegador: celular se clasifica limitada y dice su fuente", () => {
    const { result } = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: { type: "cellular", effectiveType: "3g" } } } }),
    );
    expect(result.current.estado).toBe("limitada");
    expect(result.current.fuente).toBe("navegador");
    expect(result.current.textoEstado).toBe("Limitada");
    expect(result.current.textoFuente).toBe("Información del navegador");
  });

  it("sin connection (Safari, Firefox): desconocida, «Sin datos» y sin fuente", () => {
    const { result } = renderHook(() => useEstadoConexion({ entorno: { navigator: {} } }));
    expect(result.current.estado).toBe("desconocida");
    expect(result.current.textoEstado).toBe("Sin datos");
    expect(result.current.textoFuente).toBe("");
  });

  it("sin navigator tampoco lanza y queda desconocida", () => {
    const { result } = renderHook(() => useEstadoConexion({ entorno: {} }));
    expect(result.current.estado).toBe("desconocida");
  });

  it("la marca nativa manda sobre el navegador y dice su fuente", () => {
    const { result } = renderHook(() =>
      useEstadoConexion({
        entorno: {
          navigator: { connection: { type: "wifi" } },
          // falta en el puente nativo: ver §8.2 del contrato (aquí se inyecta para la prueba)
          nativa: { medida: () => true },
        },
      }),
    );
    expect(result.current.estado).toBe("limitada");
    expect(result.current.fuente).toBe("nativa");
    expect(result.current.textoFuente).toBe("Marca de red del dispositivo");
  });

  it("la declaración de la persona manda sobre toda señal (§8.2)", () => {
    const { result } = renderHook(() =>
      useEstadoConexion({
        declarada: false,
        entorno: { navigator: { connection: { type: "cellular" } } },
      }),
    );
    expect(result.current.estado).toBe("no-limitada");
    expect(result.current.fuente).toBe("declarada");
    expect(result.current.textoFuente).toBe("Declarada por la persona");
  });

  it("se vuelve a leer cuando connection dispara change", () => {
    const { conexion, oyentes } = conexionFalsa({ type: "wifi" });
    const { result } = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: conexion } } }),
    );
    expect(result.current.estado).toBe("no-limitada");
    expect(oyentes).toHaveLength(1);
    act(() => {
      conexion.type = "cellular";
      oyentes.forEach((cb) => cb());
    });
    expect(result.current.estado).toBe("limitada");
  });

  it("la baja (unmount) quita el oyente de connection", () => {
    const { conexion, oyentes } = conexionFalsa({ type: "wifi" });
    const { unmount } = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: conexion } } }),
    );
    expect(oyentes).toHaveLength(1);
    unmount();
    expect(oyentes).toHaveLength(0);
  });

  it("connection sin addEventListener (forma incompleta) no rompe: queda la clasificación", () => {
    const { result } = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: { type: "cellular" } } } }),
    );
    expect(result.current.estado).toBe("limitada");
  });

  it("la clave identifica la conexión: cambia si cambia la señal", () => {
    const a = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: { type: "wifi" } } } }),
    );
    const b = renderHook(() =>
      useEstadoConexion({ entorno: { navigator: { connection: { type: "cellular" } } } }),
    );
    expect(a.result.current.clave).not.toBe(b.result.current.clave);
    expect(b.result.current.clave).toContain("cellular");
  });

  it("la clave por defecto (sin señal) es estable y no vacía", () => {
    const { result } = renderHook(() => useEstadoConexion({ entorno: {} }));
    expect(result.current.clave).toBe("-|-|-|-|-");
  });
});
