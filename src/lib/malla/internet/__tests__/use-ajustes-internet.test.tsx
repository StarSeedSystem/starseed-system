// INT19: el valor por defecto del gancho pasó a ser `ajustesPorDefecto()` (contrato §8.2:
// «mi-cuenta» con la malla encendida). Antes estas pruebas comparaban con `AJUSTES_APAGADOS`,
// que ya no es lo que el gancho devuelve al montar.
import { act, cleanup, renderHook } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useAjustesInternet } from "../use-ajustes-internet";
import { ajustesPorDefecto } from "../defectos-audiencia";

const CLAVE_AJUSTES = "starseed.malla.internet.v1";

function crearAlmacen(datos: Record<string, string> = {}) {
  const internos = datos;
  return {
    getItem: (clave: string) => internos[clave] ?? null,
    setItem: (clave: string, valor: string) => { internos[clave] = valor; },
  };
}

const ahoraBase = 1700000000000;
const desfaseBase = -new Date().getTimezoneOffset();

describe("useAjustesInternet", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("valores iniciales", () => {
    it("devuelve los valores por defecto al montar cuando no hay datos en localStorage", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );
      expect(result.current.ajustes).toEqual(ajustesPorDefecto());
      expect(result.current.contadores).toBeDefined();
      expect(result.current.restanteHoyMb).toBeNull();
    });

    it("el primer render del servidor y del cliente es el MISMO (los valores por defecto)", () => {
      const { result, unmount } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );
      expect(result.current.ajustes).toEqual(ajustesPorDefecto());
      unmount();
      const { result: result2 } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );
      expect(result2.current.ajustes).toEqual(ajustesPorDefecto());
    });

    it("inicializa contadores con valores vacíos usando contadoresVacios", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );
      expect(result.current.contadores.bytesDia["mi-cuenta"]).toBe(0);
      expect(result.current.contadores.bytesMes["mi-cuenta"]).toBe(0);
    });
  });

  describe("cambiar", () => {
    it("guarda ajustes parciales y re-renderiza", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({ banco: { activo: true, modo: "diario", diarioMb: 500, ventanas: [] } });
      });

      expect(result.current.ajustes.banco.activo).toBe(true);
      expect(result.current.ajustes.banco.diarioMb).toBe(500);
    });

    it("no toca campos que no se especifican (merge parcial)", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      const originalCompartir = result.current.ajustes.compartirConOtros;

      act(() => {
        result.current.cambiar({ banco: { activo: true, modo: "diario", diarioMb: 500, ventanas: [] } });
      });

      expect(result.current.ajustes.compartirConOtros).toBe(originalCompartir);
    });

    it("guarda en localStorage y persiste entre renders", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({ banco: { activo: true, modo: "diario", diarioMb: 500, ventanas: [] } });
      });

      const guardado = JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? "{}");
      expect(guardado.banco.activo).toBe(true);
      expect(guardado.banco.diarioMb).toBe(500);
    });
  });

  describe("evento storage", () => {
    it("actualiza ajustes al recibir evento storage de otra pestaña", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      expect(result.current.ajustes.banco.activo).toBe(false);

      const nuevoAjuste = {
        version: 1,
        compartirConOtros: true,
        banco: { activo: true, modo: "diario", diarioMb: 100, ventanas: [] },
        porAudiencia: {
          "mi-cuenta": { mesh: true, limiteMeshMb: 200 },
          entidad: { mesh: false, limiteMeshMb: null },
          publico: { mesh: false, limiteMeshMb: null },
        },
        declaraLimitada: null,
        compartirMedidas: false,
      };

      act(() => {
        localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevoAjuste));
        window.dispatchEvent(new StorageEvent("storage", { key: CLAVE_AJUSTES }));
      });

      expect(result.current.ajustes.compartirConOtros).toBe(true);
      expect(result.current.ajustes.banco.activo).toBe(true);
      expect(result.current.ajustes.porAudiencia["mi-cuenta"].limiteMeshMb).toBe(200);
    });

    it("ignora evento storage de otra clave", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      const valoresIniciales = result.current.ajustes;

      act(() => {
        localStorage.setItem("otra-clave", JSON.stringify({ activo: true }));
        window.dispatchEvent(new StorageEvent("storage", { key: "otra-clave" }));
      });

      expect(result.current.ajustes).toEqual(valoresIniciales);
    });

    it("ignora evento storage con clave null (localStorage.clear)", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({ banco: { activo: true, modo: "diario", diarioMb: 500, ventanas: [] } });
      });

      const valoresConBanco = result.current.ajustes;

      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: null }));
      });

      expect(result.current.ajustes).toEqual(valoresConBanco);
    });

    it("limpia suscriptores al unmount", () => {
      let llamadas = 0;
      const { result, unmount } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      const listener = vi.fn(() => { llamadas++; });
      window.addEventListener("storage", listener);

      unmount();

      const nuevoAjuste = {
        version: 1,
        compartirConOtros: false,
        banco: { activo: false, modo: "diario", diarioMb: 0, ventanas: [] },
        porAudiencia: {
          "mi-cuenta": { mesh: false, limiteMeshMb: null },
          entidad: { mesh: false, limiteMeshMb: null },
          publico: { mesh: false, limiteMeshMb: null },
        },
        declaraLimitada: null,
        compartirMedidas: false,
      };

      localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevoAjuste));
      window.dispatchEvent(new StorageEvent("storage", { key: CLAVE_AJUSTES }));

      expect(llamadas).toBe(1);
      window.removeEventListener("storage", listener);
    });
  });

  describe("cambiar no enciende compartirConOtros", () => {
    it("cambiar a true en compartirConOtros lo hace", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({ compartirConOtros: true });
      });

      expect(result.current.ajustes.compartirConOtros).toBe(true);
    });

    it("cambiar a false lo apaga", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({ compartirConOtros: true });
        result.current.cambiar({ compartirConOtros: false });
      });

      expect(result.current.ajustes.compartirConOtros).toBe(false);
    });
  });

  describe("restanteHoyMb", () => {
    it("devuelve null cuando el banco está inactivo", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      expect(result.current.restanteHoyMb).toBeNull();
    });

    it("devuelve el restante cuando el banco está activo", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({
          banco: { activo: true, modo: "diario", diarioMb: 100, ventanas: [] },
        });
      });

      expect(result.current.restanteHoyMb).toBe(100);
    });

    it("actualiza restanteHoyMb al cambiar el banco", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({ ahora: () => ahoraBase, desfaseMin: desfaseBase })
      );

      act(() => {
        result.current.cambiar({
          banco: { activo: true, modo: "diario", diarioMb: 100, ventanas: [] },
        });
      });

      expect(result.current.restanteHoyMb).toBe(100);

      act(() => {
        result.current.cambiar({
          banco: { activo: true, modo: "diario", diarioMb: 200, ventanas: [] },
        });
      });

      expect(result.current.restanteHoyMb).toBe(200);
    });
  });

  describe("opciones de hook", () => {
    it("usa almacén inyectado si se proporciona", () => {
      const almacen = crearAlmacen({});
      const { result } = renderHook(() =>
        useAjustesInternet({
          ahora: () => ahoraBase,
          desfaseMin: desfaseBase,
          almacen,
        })
      );

      expect(result.current.ajustes).toEqual(ajustesPorDefecto());
    });

    it("usa ahora y desfaseMin inyectados correctamente", () => {
      const ahoraEspecifico = 1600000000000;
      const { result } = renderHook(() =>
        useAjustesInternet({
          ahora: () => ahoraEspecifico,
          desfaseMin: 120,
        })
      );

      expect(result.current.contadores).toBeDefined();
    });

    it("usa almacen predeterminado si no se proporciona", () => {
      const { result } = renderHook(() =>
        useAjustesInternet({
          ahora: () => ahoraBase,
          desfaseMin: desfaseBase,
        })
      );

      expect(result.current.ajustes).toEqual(ajustesPorDefecto());
    });
  });
});