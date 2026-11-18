/**
 * (FAC1116) Enlaces directos a los permisos: la tabla cubre CADA permiso de CADA sistema, lo que dice abrir lo abre de
 * verdad el nativo (Rust), donde no hay enlace se dice, y el documento no se separa de la tabla.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENLACES_CONTROL, enlaceDe, filasDe, hayBoton, textoEnlace } from "../permisos-enlaces";
import { registroDe, type SistemaPermisos } from "../permisos-registro";
import { panelAndroid } from "../permisos-inicio-ejecutor";
import { AJUSTES_QUE_FALTAN } from "@/lib/control-remoto/nativo";

const SISTEMAS: SistemaPermisos[] = ["macos", "android", "windows", "linux-x11", "linux-wayland"];
const raiz = join(__dirname, "../../../..");
const rust = readFileSync(join(raiz, "native/src-tauri/src/permisos_sistema.rs"), "utf8");
const doc = readFileSync(join(raiz, "architecture/permisos-enlaces-directos.md"), "utf8");

describe("tabla de enlaces directos", () => {
  it("cada permiso de cada sistema tiene su fila, con pantalla y qué pulsar", () => {
    for (const s of SISTEMAS) {
      for (const def of registroDe(s)) {
        const e = enlaceDe(s, def.id);
        expect(e, `${s}/${def.id}`).not.toBeNull();
        expect(e!.pulsa.length, `${s}/${def.id}`).toBeGreaterThan(10);
      }
      // y no hay filas de más que el registro no conozca
      const ids = new Set(registroDe(s).map((x) => x.id));
      for (const [id] of filasDe(s)) expect(ids.has(id), `${s}/${id} sobra`).toBe(true);
    }
  });

  it("lo que promete abrir (directo, lista, ficha) tiene pantalla en el nativo de ese sistema", () => {
    for (const s of ["macos", "windows"] as const) {
      const so = s;
      for (const [id, e] of filasDe(s)) {
        if (!hayBoton(e)) continue;
        expect(rust.includes(`("${so}", "${id}")`), `${s}/${id} promete abrir y Rust no sabe`).toBe(true);
      }
    }
    const lista = /pub const PANELES_ANDROID: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(rust)![1];
    const paneles = new Set([...lista.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
    for (const [id, e] of filasDe("android")) {
      if (!hayBoton(e)) continue;
      expect(paneles.has(panelAndroid(id)) || id === "instalar" || id === "llamadas", `android/${id}`).toBe(true);
    }
    expect(paneles.has("ajustes-restringidos")).toBe(true);
  });

  it("donde Windows y Linux no dejan abrir nada, la lista no abre otra cosa: lo dice", () => {
    expect(enlaceDe("windows", "red-local")!.nivel).toBe("sin-enlace");
    expect(hayBoton(enlaceDe("windows", "red-local"))).toBe(false);
    for (const s of ["linux-x11", "linux-wayland"] as const) {
      for (const [id, e] of filasDe(s)) expect(hayBoton(e), `${s}/${id}`).toBe(false);
      expect(textoEnlace(enlaceDe(s, "microfono"))).toMatch(/No hay enlace directo/);
    }
    expect(textoEnlace(enlaceDe("windows", "red-local"))).toMatch(/No hay enlace directo en este sistema/);
  });

  it("Android: accesibilidad es lista (no se promete el interruptor) y avisa de los ajustes restringidos", () => {
    const a = enlaceDe("android", "accesibilidad")!;
    expect(a.nivel).toBe("lista");
    expect(a.pulsa).toMatch(/Permitir ajustes restringidos/);
    expect(enlaceDe("android", "microfono")!.nivel).toBe("ficha");
    expect(enlaceDe("android", "superposicion")!.nivel).toBe("directo");
    expect(enlaceDe("android", "pantalla")!.nivel).toBe("aviso");
  });

  it("nada promete conceder: ningún texto dice «se concede» o «automático»", () => {
    for (const s of SISTEMAS) for (const [, e] of filasDe(s)) expect(`${e.pantalla} ${e.pulsa}`).not.toMatch(/se concede|autom[áa]tic|sin que lo pulses/i);
  });

  it("cada cosa que le falta al control remoto tiene sus pasos", () => {
    for (const f of AJUSTES_QUE_FALTAN.filter((x): x is keyof typeof ENLACES_CONTROL => x in ENLACES_CONTROL)) expect(ENLACES_CONTROL[f].pulsa.length, f).toBeGreaterThan(20);
    expect(ENLACES_CONTROL["ajustes-restringidos"].pulsa).toMatch(/⋮/);
  });

  it("el documento tiene una fila por cada permiso y sistema de la tabla", () => {
    for (const s of SISTEMAS) {
      for (const [id] of filasDe(s)) expect(doc.includes(`\`${s}/${id}\``), `doc sin ${s}/${id}`).toBe(true);
    }
  });
});
