import { describe, it, expect } from "vitest";
import { quitarPaquete, quitarTodos, resumenEspacio, EstadoPaquetes } from "../gestion-paquetes";

describe("gestion-paquetes", () => {
  it("debe quitar un paquete correctamente", () => {
    const estado: EstadoPaquetes = {
      indice: { "p1": { id: "p1", tamano: 10, esPersistente: false } },
      almacen: new Set(["p1"])
    };
    const borrarBinario = (id: string) => id === "p1";
    
    const resultado = quitarPaquete("p1", estado, borrarBinario);
    
    expect(resultado.exito).toBe(true);
    expect(estado.indice["p1"]).toBeUndefined();
    expect(estado.almacen.has("p1")).toBe(false);
  });

  it("debe fallar si el borrado del binario falla", () => {
    const estado: EstadoPaquetes = {
      indice: { "p1": { id: "p1", tamano: 10, esPersistente: false } },
      almacen: new Set(["p1"])
    };
    const borrarBinario = () => false;
    
    const resultado = quitarPaquete("p1", estado, borrarBinario);
    
    expect(resultado.exito).toBe(false);
    expect(resultado.motivo).toBe("Error al borrar binario");
    expect(estado.indice["p1"]).toBeDefined(); // Debe mantener la entrada
  });

  it("debe quitar todos los paquetes", () => {
    const estado: EstadoPaquetes = {
      indice: { 
        "p1": { id: "p1", tamano: 10, esPersistente: false },
        "p2": { id: "p2", tamano: 20, esPersistente: false }
      },
      almacen: new Set(["p1", "p2"])
    };
    const borrarBinario = () => true;
    
    quitarTodos(estado, borrarBinario);
    
    expect(Object.keys(estado.indice).length).toBe(0);
  });

  it("debe calcular el resumen de espacio", () => {
    const estado: EstadoPaquetes = {
      indice: { 
        "p1": { id: "p1", tamano: 10, esPersistente: false },
        "p2": { id: "p2", tamano: 20, esPersistente: true }
      },
      almacen: new Set(["p1", "p2"])
    };
    
    const resumen = resumenEspacio(estado, 100);
    
    expect(resumen.usado).toBe(30);
    expect(resumen.tope).toBe(100);
    expect(resumen.porPar).toBe(10);
    expect(resumen.persistente).toBe(20);
  });
});
