import { describe, expect, it } from "vitest";
import { filaDeLatido } from "../fila-agente";
import type { LatidoEntrada } from "../fila-agente";

describe("filaDeLatido", () => {
  const ahora = 1726800000000; // Instante fijo de prueba

  it("procesa correctamente un latido en fase escribiendo de 2 min", () => {
    const latido: LatidoEntrada = {
      tarea: "TG1",
      cola: "cola-1",
      fase: "escribiendo",
      modelo: "gemini-3.6-flash",
      minutos: 2,
      quietoSegundos: 0,
      donde: "mac",
      proveedor: "google",
      tokens: { entrada: 1000, salida: 500, razonamiento: 0, cacheLeida: 0, llamadas: 2 },
    };

    const resultado = filaDeLatido(latido, ahora);

    expect(resultado.tarea).toBe("TG1");
    expect(resultado.fase).toBe("escribiendo");
    expect(resultado.etapa.nombre).toBe("escribiendo");
    expect(resultado.etapa.indice).toBe(0);
    expect(resultado.etapa.atascada).toBe(false);
    expect(resultado.minutos).toBe(2);
    expect(resultado.tokens).toEqual({ entrada: 1000, salida: 500 });
  });

  it("detecta etapa atascada en fase de pruebas tras 40 min", () => {
    const latido: LatidoEntrada = {
      tarea: "TG2",
      cola: "cola-1",
      fase: "tests",
      modelo: "gemini-3.6-flash",
      minutos: 40,
      quietoSegundos: 0,
      donde: "nube",
      medio: "claude",
    };

    const resultado = filaDeLatido(latido, ahora);

    expect(resultado.tarea).toBe("TG2");
    expect(resultado.etapa.nombre).toBe("probando");
    expect(resultado.etapa.indice).toBe(2);
    expect(resultado.etapa.atascada).toBe(true);
    expect(resultado.medio).toBe("claude");
  });

  it("procesa un latido de tarea integrada", () => {
    const latido: LatidoEntrada = {
      tarea: "TG3",
      cola: "cola-1",
      fase: "hecho",
      estado: "hecho",
      modelo: "gemini-3.6-flash",
      minutos: 10,
      quietoSegundos: 0,
      donde: "mac",
      ide: "cursor",
    };

    const resultado = filaDeLatido(latido, ahora);

    expect(resultado.tarea).toBe("TG3");
    expect(resultado.etapa.nombre).toBe("integrada");
    expect(resultado.etapa.indice).toBe(5);
    expect(resultado.etapa.atascada).toBe(false);
    expect(resultado.ide).toBe("cursor");
  });
});
