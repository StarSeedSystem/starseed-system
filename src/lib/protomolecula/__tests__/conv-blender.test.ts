import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { limpiarConversores, registrarConversor, rutaDeConversion } from "../convertidores";
import {
  COSTO_BLENDER,
  NOMBRE_BLENDER,
  ejecutarRutaConBlender,
  esPasoBlender,
  registrarConversoresBlender,
  trabajoDeConversion,
} from "../conv-blender";
import { validarTrabajo, type Trabajo3D } from "@/lib/blender3d/trabajo";

const bytesDe = (texto: string) => new TextEncoder().encode(texto);
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x01, 0x02, 0x03]);

afterEach(() => limpiarConversores());

describe("Blender en el grafo de conversores de la Protomolécula", () => {
  it("con Blender disponible registra 6 pasos hacia glb y el grafo los usa", () => {
    expect(registrarConversoresBlender(true)).toBe(6);
    const ruta = rutaDeConversion("obj", "glb")!;
    expect(ruta.pasos.map((p) => p.nombre)).toEqual([NOMBRE_BLENDER]);
    expect(ruta.pasos.map((p) => p.via)).toEqual(["servicio"]);
    expect(ruta.pasos.map((p) => p.costo)).toEqual([COSTO_BLENDER]);
    expect(ruta.costo).toBe(COSTO_BLENDER);
    for (const de of ["fbx", "stl", "ply", "gltf", "svg"]) {
      const r = rutaDeConversion(de, "glb")!;
      expect(r.pasos.map((p) => p.nombre)).toEqual([NOMBRE_BLENDER]);
      expect(esPasoBlender(r.pasos[0])).toBe(true);
    }
  });

  it("sin Blender no registra nada y el grafo queda como hoy", () => {
    expect(registrarConversoresBlender(false)).toBe(0);
    for (const de of ["obj", "fbx", "stl", "ply", "gltf", "svg"]) {
      expect(rutaDeConversion(de, "glb")).toBeNull();
    }
    expect(esPasoBlender({ de: "obj", a: "glb", via: "servicio", costo: 5, nombre: "Filee" })).toBe(false);
    expect(esPasoBlender({ de: "obj", a: "glb", via: "js", costo: 1, nombre: NOMBRE_BLENDER })).toBe(false);
  });
});

describe("el trabajo 3D de conversión es un dato de la lista blanca", () => {
  it("el trabajo armado valida: importar del archivo + exportar_glb con +Y arriba", () => {
    const trabajo = trabajoDeConversion("obj", "modelo.obj");
    expect(trabajo.origen).toBe("protomolecula");
    expect(trabajo.quien).toBe("persona");
    expect(trabajo.ambito).toBe("personal");
    expect(trabajo.escena).toEqual([{ op: "importar", archivo: "modelo.obj", nombre: "modelo" }]);
    expect(trabajo.salidas).toEqual([{ tipo: "exportar_glb", y_arriba: true }]);
    const verificado = validarTrabajo(trabajo);
    expect(verificado.ok).toBe(true);
  });

  it("un archivo .blend o con .. se rechaza (concatenación de código libre, nunca)", async () => {
    expect(validarTrabajo(trabajoDeConversion("obj", "sombra.blend")).ok).toBe(false);
    expect(validarTrabajo(trabajoDeConversion("obj", "a/b/../c.obj")).ok).toBe(false);
    registrarConversoresBlender(true);
    const ruta = rutaDeConversion("obj", "glb")!;
    const r = await ejecutarRutaConBlender(ruta, bytesDe("OBJ"), async () => ({}), "../../etc.obj");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("lista blanca");
  });
});

describe("ejecutarRutaConBlender con el servicio inyectado", () => {
  it("la ruta obj → glb se ejecuta y devuelve los bytes", async () => {
    registrarConversoresBlender(true);
    const ruta = rutaDeConversion("obj", "glb")!;
    const llamadas: string[] = [];
    const servicio = async (trabajo: Trabajo3D, entradas: Record<string, Uint8Array>) => {
      llamadas.push(`${trabajo.escena[0]?.op}:${Object.keys(entradas).join(",")}`);
      expect(validarTrabajo(trabajo).ok).toBe(true);
      expect(Object.keys(entradas)).toEqual(["modelo.obj"]);
      expect(new TextDecoder().decode(entradas["modelo.obj"])).toBe("OBJ");
      return { glb: GLB };
    };
    const r = await ejecutarRutaConBlender(ruta, bytesDe("OBJ"), servicio);
    expect(llamadas).toEqual(["importar:modelo.obj"]);
    expect(r).toEqual({ ok: true, salida: GLB });
  });

  it("mezcla un paso JS barato antes del paso de Blender", async () => {
    registrarConversor({
      de: "md",
      a: "obj",
      via: "js",
      costo: 1,
      nombre: "md-obj",
      convertir: (x) => (typeof x === "string" ? x : new TextDecoder().decode(x)).replace(/#/g, ""),
    });
    registrarConversoresBlender(true);
    const ruta = rutaDeConversion("md", "glb")!;
    expect(ruta.pasos.map((p) => p.nombre)).toEqual(["md-obj", NOMBRE_BLENDER]);
    const r = await ejecutarRutaConBlender(ruta, bytesDe("#hola"), async (_trabajo, entradas) => {
      expect(new TextDecoder().decode(entradas["modelo.obj"])).toBe("hola");
      return { glb: GLB };
    });
    expect(r).toEqual({ ok: true, salida: GLB });
  });

  it("un paso de servicio ajeno sin convertir no está conectado y no se finge", async () => {
    const ruta = { pasos: [{ de: "obj", a: "glb", via: "servicio" as const, costo: 9, nombre: "GrifoAjeno" }], costo: 9 };
    const r = await ejecutarRutaConBlender(ruta, bytesDe("OBJ"), async () => ({ glb: GLB }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no está conectado todavía/);
  });

  it("un servicio que lanza da {ok:false} con el paso", async () => {
    registrarConversoresBlender(true);
    const ruta = rutaDeConversion("obj", "glb")!;
    const r = await ejecutarRutaConBlender(ruta, bytesDe("OBJ"), async () => {
      throw new Error("Blender no está instalado en esta neurona.");
    });
    expect(r).toEqual({ ok: false, motivo: "El paso «Blender» (obj → glb) falló: Blender no está instalado en esta neurona." });
  });
});

describe("pureza del módulo", () => {
  it("conv-blender.ts no contiene node:* ni importa procesos", () => {
    const src = readFileSync(join(__dirname, "..", "conv-blender.ts"), "utf8");
    expect(src).not.toMatch(/node:/);
    expect(src).not.toMatch(/child_process|execFile|spawn/);
  });
});
