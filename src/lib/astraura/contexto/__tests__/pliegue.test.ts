import { describe, it, expect } from "vitest";
import {
  resumenExtractivo,
  plegarHistorial,
  restaurarBloque,
  buscarEnBloques,
  type Turno,
} from "../pliegue";

function generarTurnos(n: number, largo = 50): Turno[] {
  const turnos: Turno[] = [];
  for (let i = 0; i < n; i++) {
    turnos.push({
      rol: i % 2 === 0 ? "user" : "assistant",
      texto: "Palabra ".repeat(Math.ceil(largo / 8)) + "fin" + i + ". Esto es un texto de prueba.",
    });
  }
  return turnos;
}

describe("pliegue", () => {
  it("cabe todo ⇒ sin bloques y texto vacío", () => {
    const historial: Turno[] = [
      { rol: "user", texto: "Hola" },
      { rol: "assistant", texto: "Mundo" },
    ];
    const res = plegarHistorial(historial, { presupuestoChars: 10000 });
    expect(res.bloques.length).toBe(0);
    expect(res.texto).toBe("");
    expect(res.recientes.length).toBe(2);
  });

  it("40 turnos largos ⇒ los recientes ≤ recientesChars, los bloques cubren [0,n) sin huecos ni solapes", () => {
    const historial = generarTurnos(40, 80);
    const res = plegarHistorial(historial, { presupuestoChars: 1000, recientesChars: 400 });
    expect(res.recientes.length).toBeGreaterThan(0);
    const charsRecientes = res.recientes.reduce((s, t) => s + t.texto.length + 4, 0);
    expect(charsRecientes).toBeLessThanOrEqual(500); // con margen
    if (res.bloques.length > 0) {
      expect(res.bloques[0].desde).toBe(0);
      expect(res.bloques[res.bloques.length - 1].hasta).toBe(40 - res.recientes.length);
      // sin huecos ni solapes
      for (let i = 1; i < res.bloques.length; i++) {
        expect(res.bloques[i].desde).toBe(res.bloques[i - 1].hasta);
      }
    }
    expect(res.texto.length).toBeLessThanOrEqual(1000);
  });

  it("ESTABILIDAD: añadir 3 turnos al final no cambia ni el rango ni el resumen de los bloques de nivel 1 ya existentes", () => {
    const historial = generarTurnos(30, 60);
    const res1 = plegarHistorial(historial, { presupuestoChars: 800, recientesChars: 300 });
    const res2 = plegarHistorial([...historial, ...generarTurnos(3, 60)], { presupuestoChars: 800, recientesChars: 300 });
    const bloques1N1 = res1.bloques.filter((b) => b.nivel === 1);
    const bloques2N1 = res2.bloques.filter((b) => b.nivel === 1);
    // Los bloques de nivel 1 que existían antes deben mantenerse idénticos
    for (let i = 0; i < Math.min(bloques1N1.length, bloques2N1.length); i++) {
      expect(bloques2N1[i].desde).toBe(bloques1N1[i].desde);
      expect(bloques2N1[i].hasta).toBe(bloques1N1[i].hasta);
      expect(bloques2N1[i].resumen).toBe(bloques1N1[i].resumen);
    }
  });

  it("restaurarBloque devuelve exactamente el trozo", () => {
    const historial = generarTurnos(20, 40);
    const res = plegarHistorial(historial, { presupuestoChars: 500 });
    if (res.bloques.length > 0) {
      const trozo = restaurarBloque(historial, res.bloques[0]);
      expect(trozo.length).toBe(res.bloques[0].hasta - res.bloques[0].desde);
      expect(trozo[0]).toEqual(historial[res.bloques[0].desde]);
      expect(trozo[trozo.length - 1]).toEqual(historial[res.bloques[0].hasta - 1]);
    }
  });

  it("buscarEnBloques encuentra el bloque con la palabra y devuelve [] si no hay coincidencias", () => {
    const historial: Turno[] = [];
    for (let i = 0; i < 12; i++) {
      if (i < 6) {
        historial.push({ rol: "user", texto: "Hablamos sobre arquitectura de software y patrones." });
        historial.push({ rol: "assistant", texto: "Entiendo los principios arquitectónicos." });
      } else {
        historial.push({ rol: "user", texto: "Vamos a cocinar una receta sencilla." });
        historial.push({ rol: "assistant", texto: "Te ayudo con los ingredientes." });
      }
    }
    const res = plegarHistorial(historial, { presupuestoChars: 200 });
    if (res.bloques.length > 0) {
      const encontrados = buscarEnBloques(historial, res.bloques, "arquitectura");
      expect(encontrados.length).toBeGreaterThan(0);
    }
    const vacios = buscarEnBloques(historial, res.bloques, "xyzabc123");
    expect(vacios).toEqual([]);
  });

  it("el resumidor inyectado se usa", () => {
    const historial = generarTurnos(12, 60);
    const resumidor = (turnos: Turno[]) => "RESUMIDOR_CUSTOM:" + turnos.length;
    const res = plegarHistorial(historial, { presupuestoChars: 300, resumidor });
    if (res.bloques.length > 0) {
      expect(res.bloques[0].resumen).toContain("RESUMIDOR_CUSTOM");
    }
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const historial = generarTurnos(25, 70);
    const res1 = plegarHistorial(historial, { presupuestoChars: 600, recientesChars: 250 });
    const res2 = plegarHistorial(historial, { presupuestoChars: 600, recientesChars: 250 });
    expect(res1.bloques.length).toBe(res2.bloques.length);
    expect(res1.texto).toBe(res2.texto);
    expect(res1.recientes.length).toBe(res2.recientes.length);
    for (let i = 0; i < res1.bloques.length; i++) {
      expect(res1.bloques[i].desde).toBe(res2.bloques[i].desde);
      expect(res1.bloques[i].hasta).toBe(res2.bloques[i].hasta);
      expect(res1.bloques[i].resumen).toBe(res2.bloques[i].resumen);
    }
  });
});
