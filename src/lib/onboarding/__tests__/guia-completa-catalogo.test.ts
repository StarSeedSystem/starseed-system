/**
 * GUIA1025U · el catálogo único de la guía completa (`guia-completa.ts`) y su guardia de huérfanas.
 *
 * Alex (2026-10-26): «A la guía introducción le faltan varios pasos que no sé por qué no aparecen completos
 * desde cualquier medio.» La causa: diez demostraciones hechas que ningún paso usaba. Esta prueba es la
 * guardia: si una demostración existe en `DEMOS_SISTEMA`, `DEMOS_RED` o `StepDemo` y NINGÚN paso del
 * catálogo la usa, falla; y al revés, si un paso pide una demostración que no existe.
 *
 * Corre en node (lee el código fuente de los componentes y el árbol de rutas); la parte que necesita
 * renderizar está en `components/onboarding/__tests__/guia-completa-demos.test.tsx`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACENTOS_TRINITY,
  CAPITULOS_GUIA,
  CLAVES_DEMO,
  CLAVES_DEMO_PASO,
  CLAVES_DEMO_RED,
  CLAVES_DEMO_SISTEMA,
  PASOS_GUIA,
  RAZONES_CUENTA,
  TOTAL_CAPITULOS,
  TOTAL_PASOS,
  ULTIMO_PASO,
  acotarIndice,
  avanceDeCapitulo,
  capituloDeIndice,
  etiquetaProgreso,
  indiceDePaso,
  indiceInicial,
  irNecesitaCuenta,
  origenDeDemo,
  pasoPorId,
  pasosDelCapitulo,
  posicionDe,
  primerPasoDelCapitulo,
  textoDelPaso,
  vozDelPaso,
} from "../guia-completa";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

/** Las claves de un objeto literal `export const NOMBRE = { clave: Componente, … }` del código fuente. */
function clavesDeObjeto(fuente: string, nombre: string): string[] {
  const inicio = fuente.indexOf(`export const ${nombre}`);
  expect(inicio, `no encuentro ${nombre} en el código fuente`).toBeGreaterThanOrEqual(0);
  const abre = fuente.indexOf("{", inicio);
  const cierra = fuente.indexOf("}", abre);
  const cuerpo = fuente.slice(abre + 1, cierra);
  return [...cuerpo.matchAll(/(?:^|[\s,])"?([a-z][\w-]*)"?\s*:/g)].map((m) => m[1]);
}

/** Las etiquetas `case "…":` de `StepDemo` en `aurora-guide-demos.tsx`. */
function casosDeStepDemo(fuente: string): string[] {
  const inicio = fuente.indexOf("export function StepDemo");
  expect(inicio, "no encuentro StepDemo").toBeGreaterThanOrEqual(0);
  const cuerpo = fuente.slice(inicio);
  return [...cuerpo.matchAll(/case\s+"([\w-]+)"\s*:/g)].map((m) => m[1]);
}

const usadas = new Set(PASOS_GUIA.map((p) => p.demo).filter((d): d is NonNullable<typeof d> => d !== null));

describe("guardia de huérfanas · ninguna demostración sin paso", () => {
  const sistema = clavesDeObjeto(leer("src/components/onboarding/demos-sistema.tsx"), "DEMOS_SISTEMA");
  const red = clavesDeObjeto(leer("src/components/onboarding/demos-red.tsx"), "DEMOS_RED");
  const stepDemo = casosDeStepDemo(leer("src/components/onboarding/aurora-guide-demos.tsx"));

  it("lee de verdad las tres familias de demostraciones", () => {
    expect(sistema.length).toBeGreaterThanOrEqual(4);
    expect(red.length).toBeGreaterThanOrEqual(6);
    expect(stepDemo.length).toBeGreaterThanOrEqual(11);
  });

  it("toda demostración de DEMOS_SISTEMA aparece en un paso del catálogo", () => {
    const huerfanas = sistema.filter((k) => !usadas.has(k as never));
    expect(huerfanas, `demos del sistema sin paso: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("toda demostración de DEMOS_RED aparece en un paso del catálogo", () => {
    const huerfanas = red.filter((k) => !usadas.has(k as never));
    expect(huerfanas, `demos de la red sin paso: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("toda demostración de StepDemo aparece en un paso del catálogo", () => {
    const huerfanas = stepDemo.filter((k) => !usadas.has(k as never));
    expect(huerfanas, `demos de StepDemo sin paso: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("el catálogo no pide demostraciones que no existen", () => {
    const existen = new Set<string>([...sistema, ...red, ...stepDemo]);
    const inventadas = [...usadas].filter((k) => !existen.has(k));
    expect(inventadas, `pasos con una demo que no existe: ${inventadas.join(", ")}`).toEqual([]);
  });

  it("las listas de claves del catálogo son exactamente las de los componentes", () => {
    expect([...CLAVES_DEMO_SISTEMA].sort()).toEqual([...sistema].sort());
    expect([...CLAVES_DEMO_RED].sort()).toEqual([...red].sort());
    expect([...CLAVES_DEMO_PASO].sort()).toEqual([...stepDemo].sort());
  });

  it("`CLAVES_STEPDEMO` de aurora-guide-demos.tsx sigue a los `case` de StepDemo", () => {
    const fuente = leer("src/components/onboarding/aurora-guide-demos.tsx");
    const inicio = fuente.indexOf("export const CLAVES_STEPDEMO");
    expect(inicio).toBeGreaterThanOrEqual(0);
    const lista = fuente.slice(fuente.indexOf("[", inicio), fuente.indexOf("]", inicio));
    const claves = [...lista.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
    expect([...claves].sort()).toEqual([...stepDemo].sort());
  });

  it("cada demostración sale de un único archivo y `origenDeDemo` lo sabe", () => {
    for (const k of CLAVES_DEMO) {
      const esperado = (CLAVES_DEMO_SISTEMA as readonly string[]).includes(k)
        ? "sistema"
        : (CLAVES_DEMO_RED as readonly string[]).includes(k)
          ? "red"
          : "paso";
      expect(origenDeDemo(k)).toBe(esperado);
    }
  });
});

describe("el catálogo de la guía completa", () => {
  it("tiene los nueve capítulos pedidos, en orden", () => {
    expect(CAPITULOS_GUIA.map((c) => c.titulo)).toEqual([
      "Bienvenida",
      "Trinity y gestos",
      "El sistema",
      "La red",
      "Librería y Biblioteca",
      "Genesis y PoliGenesis",
      "Personalización segura",
      "Tu espacio",
      "Tu cuenta",
    ]);
    expect(TOTAL_CAPITULOS).toBe(9);
  });

  it("los ids de los pasos son únicos y cada paso pertenece a un capítulo que existe", () => {
    const ids = PASOS_GUIA.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const capitulos = new Set(CAPITULOS_GUIA.map((c) => c.id));
    for (const p of PASOS_GUIA) expect(capitulos.has(p.capitulo), `${p.id}: capítulo ${p.capitulo}`).toBe(true);
  });

  it("los capítulos aparecen en orden, sin saltos ni vueltas, y ninguno queda vacío", () => {
    const orden = CAPITULOS_GUIA.map((c) => c.id);
    let ultimo = -1;
    for (const p of PASOS_GUIA) {
      const n = orden.indexOf(p.capitulo);
      expect(n, `${p.id} vuelve a un capítulo anterior`).toBeGreaterThanOrEqual(ultimo);
      ultimo = n;
    }
    for (const c of CAPITULOS_GUIA) expect(pasosDelCapitulo(c.id).length, `capítulo vacío: ${c.id}`).toBeGreaterThan(0);
  });

  it("empieza en la bienvenida y termina en la cuenta", () => {
    expect(PASOS_GUIA[0].id).toBe("bienvenida");
    expect(PASOS_GUIA[ULTIMO_PASO].id).toBe("cuenta");
    expect(PASOS_GUIA[ULTIMO_PASO].capitulo).toBe("cuenta");
    expect(TOTAL_PASOS).toBe(PASOS_GUIA.length);
  });

  it("cada paso trae título, texto y narración, con acento Trinity válido", () => {
    for (const p of PASOS_GUIA) {
      expect(p.titulo.trim().length, `${p.id}: título`).toBeGreaterThan(2);
      expect(p.texto.trim().length, `${p.id}: texto`).toBeGreaterThan(20);
      expect(p.voz.trim().length, `${p.id}: voz`).toBeGreaterThan(20);
      expect(Object.keys(ACENTOS_TRINITY)).toContain(p.acento);
    }
  });

  it("los temas que Alex pidió explicar están todos con su demostración", () => {
    const pedidos = [
      "protomolecula",
      "malla",
      "capas-conciencia",
      "neuronas-cerebro",
      "pilar-politica",
      "pilar-educacion",
      "pilar-cultura",
      "libreria-biblioteca",
      "genesis",
      "personalizacion-segura",
    ];
    for (const id of pedidos) {
      const p = pasoPorId(id);
      expect(p, `falta el paso ${id}`).toBeDefined();
      expect(p?.demo).toBe(id);
    }
  });

  it("cada demostración del catálogo se usa en un único paso", () => {
    const demos = PASOS_GUIA.map((p) => p.demo).filter(Boolean);
    expect(new Set(demos).size).toBe(demos.length);
  });

  it("los textos usan el nombre Genesis (nunca el antiguo) ni dan por hecha la verificación biométrica", () => {
    // El nombre antiguo se monta por trozos: la guardia `nombre-genesis.test.ts` lee también las pruebas.
    const NOMBRE_VIEJO = "Man" + "do";
    const viejo = new RegExp(`Puente de ${NOMBRE_VIEJO}|Centro de ${NOMBRE_VIEJO}|\\b${NOMBRE_VIEJO}\\b`);
    for (const p of PASOS_GUIA) {
      const todo = [p.titulo, p.texto, p.voz, ...(p.puntos ?? []), ...Object.values(p.textoPorPerfil ?? {}), p.conSesion?.texto ?? ""].join(" ");
      expect(todo, p.id).not.toMatch(viejo);
    }
    // Ni sombra de la verificación biométrica contada como hecha.
    const todos = PASOS_GUIA.map((p) => `${p.texto} ${p.voz}`).join(" ").toLowerCase();
    expect(todos).not.toMatch(/verificaci[oó]n biom[eé]trica (est[aá]|ya)/);
  });

  it("ninguna ruta de «Ir» es inventada: todas tienen su página en src/app", () => {
    const rutas = [...new Set(PASOS_GUIA.map((p) => p.ruta).filter((r): r is string => Boolean(r)))];
    expect(rutas.length).toBeGreaterThan(5);
    const paginas = paginasDeApp();
    for (const ruta of rutas) {
      const limpia = ruta.split(/[?#]/)[0];
      expect(paginas.some((re) => re.test(limpia)), `la ruta ${ruta} no tiene página`).toBe(true);
    }
  });

  it("los bordes Trinity son los cuatro conocidos y no necesitan cuenta", () => {
    for (const p of PASOS_GUIA.filter((x) => x.borde)) {
      expect(["zenith", "horizon", "logic", "anchor"]).toContain(p.borde);
      expect(irNecesitaCuenta(p), p.id).toBe(false);
    }
  });

  it("«Ir» a una ruta pide cuenta, salvo los escritorios (que se usan sin ella)", () => {
    expect(irNecesitaCuenta(pasoPorId("escritorio") as never)).toBe(false);
    expect(irNecesitaCuenta(pasoPorId("astraura") as never)).toBe(true);
    expect(irNecesitaCuenta(pasoPorId("perfil") as never)).toBe(true);
    expect(irNecesitaCuenta(pasoPorId("bienvenida") as never)).toBe(false);
  });

  it("el último paso tiene su variante con sesión y las tres razones para tener cuenta", () => {
    const ultimo = PASOS_GUIA[ULTIMO_PASO];
    expect(ultimo.conSesion?.titulo).toBeTruthy();
    expect(RAZONES_CUENTA.map((r) => r.titulo)).toEqual(["Una sola cuenta", "Dirección @star.seed", "Aurora te guía"]);
  });

  it("la interfaz híbrida tiene texto y voz por dispositivo y caen al común", () => {
    const g = pasoPorId("gestos-hibridos");
    expect(g).toBeDefined();
    if (!g) return;
    expect(textoDelPaso(g, "tactil")).toMatch(/dedo/);
    expect(textoDelPaso(g, "raton")).toMatch(/cursor/);
    expect(textoDelPaso(g)).toBe(g.texto);
    expect(vozDelPaso(g, "hibrido")).toBe(g.voz);
    expect(textoDelPaso(PASOS_GUIA[0], "tactil")).toBe(PASOS_GUIA[0].texto);
  });
});

describe("navegación y progreso del catálogo", () => {
  it("acotarIndice nunca se sale del catálogo", () => {
    expect(acotarIndice(-5)).toBe(0);
    expect(acotarIndice(999)).toBe(ULTIMO_PASO);
    expect(acotarIndice(Number.NaN)).toBe(0);
    expect(acotarIndice(3.9)).toBe(3);
  });

  it("indiceInicial acepta posición, id de paso o nada", () => {
    expect(indiceInicial()).toBe(0);
    expect(indiceInicial(null)).toBe(0);
    expect(indiceInicial(4)).toBe(4);
    expect(indiceInicial("malla")).toBe(indiceDePaso("malla"));
    expect(indiceInicial("no-existe")).toBe(0);
  });

  it("«Paso N de M» cuenta desde 1 hasta el total", () => {
    expect(etiquetaProgreso(0)).toBe(`Paso 1 de ${TOTAL_PASOS}`);
    expect(etiquetaProgreso(ULTIMO_PASO)).toBe(`Paso ${TOTAL_PASOS} de ${TOTAL_PASOS}`);
    const p = posicionDe(indiceDePaso("malla"));
    expect(p.capitulo).toBe(3);
    expect(p.capitulos).toBe(9);
    expect(p.enCapitulo).toBe(2);
  });

  it("cada capítulo empieza en su primer paso y el avance va de 0 a 1", () => {
    for (const c of CAPITULOS_GUIA) {
      const primero = primerPasoDelCapitulo(c.id);
      expect(capituloDeIndice(primero).id).toBe(c.id);
      expect(avanceDeCapitulo(c.id, primero)).toBeGreaterThan(0);
    }
    expect(avanceDeCapitulo("trinity", 0)).toBe(0);
    expect(avanceDeCapitulo("bienvenida", ULTIMO_PASO)).toBe(1);
  });
});

/** Las páginas de `src/app` como expresiones regulares de ruta (grupos `(x)` fuera, `[x]` = cualquier segmento). */
function paginasDeApp(): RegExp[] {
  const base = join(RAIZ, "src", "app");
  const res: RegExp[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) {
        if (nombre === "api" || nombre === "__tests__") continue;
        recorrer(ruta);
      } else if (/^page\.(t|j)sx?$/.test(nombre)) {
        const segmentos = relative(base, dir)
          .split(/[\\/]/)
          .filter((s) => s && !/^\(.*\)$/.test(s));
        const patron = segmentos.map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
        res.push(new RegExp(`^/${patron}/?$`));
      }
    }
  };
  recorrer(base);
  return res;
}
