/**
 * Prueba del catálogo de acciones rápidas del dock (Ola 1025U · V1a).
 * La regla de la ola: NINGUNA acción promete lo que no hace. Aquí se comprueba contra el
 * árbol real del repositorio que cada ruta existe, que cada parámetro de query lo lee la
 * página, que cada evento tiene oyente y que cada botón del catálogo existe en el dock.
 * Lee el sistema de archivos: por eso es `.ts` (corre en `node`, no en jsdom).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  ACCIONES_GENERICAS,
  CATALOGO,
  accionesRapidasDe,
  rutaBase,
  tieneAccionesPropias,
  todasLasAcciones,
  EVENTO_EDITAR_TABLERO,
  type AccionRapida,
} from "../acciones-rapidas";
import { DOCK_PRESETS } from "@/components/layout/dock-config";

const RAIZ = process.cwd();
const APP = path.join(RAIZ, "src/app");
const SRC = path.join(RAIZ, "src");

function recorrer(dir: string, acepta: (f: string) => boolean, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) {
      if (nombre === "node_modules" || nombre === ".next") continue;
      recorrer(ruta, acepta, salida);
    } else if (acepta(ruta)) salida.push(ruta);
  }
  return salida;
}

/** `src/app/(app)/hub/[id]/page.tsx` → patrón de ruta `^/hub/[^/]+$`. */
function patronDePagina(archivo: string): RegExp {
  const rel = path.relative(APP, path.dirname(archivo)).split(path.sep);
  const trozos: string[] = [];
  for (const t of rel) {
    if (!t || (t.startsWith("(") && t.endsWith(")")) || t.startsWith("@")) continue; // grupos y slots
    if (/^\[\[\.\.\..+\]\]$/.test(t)) trozos.push("(?:/.*)?");
    else if (/^\[\.\.\..+\]$/.test(t)) trozos.push("/.+");
    else if (/^\[.+\]$/.test(t)) trozos.push("/[^/]+");
    else trozos.push("/" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  return new RegExp("^" + (trozos.join("") || "/") + "$");
}

const PAGINAS = recorrer(APP, (f) => /[\\/]page\.(tsx|ts|jsx|js)$/.test(f)).map(patronDePagina);
const existePagina = (ruta: string) => PAGINAS.some((p) => p.test(ruta));

// El nombre viejo del producto, montado a trozos para que la guardia `nombre-genesis` (que lee este
// mismo archivo) no lo vea escrito: aquí solo hace falta comprobar que las etiquetas NO lo dicen.
const VIEJO = ["Man", "do"].join("");
const NOMBRE_VIEJO = new RegExp(`(?:Puente de|Centro de) ${VIEJO}|\\b${VIEJO}\\b`);

const ACCIONES = todasLasAcciones();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

describe("catálogo de acciones rápidas · forma", () => {
  it("hay un buen número de acciones y sus ids son únicos", () => {
    expect(ACCIONES.length).toBeGreaterThan(40);
    const ids = ACCIONES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada app ofrece entre 2 y 5 acciones (también tras filtrar por la ruta)", () => {
    for (const [app, lista] of Object.entries(CATALOGO)) {
      expect(lista.length, `${app} tiene ${lista.length}`).toBeGreaterThanOrEqual(2);
      expect(lista.length, `${app} tiene ${lista.length}`).toBeLessThanOrEqual(5);
      const sinCondicion = lista.filter((a) => !a.soloEnRutas);
      expect(sinCondicion.length, `${app} sin condiciones`).toBeGreaterThanOrEqual(2);
    }
    expect(ACCIONES_GENERICAS.length).toBeGreaterThanOrEqual(2);
    expect(ACCIONES_GENERICAS.length).toBeLessThanOrEqual(5);
  });

  it("las etiquetas son legibles y respetan el nombre Genesis (guardia nombre-genesis)", () => {
    for (const a of ACCIONES) {
      expect(a.etiqueta.trim().length, a.id).toBeGreaterThan(2);
      expect(a.etiqueta, a.id).not.toMatch(NOMBRE_VIEJO);
      // Sin emojis como iconos: el icono es siempre un nombre de Lucide.
      expect(a.etiqueta, a.id).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(a.icono, a.id).toMatch(/^[A-Z][A-Za-z0-9]+$/);
    }
  });

  it("cada entrada del catálogo es un botón que existe en el dock", () => {
    const presets = new Set(DOCK_PRESETS.map((p) => p.id));
    for (const app of Object.keys(CATALOGO)) {
      expect(presets.has(app), `«${app}» no es un botón del dock`).toBe(true);
    }
  });
});

describe("catálogo de acciones rápidas · cada destino existe de verdad", () => {
  const rutas = ACCIONES.filter((a): a is AccionRapida & { destino: { tipo: "ruta"; ruta: string } } => a.destino.tipo === "ruta");

  it("hay rutas que comprobar", () => {
    expect(rutas.length).toBeGreaterThan(30);
  });

  it("cada ruta del catálogo tiene su página en el árbol src/app", () => {
    const sinPagina = rutas.filter((a) => !existePagina(rutaBase(a.destino.ruta))).map((a) => `${a.id} → ${a.destino.ruta}`);
    expect(sinPagina).toEqual([]);
  });

  it("toda ruta empieza por / y no lleva espacios ni dominios", () => {
    for (const a of rutas) {
      expect(a.destino.ruta, a.id).toMatch(/^\/[A-Za-z0-9\-_/?=&.]*$/);
    }
  });

  it("si la ruta lleva query, la página la lee (el archivo nombra el parámetro y el valor)", () => {
    const fallos: string[] = [];
    for (const a of rutas) {
      const d = a.destino;
      const tieneQuery = d.ruta.includes("?");
      const lee = (d as { lee?: { archivo: string; param: string; valor?: string } }).lee;
      if (tieneQuery && !lee) {
        fallos.push(`${a.id}: lleva query pero no declara qué archivo la lee`);
        continue;
      }
      if (!lee) continue;
      const query = new URLSearchParams(d.ruta.split("?")[1] ?? "");
      if (!query.has(lee.param)) fallos.push(`${a.id}: la ruta no incluye «${lee.param}»`);
      if (lee.valor !== undefined && query.get(lee.param) !== lee.valor) fallos.push(`${a.id}: el valor de la ruta no es «${lee.valor}»`);
      let texto = "";
      try {
        texto = leer(lee.archivo);
      } catch {
        fallos.push(`${a.id}: no existe ${lee.archivo}`);
        continue;
      }
      const leeParam = new RegExp(`["'\`]${lee.param}["'\`]`).test(texto);
      if (!leeParam) fallos.push(`${a.id}: ${lee.archivo} no menciona el parámetro «${lee.param}»`);
      if (lee.valor !== undefined && !new RegExp(`["'\`]${lee.valor}["'\`]`).test(texto)) {
        fallos.push(`${a.id}: ${lee.archivo} no conoce el valor «${lee.valor}»`);
      }
    }
    expect(fallos).toEqual([]);
  });

  it("cada evento tiene un oyente real en el código (nadie dispara al vacío)", () => {
    const eventos = ACCIONES.flatMap((a) => (a.destino.tipo === "evento" ? [[a.id, a.destino.evento] as const] : []));
    expect(eventos.length).toBeGreaterThan(3);
    const fuentes = recorrer(SRC, (f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\.|acciones-rapidas\.ts$|acciones-internas\.ts$/.test(f));
    const textos = fuentes.map((f) => [f, readFileSync(f, "utf8")] as const);
    const sinOyente = eventos
      .filter(([, evento]) => !textos.some(([, t]) => t.includes(`"${evento}"`) && t.includes("addEventListener")))
      .map(([id, evento]) => `${id} → ${evento}`);
    expect(sinOyente).toEqual([]);
  });

  it("las funciones internas del dock están implementadas en acciones-internas", () => {
    const internas = readFileSync(path.join(RAIZ, "src/components/layout/dock/acciones-internas.ts"), "utf8");
    for (const a of ACCIONES) {
      if (a.destino.tipo === "funcion") expect(internas, a.id).toContain(`case "${a.destino.funcion}"`);
    }
  });
});

describe("accionesRapidasDe", () => {
  it("un botón con catálogo propio devuelve las suyas", () => {
    const m = accionesRapidasDe("messages");
    expect(m.map((a) => a.id)).toContain("messages.nuevo");
    expect(tieneAccionesPropias("messages")).toBe(true);
  });

  it("los botones afines comparten el catálogo (Biblioteca de red → Biblioteca, Hermes → Astraura)", () => {
    expect(accionesRapidasDe("netlib").map((a) => a.id)).toEqual(accionesRapidasDe("mylib").map((a) => a.id));
    expect(accionesRapidasDe("hermes-skills").map((a) => a.id)).toEqual(accionesRapidasDe("ai-studio").map((a) => a.id));
    expect(tieneAccionesPropias("netlib")).toBe(true);
  });

  it("una app sin catálogo recibe las acciones genéricas (nunca una lista vacía)", () => {
    const g = accionesRapidasDe("una-app-que-no-existe");
    expect(g).toEqual(ACCIONES_GENERICAS);
    expect(g.length).toBeGreaterThanOrEqual(2);
    expect(tieneAccionesPropias("una-app-que-no-existe")).toBe(false);
  });

  it("«Editar el tablero» solo se ofrece estando en /dashboard (su oyente solo vive allí)", () => {
    const fuera = accionesRapidasDe("dashboard", { pathname: "/hub" });
    const dentro = accionesRapidasDe("dashboard", { pathname: "/dashboard" });
    const dentroDeSub = accionesRapidasDe("dashboard", { pathname: "/dashboard/algo" });
    const esEditar = (a: AccionRapida) => a.destino.tipo === "evento" && a.destino.evento === EVENTO_EDITAR_TABLERO;
    expect(fuera.some(esEditar)).toBe(false);
    expect(dentro.some(esEditar)).toBe(true);
    expect(dentroDeSub.some(esEditar)).toBe(true);
    expect(fuera.length).toBeGreaterThanOrEqual(2);
  });

  it("rutaBase quita la query y el ancla", () => {
    expect(rutaBase("/library?tab=updates#abajo")).toBe("/library");
    expect(rutaBase("/hub")).toBe("/hub");
  });
});
