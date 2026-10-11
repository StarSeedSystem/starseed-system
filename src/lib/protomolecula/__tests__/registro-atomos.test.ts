import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarAtomo,
  obtenerAtomo,
  listarAtomos,
  limpiarRegistro,
  puedeAnadirse,
  sanearDefinicion,
  candidatosDe,
  type DefinicionAtomo,
} from "../registro-atomos";
import { entenderDictado, type ContextoDictado } from "../dictado";
import type { Molecula, AtomoEnUso, Autor, Parametro, CandidatoParametro } from "../tipos";

function moleculaEjemplo(atomos: AtomoEnUso[]): Molecula {
  return {
    id: "mol-1",
    titulo: "Test",
    ambito: "personal",
    capas: [],
    atomos,
    valores: {},
    version: 1,
    creadaEn: Date.now(),
    actualizadaEn: Date.now(),
  };
}

function atomoActivo(id: string, herramientaId: string, titulo?: string): AtomoEnUso {
  return { id, herramientaId, estado: "activo", titulo };
}

function atomoSuspendido(id: string, herramientaId: string): AtomoEnUso {
  return { id, herramientaId, estado: "suspendido" };
}

function parametroVolumen(): Parametro {
  return { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, unidad: "dB", paso: 0.5, defecto: 0 };
}

function parametroFiltro(): Parametro {
  return { id: "filtro", nombre: "Filtro", tipo: "opcion", opciones: ["paso alto", "paso bajo", "paso banda"], defecto: "paso alto" };
}

function defValida(overrides: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  return {
    herramientaId: "mi.herramienta",
    nombre: "Mi Herramienta",
    categoria: "audio",
    integracion: "libreria-js",
    control: "total",
    parametros: [parametroVolumen()],
    entradas: ["audio"],
    salidas: ["audio"],
    ...overrides,
  };
}

const autorTest: Autor = { tipo: "persona", id: "u1", nombre: "Test" };
const ctxDictado: ContextoDictado = { autor: autorTest, ahora: Date.now(), origen: "dictado" };

function assertFail(r: { ok: true } | { ok: false; motivo: string }): { ok: false; motivo: string } {
  expect(r.ok).toBe(false);
  return r as { ok: false; motivo: string };
}

describe("registro-atomos", () => {
  beforeEach(() => limpiarRegistro());

  it("registra una definición válida", () => {
    const r = registrarAtomo(defValida());
    expect(r).toEqual({ ok: true });
    expect(obtenerAtomo("mi.herramienta")).toBeDefined();
  });

  it("rechaza herramientaId inválido (mayúsculas)", () => {
    const r = assertFail(registrarAtomo(defValida({ herramientaId: "Mi.Herramienta" })));
    expect(r.motivo).toContain("minúscula");
  });

  it("rechaza herramientaId inválido (caracteres raros)", () => {
    const r = assertFail(registrarAtomo(defValida({ herramientaId: "mi@herramienta" })));
    expect(r.motivo).toBeDefined();
  });

  it("rechaza nombre demasiado largo", () => {
    const r = assertFail(registrarAtomo(defValida({ nombre: "a".repeat(81) })));
    expect(r.motivo).toContain("80");
  });

  it("rechaza más de 64 parámetros", () => {
    const params = Array.from({ length: 65 }, (_, i) => ({ ...parametroVolumen(), id: `p${i}`, nombre: `P${i}` }));
    const r = assertFail(registrarAtomo(defValida({ parametros: params })));
    expect(r.motivo).toContain("64");
  });

  it("rechaza parámetros con ids duplicados", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [parametroVolumen(), { ...parametroVolumen(), id: "volumen", nombre: "Volumen 2" }] })));
    expect(r.motivo).toContain("duplicado");
  });

  it("rechaza tipo de parámetro inválido", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [{ ...parametroVolumen(), tipo: "invalido" as any }] })));
    expect(r.motivo).toContain("inválido");
  });

  it("rechaza min >= max", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [{ ...parametroVolumen(), min: 10, max: 5 }] })));
    expect(r.motivo).toContain("menor que max");
  });

  it("rechaza más de 32 opciones", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [{ ...parametroFiltro(), opciones: Array.from({ length: 33 }, (_, i) => `o${i}`) }] })));
    expect(r.motivo).toContain("32");
  });

  it("rechaza opción demasiado larga", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [{ ...parametroFiltro(), opciones: ["a".repeat(41)] }] })));
    expect(r.motivo).toContain("40");
  });

  it("rechaza texto de parámetro demasiado largo", () => {
    const r = assertFail(registrarAtomo(defValida({ parametros: [{ ...parametroVolumen(), nombre: "a".repeat(81) }] })));
    expect(r.motivo).toContain("80");
  });

  it("rechaza control 'total' sin parámetros", () => {
    const r = assertFail(registrarAtomo(defValida({ control: "total", parametros: [] })));
    expect(r.motivo).toContain("al menos 1 parámetro");
  });

  it("acepta control 'ventana' sin parámetros", () => {
    const r = registrarAtomo(defValida({ control: "ventana", parametros: [] }));
    expect(r.ok).toBe(true);
  });

  it("rechaza duplicado de herramientaId", () => {
    registrarAtomo(defValida());
    const r = assertFail(registrarAtomo(defValida()));
    expect(r.motivo).toContain("ya registrada");
  });

  it("rechaza definición con 'proximamente'", () => {
    const r = assertFail(registrarAtomo(defValida({ proximamente: "falta SHA verificado" })));
    expect(r.motivo).toBe("falta SHA verificado");
  });

  it("puedeAnadirse devuelve el motivo de 'proximamente'", () => {
    const r = puedeAnadirse(defValida({ proximamente: "falta app nativa" }));
    expect(r).toEqual({ ok: false, motivo: "falta app nativa" });
  });

  it("sanearDefinicion elimina HTML y campos extra", () => {
    const bruto = {
      herramientaId: "sanitizada",
      nombre: "Limpia <script>",
      categoria: "audio",
      integracion: "servidor-remoto",
      control: "ventana",
      parametros: [{ id: "p1", nombre: "Param <b>1</b>", tipo: "numero", min: 0, max: 100 }],
      entradas: ["in"],
      salidas: ["out"],
      campoExtra: "se ignora",
      vista: { tipo: "externa", url: "https://x.com" },
    };
    const saneada = sanearDefinicion(bruto);
    expect(saneada).not.toBeNull();
    expect(saneada!.herramientaId).toBe("sanitizada");
    expect(saneada!.nombre).toBe("Limpia script");
    expect(saneada!.integracion).toBe("iframe-aislado");
    expect(saneada!.vista).toBeUndefined();
    expect(saneada!.parametros[0].nombre).toBe("Param b1/b");
  });

  it("sanearDefinicion fuerza integracion a 'iframe-aislado'", () => {
    const bruto = { ...defValida(), integracion: "libreria-js" };
    const saneada = sanearDefinicion(bruto);
    expect(saneada!.integracion).toBe("iframe-aislado");
  });

  it("sanearDefinicion devuelve null si queda inválida", () => {
    const bruto = { herramientaId: "", nombre: "x", categoria: "audio", integracion: "libreria-js", control: "total", parametros: [], entradas: [], salidas: [] };
    expect(sanearDefinicion(bruto)).toBeNull();
  });

  it("candidatosDe omite átomos suspendidos", () => {
    registrarAtomo(defValida({ herramientaId: "h1", parametros: [parametroVolumen()] }));
    const m = moleculaEjemplo([atomoActivo("a1", "h1"), atomoSuspendido("a2", "h1")]);
    const cands = candidatosDe(m);
    expect(cands.length).toBe(1);
    expect(cands[0].ref.atomoId).toBe("a1");
  });

  it("candidatosDe omite herramienta no registrada", () => {
    registrarAtomo(defValida({ herramientaId: "h1", parametros: [parametroVolumen()] }));
    const m = moleculaEjemplo([atomoActivo("a1", "h1"), atomoActivo("a2", "no-existe")]);
    const cands = candidatosDe(m);
    expect(cands.length).toBe(1);
  });

  it("candidatosDe no pisa dos instancias de la misma herramienta", () => {
    registrarAtomo(defValida({ herramientaId: "h1", parametros: [parametroVolumen(), parametroFiltro()] }));
    const m = moleculaEjemplo([atomoActivo("a1", "h1", "Reverb voz"), atomoActivo("a2", "h1", "Reverb música")]);
    const cands = candidatosDe(m);
    expect(cands.length).toBe(4);
    const vols = cands.filter((c: CandidatoParametro) => c.parametro.id === "volumen");
    expect(vols.length).toBe(2);
    expect(new Set(vols.map((v: CandidatoParametro) => v.ref.atomoId)).size).toBe(2);
  });

  it("integración: 'sube el volumen 3 dB' resuelve el parámetro correcto", () => {
    registrarAtomo(defValida({ herramientaId: "mezclador", parametros: [parametroVolumen(), parametroFiltro()] }));
    const m = moleculaEjemplo([atomoActivo("mezclador-1", "mezclador", "Mezclador principal")]);
    const cands = candidatosDe(m);
    const res = entenderDictado("sube el volumen 3 dB", cands, ctxDictado);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.operacion.objetivo.parametroId).toBe("volumen");
      expect(res.operacion.accion.tipo).toBe("relativa");
      expect((res.operacion.accion as { cantidad: number }).cantidad).toBe(3);
    }
  });

  it("listarAtomos devuelve todas las registradas", () => {
    registrarAtomo(defValida({ herramientaId: "h1" }));
    registrarAtomo(defValida({ herramientaId: "h2", nombre: "Otra", control: "ventana", parametros: [] }));
    expect(listarAtomos().length).toBe(2);
  });

  it("limpiarRegistro vacía el registro", () => {
    registrarAtomo(defValida());
    limpiarRegistro();
    expect(listarAtomos().length).toBe(0);
  });
});