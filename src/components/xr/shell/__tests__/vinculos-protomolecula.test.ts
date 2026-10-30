import { describe, expect, it, beforeEach } from "vitest";
import { decidir, esAutomatico } from "@/lib/protomolecula/permisos";
import type { FuenteControl } from "@/lib/protomolecula/vinculos-control";
import {
  ACCIONES_XR,
  ACCIONES_OBLIGATORIAS,
  MAPAS_DEFECTO,
  gatilloAFuente,
  type MapaEntrada,
  type Gatillo,
} from "@/lib/xr/vinculos-xr";
import { CURVA_LINEAL, estadoInicial, procesar, aplicarCurva, normalizar01, rangoEntrada, type Vinculo } from "@/lib/protomolecula/vinculos-control";
import type { Parametro, ParametroRef } from "@/lib/protomolecula/tipos";
import { crearControlador } from "@/lib/protomolecula/controlador";
import { aplicarOperacion } from "@/lib/protomolecula/parametros";
import { registrarAtomo, limpiarRegistro } from "@/lib/protomolecula/registro-atomos";

function fuentesDeMapaXR(mapa: MapaEntrada): FuenteControl[] {
  const fuentes: FuenteControl[] = [];
  const vistos = new Set<string>();
  for (const accion of ACCIONES_XR) {
    for (const g of mapa[accion] ?? []) {
      const f = gatilloAFuente(g);
      if (f) {
        const k = `${f.tipo}:${f.control}:${f.numero}:${f.indice}`;
        if (!vistos.has(k)) {
          vistos.add(k);
          fuentes.push(f);
        }
      }
    }
  }
  return fuentes;
}

function rangoAGesto(p: Parametro, x: number, curva: typeof CURVA_LINEAL = CURVA_LINEAL): number | boolean | string {
  const clampedX = Math.min(1, Math.max(0, x));
  const y = aplicarCurva(clampedX, curva, false);
  const lo = p.min ?? 0;
  const hi = p.max ?? 1;
  if (p.tipo === "booleano") return y >= 0.5;
  if (p.tipo === "opcion") return (p.opciones ?? [""])[Math.min((p.opciones?.length ?? 1) - 1, Math.floor(y * (p.opciones?.length ?? 1)))];
  let valor = lo + y * (hi - lo);
  if (p.paso) valor = Math.round((valor - lo) / p.paso) * p.paso + lo;
  if (p.tipo === "entero") valor = Math.round(valor);
  return Math.round(valor * 1e9) / 1e9;
}

function operacionDeGesto(ref: ParametroRef, p: Parametro, x: number, ctx: { ahora: number; nuevoId: () => string }): {
  id: string;
  objetivo: ParametroRef;
  accion: { tipo: "exacta"; valor: number | boolean | string };
  autor: { tipo: "persona"; id: string };
  origen: "gamepad";
  t: number;
  fuente: string;
} {
  const valor = rangoAGesto(p, x);
  return {
    id: ctx.nuevoId(),
    objetivo: ref,
    accion: { tipo: "exacta", valor },
    autor: { tipo: "persona", id: "test" },
    origen: "gamepad",
    t: ctx.ahora,
    fuente: "test",
  };
}

function crearControladorFalso(refEsperado: ParametroRef) {
  let llamadas: Array<{ accion: { tipo: "exacta"; valor: number | boolean | string } }> = [];
  const controlador = {
    mover: (op: { objetivo: ParametroRef; accion: { tipo: "exacta"; valor: number | boolean | string }; autor: { tipo: string; id: string }; origen: string; t: number; id: string; fuente: string }) => {
      if (op.objetivo.atomoId !== refEsperado.atomoId || op.objetivo.parametroId !== refEsperado.parametroId) {
        return { ok: false, motivo: "Parámetro incorrecto" };
      }
      llamadas.push({ accion: op.accion });
      return { ok: true, cambio: { operacion: op, antes: 0, despues: op.accion.valor, acotado: false, reversible: true }, difundir: true };
    },
  };
  return { controlador, llamadas };
}

const ref: ParametroRef = { atomoId: "a1", parametroId: "vol" };
const vol: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: 0, max: 100 };

const moleculaConVol = (ambito: "personal" | "grupo" = "personal") => ({
  id: "m1",
  titulo: "Test",
  ambito: ambito as const,
  capas: [],
  atomos: [{ id: "a1", herramientaId: "test-tool", titulo: "Test", estado: "activo" as const }],
  valores: {},
  version: 1,
  creadaEn: 0,
  actualizadaEn: 0,
});

const herramientaTest = {
  herramientaId: "test-tool",
  nombre: "Test Tool",
  categoria: "audio" as const,
  integracion: "libreria-js" as const,
  control: "total" as const,
  parametros: [vol],
  entradas: [],
  salidas: [],
};

beforeEach(() => {
  limpiarRegistro();
  registrarAtomo(herramientaTest);
});

describe("vínculos Protomolécula ↔ XR", () => {
  it("solo devuelve gatillos de mando: ni gestos, ni teclas, ni frases", () => {
    const mapa: MapaEntrada = {
      seleccionar: [{ tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }],
      salir: [{ tipo: "tecla", codigo: "Escape" }, { tipo: "frase", texto: "salir" }],
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

  it("un deslizador al 50 % da un valor exacto y se aplica", () => {
    expect(rangoAGesto(vol, 0.5)).toBe(50);
    const { controlador, llamadas } = crearControladorFalso(ref);
    const op = operacionDeGesto(ref, vol, 0.5, { ahora: 7, nuevoId: () => "op-1" });
    const res = controlador.mover(op);
    expect(res.ok).toBe(true);
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
    const log = { ...CURVA_LINEAL, forma: "log" as const };
    expect(rangoAGesto(vol, 0.5)).toBe(50);
    expect(rangoAGesto(vol, 0.5, log)).toBeGreaterThan(50);
  });

  it("un botón de mando mapeado a un parámetro lo mueve con la curva", () => {
    const [fuente] = fuentesDeMapaXR({ seleccionar: [{ tipo: "boton", indice: 0, mano: "derecha" }] });
    const vinculo: Vinculo = { id: "v", fuente, objetivo: ref, modo: "absoluto", curva: { ...CURVA_LINEAL, forma: "log" }, activo: true, creadoPor: "ana" };
    const r = procesar(vinculo, vol, estadoInicial(), 0.5, { autor: { tipo: "persona", id: "ana" }, ahora: 1, id: "op" });
    const op = r.operacion;
    expect(op?.accion).toMatchObject({ tipo: "exacta" });
    if (!op || op.accion.tipo !== "exacta") throw new Error("se esperaba una operación exacta");
    expect(Number(op.accion.valor)).toBeGreaterThan(50);
    const { controlador, llamadas } = crearControladorFalso(ref);
    controlador.mover(op);
    expect(llamadas[0].accion).toEqual(op.accion);
  });

  it("una operación de un agente en un espacio de grupo queda pendiente y no se aplica", () => {
    const molecula = moleculaConVol("grupo");
    const ctrl = crearControlador({ molecula, rol: "editor", sesion: { ambito: "grupo", consentimientos: [] }, ahora: () => 1, nuevoId: () => "op" });
    const op = {
      id: "op1", objetivo: ref, accion: { tipo: "exacta" as const, valor: 50 },
      autor: { tipo: "agente" as const, id: "bot1" }, origen: "agente" as const, t: 1, fuente: "test",
    };
    // Debug: check what decidir returns
    console.log("esAutomatico(agente):", esAutomatico("agente"));
    console.log("abierto for grupo:", "grupo" === "grupo" || "grupo" === "publica");
    const decision = decidir({ rol: "editor", origen: "agente", ambito: "grupo", accion: "mover-parametro" });
    console.log("decision:", decision);
    const res = ctrl.mover(op);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.pendiente).toBeDefined();
  });

  it("la misma operación de agente en un espacio personal sí se aplica", () => {
    const molecula = moleculaConVol("personal");
    const ctrl = crearControlador({ molecula, rol: "editor", sesion: { ambito: "personal", consentimientos: [] }, ahora: () => 1, nuevoId: () => "op" });
    const op = {
      id: "op1", objetivo: ref, accion: { tipo: "exacta" as const, valor: 50 },
      autor: { tipo: "agente" as const, id: "bot1" }, origen: "agente" as const, t: 1, fuente: "test",
    };
    const res = ctrl.mover(op);
    expect(res.ok).toBe(true);
  });

  it("un parámetro desconocido no rompe: devuelve el motivo del controlador", () => {
    const molecula = moleculaConVol("personal");
    const ctrl = crearControlador({ molecula, rol: "editor", sesion: { ambito: "personal", consentimientos: [] }, ahora: () => 1, nuevoId: () => "op" });
    const op = {
      id: "op1", objetivo: { atomoId: "a2", parametroId: "no-existe" }, accion: { tipo: "exacta" as const, valor: 50 },
      autor: { tipo: "persona" as const, id: "ana" }, origen: "mano" as const, t: 1, fuente: "test",
    };
    const res = ctrl.mover(op);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toMatch(/desconocido/);
  });

  it("rechaza una operación que apunta a otro parámetro", () => {
    const { controlador, llamadas } = crearControladorFalso(ref);
    const otro: ParametroRef = { atomoId: "a2", parametroId: "vol" };
    const op = operacionDeGesto(otro, vol, 0.5, { ahora: 1, nuevoId: () => "op-1" });
    const res = controlador.mover(op);
    expect(res.ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });
});