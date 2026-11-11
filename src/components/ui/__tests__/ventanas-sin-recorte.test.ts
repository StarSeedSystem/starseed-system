/**
 * VEN1111D — ninguna ventana del OS puede recortarse en pantallas pequeñas.
 * Guardia barata: las primitivas conservan sus límites de tamaño y toda
 * ventana hecha a mano (capa `fixed inset-0` + `role="dialog"`) declara un
 * límite de alto con scroll interior.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Capas que ocupan el viewport entero (no pueden excederlo) o cuyo tamaño lo fija quien las usa. */
const EXENTAS = new Set([
  path.join("components", "aurora", "chat-header-options.tsx"), // su menú ya limita a 92dvh
  path.join("components", "exocortex", "aurora-chat-fullscreen.tsx"), // pantalla completa
  path.join("components", "layout", "trinity", "panel-cortina.tsx"), // panel lateral a pantalla completa
]);
const RAIZ = path.resolve(process.cwd(), "src");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

function archivos(dir: string, salida: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      archivos(p, salida);
    } else if (p.endsWith(".tsx")) salida.push(p);
  }
  return salida;
}

describe("primitivas de ventana con límites", () => {
  it.each([
    ["components/ui/dialog.tsx", "ss-ventana-limite"],
    ["components/ui/alert-dialog.tsx", "ss-ventana-limite"],
    ["components/ui/sheet.tsx", "ss-ventana-limite"],
    ["components/nativa/lista-permisos.tsx", "ss-ventana-limite"], // PER1111S: la ventana vive aquí; asistente-permisos.tsx solo la monta
    ["components/ui/popover.tsx", "available-height"],
    ["components/ui/dropdown-menu.tsx", "available-height"],
    ["components/ui/select.tsx", "available-height"],
  ])("%s declara su límite (%s)", (archivo, ficha) => {
    expect(leer(archivo)).toContain(ficha);
  });

  it("globals.css define las clases de límite", () => {
    const css = leer("app/globals.css");
    for (const c of [".ss-ventana-limite", ".ss-capa-modal", ".ss-dialogo-pie"]) expect(css).toContain(c);
    expect(css).toContain("100dvh");
    expect(css).toContain("safe-area-inset-bottom");
  });

  it("las pestañas pasan a varias filas si no caben", () => {
    expect(leer("components/ui/tabs.tsx")).toContain("flex-wrap");
  });
});

describe("ventanas hechas a mano", () => {
  it("toda capa fixed inset-0 con role=dialog limita su alto", () => {
    const sinLimite: string[] = [];
    for (const f of archivos(RAIZ)) {
      const rel = path.relative(RAIZ, f);
      // Otro agente trabaja en llamadas: no se audita aquí.
      if (rel.startsWith(path.join("components", "llamadas")) || rel.startsWith(path.join("lib", "llamadas"))) continue;
      if (EXENTAS.has(rel)) continue;
      const s = fs.readFileSync(f, "utf8");
      if (!/fixed inset-0/.test(s) || !/role=["{]\s*["']?dialog/.test(s)) continue;
      if (!/ss-ventana-limite|ss-capa-modal|max-h-|dvh|overflow-y/.test(s)) sinLimite.push(rel);
    }
    expect(sinLimite).toEqual([]);
  });
});
