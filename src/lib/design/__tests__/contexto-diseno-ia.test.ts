import { describe, it, expect } from "vitest";
import {
  contextoDisenoIA,
  TOPE_CONTEXTO_DISENO_IA,
  type EntidadDisenoIA,
} from "@/lib/design/principios-referencia";
import {
  movimientoDe,
  type RegistroMovimiento,
  type SeccionMovimiento,
} from "@/lib/design/registros-movimiento";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
  "trinity",
  "astraura",
  "genesis",
  "malla",
  "biblioteca",
  "protomolecula",
];

describe("contextoDisenoIA · longitud y contenido del ADN", () => {
  it("queda dentro del tope declarado y nunca sale vacío", () => {
    for (const registro of [...REGISTROS, undefined]) {
      for (const seccion of [...SECCIONES, undefined]) {
        const t = contextoDisenoIA({ movimiento: registro, seccion });
        expect(t.length).toBeGreaterThan(0);
        expect(t.length).toBeLessThanOrEqual(TOPE_CONTEXTO_DISENO_IA);
        expect(t.length).toBeLessThanOrEqual(900);
      }
    }
  });

  it("cita los principios del ADN: composición, Trinity, brillo y animación", () => {
    const t = contextoDisenoIA();
    expect(t).toContain("Composición centrada");
    expect(t).toContain("Trinity");
    expect(t).toContain("Un único brillo multicapa");
    expect(t).toContain("transform y opacity");
  });

  it("cuenta la regla del símbolo oficial: vesica vertical, sin retocar", () => {
    const t = contextoDisenoIA();
    expect(t).toContain("vesica vertical");
    expect(t).toContain("sin recolorear");
    expect(t).toContain("sin deformar");
  });

  it("es determinista: la misma entidad devuelve el mismo texto", () => {
    const e: EntidadDisenoIA = { movimiento: "expresivo", seccion: "trinity" };
    expect(contextoDisenoIA(e)).toBe(contextoDisenoIA(e));
  });

  it("acepta entidad nula o vacía sin lanzar", () => {
    expect(() => contextoDisenoIA()).not.toThrow();
    expect(() => contextoDisenoIA(null)).not.toThrow();
    expect(() => contextoDisenoIA({})).not.toThrow();
  });
});

describe("contextoDisenoIA · registro y sección de la entidad", () => {
  it("cita el registro de movimiento que la entidad pide", () => {
    expect(contextoDisenoIA({ movimiento: "expresivo" })).toContain("registro expresivo");
    expect(contextoDisenoIA({ movimiento: "experimental" })).toContain("registro experimental");
    expect(contextoDisenoIA()).toContain("registro sobrio");
  });

  it("cuenta la sección donde va a nacer la pieza", () => {
    expect(contextoDisenoIA({ seccion: "trinity" })).toContain("sección trinity");
    expect(contextoDisenoIA({ seccion: "malla" })).toContain("sección malla");
    expect(contextoDisenoIA()).toContain("sección protomolecula");
  });

  it("los números de interfaz salen de movimientoDe, nunca de otra parte", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const m = movimientoDe(registro, seccion);
        const t = contextoDisenoIA({ movimiento: registro, seccion });
        expect(t).toContain(`${m.entrada.ms} ms`);
        expect(t).toContain(`${m.salida.ms} ms`);
        expect(t).toContain(`${m.cascadaMs} ms`);
        expect(t).toContain(m.entrada.curva);
        expect(t).toContain(m.salida.curva);
      }
    }
  });

  it("con movimiento reducido del sistema dice el estado quieto", () => {
    const t = contextoDisenoIA({ movimientoReducido: true });
    expect(t).toContain("se pinta quieto");
    expect(t).not.toContain("Cascada de los hijos");
    expect(t).not.toContain("· Entrada:");
  });

  it("un registro o sección desconocidos vuelven al defecto, sin lanzar", () => {
    const raro = "raro" as unknown as RegistroMovimiento;
    const seccionRara = "antorcha" as unknown as SeccionMovimiento;
    expect(contextoDisenoIA({ movimiento: raro })).toContain("registro sobrio");
    expect(contextoDisenoIA({ seccion: seccionRara })).toContain("sección protomolecula");
  });
});

describe("contextoDisenoIA · sin claves ni rutas", () => {
  it("no lleva ninguno de los dos, para ninguna entidad", () => {
    const sospechas = /[/\\]|sk-|AKIA|Bearer|secret|api|aquí|token/i;
    for (const registro of [...REGISTROS, undefined]) {
      for (const seccion of [...SECCIONES, undefined]) {
        const t = contextoDisenoIA({ movimiento: registro, seccion });
        expect(sospechas.test(t)).toBe(false);
      }
    }
  });

  it(" tampoco el texto mínimo de emergencia", () => {
    expect(/[/\\]|sk-|AKIA|Bearer|secret|api|aquí|token/i.test(contextoDisenoIA({ movimientoReducido: true }))).toBe(false);
  });
});

