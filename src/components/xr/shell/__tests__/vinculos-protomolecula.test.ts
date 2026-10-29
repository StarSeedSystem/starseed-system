import { describe, expect, it } from "vitest";
import type { Controlador, ResultadoMover } from "@/lib/protomolecula/controlador";
import type { Cambio, Operacion, Parametro, ParametroRef } from "@/lib/protomolecula/tipos";
import { CURVA_LINEAL, estadoInicial, procesar, type Curva, type Vinculo } from "@/lib/protomolecula/vinculos-control";
import { MAPAS_DEFECTO } from "@/lib/xr/vinculos-xr";
import { aplicarEnVisor, fuentesDeMapaXR, operacionDeGesto, rangoAGesto } from "../vinculos-protomolecula";
const ref: ParametroRef = { atomoId: "a1", parametroId: "vol" };
const vol: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: 0, max: 100 };
const cambio = (op: Operacion): Cambio => ({ operacion: op, antes: 0, despues: 50, acotado: false, reversible: true });
function falso(resultado?: ResultadoMover) {
  const llamadas: Operacion[] = [];
  const controlador = {
    mover: (op: Operacion): ResultadoMover => {
      llamadas.push(op);
      return resultado ?? { ok: true, cambio: cambio(op), difundir: true };
    },
  } as unknown as Controlador;
  return { controlador, llamadas };
}
const agente = (): Operacion => ({ ...operacionDeGesto(ref, vol, 0.5, { ahora: 7, nuevoId: () => "op-1" }), origen: "agente" });
describe("fuentesDeMapaXR", () => {
  it("solo devuelve gatillos de mando: ni gestos, ni teclas, ni frases", () => {
    const mapa = {
      seleccionar: [{ tipo: "gesto" as const, gesto: "pellizco" as const, mano: "cualquiera" as const }],
      salir: [{ tipo: "tecla" as const, codigo: "Escape" }, { tipo: "frase" as const, texto: "salir" }],
    };
    expect(fuentesDeMapaXR(mapa)).toEqual([]);
  });
  it("respeta izquierda (0) y derecha (1) y no repite la misma fuente", () => {
    const f = fuentesDeMapaXR({
      seleccionar: [{ tipo: "boton", indice: 0, mano: "derecha" }, { tipo: "boton", indice: 0, mano: "izquierda" }],
      agarrar: [{ tipo: "boton", indice: 0, mano: "derecha" }],
      teletransporte: [{ tipo: "eje", indice: 3, direccion: "-", mano: "derecha" }],
    });
    expect(f).toContainEqual({ tipo: "gamepad", control: "boton", numero: 0, indice: 1 });
    expect(f).toContainEqual({ tipo: "gamepad", control: "boton", numero: 0, indice: 0 });
    expect(f).toContainEqual({ tipo: "gamepad", control: "eje", numero: 3, indice: 1 });
    expect(f.filter((x) => x.control === "boton" && x.numero === 0 && x.indice === 1)).toHaveLength(1);
  });
  it("los mapas de mandos y gamepad dan fuentes; los de manos no", () => {
    const mandos = fuentesDeMapaXR(MAPAS_DEFECTO.mandos);
    expect(mandos.every((f) => f.tipo === "gamepad")).toBe(true);
    expect(mandos.length).toBeGreaterThan(0);
    expect(fuentesDeMapaXR(MAPAS_DEFECTO.manos)).toEqual([]);
  });
});
describe("rangoAGesto", () => {
  it("un deslizador al 50 % da un valor exacto y se aplica", () => {
    expect(rangoAGesto(vol, 0.5)).toBe(50);
    const { controlador, llamadas } = falso();
    const op = operacionDeGesto(ref, vol, 0.5, { ahora: 7, nuevoId: () => "op-1" });
    expect(aplicarEnVisor(controlador, ref, op).ok).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].accion).toEqual({ tipo: "exacta", valor: 50 });
  });
  it("respeta paso y entero, y acota fuera de 0..1", () => {
    expect(rangoAGesto({ ...vol, paso: 25 }, 0.5)).toBe(50);
    expect(rangoAGesto({ ...vol, tipo: "entero" }, 0.333)).toBe(33);
    expect(rangoAGesto(vol, -3)).toBe(0);
    expect(rangoAGesto(vol, 9)).toBe(100);
  });
  it("interruptor y dial de opciones se mueven con el gesto", () => {
    expect(rangoAGesto({ id: "b", nombre: "Eco", tipo: "booleano" }, 0.6)).toBe(true);
    expect(rangoAGesto({ id: "o", nombre: "Filtro", tipo: "opcion", opciones: ["bajo", "medio", "alto"] }, 0.8)).toBe("alto");
  });
  it("usa la curva real de vinculos-control: log responde antes que lineal", () => {
    const log: Curva = { ...CURVA_LINEAL, forma: "log" };
    expect(rangoAGesto(vol, 0.5)).toBe(50);
    expect(rangoAGesto(vol, 0.5, log)).toBeGreaterThan(50);
  });
});
describe("aplicarEnVisor", () => {
  it("un botón de mando mapeado a un parámetro lo mueve con la curva", () => {
    const [fuente] = fuentesDeMapaXR({ seleccionar: [{ tipo: "boton", indice: 0, mano: "derecha" }] });
    const vinculo: Vinculo = { id: "v", fuente, objetivo: ref, modo: "absoluto", curva: { ...CURVA_LINEAL, forma: "log" }, activo: true, creadoPor: "ana" };
    const r = procesar(vinculo, vol, estadoInicial(), 0.5, { autor: { tipo: "persona", id: "ana" }, ahora: 1, id: "op" });
    const op = r.operacion;
    expect(op?.accion).toMatchObject({ tipo: "exacta" });
    if (!op || op.accion.tipo !== "exacta") throw new Error("se esperaba una operación exacta");
    expect(Number(op.accion.valor)).toBeGreaterThan(50);
    const { controlador, llamadas } = falso();
    aplicarEnVisor(controlador, ref, op);
    expect(llamadas[0].accion).toEqual(op.accion);
  });
  it("una operación de un agente en un espacio de grupo queda pendiente y no se aplica", () => {
    const { controlador, llamadas } = falso();
    const op = agente();
    const r = aplicarEnVisor(controlador, ref, op, { ambito: "grupo", rol: "editor" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pendiente).toBe(op);
    expect(llamadas).toHaveLength(0);
  });
  it("la misma operación de agente en un espacio personal sí se aplica", () => {
    const { controlador, llamadas } = falso();
    expect(aplicarEnVisor(controlador, ref, agente(), { ambito: "personal" }).ok).toBe(true);
    expect(llamadas).toHaveLength(1);
  });
  it("un parámetro desconocido no rompe: devuelve el motivo del controlador", () => {
    const { controlador } = falso({ ok: false, motivo: "Parámetro desconocido: no-existe" });
    const r = aplicarEnVisor(controlador, ref, operacionDeGesto(ref, vol, 0.5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/desconocido/);
  });
  it("rechaza una operación que apunta a otro parámetro", () => {
    const { controlador, llamadas } = falso();
    const otro: ParametroRef = { atomoId: "a2", parametroId: "vol" };
    expect(aplicarEnVisor(controlador, ref, operacionDeGesto(otro, vol, 0.5)).ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });
});
