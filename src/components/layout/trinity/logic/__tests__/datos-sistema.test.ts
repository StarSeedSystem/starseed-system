/**
 * Los destinos de «Sistema» y los accesos del Centro de Control tienen que existir DE VERDAD.
 * Hasta la Ola 1025U cuatro de seis entradas apuntaban a rutas inexistentes (`/settings/privacy`,
 * `/settings/storage`, `/settings/system`, `/settings/appearance`): esta prueba recorre `src/app` y
 * falla si una ruta (o un ancla de /cuenta) deja de existir.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPOS_SISTEMA, RUTAS_EXTRA_CONTROL, rutasDelSistema } from "../datos-sistema";

const RAIZ_APP = join(process.cwd(), "src", "app");

function paginas(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) paginas(ruta, acc);
    else if (nombre === "page.tsx" || nombre === "page.ts") acc.push(ruta);
  }
  return acc;
}

/** `src/app/(app)/cuenta/page.tsx` → `/cuenta` (los grupos entre paréntesis no cuentan). */
function rutaDeLaPagina(archivo: string): string {
  const partes = relative(RAIZ_APP, archivo).split(sep).slice(0, -1).filter((p) => !/^\(.*\)$/.test(p));
  return "/" + partes.join("/");
}

const RUTAS_REALES = new Set(paginas(RAIZ_APP).map(rutaDeLaPagina));

function sinConsulta(href: string): string {
  return href.split(/[?#]/)[0] || "/";
}

describe("Centro de Control · destinos de Sistema", () => {
  it("hay dos grupos con entradas únicas y con texto", () => {
    expect(GRUPOS_SISTEMA.map((g) => g.titulo)).toEqual(["Tu cuenta", "Este aparato"]);
    const ids = GRUPOS_SISTEMA.flatMap((g) => g.entradas.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of GRUPOS_SISTEMA.flatMap((g) => g.entradas)) {
      expect(e.rotulo.length).toBeGreaterThan(2);
      expect(e.sub.length).toBeGreaterThan(5);
    }
  });

  it("cada entrada de Sistema apunta a una página que existe en src/app", () => {
    for (const href of rutasDelSistema()) {
      expect(RUTAS_REALES.has(sinConsulta(href)), `${href} no existe en src/app`).toBe(true);
    }
  });

  it("los demás accesos del Centro de Control también existen", () => {
    for (const href of RUTAS_EXTRA_CONTROL) {
      expect(RUTAS_REALES.has(sinConsulta(href)), `${href} no existe en src/app`).toBe(true);
    }
  });

  it("ya no queda ninguna de las cuatro rutas que daban 404", () => {
    const antiguas = ["/settings/privacy", "/settings/storage", "/settings/system", "/settings/appearance"];
    const todas = [...rutasDelSistema(), ...RUTAS_EXTRA_CONTROL] as string[];
    for (const a of antiguas) expect(todas).not.toContain(a);
  });

  it("los ?section= de /cuenta son anclas reales de esa página", () => {
    const fuente = readFileSync(join(RAIZ_APP, "(app)", "cuenta", "page.tsx"), "utf8");
    const secciones = [...rutasDelSistema(), ...RUTAS_EXTRA_CONTROL]
      .map((h) => /[?&]section=([\w-]+)/.exec(h)?.[1])
      .filter((s): s is string => Boolean(s));
    expect(secciones.length).toBeGreaterThanOrEqual(4);
    for (const s of secciones) expect(fuente, `/cuenta no tiene id="${s}"`).toContain(`id="${s}"`);
  });
});
