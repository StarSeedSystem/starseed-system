import { describe, it, expect } from "vitest";
import { contextoDisenoIA, type EntidadDiseno } from "../principios-referencia";
import { movimientoDe } from "../registros-movimiento";

/* DAN1024H — el ADN de diseño que viaja a los agentes de creación con IA */

describe("contextoDisenoIA", () => {
  it("devuelve un texto de entre 50 y 900 caracteres", () => {
    const texto = contextoDisenoIA();
    expect(texto.length).toBeGreaterThanOrEqual(50);
    expect(texto.length).toBeLessThanOrEqual(900);
  });

  it("cita los principios del ADN y la regla del símbolo", () => {
    const texto = contextoDisenoIA();
    expect(texto).toContain("composición centrada");
    expect(texto).toContain("color por papel");
    expect(texto).toContain("brillo multicapa");
    expect(texto).toContain("transform");
    expect(texto).toContain("opacity");
    expect(texto).toContain("vesica");
    expect(texto).toContain("no se recolorea ni se deforma");
  });

  it("no lleva claves ni rutas", () => {
    const texto = contextoDisenoIA();
    expect(texto).not.toMatch(/:\s*\/\//);
    expect(texto).not.toMatch(/(^|\s)\/[a-z-]{3,}/);
    expect(texto).not.toMatch(/_KEY|_SECRET|_TOKEN|_URL|API|SUPABASE|ASTRAURA_/);
    expect(texto).not.toContain("src/lib");
  });

  it("cita el registro y la sección de la entidad, con su movimiento real", () => {
    const m = movimientoDe("expresivo", "astraura");
    const texto = contextoDisenoIA({ registro: "expresivo", seccion: "astraura" });
    expect(texto).toContain("registro «expresivo»");
    expect(texto).toContain("sección «astraura»");
    expect(texto).toContain(`entra en ${m.entrada.ms} ms`);
    expect(texto).toContain(`sale en ${m.salida.ms} ms`);
  });

  it("un registro o sección desconocidos vuelven al patrón sobrio de la Protomolécula", () => {
    const raro = contextoDisenoIA({ registro: "caótico" as EntidadDiseno["registro"], seccion: "otra" as EntidadDiseno["seccion"] });
    expect(raro).toContain("registro «sobrio»");
    expect(raro).toContain("sección «protomolecula»");
    expect(raro).toBe(contextoDisenoIA());
  });

  it("es determinista y respeta el nombre de la entidad", () => {
    const entidad: EntidadDiseno = { nombre: "Semilla", registro: "experimental", seccion: "trinity" };
    expect(contextoDisenoIA(entidad)).toBe(contextoDisenoIA(entidad));
    expect(contextoDisenoIA(entidad)).toContain("«Semilla»");
    expect(contextoDisenoIA().length).toBeLessThan(900);
  });
});

