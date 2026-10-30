import { describe, expect, it, vi } from "vitest";
import type { Controlador, EstadoControl, ResultadoMover } from "@/lib/protomolecula/controlador";
import { CURVA_LINEAL, estadoInicial, procesar, type Vinculo } from "@/lib/protomolecula/vinculos-control";
import type { Accion, Ambito, Autor, Operacion, Parametro, ParametroRef } from "@/lib/protomolecula/tipos";
import { MAPAS_DEFECTO, type MapaEntrada } from "@/lib/xr/vinculos-xr";
import { aplicarEnVisor, fuentesDeMapaXR, operacionEnVisor, rangoAGesto } from "../vinculos-protomolecula";

const REF: ParametroRef = { atomoId: "atomo-1", parametroId: "volumen" };
const REF_OTRO: ParametroRef = { atomoId: "atomo-2", parametroId: "brillo" };
const PERSONA: Autor = { tipo: "persona", id: "alex" };
const AGENTE: Autor = { tipo: "agente", id: "astraura" };
const VOLUMEN: Parametro = { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 100, unidad: "%" };
const op = (accion: Accion, autor: Autor = PERSONA, origen: Operacion["origen"] = "mano"): Operacion =>
  operacionEnVisor(REF, accion, { autor, ahora: 100, id: () => "op-1", origen });

function controladorFalso(o: { ambito?: Ambito; mover?: Controlador["mover"] } = {}): Controlador {
  const estado: EstadoControl = {
    molecula: { id: "m", titulo: "Prueba", ambito: o.ambito ?? "personal", capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 },
    historial: { hechos: [], rehacer: [] },
    pendientes: [],
  };
  return {
    obtener: () => estado,
    suscribir: () => () => {},
    mover: o.mover ?? (() => ({ ok: false, motivo: "no aplicado" })),
    dictar: () => ({ resultados: [], aplicados: 0, pendientes: [] }),
    confirmar: () => ({ ok: false, motivo: "sin pendientes" }),
    rechazar: () => ({ ok: false, motivo: "sin pendientes" }),
    deshacer: () => ({ ok: false, motivo: "nada" }),
    rehacer: () => ({ ok: false, motivo: "nada" }),
    anadirAtomo: () => ({ ok: false, motivo: "no" }),
  };
}

const okMover = () =>
  vi.fn((operacion: Operacion): ResultadoMover => ({
    ok: true,
    cambio: { operacion, antes: 0, despues: 50, acotado: false, reversible: true },
    difundir: true,
  }));

describe("fuentesDeMapaXR", () => {
  it("solo devuelve gatillos de mando y respeta izquierda/derecha", () => {
    const fuentes = fuentesDeMapaXR(MAPAS_DEFECTO.mandos);
    expect(fuentes.length).toBeGreaterThan(0);
    for (const f of fuentes) {
      expect(f.tipo).toBe("gamepad");
      if (f.tipo === "gamepad") expect([0, 1]).toContain(f.indice);
    }
    expect(new Set(fuentes.map((f) => (f.tipo === "gamepad" ? f.indice : -1)))).toEqual(new Set([0, 1]));
    expect(fuentesDeMapaXR(MAPAS_DEFECTO.manos)).toEqual([]);
    expect(fuentesDeMapaXR(MAPAS_DEFECTO.voz)).toEqual([]);
  });
  it("no repite una fuente mapeada a dos acciones", () => {
    const mapa: MapaEntrada = {
      seleccionar: [{ tipo: "boton", indice: 4, mano: "izquierda" }],
      "menu-mano": [{ tipo: "boton", indice: 4, mano: "izquierda" }],
    };
    expect(fuentesDeMapaXR(mapa)).toHaveLength(1);
  });
  it("ni gestos, ni teclas, ni frases: solo el mando da fuentes", () => {
    const mapa: MapaEntrada = {
      seleccionar: [{ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }],
      salir: [{ tipo: "tecla", codigo: "Escape" }, { tipo: "frase", texto: "salir" }],
    };
    expect(fuentesDeMapaXR(mapa)).toEqual([]);
  });
  it("respeta izquierda (0) y derecha (1) y no repite la misma fuente", () => {
    const mapa: MapaEntrada = {
      seleccionar: [{ tipo: "boton", indice: 0, mano: "derecha" }, { tipo: "boton", indice: 0, mano: "izquierda" }],
      agarrar: [{ tipo: "boton", indice: 0, mano: "derecha" }],
      teletransporte: [{ tipo: "eje", indice: 3, direccion: "-", mano: "derecha" }],
    };
    const f = fuentesDeMapaXR(mapa);
    expect(f).toContainEqual({ tipo: "gamepad", control: "boton", numero: 0, indice: 1 });
    expect(f).toContainEqual({ tipo: "gamepad", control: "boton", numero: 0, indice: 0 });
    expect(f).toContainEqual({ tipo: "gamepad", control: "eje", numero: 3, indice: 1 });
    expect(f.filter((x) => x.tipo === "gamepad" && x.control === "boton" && x.numero === 0 && x.indice === 1)).toHaveLength(1);
  });
});

describe("rangoAGesto", () => {
  it("un deslizador al 50 % aplica un valor exacto", () => {
    expect(rangoAGesto(VOLUMEN, 0.5)).toBe(50);
  });
  it("respeta el paso y la curva invertida", () => {
    expect(rangoAGesto({ ...VOLUMEN, paso: 10 }, 0.53)).toBe(50);
    expect(rangoAGesto(VOLUMEN, 0.2, { ...CURVA_LINEAL, invertir: true })).toBe(80);
  });
  it("interruptores y opciones se resuelven con la misma curva", () => {
    expect(rangoAGesto({ id: "eco", nombre: "Eco", tipo: "booleano" }, 0.7)).toBe(true);
    expect(rangoAGesto({ id: "eco", nombre: "Eco", tipo: "booleano" }, 0.2)).toBe(false);
    const filtro: Parametro = { id: "filtro", nombre: "Filtro", tipo: "opcion", opciones: ["bajo", "medio", "alto"] };
    expect(rangoAGesto(filtro, 0.9)).toBe("alto");
  });
  it("un parámetro desconocido no rompe", () => {
    expect(rangoAGesto({ id: "x", nombre: "X", tipo: "numero" }, 0.5)).toBe(0.5);
  });
  it("acota gestos fuera de 0..1 y respeta el tipo entero", () => {
    expect(rangoAGesto({ ...VOLUMEN, paso: 25 }, 0.5)).toBe(50);
    expect(rangoAGesto({ ...VOLUMEN, tipo: "entero" }, 0.333)).toBe(33);
    expect(rangoAGesto(VOLUMEN, -3)).toBe(0);
    expect(rangoAGesto(VOLUMEN, 9)).toBe(100);
  });
  it("la curva log responde antes que la lineal", () => {
    expect(rangoAGesto(VOLUMEN, 0.5, { ...CURVA_LINEAL, forma: "log" })).toBeGreaterThan(50);
  });
});

describe("mando → parámetro", () => {
  it("un botón de mando mapeado lo mueve con la curva", () => {
    const fuente = fuentesDeMapaXR(MAPAS_DEFECTO.mandos).find((f) => f.tipo === "gamepad" && f.control === "boton");
    expect(fuente).toBeDefined();
    const vinculo: Vinculo = { id: "v", fuente: fuente!, objetivo: REF, modo: "absoluto", curva: CURVA_LINEAL, activo: true, creadoPor: "test" };
    const r = procesar(vinculo, VOLUMEN, estadoInicial(), 1, { autor: PERSONA, ahora: 100, id: "op-1" });
    expect(r.operacion?.accion).toEqual({ tipo: "exacta", valor: 100 });
  });
});

describe("aplicarEnVisor", () => {
  it("delega en el controlador y apunta al parámetro con foco", () => {
    const mover = okMover();
    const r = aplicarEnVisor(controladorFalso({ mover }), REF_OTRO, op({ tipo: "exacta", valor: 50 }));
    expect(r.ok).toBe(true);
    expect(mover.mock.calls[0][0].objetivo).toEqual(REF_OTRO);
  });
  it("una operación de agente en grupo queda pendiente y no se aplica", () => {
    const mover = vi.fn((operacion: Operacion): ResultadoMover => ({
      ok: true,
      cambio: { operacion, antes: 0, despues: 50, acotado: false, reversible: true },
      difundir: true,
    }));
    const r = aplicarEnVisor(controladorFalso({ ambito: "grupo", mover }), REF, op({ tipo: "exacta", valor: 50 }, AGENTE, "agente"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.pendiente?.motivo).toMatch(/pendiente de tu confirmación/);
    expect(mover).not.toHaveBeenCalled();
  });
  it("una persona en grupo sí aplica y un parámetro desconocido devuelve el motivo", () => {
    expect(aplicarEnVisor(controladorFalso({ ambito: "grupo", mover: okMover() }), REF, op({ tipo: "exacta", valor: 50 })).ok).toBe(true);
    const rechazo = controladorFalso({ mover: () => ({ ok: false, motivo: "Parámetro desconocido: fantasma" }) });
    expect(aplicarEnVisor(rechazo, { atomoId: "x", parametroId: "fantasma" }, op({ tipo: "exacta", valor: 1 }))).toEqual({ ok: false, motivo: "Parámetro desconocido: fantasma" });
  });
  it("la misma operación de agente en un espacio personal sí se aplica", () => {
    const mover = okMover();
    const r = aplicarEnVisor(controladorFalso({ mover }), REF, op({ tipo: "exacta", valor: 50 }, AGENTE, "agente"), "personal");
    expect(r.ok).toBe(true);
    expect(mover).toHaveBeenCalledTimes(1);
  });
});
