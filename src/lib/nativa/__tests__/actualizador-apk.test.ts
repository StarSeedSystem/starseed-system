/**
 * (ACT1108A) Actualizador interno del APK: el estado que cuenta la app, el texto para la persona, el
 * bucle de progreso (con un puente falso) y el contrato con Rust (campos, comandos y permisos).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actualizarApkEnApp,
  COMANDOS_APK,
  esFinal,
  instalarApkDescargado,
  leerEstadoApk,
  normalizarEstadoApk,
  porcentajeApk,
  textoEstadoApk,
  type EstadoApkNativo,
} from "../actualizador-apk";
import { crearPuente } from "../puente";

const e = (fase: string, extra: Partial<EstadoApkNativo> = {}): EstadoApkNativo => ({ fase, t: 1, ...extra });

describe("estado del actualizador interno", () => {
  it("sanea lo que llega de la app", () => {
    expect(normalizarEstadoApk({ fase: "descargando", version: " 0.5.1-prueba.4 ", descargado: 5, total: 10, otro: 1, t: 3 })).toEqual({
      fase: "descargando",
      version: "0.5.1-prueba.4",
      version_code: null,
      instalada: null,
      descargado: 5,
      total: 10,
      mensaje: null,
      canal: null,
      notas: null,
      t: 3,
    });
    expect(normalizarEstadoApk({ fase: "inventada" })).toBeNull();
    expect(normalizarEstadoApk(null)).toBeNull();
    expect(normalizarEstadoApk([])).toBeNull();
  });

  it("textos honestos: Android siempre pide confirmar; misma firma, mismos datos", () => {
    expect(porcentajeApk(e("descargando", { descargado: 25, total: 100 }))).toBe(25);
    expect(porcentajeApk(e("descargando", { descargado: 25 }))).toBeNull();
    expect(textoEstadoApk(e("descargando", { version: "0.5.1-prueba.4", descargado: 50, total: 100 }))).toBe("Descargando la versión 0.5.1-prueba.4 dentro de la app · 50 %");
    expect(textoEstadoApk(e("instalador"))).toMatch(/pulsa «Instalar».*misma firma.*tus datos/);
    expect(textoEstadoApk(e("lista", { version: "0.5.1-prueba.4" }))).toMatch(/Android te pedirá confirmar/);
    expect(textoEstadoApk(e("permiso"))).toMatch(/Instalar apps desconocidas/);
    expect(textoEstadoApk(e("error", { mensaje: "El SHA-256 del APK no casa" }))).toBe("El SHA-256 del APK no casa");
  });

  it("cuándo se deja de mirar", () => {
    for (const f of ["al-dia", "error", "sin-actualizador", "instalador", "instalada"]) expect(esFinal(e(f), true), f).toBe(true);
    expect(esFinal(e("lista"), true)).toBe(false);
    expect(esFinal(e("lista"), false)).toBe(true);
    expect(esFinal(e("descargando"), true)).toBe(false);
    expect(esFinal(e("permiso"), true)).toBe(false);
  });
});

/** Un puente de Tauri falso: `apk_estado` devuelve, uno a uno, los estados de la lista. */
function puenteFalso(estados: unknown[], pedido: unknown = { fase: "buscando", t: 0 }, fallo?: string) {
  const llamadas: Array<[string, unknown]> = [];
  let i = 0;
  const invoke = async (cmd: string, args?: Record<string, unknown>) => {
    llamadas.push([cmd, args]);
    if (cmd === COMANDOS_APK.actualizar) {
      if (fallo) throw fallo;
      return pedido;
    }
    if (cmd === COMANDOS_APK.estado) return estados[Math.min(i++, estados.length - 1)];
    if (cmd === COMANDOS_APK.instalar) return estados[estados.length - 1];
    throw "Command not found";
  };
  return { puente: crearPuente({ core: { invoke } }), llamadas };
}

const reloj = () => {
  let t = 0;
  return { esperar: async (ms: number) => void (t += ms), ahora: () => t };
};

describe("actualizarApkEnApp", () => {
  it("busca, descarga, verifica y abre el instalador; cuenta cada paso", async () => {
    const { puente, llamadas } = puenteFalso([
      { fase: "buscando", t: 1 },
      { fase: "descargando", descargado: 10, total: 100, t: 2 },
      { fase: "descargando", descargado: 100, total: 100, t: 3 },
      { fase: "lista", version: "0.5.1-prueba.4", t: 4 },
      { fase: "instalador", version: "0.5.1-prueba.4", t: 5 },
    ]);
    const vistos: string[] = [];
    const r = await actualizarApkEnApp({ puente, onEstado: (x) => vistos.push(x.fase), ...reloj() });
    expect(r).toMatchObject({ estado: "ok", final: { fase: "instalador" } });
    expect(llamadas[0]).toEqual([COMANDOS_APK.actualizar, { instalar: true }]);
    // El primer «buscando» es el que devuelve Rust al pedir; el segundo, el que escribe Kotlin.
    expect(vistos).toEqual(["buscando", "buscando", "descargando", "descargando", "lista", "instalador"]);
  });

  it("APK anterior (sin el comando) → «sin-actualizador»: la web ofrece el .apk", async () => {
    const { puente } = puenteFalso([], undefined, "Command apk_actualizar not found");
    expect((await actualizarApkEnApp({ puente, ...reloj() })).estado).toBe("sin-actualizador");
    const { puente: p2 } = puenteFalso([], undefined, "Este APK no trae el actualizador interno (llegó con ACT1108A): descarga el .apk desde la Librería.");
    expect((await actualizarApkEnApp({ puente: p2, ...reloj() })).estado).toBe("sin-actualizador");
    expect((await actualizarApkEnApp({ puente: crearPuente(null) })).estado).toBe("sin-actualizador");
  });

  it("una descarga que no avanza se deja de mirar con un motivo", async () => {
    const { puente } = puenteFalso([{ fase: "descargando", descargado: 10, total: 100, t: 2 }]);
    const r = await actualizarApkEnApp({ puente, quietoMs: 5_000, ...reloj() });
    expect(r).toMatchObject({ estado: "error", motivo: expect.stringMatching(/no avanza/) });
  });

  it("«permiso»: se sigue mirando hasta que vuelve con el permiso y se abre el instalador", async () => {
    const { puente } = puenteFalso([{ fase: "permiso", t: 2 }, { fase: "permiso", t: 2 }, { fase: "instalador", t: 3 }]);
    const r = await actualizarApkEnApp({ puente, ...reloj() });
    expect(r).toMatchObject({ estado: "ok", final: { fase: "instalador" } });
  });

  it("solo buscar (instalar: false) termina en «lista»; leer e instalar después", async () => {
    const { puente, llamadas } = puenteFalso([{ fase: "lista", version: "0.5.1-prueba.4", t: 2 }]);
    const r = await actualizarApkEnApp({ puente, instalar: false, ...reloj() });
    expect(r).toMatchObject({ estado: "ok", final: { fase: "lista" } });
    expect(llamadas[0]).toEqual([COMANDOS_APK.actualizar, { instalar: false }]);
    expect(await leerEstadoApk(puente)).toMatchObject({ fase: "lista" });
    expect(await instalarApkDescargado(puente)).toEqual({ ok: true });
    expect(await leerEstadoApk(crearPuente(null))).toBeNull();
    const { puente: sin } = puenteFalso([{ fase: "sin-actualizador", t: 0 }]);
    expect(await leerEstadoApk(sin)).toBeNull();
  });
});

describe("contrato con Rust (canal_actualizacion.rs / canal_actualizacion_logica.rs)", () => {
  const raiz = process.cwd();
  const leer = (f: string) => readFileSync(join(raiz, f), "utf8");
  const camposRust = (fuente: string, struct: string) => {
    const m = fuente.match(new RegExp(`pub struct ${struct} \\{([\\s\\S]*?)\\n\\}`))!;
    return [...m[1].matchAll(/^\s*pub (\w+):/gm)].map((x) => x[1]).sort();
  };
  const camposTs = (fuente: string, iface: string) => {
    const m = fuente.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`))!;
    return [...m[1].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]).sort();
  };

  it("los campos del estado son los mismos a los dos lados", () => {
    expect(camposTs(leer("src/lib/nativa/actualizador-apk.ts"), "EstadoApkNativo")).toEqual(
      camposRust(leer("native/src-tauri/src/canal_actualizacion_logica.rs"), "EstadoApk"),
    );
  });

  it("los tres comandos: en Rust, registrados, en el manifiesto de la app y con permiso para la web", () => {
    const glue = leer("native/src-tauri/src/canal_actualizacion.rs");
    const lib = leer("native/src-tauri/src/lib.rs");
    const build = leer("native/src-tauri/build.rs");
    const def = JSON.parse(leer("native/src-tauri/capabilities/default.json")) as { permissions: unknown[] };
    for (const c of Object.values(COMANDOS_APK)) {
      expect(glue).toMatch(new RegExp(`#\\[tauri::command\\]\\s*pub fn ${c}\\(`));
      expect(lib).toContain(`canal_actualizacion::${c},`);
      expect(build).toContain(`"${c}",`);
      expect(def.permissions).toContain(`allow-${c.replace(/_/g, "-")}`);
    }
  });
});
