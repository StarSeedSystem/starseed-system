/**
 * Generador del manifiesto de precarga (scripts/precarga-sw.mjs · SW1107A) sobre un `.next` de mentira:
 * páginas sin consolas ni parámetros, chunks iniciales por página, URLs codificadas como las pide el
 * navegador, public/ sin lo del SW, y que nunca rompa un build.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clavesDePagina, codificarRuta, construirManifiesto, principal } from "../../../../scripts/precarga-sw.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = createRequire(import.meta.url)("../../../../public/sw-logica.js");

function escribir(raiz: string, rel: string, contenido: string | Buffer) {
  const p = join(raiz, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, contenido);
}

function proyectoDeMentira(dist = ".next") {
  const raiz = mkdtempSync(join(tmpdir(), "precarga-sw-"));
  const d = (rel: string, c: string | Buffer) => escribir(raiz, join(dist, rel), c);
  d("BUILD_ID", "B9\n");
  d("app-path-routes-manifest.json", JSON.stringify({
    "/page": "/",
    "/(main)/escritorios/page": "/escritorios",
    "/(app)/messages/page": "/messages",
    "/(app)/genesis/page": "/genesis",
    "/(app)/pagina/[slug]/page": "/pagina/[slug]",
    "/api/os/versiones/route": "/api/os/versiones",
    "/auth/callback/route": "/auth/callback",
  }));
  d("prerender-manifest.json", JSON.stringify({ routes: { "/": {}, "/escritorios": {} } }));
  d("app-build-manifest.json", JSON.stringify({ pages: {
    "/layout": ["static/chunks/main-app.js", "static/css/a.css"],
    "/(main)/layout": ["static/chunks/main-layout.js"],
    "/(main)/escritorios/page": ["static/chunks/main-app.js", "static/chunks/esc.js"],
    "/page": ["static/chunks/raiz.js"],
    "/(app)/messages/page": ["static/chunks/msg.js"],
    "/(app)/pagina/[slug]/page": ["static/chunks/app/(app)/pagina/[slug]/page-1.js"],
  } }));
  d("build-manifest.json", JSON.stringify({ rootMainFiles: ["static/chunks/webpack.js", "static/chunks/main-app.js"], polyfillFiles: ["static/chunks/polyfills.js"] }));
  for (const f of ["chunks/webpack.js", "chunks/main-app.js", "chunks/main-layout.js", "chunks/esc.js", "chunks/raiz.js", "chunks/msg.js",
    "chunks/perezoso.js", "chunks/perezoso.js.map", "css/a.css", "chunks/app/(app)/pagina/[slug]/page-1.js", "B9/_buildManifest.js"]) {
    d(join("static", f), `/* ${f} */`);
  }
  d("server/app/escritorios.html", "x".repeat(1000));
  d("server/app/escritorios.rsc", "x".repeat(500));
  d("server/app/index.html", "x".repeat(300));
  d("server/app/index.rsc", "x".repeat(200));
  const p = (rel: string, c: string | Buffer) => escribir(raiz, join("public", rel), c);
  for (const f of ["offline.html", "logo.png", "sw-v8.js", "sw-v7.js", "sw-logica.js", "version.json", "inject.html", "inject-vercel.html", "icons/a b.png"]) p(f, "z");
  p("precarga.json", "{\"viejo\":true}");
  p("grande.bin", Buffer.alloc(2_000_001));
  return raiz;
}

let raiz = "";
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (raiz) rmSync(raiz, { recursive: true, force: true });
  raiz = "";
});

describe("construirManifiesto", () => {
  it("páginas principales sin consolas ni parámetros, con sus chunks iniciales y su peso medido", () => {
    raiz = proyectoDeMentira();
    const { manifiesto: m, resumen } = construirManifiesto({ dist: join(raiz, ".next"), publico: join(raiz, "public"), generado: "fijo" });
    expect(m.buildId).toBe("B9");
    expect(m.generado).toBe("fijo");
    expect(m.rutas.map((r: { r: string }) => r.r)).toEqual(["/", "/escritorios", "/messages"]);
    const url = (i: number) => m.estaticos[i];
    expect(m.comunes.map(url)).toEqual(["/_next/static/chunks/webpack.js", "/_next/static/chunks/main-app.js", "/_next/static/css/a.css"]);
    const esc = m.rutas.find((r: { r: string }) => r.r === "/escritorios");
    expect(esc.e).toBe(1);
    expect(esc.c.map(url)).toEqual(["/_next/static/chunks/main-layout.js", "/_next/static/chunks/esc.js"]);
    expect(esc.b).toBe(1500);
    expect(m.rutas.find((r: { r: string }) => r.r === "/").b).toBe(500);
    expect(m.rutas.find((r: { r: string }) => r.r === "/messages")).toMatchObject({ e: 0, b: L.BYTES_RUTA_POR_DEFECTO });
    expect(resumen).toMatchObject({ buildId: "B9", rutas: 3, rutasEstaticas: 2 });
  });

  it("TODO /_next/static/** (sin .map) con la URL codificada como la pide Next; public/ sin lo del SW, lo generado ni lo enorme", () => {
    raiz = proyectoDeMentira();
    const { manifiesto: m } = construirManifiesto({ dist: join(raiz, ".next"), publico: join(raiz, "public") });
    expect(m.estaticos).toContain("/_next/static/chunks/app/(app)/pagina/%5Bslug%5D/page-1.js");
    expect(m.estaticos).toContain("/_next/static/B9/_buildManifest.js");
    expect(m.estaticos).toContain("/_next/static/chunks/perezoso.js");
    expect(m.estaticos.some((u: string) => u.endsWith(".map"))).toBe(false);
    expect(m.estaticos).toHaveLength(10);
    expect(m.tamanos).toHaveLength(10);
    expect(m.publicos).toEqual(["/icons/a%20b.png", "/logo.png", "/offline.html"]);
    // Lo que escribe el generador lo acepta el SW tal cual.
    const v = L.validarManifiesto(JSON.parse(JSON.stringify(m)));
    expect(v.estaticos).toEqual(m.estaticos);
    expect(v.rutas.map((r: { r: string }) => r.r)).toEqual(["/", "/escritorios", "/messages"]);
  });

  it("claves de una página en el app-build-manifest: layouts, plantillas, cargas y errores de cada nivel", () => {
    const k = clavesDePagina("/(main)/escritorios/page");
    for (const c of ["/layout", "/(main)/layout", "/(main)/loading", "/(main)/escritorios/layout", "/(main)/escritorios/page"]) expect(k).toContain(c);
    expect(codificarRuta("chunks/app/(app)/x/[...ruta]/page.js")).toBe("chunks/app/(app)/x/%5B...ruta%5D/page.js");
  });
});

describe("principal (postbuild)", () => {
  it("escribe public/precarga.json y sale con 0", () => {
    raiz = proyectoDeMentira();
    expect(principal([], {}, raiz)).toBe(0);
    const m = JSON.parse(readFileSync(join(raiz, "public", "precarga.json"), "utf-8"));
    expect(m.buildId).toBe("B9");
    expect(m.formato).toBe(L.FORMATO_MANIFIESTO);
  });

  it("respeta STARSEED_DIST (el build en otra carpeta de la Mac) y --dist", () => {
    raiz = proyectoDeMentira(".next-build");
    expect(principal([], { STARSEED_DIST: ".next-build" }, raiz)).toBe(0);
    expect(JSON.parse(readFileSync(join(raiz, "public", "precarga.json"), "utf-8")).buildId).toBe("B9");
    expect(principal(["--dist", ".next-build"], {}, raiz)).toBe(0);
  });

  it("si falla NO rompe el build: avisa, borra el manifiesto viejo (sería de otra build) y sale con 0 (1 con --estricto)", () => {
    raiz = proyectoDeMentira();
    expect(principal(["--dist", "no-existe"], {}, raiz)).toBe(0);
    expect(existsSync(join(raiz, "public", "precarga.json"))).toBe(false);
    expect(principal(["--dist", "no-existe", "--estricto"], { GITHUB_ACTIONS: "true" }, raiz)).toBe(1);
  });
});
