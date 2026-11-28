import { describe, it, expect } from "vitest";
import {
  CLAVE_VARIACION_VISTA, VERSION_VISTA, crearVista, migrarVista,
  codificarVistas, decodificarVistas, configuracionCompartible, motivosCompartir,
  type ConfiguracionCompartida,
} from "../vistas";

describe("guardado de vistas", () => {
  it("crea una vista con la versión actual y solo tokens de color", () => {
    const vista = crearVista({ nombre: "Mi galaxia" }, 1000);
    expect(vista.version).toBe(VERSION_VISTA);
    expect(vista.nombre).toBe("Mi galaxia");
    expect(vista.actualizada).toBe(1000);
    expect(vista.colores.acento).toBe("var(--primary)");
    expect(vista.formas.neurona.color).toMatch(/^var\(--/);
    expect(JSON.stringify(vista)).not.toContain("#");
  });

  it("conserva todas las facetas al guardar y volver a leer", () => {
    const vista = crearVista({ id: "vista-a", nombre: "Aula", ambito: "grupo", grupoId: "g1", capas: ["educativo", "publico"] }, 42);
    const guardado = codificarVistas([vista]);
    const sobre: unknown = JSON.parse(guardado);
    expect((sobre as { version: number }).version).toBe(VERSION_VISTA);
    expect(decodificarVistas(guardado)).toEqual([vista]);
  });

  it("descarta un guardado roto y conserva la última vista por id", () => {
    expect(decodificarVistas("{no es json")).toEqual([]);
    const vieja = crearVista({ id: "vista-a", nombre: "Vieja" }, 1);
    const nueva = crearVista({ id: "vista-a", nombre: "Nueva" }, 2);
    expect(decodificarVistas(codificarVistas([vieja, nueva]))).toEqual([nueva]);
  });
});
describe("migración de versiones", () => {
  it("migra una vista v1 a la versión actual sin perder capas ni física", () => {
    const legado = {
      version: 1, id: "vista-v1", nombre: "Semilla", ambito: "persona",
      plantilla: "educacion", capas: ["educativo"], perspectiva: "yo",
      formas: { neurona: "var(--trinity-azure)" }, color: "var(--accent)",
      gravedad: 1.4, distancia: 12, velocidad: 2, etiquetas: true, sonido: true,
      guardada: 55,
    };
    const vista = migrarVista(legado);
    expect(vista).not.toBeNull();
    expect(vista?.version).toBe(VERSION_VISTA);
    expect(vista?.colores.acento).toBe("var(--accent)");
    expect(vista?.formas.neurona).toEqual({ forma: "planeta", icono: "Sparkles", color: "var(--trinity-azure)" });
    expect(vista?.fisica).toEqual({ gravedad: 1.4, distancia: 12, velocidad: 2 });
    expect(vista?.etiquetas).toEqual({ visible: true, tamano: "normal" });
    expect(vista?.sonidoEspacial).toBe(true);
    expect(vista?.actualizada).toBe(55);
  });

  it("migra una vista sin versión y rechaza una versión futura", () => {
    const vista = migrarVista({ nombre: "Sin versión", colorAcento: "var(--trinity-emerald)" }, 7);
    expect(vista?.version).toBe(VERSION_VISTA);
    expect(vista?.colores.acento).toBe("var(--trinity-emerald)");
    expect(vista?.actualizada).toBe(7);
    expect(migrarVista({ version: VERSION_VISTA + 1 })).toBeNull();
    expect(migrarVista("texto")).toBeNull();
  });
});
describe("compartir con permiso", () => {
  const vista = crearVista({ id: "privada", nombre: "Aula", ambito: "grupo", grupoId: "g1", capas: ["educativo"] }, 9);

  it("exporta solo la configuración, nunca referencias ni contenido privado", () => {
    const config = configuracionCompartible(vista, "edicion");
    expect(config.esquema).toBe(CLAVE_VARIACION_VISTA);
    expect(config.permiso).toBe("edicion");
    const texto = JSON.stringify(config);
    for (const clave of ["id", "dueno", "grupoId", "ref", "contenido", "contenidoPrivado"]) {
      expect(texto).not.toContain(`"${clave}"`);
    }
    expect(motivosCompartir(config)).toEqual([]);
  });

  it("copia las facetas para que el original no cambie al compartir", () => {
    const config = configuracionCompartible(vista, "lectura");
    config.capas.push("publico");
    config.formas.neurona.color = "var(--accent)";
    expect(vista.capas).toEqual(["educativo"]);
    expect(vista.formas.neurona.color).toMatch(/^var\(--/);
  });

  it("rechaza permisos inventados, caminos privados y secretos", () => {
    const config = configuracionCompartible(vista, "lectura");
    expect(motivosCompartir({ ...config, permiso: "admin" as ConfiguracionCompartida["permiso"] })).toContain("Permiso: elige lectura, edición o herencia");
    expect(motivosCompartir({ ...config, nombre: "  " }).length).toBeGreaterThan(0);
    const conId = { ...config, id: "privada" } as ConfiguracionCompartida & { id: string };
    expect(motivosCompartir(conId).some((m) => m.startsWith("Privacidad"))).toBe(true);
    const conSecreto = { ...config, apiKey: "secreto" } as ConfiguracionCompartida & { apiKey: string };
    expect(motivosCompartir(conSecreto).some((m) => m.startsWith("Privacidad"))).toBe(true);
  });
});
