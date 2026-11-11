import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FASE_ACTUAL,
  FUNCIONES,
  IDS_PERMISO,
  ORDEN_GRUPOS,
  accionDe,
  defDe,
  necesitaPara,
  normalizarEstados,
  registroDe,
  sistemaDePermisos,
  textoEstado,
  type IdFuncion,
  type SistemaPermisos,
} from "../permisos-registro";

const SISTEMAS: SistemaPermisos[] = ["macos", "android", "windows", "linux-x11", "linux-wayland"];

describe("registro único (PER1111S)", () => {
  it("cada sistema lista sus permisos agrupados, sin repetir y en el orden de los grupos", () => {
    for (const s of SISTEMAS) {
      const r = registroDe(s);
      expect(new Set(r.map((d) => d.id)).size, s).toBe(r.length);
      const grupos = r.map((d) => ORDEN_GRUPOS.indexOf(d.grupo));
      expect([...grupos].sort((a, b) => a - b), s).toEqual(grupos);
    }
  });
  it("macOS incluye Accesibilidad y Grabación de pantalla, con aviso del sistema y luego Ajustes, y se pueden leer", () => {
    for (const id of ["accesibilidad", "pantalla"] as const) {
      const d = defDe("macos", id)!;
      expect(d.como).toBe("aviso-y-panel");
      expect(d.lectura).toBe("si");
      expect(d.fase).toBe(FASE_ACTUAL);
    }
  });
  it("lo que macOS no deja leer está dicho (red local, automatización, acceso total al disco)", () => {
    expect(defDe("macos", "red-local")!.lectura).toBe("parcial");
    expect(defDe("macos", "automatizacion")!.lectura).toBe("no");
    expect(defDe("macos", "disco-completo")!.lectura).toBe("no");
  });
  it("Android: pantalla por uso (MediaProjection) y los accesos especiales en su fase", () => {
    expect(defDe("android", "pantalla")!.como).toBe("por-uso");
    expect(defDe("android", "accesibilidad")!.fase).toBeGreaterThan(FASE_ACTUAL);
    expect(defDe("android", "accesibilidad")!.nota).toMatch(/restringidos/);
  });
  it("Wayland pregunta la pantalla al usarla; X11 no pide nada", () => {
    expect(defDe("linux-wayland", "pantalla")!.como).toBe("por-uso");
    expect(defDe("linux-x11", "pantalla")!.como).toBe("nada");
  });
  it("sistema por plataforma y sesión", () => {
    expect(sistemaDePermisos("darwin")).toBe("macos");
    expect(sistemaDePermisos("linux", "WAYLAND")).toBe("linux-wayland");
    expect(sistemaDePermisos("freebsd")).toBeNull();
  });
  it("todas las funciones que nombra un permiso existen en la tabla de funciones", () => {
    for (const s of SISTEMAS) for (const d of registroDe(s)) for (const f of d.funciones) expect(FUNCIONES[f], `${d.id} → ${f}`).toBeDefined();
  });
});

describe("acción por estado", () => {
  const pantalla = defDe("macos", "pantalla")!;
  it("concedido o no aplica: listo; fase futura: más adelante", () => {
    expect(accionDe(pantalla, "concedido")).toBe("listo");
    expect(accionDe(pantalla, "no-aplica")).toBe("listo");
    expect(accionDe(defDe("android", "superposicion")!, undefined)).toBe("mas-adelante");
  });
  it("aviso del sistema la primera vez; Ajustes después o si se negó", () => {
    expect(accionDe(pantalla, "no-concedido")).toBe("pedir");
    expect(accionDe(pantalla, "no-concedido", true)).toBe("abrir-ajustes");
    expect(accionDe(defDe("macos", "camara")!, "denegado")).toBe("abrir-ajustes");
    expect(accionDe(defDe("macos", "camara")!, "sin-preguntar")).toBe("pedir");
  });
  it("por uso y nada: no se pide", () => {
    expect(accionDe(defDe("windows", "microfono")!, undefined)).toBe("por-uso");
    expect(accionDe(defDe("windows", "pantalla")!, undefined)).toBe("nada");
  });
  it("el texto de estado nunca inventa: lo que no se lee lo dice", () => {
    const red = defDe("windows", "red-local")!;
    expect(textoEstado(red, undefined, "por-uso")).toMatch(/al usarlo/);
    const disco = { ...defDe("macos", "disco-completo")!, fase: 1 };
    expect(textoEstado(disco, undefined, "abrir-ajustes")).toMatch(/no deja saber/);
    expect(textoEstado(pantalla, undefined, "pedir")).toBe("Sin dato todavía");
    expect(textoEstado(pantalla, "concedido", "listo")).toBe("Concedido");
  });
});

describe("necesitaPara: «¿tengo lo que necesito y, si no, qué pido?»", () => {
  it("prestar una ventana en macOS pide Grabación de pantalla y Accesibilidad", () => {
    const n = necesitaPara("prestar-ventana", "macos", { "red-local": "concedido" });
    expect(n.construida).toBe(true);
    expect(n.listo).toBe(false);
    expect(n.faltan.map((f) => f.id).sort()).toEqual(["accesibilidad", "pantalla"]);
    expect(n.faltan.every((f) => f.accion === "pedir")).toBe(true);
    const ok = necesitaPara("prestar-ventana", "macos", { "red-local": "concedido", pantalla: "concedido", accesibilidad: "concedido" });
    expect(ok.listo).toBe(true);
  });
  it("tras el aviso, lo que falta se abre en Ajustes", () => {
    const n = necesitaPara("prestar-ventana", "macos", {}, ["pantalla"]);
    expect(n.faltan.find((f) => f.id === "pantalla")!.accion).toBe("abrir-ajustes");
  });
  it("en X11 no falta nada para la pantalla; en Wayland se pregunta al usarla", () => {
    expect(necesitaPara("compartir-pantalla", "linux-x11", {}).faltan).toEqual([]);
    expect(necesitaPara("compartir-pantalla", "linux-wayland", {}).porUso).toContain("pantalla");
  });
  it("una función que aún no existe nunca dice «listo»", () => {
    const n = necesitaPara("control-entre-neuronas", "windows", {});
    expect(n.construida).toBe(false);
    expect(n.listo).toBe(false);
  });
  it("cada función tiene al menos un permiso en macOS o Android (la tabla no tiene huecos)", () => {
    for (const f of Object.keys(FUNCIONES) as IdFuncion[]) {
      const usa = [...registroDe("macos"), ...registroDe("android")].some((d) => d.funciones.includes(f));
      expect(usa, f).toBe(true);
    }
  });
});

describe("contrato con la app nativa", () => {
  const rs = readFileSync(join(process.cwd(), "native/src-tauri/src/permisos_sistema.rs"), "utf8");
  it("los estados que devuelve Rust son los que entiende el registro", () => {
    const estados = rs.match(/pub const ESTADOS: \[&str; \d+\] = \[([^\]]*)\]/)![1].match(/"([a-z-]+)"/g)!.map((x) => x.replace(/"/g, ""));
    const n = normalizarEstados(Object.fromEntries(estados.map((e) => ["pantalla", e])));
    expect(n.pantalla).toBe(estados[estados.length - 1]);
    for (const e of estados) expect(normalizarEstados({ camara: e }).camara).toBe(e);
    expect(normalizarEstados({ camara: "raro", nada: "concedido" })).toEqual({});
  });
  it("todo id con pantalla de Ajustes en Rust es un permiso del registro", () => {
    const idsRs = [...rs.matchAll(/\("(?:macos|windows)", "([a-z-]+)"\) =>/g)].map((m) => m[1]);
    expect(idsRs.length).toBeGreaterThan(10);
    for (const id of idsRs) expect(IDS_PERMISO, id).toContain(id);
  });
  it("nada de la app se autoconcede: ni TCC.db, ni tccutil, ni pm grant, ni clics por guion", () => {
    const fuentes = [
      rs,
      readFileSync(join(process.cwd(), "src/lib/nativa/permisos-inicio-ejecutor.ts"), "utf8"),
      readFileSync(join(process.cwd(), "native/src-tauri/android/ArranqueStarSeed.kt"), "utf8"),
    ].join("\n");
    // Se quitan los comentarios que explican la regla antes de buscar.
    const codigo = fuentes.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const prohibido of [/TCC\.db/i, /tccutil/, /pm grant/, /appops set/, /System Events/, /osascript/]) expect(codigo).not.toMatch(prohibido);
  });
});
