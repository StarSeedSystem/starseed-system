import { describe, it, expect } from "vitest";
import { esOrdenPermitidaAndroid, obtenerMensajeAndroid } from "../android";

describe("android", () => {
  it("debe marcar como permitidas solo las órdenes válidas", () => {
    // Ejemplo de prueba: almacen-estado debería estar permitido en Android? 
    // El contrato dice "almacenes por el marco de acceso".
    // El archivo ordenes.ts no lo incluye en android, así que deberé definir qué sí está permitido.
    expect(esOrdenPermitidaAndroid("almacen-estado")).toBe(true);
    expect(esOrdenPermitidaAndroid("almacen-formatear")).toBe(false); // Requiere admin
  });

  it("debe retornar el mensaje correcto para órdenes no permitidas", () => {
    expect(obtenerMensajeAndroid("almacen-formatear")).toBe("Esta orden requiere privilegios de administrador, no disponibles en Android sin root.");
  });
});
