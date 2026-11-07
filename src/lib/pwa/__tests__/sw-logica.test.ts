/**
 * Lógica pura del service worker (public/sw-logica.js · SW1107A): qué es cada petición, qué se guarda,
 * qué NUNCA se guarda, qué se precarga, en qué orden y cuándo. Deterministas: sin red, sin reloj.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;
const requerir = createRequire(import.meta.url);
const L: Cualquiera = requerir("../../../../public/sw-logica.js");

const O = "https://starseed-os.vercel.app";
const cab = (h: Record<string, string> = {}) => new Headers(h);
const peticion = (url: string, extra: Partial<{ metodo: string; modo: string; cabeceras: Headers; origen: string }> = {}) =>
  L.clasificarPeticion({ metodo: extra.metodo ?? "GET", url, origen: extra.origen ?? O, modo: extra.modo ?? "cors", cabeceras: extra.cabeceras ?? cab() });

describe("rutas", () => {
  it("normaliza: barra inicial, sin barras dobles ni final, sin consulta", () => {
    expect(L.normalizarRuta("")).toBe("/");
    expect(L.normalizarRuta("/")).toBe("/");
    expect(L.normalizarRuta("/escritorios/")).toBe("/escritorios");
    expect(L.normalizarRuta("//red//mesh/")).toBe("/red/mesh");
    expect(L.normalizarRuta("settings?x=1#a")).toBe("/settings");
  });

  it("excluye consolas de desarrollo, parámetros, API y páginas de prueba (por tramo, no por prefijo de texto)", () => {
    for (const r of ["/genesis", "/genesis/oficina", "/metagenesis", "/poligenesis", "/_not-found", "/components-test",
      "/liquid-demo", "/pagina/[slug]", "/api/os/versiones", "/_next/static/x.js", "/auth/callback"]) {
      expect(L.rutaExcluida(r), r).toBe(true);
    }
    for (const r of ["/", "/escritorios", "/genesisx", "/settings", "/red-mesh", "/trinity/lab"]) {
      expect(L.rutaExcluida(r), r).toBe(false);
    }
  });

  it("reconoce el servidor local (loopback) y nada más", () => {
    for (const h of ["localhost", "127.0.0.1", "127.9.8.7", "[::1]", "::1", "app.localhost"]) expect(L.esLoopback(h), h).toBe(true);
    // Direcciones de documentación (RFC 5737): no son de nadie.
    for (const h of ["starseed-os.vercel.app", "203.0.113.7", "198.51.100.2", "127.0.0.1.example", ""]) expect(L.esLoopback(h), h).toBe(false);
  });
});

describe("clasificarPeticion", () => {
  it("solo GET del mismo origen; lo demás pasa sin tocar", () => {
    expect(peticion(`${O}/escritorios`, { metodo: "POST", modo: "navigate" })).toBe("ignorar");
    expect(peticion("https://cdn.jsdelivr.net/npm/x.js")).toBe("ignorar");
    expect(peticion("http://ipc.localhost/plugin:x")).toBe("ignorar");
  });

  it("navegaciones, RSC, estáticos, medios y API", () => {
    expect(peticion(`${O}/escritorios`, { modo: "navigate" })).toBe("navegacion");
    expect(peticion(`${O}/escritorios`, { cabeceras: cab({ Accept: "text/html,*/*" }) })).toBe("navegacion");
    expect(peticion(`${O}/escritorios`, { cabeceras: cab({ RSC: "1" }) })).toBe("rsc");
    expect(peticion(`${O}/escritorios?_rsc=abc`)).toBe("rsc");
    expect(peticion(`${O}/_next/static/chunks/main-app-1.js`)).toBe("estatico");
    expect(peticion(`${O}/_next/static/css/a.css?dpl=dpl_1`)).toBe("estatico");
    expect(peticion(`${O}/logo.png`)).toBe("medio");
    expect(peticion(`${O}/manifest.webmanifest`)).toBe("otro");
    expect(peticion(`${O}/_next/image?url=%2Flogo.png&w=64&q=75`)).toBe("otro");
    expect(peticion(`${O}/api/os/versiones`)).toBe("api");
  });

  it("deja pasar los archivos del propio SW, el manifiesto, version.json, OAuth, tramos de vídeo y APIs abiertas como página", () => {
    for (const r of ["/sw-v8.js", "/sw-v7.js", "/sw-logica.js", "/version.json", "/precarga.json", "/__starseed/red"]) {
      expect(peticion(`${O}${r}`), r).toBe("ignorar");
    }
    expect(peticion(`${O}/auth/callback?code=1`, { modo: "navigate" })).toBe("ignorar");
    expect(peticion(`${O}/api/storage/oauth/callback?code=1`, { modo: "navigate" })).toBe("ignorar");
    expect(peticion(`${O}/assets/intro.mp4`, { cabeceras: cab({ Range: "bytes=0-" }) })).toBe("ignorar");
  });
});

describe("claves de caché", () => {
  it("página: origen + ruta canónica, sin consulta", () => {
    expect(L.claveHtml(O, "/escritorios/")).toBe(`${O}/escritorios`);
    expect(L.claveHtml(O, "/")).toBe(`${O}/`);
  });

  it("RSC: sin _rsc (cambia con el árbol del cliente), con la marca propia y la consulta ordenada", () => {
    expect(L.claveRsc(`${O}/escritorios?_rsc=a1b2`)).toBe(`${O}/escritorios?__ss_rsc=1`);
    expect(L.claveRsc(`${O}/escritorios/?b=2&_rsc=x&a=1`)).toBe(`${O}/escritorios?__ss_rsc=1&a=1&b=2`);
    expect(L.claveRsc(`${O}/escritorios?b=2&_rsc=x`, false)).toBe(`${O}/escritorios?__ss_rsc=1`);
    expect(L.claveRsc(`${O}/?_rsc=z`)).toBe(`${O}/?__ss_rsc=1`);
  });
});

describe("API: respaldo sin red solo para catálogos públicos revisados", () => {
  const api = (ruta: string, h: Record<string, string> = {}) => L.politicaApi({ url: `${O}${ruta}`, cabeceras: cab(h) });

  it("la lista blanca: versiones del OS, actualizaciones de la Biblioteca y fichas públicas de GitHub", () => {
    expect(api("/api/os/versiones")).toBe("respaldo");
    expect(api("/api/library/actualizaciones?pagina=2")).toBe("respaldo");
    expect(api("/api/github-repo/StarSeedSystem/starseed-system")).toBe("respaldo");
  });

  it("lo demás va siempre a la red (una ruta nueva no se guarda hasta que alguien la revisa)", () => {
    for (const r of ["/api/mando/estado", "/api/auth/x", "/api/llamadas/ice", "/api/storage/gcs/sign", "/api/dispositivo/sesion",
      "/api/voz/salud", "/api/movimiento/salud", "/api/space-weather/live", "/api/recursos-ia/detectar", "/api/astraura/nodos",
      "/api/network/openwisp", "/api/avatares/externo", "/api/artcraft/figcraft", "/api/neurons/hermione/sync-chats",
      "/api/memorias/capsulas", "/api/una-ruta-nueva"]) {
      expect(api(r), r).toBe("red");
    }
  });

  it("segunda barrera dentro de la lista blanca: palabras, parámetros y cabeceras de sesión", () => {
    expect(api("/api/library/actualizaciones?token=abc")).toBe("red");
    expect(api("/api/library/actualizaciones?api_key=abc")).toBe("red");
    expect(api("/api/github-repo/a/oauth-callback")).toBe("red");
    expect(api("/api/github-repo/a/session_id")).toBe("red");
    expect(api("/api/os/versiones", { Authorization: "Bearer x" })).toBe("red");
    expect(api("/api/os/versiones", { Accept: "text/event-stream" })).toBe("red");
    expect(api("/api/os/versiones", { Range: "bytes=0-9" })).toBe("red");
  });

  it("recorre las rutas GET REALES de src/app/api: solo las de la lista blanca quedan con respaldo", () => {
    const raiz = join(process.cwd(), "src", "app", "api");
    const rutas: string[] = [];
    const pila = [raiz];
    while (pila.length) {
      const d = pila.pop() as string;
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) pila.push(p);
        else if (/^route\.(ts|tsx|js)$/.test(n) && /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(readFileSync(p, "utf-8"))) {
          const ruta = "/api/" + relative(raiz, d).split(/[\\/]/).join("/");
          rutas.push(ruta.replace(/\[\.\.\.[^\]]+\]/g, "a/b").replace(/\[[^\]]+\]/g, "x"));
        }
      }
    }
    expect(rutas.length).toBeGreaterThan(50);
    const conRespaldo = rutas.filter((r) => api(r) === "respaldo").sort();
    for (const r of conRespaldo) {
      expect(L.API_RESPALDO_PERMITIDAS.some((p: string) => r === p || r.startsWith(`${p}/`)), r).toBe(true);
    }
    // Las de sesión, de esta neurona o en vivo NUNCA (revisadas a mano el 2026-11-07).
    for (const r of rutas) {
      if (/^\/api\/(mando|auth|storage|dispositivo|llamadas|neurons|memorias|astraura|avatares|network|artcraft|voz)(\/|$)/.test(r)) {
        expect(api(r), r).toBe("red");
      }
    }
  });

  it("solo se guardan respuestas 200 de JSON o texto, sin no-store, sin redirección y de ≤ 1 MB", () => {
    const ok = { estado: 200, tipo: "application/json; charset=utf-8", cacheControl: "public, max-age=0", longitud: "1200" };
    expect(L.respuestaApiGuardable(ok)).toBe(true);
    expect(L.respuestaApiGuardable({ ...ok, tipo: "application/vnd.api+json" })).toBe(true);
    expect(L.respuestaApiGuardable({ ...ok, tipo: "text/plain" })).toBe(true);
    expect(L.respuestaApiGuardable({ ...ok, longitud: null })).toBe(true);
    expect(L.respuestaApiGuardable({ ...ok, estado: 201 })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, estado: 500 })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, tipo: "text/event-stream" })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, tipo: "model/gltf-binary" })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, cacheControl: "private, no-cache, no-store, max-age=0" })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, longitud: String(L.MAX_BYTES_API + 1) })).toBe(false);
    expect(L.respuestaApiGuardable({ ...ok, redirigida: true })).toBe(false);
  });
});

describe("páginas y RSC guardables; resultado de cada descarga de la precarga", () => {
  it("HTML y RSC: 200, su tipo y sin redirección", () => {
    expect(L.respuestaHtmlGuardable({ estado: 200, tipo: "text/html; charset=utf-8" })).toBe(true);
    expect(L.respuestaHtmlGuardable({ estado: 200, tipo: "text/html", redirigida: true })).toBe(false);
    expect(L.respuestaHtmlGuardable({ estado: 404, tipo: "text/html" })).toBe(false);
    expect(L.respuestaRscGuardable({ estado: 200, tipo: "text/x-component" })).toBe(true);
    expect(L.respuestaRscGuardable({ estado: 200, tipo: "text/html" })).toBe(false);
    expect([502, 503, 504].every((e) => L.esFalloDePasarela(e))).toBe(true);
    expect(L.esFalloDePasarela(500)).toBe(false);
  });

  it("red caída y 5xx/429 se reintentan; 4xx, redirecciones y tipos inesperados no", () => {
    expect(L.clasificarResultado({ errorRed: true }, "estatico")).toBe("transitorio");
    expect(L.clasificarResultado({ estado: 503 }, "estatico")).toBe("transitorio");
    expect(L.clasificarResultado({ estado: 429 }, "html")).toBe("transitorio");
    expect(L.clasificarResultado({ estado: 404 }, "estatico")).toBe("permanente");
    expect(L.clasificarResultado({ estado: 0, opaca: true }, "html")).toBe("permanente");
    expect(L.clasificarResultado({ estado: 200, redirigida: true, tipo: "text/html" }, "html")).toBe("permanente");
    expect(L.clasificarResultado({ estado: 200, tipo: "text/html" }, "rsc")).toBe("permanente");
    expect(L.clasificarResultado({ estado: 200, tipo: "text/x-component" }, "rsc")).toBe("guardar");
    expect(L.clasificarResultado({ estado: 200, tipo: "text/html; charset=utf-8" }, "html")).toBe("guardar");
    expect(L.clasificarResultado({ estado: 200, tipo: "application/javascript" }, "estatico")).toBe("guardar");
  });
});

const MANIFIESTO = {
  formato: 1,
  buildId: "build-B",
  generado: "2026-11-07T00:00:00.000Z",
  estaticos: [
    "/_next/static/chunks/main-app.js",
    "/_next/static/chunks/esc.js",
    "/_next/static/chunks/set.js",
    "/_next/static/chunks/perezoso.js",
    "/_next/static/css/a.css",
    "/_next/static/chunks/app/(app)/pagina/%5Bslug%5D/page-1.js",
  ],
  tamanos: [1000, 2000, 3000, 4000, 500, 700],
  comunes: [0, 4],
  rutas: [
    { r: "/settings", e: 1, c: [2], b: 10000 },
    { r: "/escritorios/", e: 1, c: [1, 0], b: 20000 },
    { r: "/messages", e: 0, c: [], b: 0 },
    { r: "/genesis", e: 1, c: [], b: 1 },
    { r: "/pagina/[slug]", e: 0, c: [5], b: 1 },
  ],
  publicos: ["/logo.png", "/offline.html", "/sw-v8.js"],
  tamanosPublicos: [300, 100, 50],
};

describe("manifiesto de precarga", () => {
  it("valida, normaliza y quita consolas, parámetros y archivos del SW", () => {
    const m = L.validarManifiesto(MANIFIESTO);
    expect(m.buildId).toBe("build-B");
    expect(m.rutas.map((r: { r: string }) => r.r)).toEqual(["/settings", "/escritorios", "/messages"]);
    expect(m.rutas[2].b).toBe(L.BYTES_RUTA_POR_DEFECTO);
    expect(m.estaticos).toHaveLength(6);
    expect(m.publicos).toEqual(["/logo.png", "/offline.html"]);
  });

  it("rechaza lo que no es un manifiesto y descarta URLs peligrosas sin romper los índices", () => {
    expect(L.validarManifiesto(null)).toBeNull();
    expect(L.validarManifiesto({ ...MANIFIESTO, formato: 2 })).toBeNull();
    expect(L.validarManifiesto({ ...MANIFIESTO, buildId: "../x" })).toBeNull();
    const m = L.validarManifiesto({
      ...MANIFIESTO,
      estaticos: ["/_next/static/../../api/mando/x", "/_next/static/chunks/main-app.js", "https://otro/x.js", "/_next/static/chunks/esc.js?x=1", "/_next/static/chunks/b.js"],
      tamanos: [1, 2, 3, 4, 5],
      comunes: [0, 1, 4],
      rutas: [{ r: "/escritorios", e: 1, c: [2, 4, 9], b: 10 }],
    });
    expect(m.estaticos).toEqual(["/_next/static/chunks/main-app.js", "/_next/static/chunks/b.js"]);
    expect(m.tamanos).toEqual([2, 5]);
    expect(m.comunes).toEqual([0, 1]);
    expect(m.rutas[0].c).toEqual([1]);
  });

  it("ordena las rutas por prioridad (inicio y escritorios primero) y luego en su orden", () => {
    const orden = L.ordenarRutas([{ r: "/zeta" }, { r: "/messages" }, { r: "/alfa" }, { r: "/escritorios" }, { r: "/" }]);
    expect(orden.map((x: { r: string }) => x.r)).toEqual(["/", "/escritorios", "/messages", "/zeta", "/alfa"]);
  });
});

describe("planificarPrecarga", () => {
  const m = L.validarManifiesto(MANIFIESTO);

  it("sin límite: arranque + código común, luego cada ruta con sus chunks, su HTML y su RSC; al final lo perezoso y public/", () => {
    const p = L.planificarPrecarga({ manifiesto: m, origen: O, libres: null });
    expect(p.nivel).toBe("completo");
    expect(p.elementos.map((e: { clase: string; url: string }) => `${e.clase} ${e.url}`)).toEqual([
      "publico /offline.html",
      "estatico /_next/static/chunks/main-app.js",
      "estatico /_next/static/css/a.css",
      "estatico /_next/static/chunks/esc.js",
      "html /escritorios",
      "rsc /escritorios",
      "estatico /_next/static/chunks/set.js",
      "html /settings",
      "rsc /settings",
      "html /messages",
      "rsc /messages",
      "estatico /_next/static/chunks/perezoso.js",
      "estatico /_next/static/chunks/app/(app)/pagina/%5Bslug%5D/page-1.js",
      "publico /logo.png",
    ]);
    const rsc = p.elementos.find((e: { clase: string }) => e.clase === "rsc");
    expect(rsc.clave).toBe(`${O}/escritorios?__ss_rsc=1`);
    expect(p.rutas).toBe(3);
    expect(p.bytes).toBe(p.bytesTotales);
  });

  it("con poco espacio corta por BLOQUES (nunca una página sin su código) y deja la reserva libre", () => {
    const hastaEscritorios = 8000 + 1000 + 500 + 2000 + 20000;
    const libres = (hastaEscritorios + L.RESERVA_BYTES) * L.MARGEN_ESPACIO + 100;
    const p = L.planificarPrecarga({ manifiesto: m, origen: O, libres });
    expect(p.nivel).toBe("parcial");
    expect(p.rutas).toBe(1);
    expect(p.elementos.map((e: { url: string }) => e.url)).toEqual([
      "/offline.html", "/_next/static/chunks/main-app.js", "/_next/static/css/a.css", "/_next/static/chunks/esc.js", "/escritorios", "/escritorios",
    ]);
  });

  it("si no cabe ni una página, no guarda nada", () => {
    const p = L.planificarPrecarga({ manifiesto: m, origen: O, libres: 0 });
    expect(p.nivel).toBe("nada");
    expect(p.elementos).toEqual([]);
  });
});

describe("cuándo precargar", () => {
  const base = { host: "starseed-os.vercel.app", enLinea: true, ahora: 1_000_000_000 };

  it("nunca sin red; pedida a mano, siempre que haya red", () => {
    expect(L.debePrecargar({ ...base, enLinea: false, forzar: true })).toEqual({ si: false, motivo: "sin-red" });
    expect(L.debePrecargar({ ...base, tipoConexion: "none", forzar: true }).si).toBe(false);
    expect(L.debePrecargar({ ...base, host: "127.0.0.1", tipoConexion: "cellular", ahorroDatos: true, forzar: true })).toEqual({ si: true, motivo: "pedida" });
  });

  it("sola: ni en el servidor local, ni con ahorro de datos, ni con datos móviles, ni con 2G, ni dos veces por minuto", () => {
    expect(L.debePrecargar({ ...base, host: "127.0.0.1" }).motivo).toBe("servidor-local");
    expect(L.debePrecargar({ ...base, ahorroDatos: true }).motivo).toBe("ahorro-de-datos");
    expect(L.debePrecargar({ ...base, tipoConexion: "cellular" }).motivo).toBe("datos-moviles");
    expect(L.debePrecargar({ ...base, efectiva: "2g" }).motivo).toBe("red-lenta");
    expect(L.debePrecargar({ ...base, ultimoIntento: base.ahora - 30_000 }).motivo).toBe("reciente");
    expect(L.debePrecargar({ ...base, ultimoIntento: base.ahora - 61_000 })).toEqual({ si: true, motivo: "ok" });
    expect(L.debePrecargar({ ...base, tipoConexion: "wifi", efectiva: "4g" }).si).toBe(true);
    expect(L.debePrecargar({ ...base, tipoConexion: null, efectiva: null, ahorroDatos: null }).si).toBe(true); // sin medida (Safari, Firefox)
  });

  it("con el manifiesto leído: build nueva sí; misma build completa cada 30 min; a medias a los 2 min", () => {
    const ahora = 10_000_000;
    expect(L.hayQueRecorrer({ buildId: "B", estado: null, ahora })).toBe(true);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "A", completo: true, terminado: ahora - 1000 }, ahora })).toBe(true);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: true, terminado: ahora - 10 * 60_000 }, ahora })).toBe(false);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: true, terminado: ahora - 31 * 60_000 }, ahora })).toBe(true);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: false, terminado: ahora - 60_000 }, ahora })).toBe(false);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: false, terminado: ahora - 3 * 60_000 }, ahora })).toBe(true);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: true, terminado: null }, ahora })).toBe(true);
    expect(L.hayQueRecorrer({ buildId: "B", estado: { buildId: "B", completo: true, terminado: ahora - 1000 }, ahora, forzar: true })).toBe(true);
  });
});

describe("cachés", () => {
  it("al activar sobran solo las versiones viejas del SW (nunca builds, API, estado ni cachés ajenas)", () => {
    const nombres = ["starseed-precache-v8-2026-07-29", "starseed-runtime-v8-2026-07-29", "starseed-precache-v9", "starseed-runtime-v9",
      "starseed-build-A", "starseed-api-v1", "starseed-meta-v1", "sd-turbo-pesos", "starseed-api-v0"];
    expect(L.cachesSobrantes(nombres, { precache: "starseed-precache-v9", runtime: "starseed-runtime-v9" })).toEqual([
      "starseed-precache-v8-2026-07-29", "starseed-runtime-v8-2026-07-29", "starseed-api-v0",
    ]);
  });

  it("una build completa retira las demás; se busca primero en las completas y en la más nueva", () => {
    expect(L.buildsSobrantes(["starseed-build-A", "starseed-build-B", "otra"], "B")).toEqual(["starseed-build-A"]);
    expect(L.ordenBuilds(["x", "starseed-build-A", "starseed-build-B", "starseed-build-C"], ["A"])).toEqual([
      "starseed-build-A", "starseed-build-C", "starseed-build-B",
    ]);
    expect(L.idDeBuild("starseed-build-AA0Y")).toBe("AA0Y");
    expect(L.idDeBuild("starseed-api-v1")).toBeNull();
  });

  it("al cerrar sesión se borran la API y las páginas dinámicas (las estáticas y los recursos se quedan)", () => {
    const est = ["/escritorios"];
    expect(L.esEntradaPersonal(`${O}/api/os/versiones`, est)).toBe(true);
    expect(L.esEntradaPersonal(`${O}/messages`, est)).toBe(true);
    expect(L.esEntradaPersonal(`${O}/messages?__ss_rsc=1`, est)).toBe(true);
    expect(L.esEntradaPersonal(`${O}/escritorios`, est)).toBe(false);
    expect(L.esEntradaPersonal(`${O}/escritorios?__ss_rsc=1`, est)).toBe(false);
    for (const u of ["/_next/static/chunks/a.js", "/logo.png", "/manifest.webmanifest", "/offline.html"]) {
      expect(L.esEntradaPersonal(`${O}${u}`, est), u).toBe(false);
    }
  });

  it("recortes y resumen", () => {
    expect(L.recortes(10, 6)).toBe(4);
    expect(L.recortes(3, 6)).toBe(0);
    expect(L.resumenEstado(null)).toBeNull();
    expect(L.resumenEstado({ buildId: "B", fase: "lista", completo: true, guardados: 5, planificados: 5, rutasEstaticas: ["/x"] })).toEqual({
      buildId: "B", fase: "lista", nivel: null, completo: true, guardados: 5, planificados: 5, permanentes: 0, transitorios: 0,
      rutas: 0, rutasTotales: 0, bytes: 0, motivo: null, terminado: null,
    });
  });
});
