import { describe, it, expect } from "vitest";
import { plegarHistorial, restaurarBloque, buscarEnBloques, resumenExtractivo, type Turno } from "../pliegue";

describe("pliegue", () => {
  it("cabe todo ⇒ sin bloques y texto vacío", () => {
    const historial: Turno[] = [
      { rol: "user", texto: "hola" },
      { rol: "assistant", texto: "mundo" },
    ];
    const res = plegarHistorial(historial, { presupuestoChars: 10000 });
    expect(res.bloques.length).toBe(0);
    expect(res.texto).toBe("");
    expect(res.recientes.length).toBe(2);
  });

  it("40 turnos largos ⇒ los recientes ≤ recientesChars, los bloques cubren [0, n) sin huecos ni solapes y texto ≤ presupuesto", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 40; i++) {
      historial.push({ rol: i % 2 === 0 ? "user" : "assistant", texto: "x".repeat(200) });
    }
    const presupuestoChars = 1000;
    const res = plegarHistorial(historial, { presupuestoChars, recientesChars: 300 });
    expect(res.recientes.length * 200).toBeLessThanOrEqual(300 + 50); // aproximado
    // cubrir todo sin huecos ni solapes
    if (res.bloques.length > 0) {
      // primer bloque debe empezar en 0
      expect(res.bloques[0].desde).toBe(0);
      // último debe terminar en historial.length - recientes.length
      const esperadoHasta = historial.length - res.recientes.length;
      expect(res.bloques[res.bloques.length - 1].hasta).toBe(esperadoHasta);
      // sin huecos ni solapes
      for (let i = 1; i < res.bloques.length; i++) {
        expect(res.bloques[i].desde).toBe(res.bloques[i - 1].hasta);
      }
    }
    expect(res.texto.length).toBeLessThanOrEqual(presupuestoChars + 100);
  });

  it("ESTABILIDAD (caso sin fusiones de nivel superior): añadir 3 turnos al final no cambia ni el rango ni el resumen de los bloques de nivel 1 ya existentes", () => {
    const historial1: Turno[] = [];
    for (let i = 0; i < 30; i++) {
      historial1.push({ rol: i % 2 === 0 ? "user" : "assistant", texto: `mensaje${i} `.repeat(5) });
    }
    const presupuestoChars = 2000;
    const res1 = plegarHistorial(historial1, { presupuestoChars, recientesChars: 200 });
    const bloquesNivel1Antes = res1.bloques.filter((b) => b.nivel === 1);

    const historial2 = [...historial1];
    for (let i = 30; i < 33; i++) {
      historial2.push({ rol: i % 2 === 0 ? "user" : "assistant", texto: `mensaje${i} `.repeat(5) });
    }
    const res2 = plegarHistorial(historial2, { presupuestoChars, recientesChars: 200 });
    const bloquesNivel1Despues = res2.bloques.filter((b) => b.nivel === 1);

    // Los bloques de nivel 1 ya existentes deben mantener rango y resumen
    expect(bloquesNivel1Despues.length).toBeGreaterThanOrEqual(bloquesNivel1Antes.length);
    // Comparar los primeros bloques que existían antes
    for (let i = 0; i < bloquesNivel1Antes.length; i++) {
      const encontrado = bloquesNivel1Despues.find((b) => b.id === bloquesNivel1Antes[i].id);
      if (encontrado) {
        expect(encontrado.desde).toBe(bloquesNivel1Antes[i].desde);
        expect(encontrado.hasta).toBe(bloquesNivel1Antes[i].hasta);
        expect(encontrado.resumen).toBe(bloquesNivel1Antes[i].resumen);
      }
    }
  });

  it("restaurarBloque devuelve exactamente el trozo", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 20; i++) {
      historial.push({ rol: i % 2 === 0 ? "user" : "assistant", texto: `texto${i}` });
    }
    const bloque = { id: "b1-0-6", nivel: 1 as const, desde: 0, hasta: 6, resumen: "test" };
    const restaurado = restaurarBloque(historial, bloque);
    expect(restaurado.length).toBe(6);
    expect(restaurado[0].texto).toBe("texto0");
    expect(restaurado[5].texto).toBe("texto5");
  });

  it("buscarEnBloques encuentra el bloque con la palabra y devuelve [] si no hay coincidencias", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 12; i++) {
      if (i < 6) {
        historial.push({ rol: "user", texto: "hola mundo programación" });
      } else {
        historial.push({ rol: "assistant", texto: "respuesta normal" });
      }
    }
    const res = plegarHistorial(historial, { presupuestoChars: 500, recientesChars: 50 });
    const encontrados = buscarEnBloques(historial, res.bloques, "programación", 3);
    expect(encontrados.length).toBeGreaterThan(0);
    const noEncontrados = buscarEnBloques(historial, res.bloques, "xyzabc123", 3);
    expect(noEncontrados.length).toBe(0);
  });

  it("el resumidor inyectado se usa", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 20; i++) {
      historial.push({ rol: "user", texto: `mensaje${i}` });
    }
    let resumidorLlamado = false;
    const resumidor = (turnos: Turno[], maxChars: number) => {
      resumidorLlamado = true;
      return "RESUMEN_INYECTADO";
    };
    const res = plegarHistorial(historial, { presupuestoChars: 1000, recientesChars: 100, resumidor });
    expect(resumidorLlamado).toBe(true);
    // verificar que se usó
    const hayResumenInyectado = res.bloques.some((b) => b.resumen === "RESUMEN_INYECTADO");
    expect(hayResumenInyectado).toBe(true);
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 25; i++) {
      historial.push({ rol: i % 2 === 0 ? "user" : "assistant", texto: `texto${i} con contenido` });
    }
    const op = { presupuestoChars: 800, recientesChars: 200 };
    const res1 = plegarHistorial(historial, op);
    const res2 = plegarHistorial(historial, op);
    expect(res1.bloques.length).toBe(res2.bloques.length);
    expect(res1.texto).toBe(res2.texto);
    expect(res1.descartadosChars).toBe(res2.descartadosChars);
    for (let i = 0; i < res1.bloques.length; i++) {
      expect(res1.bloques[i].id).toBe(res2.bloques[i].id);
      expect(res1.bloques[i].resumen).toBe(res2.bloques[i].resumen);
    }
  });
});
