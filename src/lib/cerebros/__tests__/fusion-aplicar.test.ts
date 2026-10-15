import { describe, it, expect } from "vitest";
import * as fusionAplicar from "../fusion-aplicar";

describe("fusion-aplicar (implementación básica)", () => {
  it("debe tener las funciones exportadas", () => {
    expect(typeof fusionAplicar.leerParaFusion).toBe("function");
    expect(typeof fusionAplicar.copiaDeSeguridad).toBe("function");
    expect(typeof fusionAplicar.descargarCopia).toBe("function");
    expect(typeof fusionAplicar.aplicarFusion).toBe("function");
  });

  it("leerParaFusion devuelve error cuando el cerebro destino no existe", async () => {
    // En el entorno de prueba, no hay credenciales de Supabase, así que getBrain devolverá null
    const resultado = await fusionAplicar.leerParaFusion("destino-id-inexistente", ["origen-id-inexistente"]);
    expect(resultado.ok).toBe(false);
    // El mensaje debe contener indicación de que el cerebro destino no se encontró
    expect(resultado.motivo).toContain("Cerebro destino");
  });

  it("copiaDeSeguridad devuelve objeto con nombre y texto", () => {
    // Usamos datos mínimos para probar la función
    const datos = {
      destino: { id: "d1", name: "Destino", scope: "account", scope_ref: null, description: "", config: {}, includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined }, servers: [], created_at: undefined, updated_at: undefined },
      origenes: [],
      archivos: [],
      prefs: {}
    };
    const copia = fusionAplicar.copiaDeSeguridad(datos, "2026-10-13");
    expect(typeof copia.nombre).toBe("string");
    expect(typeof copia.texto).toBe("string");
    // El nombre debe seguir el patrón esperado
    expect(copia.nombre).toBe("cerebros-fusion-2026-10-13.json");
    // El texto debe ser un JSON válido
    expect(() => JSON.parse(copia.texto)).not.toThrow();
  });

  it("descargarCopia devuelve false sin window (SSR)", () => {
    // En el entorno de prueba de Vitest, window está definido, pero podemos simular SSR eliminando la propiedad window
    // Sin embargo, para no afectar otros tests, hacemos un mock temporal.
    const originalWindow = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete globalThis.window;
    try {
      const copia = { nombre: "test.json", texto: "{}" };
      const result = fusionAplicar.descargarCopia(copia);
      expect(result).toBe(false);
    } finally {
      // Restaurar window
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      globalThis.window = originalWindow;
    }
  });

  it("aplicarFusion devuelve error cuando falla por credenciales faltantes", async () => {
    // En el entorno de prueba, no hay credenciales de Supabase, así que cualquiera de las llamadas fallará
    const plan = { archivos: [], incluye: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined }, servidores: [], config: {}, prefs: {} };
    const resultado = await fusionAplicar.aplicarFusion(plan, { destino: { id: "d1", name: "Destino", scope: "account", scope_ref: null, description: "", config: {}, includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined }, servers: [], created_at: undefined, updated_at: undefined }, origenIds: [], quitarOrigenes: false });
    expect(resultado.ok).toBe(false);
    // El error debe ser un string
    expect(typeof resultado.error).toBe("string");
  });
});