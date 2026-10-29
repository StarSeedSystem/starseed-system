/** XR1010AP · vínculos de la Protomolécula en el visor: pruebas PURAS (node) con un controlador falso. */
import { describe, expect, it, vi } from "vitest";
import type { Controlador } from "../../../../lib/protomolecula/controlador";
import { CURVA_LINEAL, estadoInicial, procesar, type Vinculo } from "../../../../lib/protomolecula/vinculos-control";
import type { Autor, Cambio, Operacion, Parametro, ParametroRef } from "../../../../lib/protomolecula/tipos";
import { MAPAS_DEFECTO } from "../../../../lib/xr/vinculos-xr";
import { aplicarEnVisor, confirmarEnVisor, controlDeParametro, fraccionDesdeUv, fuentesDeMapaXR, rangoAGesto, requiereTarjeta } from "../vinculos-protomolecula";

const REF: ParametroRef = { atomoId: "a1", parametroId: "volumen" };
const NUMERO: Parametro = { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%" };
const AUTOR: Autor = { tipo: "persona", id: "alex" };
const AGENTE: Autor = { tipo: "agente", id: "astraura" };
const op = (autor: Autor = AUTOR, origen: Operacion["origen"] = "mano"): Operacion =>
  ({ id: `op-${autor.id}`, objetivo: REF, accion: { tipo: "exacta", valor: 50 }, autor, origen, t: 0 });

function controladorFalso(ambito: "personal" | "grupo" = "personal", resultado?: { ok: boolean; motivo?: string; pendiente?: unknown }) {
  const cambio: Cambio = { operacion: op(), antes: 0, despues: 50, acotado: false, reversible: true };
  const mover = vi.fn(() => resultado ?? { ok: true as const, cambio, difundir: true });
  const estado = {
    molecula: { id: "m1", titulo: "Mi molécula", ambito, capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 },
    historial: { hechos: [], rehacer: [] }, pendientes: [],
  };
  const falso = { obtener: () => estado, mover, suscribir: () => () => undefined, dictar: vi.fn(), confirmar: vi.fn(), rechazar: vi.fn(), deshacer: vi.fn(), rehacer: vi.fn(), anadirAtomo: vi.fn() };
  return { controlador: falso as unknown as Controlador, mover };
}

describe("rangoAGesto", () => {
  it("un deslizador al 50 % aplica un valor exacto del rango", () => {
    expect(rangoAGesto(NUMERO, 0.5)).toBe(50);
    expect(rangoAGesto({ ...NUMERO, min: 10, max: 20, paso: undefined }, 0.5)).toBe(15);
  });
  it("respeta el paso y los extremos del parámetro", () => {
    expect(rangoAGesto({ ...NUMERO, paso: 25 }, 0.5)).toBe(50);
    expect(rangoAGesto({ ...NUMERO, paso: 25 }, 0)).toBe(0);
    expect(rangoAGesto({ ...NUMERO, paso: 25 }, 1)).toBe(100);
  });
  it("un interruptor cambia al pasar de la mitad", () => {
    const p: Parametro = { id: "eco", nombre: "Eco", tipo: "booleano" };
    expect(rangoAGesto(p, 0.49)).toBe(false);
    expect(rangoAGesto(p, 0.5)).toBe(true);
  });
  it("un dial de opciones devuelve la opción que toca", () => {
    const p: Parametro = { id: "filtro", nombre: "Filtro", tipo: "opcion", opciones: ["paso bajo", "paso alto"] };
    expect(rangoAGesto(p, 0.1)).toBe("paso bajo");
    expect(rangoAGesto(p, 0.9)).toBe("paso alto");
  });
});

describe("fuentesDeMapaXR", () => {
  it("solo devuelve gatillos de mando y respeta izquierda/derecha", () => {
    const fuentes = fuentesDeMapaXR(MAPAS_DEFECTO.mandos);
    expect(fuentes.length).toBeGreaterThan(0);
    expect(fuentes.every((f) => f.tipo === "gamepad")).toBe(true);
    expect(fuentes.some((f) => f.tipo === "gamepad" && f.indice === 0 && f.control === "boton")).toBe(true);
    expect(fuentes.some((f) => f.tipo === "gamepad" && f.indice === 1 && f.control === "boton")).toBe(true);
  });
  it("descarta gestos, teclas y frases, y no repite la misma fuente", () => {
    const fuentes = fuentesDeMapaXR({
      seleccionar: [
        { tipo: "boton", indice: 0, mano: "derecha" }, { tipo: "boton", indice: 0, mano: "derecha" },
        { tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }, { tipo: "tecla", codigo: "Enter" }, { tipo: "frase", texto: "salir" },
      ],
    });
    expect(fuentes).toEqual([{ tipo: "gamepad", control: "boton", numero: 0, indice: 1 }]);
  });
  it("un botón de mando mapeado mueve el parámetro con la curva del núcleo", () => {
    const fuente = fuentesDeMapaXR({ seleccionar: [{ tipo: "boton", indice: 4, mano: "izquierda" }] })[0];
    const vinculo: Vinculo = { id: "v", fuente, objetivo: REF, modo: "absoluto", curva: { ...CURVA_LINEAL }, activo: true, creadoPor: "alex" };
    const r = procesar(vinculo, NUMERO, estadoInicial(), 1, { autor: AUTOR, ahora: 0, id: "op" });
    expect(r.operacion?.accion).toEqual({ tipo: "exacta", valor: 100 });
  });
});

describe("aplicarEnVisor", () => {
  it("delega en el controlador real cuando opera una persona", () => {
    const { controlador, mover } = controladorFalso();
    const r = aplicarEnVisor(controlador, REF, op());
    expect(r.estado).toBe("aplicado");
    expect(mover).toHaveBeenCalledWith(expect.objectContaining({ objetivo: REF }));
  });
  it("una operación de agente en un espacio de grupo queda pendiente", () => {
    const { controlador, mover } = controladorFalso("grupo");
    const r = aplicarEnVisor(controlador, REF, op(AGENTE, "agente"));
    expect(r.estado).toBe("pendiente");
    expect(requiereTarjeta(op(AGENTE, "agente"), "grupo")).toBe(true);
    expect(mover).not.toHaveBeenCalled();
  });
  it("confirmar en la tarjeta sí delega en el controlador", () => {
    const { controlador, mover } = controladorFalso("grupo");
    expect(confirmarEnVisor(controlador, op(AGENTE, "agente")).estado).toBe("aplicado");
    expect(mover).toHaveBeenCalledTimes(1);
  });
  it("un parámetro desconocido no rompe: lo explica y no aplica", () => {
    const { controlador } = controladorFalso("personal", { ok: false, motivo: "Parámetro desconocido: fantasma" });
    const r = aplicarEnVisor(controlador, { atomoId: "a1", parametroId: "fantasma" }, op());
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toContain("Parámetro desconocido");
  });
});

describe("utilitarios del panel 3D", () => {
  it("elige un control por tipo de parámetro", () => {
    expect(controlDeParametro(NUMERO)).toBe("deslizador");
    expect(controlDeParametro({ id: "b", nombre: "B", tipo: "booleano" })).toBe("interruptor");
    expect(controlDeParametro({ id: "o", nombre: "O", tipo: "opcion" })).toBe("dial");
    expect(controlDeParametro({ id: "d", nombre: "D", tipo: "disparo" })).toBe("disparo");
  });
  it("la posición del rayo se acota y sin UV queda en el centro", () => {
    expect(fraccionDesdeUv({ x: -1 })).toBe(0);
    expect(fraccionDesdeUv({ x: 2 })).toBe(1);
    expect(fraccionDesdeUv(undefined)).toBe(0.5);
  });
});
