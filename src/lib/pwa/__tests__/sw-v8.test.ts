/**
 * El service worker de verdad (`public/sw-v8.js`, SW1107A) en un entorno de mentira: precarga, sin red,
 * RSC, API con respaldo, pasarela caída, servidor local, espacio, cierre de sesión y reanudación.
 */
import { describe, expect, it } from "vitest";

import { montarSW, redireccionOpaca, type Llamada } from "./sw-entorno-prueba";

const MANIFIESTO = {
  formato: 1,
  buildId: "B2",
  generado: "2026-11-07T00:00:00.000Z",
  estaticos: ["/_next/static/chunks/comun.js", "/_next/static/chunks/esc.js", "/_next/static/chunks/perezoso.js", "/_next/static/css/a.css"],
  tamanos: [10, 20, 30, 5],
  comunes: [0, 3],
  rutas: [
    { r: "/", e: 1, c: [], b: 100 },
    { r: "/escritorios", e: 1, c: [1], b: 100 },
    { r: "/messages", e: 0, c: [], b: 100 },
    { r: "/dashboard", e: 0, c: [], b: 100 },
    { r: "/rota", e: 0, c: [], b: 100 },
  ],
  publicos: ["/logo.png", "/offline.html"],
  tamanosPublicos: [3, 2],
};

const html = (t: string, estado = 200) => new Response(t, { status: estado, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { "Content-Type": "application/json" } });

function servidorBase(op: { versionHtml?: () => string; fallar?: (ruta: string) => Response | "colgar" | null; sinManifiesto?: boolean } = {}) {
  return (ruta: string, c: Llamada): Response | "colgar" => {
    const f = op.fallar?.(ruta);
    if (f) return f;
    if (ruta === "/precarga.json") return op.sinManifiesto ? new Response("no", { status: 404 }) : json(MANIFIESTO);
    if (ruta === "/offline.html") return html("<h1>Sin conexión</h1>");
    if (ruta.startsWith("/_next/static/")) return new Response(`js:${ruta}`, { headers: { "Content-Type": "application/javascript" } });
    if (/\.(png|webmanifest)$/.test(ruta)) return new Response("bin", { headers: { "Content-Type": "image/png" } });
    if (ruta === "/dashboard") return c.init.redirect === "manual" ? redireccionOpaca() : html("login");
    if (ruta === "/rota") return html("no", 404);
    if (["/", "/escritorios", "/messages"].includes(ruta)) {
      if (c.cabeceras.get("rsc") === "1") {
        return new Response(`rsc:${ruta}:${c.cabeceras.get("next-router-state-tree") ?? "raiz"}`, { headers: { "Content-Type": "text/x-component" } });
      }
      return html(`<p>${ruta} ${op.versionHtml ? op.versionHtml() : "v2"}</p>`);
    }
    if (ruta.startsWith("/api/")) return json({ ruta, v: "0.4.4" });
    return html("404", 404);
  };
}

async function montarYPrecargar(op: Parameters<typeof montarSW>[0] = { servidor: servidorBase() }) {
  const sw = montarSW(op);
  await sw.ciclo("install");
  await sw.ciclo("activate");
  await sw.mensaje({ tipo: "PRECARGAR" });
  return sw;
}

function sinRed(sw: ReturnType<typeof montarSW>) {
  sw.estado.red = false;
  sw.navegador.onLine = false;
}

const ultimoEstado = (sw: ReturnType<typeof montarSW>) =>
  (sw.estado.mensajes.filter((m) => (m as { tipo?: string }).tipo === "starseed:precarga").at(-1) as { estado: Record<string, unknown> }).estado;

describe("sw-v8 · instalar y activar", () => {
  it("guarda el arranque y retira solo las cachés viejas del SW (ni builds ni cachés ajenas)", async () => {
    const sw = montarSW({ servidor: servidorBase() });
    for (const n of ["starseed-precache-v8-2026-07-29", "starseed-runtime-v8-2026-07-29", "starseed-build-B1", "sd-turbo-pesos"]) await sw.caches.open(n);
    await sw.ciclo("install");
    expect((await sw.caches.open("starseed-precache-v9-2026-11-07")).urls()).toContain("/offline.html");
    await sw.ciclo("activate");
    expect(await sw.caches.keys()).toEqual(["starseed-build-B1", "sd-turbo-pesos", "starseed-precache-v9-2026-11-07"]);
  });
});

describe("sw-v8 · precarga", () => {
  it("guarda código, HTML y carga RSC completa de cada página, y public/; no guarda redirecciones ni 404", async () => {
    const sw = await montarYPrecargar();
    const urls = (await sw.caches.open("starseed-build-B2")).urls();
    for (const u of ["/offline.html", "/_next/static/chunks/comun.js", "/_next/static/css/a.css", "/_next/static/chunks/esc.js", "/escritorios",
      "/escritorios?__ss_rsc=1", "/", "/?__ss_rsc=1", "/messages", "/messages?__ss_rsc=1", "/_next/static/chunks/perezoso.js", "/logo.png"]) {
      expect(urls, u).toContain(u);
    }
    expect(urls.some((u) => u.startsWith("/dashboard") || u.startsWith("/rota"))).toBe(false);
    // Las páginas se piden sin seguir redirecciones y sin caché HTTP; el RSC sin árbol del router (carga completa).
    const pagina = sw.estado.llamadas.find((l) => l.ruta === "/escritorios" && !l.cabeceras.get("rsc"));
    expect(pagina?.init.redirect).toBe("manual");
    expect(pagina?.init.cache).toBe("no-store");
    const r = await (await sw.caches.open("starseed-build-B2")).match("/escritorios?__ss_rsc=1");
    expect(await r?.text()).toBe("rsc:/escritorios:raiz");
    const e = ultimoEstado(sw);
    expect(e).toMatchObject({ buildId: "B2", fase: "lista", completo: true, permanentes: 4, transitorios: 0, rutas: 5 });
  });

  it("estáticos con hash: copia la de otra build en vez de bajarla; al completar, retira la build vieja", async () => {
    const sw = montarSW({ servidor: servidorBase() });
    const vieja = await sw.caches.open("starseed-build-B1");
    await vieja.put("/_next/static/chunks/comun.js", new Response("js:viejo-identico"));
    await sw.ciclo("install");
    await sw.ciclo("activate");
    await sw.mensaje({ tipo: "PRECARGAR" });
    expect(sw.estado.llamadas.some((l) => l.ruta === "/_next/static/chunks/comun.js")).toBe(false);
    expect(await sw.caches.has("starseed-build-B1")).toBe(false);
    expect(await sw.caches.has("starseed-build-B2")).toBe(true);
  });

  it("un fallo de red deja la build a medias (la vieja se queda) y la siguiente pasada baja SOLO lo que falta", async () => {
    let fallar = true;
    const sw = montarSW({ servidor: servidorBase({ fallar: (r) => (fallar && r === "/_next/static/chunks/perezoso.js" ? new Response("x", { status: 503 }) : null) }) });
    await sw.caches.open("starseed-build-B1");
    await sw.ciclo("install");
    await sw.ciclo("activate");
    await sw.mensaje({ tipo: "PRECARGAR" });
    expect(ultimoEstado(sw)).toMatchObject({ completo: false, transitorios: 1, motivo: "errores-de-red" });
    expect(await sw.caches.has("starseed-build-B1")).toBe(true);
    fallar = false;
    const antes = sw.estado.llamadas.length;
    await sw.mensaje({ tipo: "PRECARGAR", forzar: true });
    const nuevas = sw.estado.llamadas.slice(antes).map((l) => l.ruta);
    expect(nuevas.filter((r) => r !== "/precarga.json" && r !== "/dashboard" && r !== "/rota")).toEqual(["/_next/static/chunks/perezoso.js"]);
    expect(ultimoEstado(sw)).toMatchObject({ completo: true, fase: "lista" });
    expect(await sw.caches.has("starseed-build-B1")).toBe(false);
  });

  it("no precarga en el servidor local (127.0.0.1) ni con datos móviles, salvo que se pida a mano", async () => {
    const local = await montarYPrecargar({ servidor: servidorBase(), host: "127.0.0.1:47610" });
    expect(local.estado.llamadas.some((l) => l.ruta === "/precarga.json")).toBe(false);
    expect(ultimoEstado(local).motivo).toBe("servidor-local");
    await local.mensaje({ tipo: "PRECARGAR", forzar: true });
    expect(local.estado.llamadas.some((l) => l.ruta === "/precarga.json")).toBe(true);

    const movil = await montarYPrecargar({ servidor: servidorBase(), conexion: { type: "cellular", effectiveType: "4g", saveData: false } });
    expect(movil.estado.llamadas.some((l) => l.ruta === "/precarga.json")).toBe(false);
    expect(ultimoEstado(movil).motivo).toBe("datos-moviles");
  });

  it("sin manifiesto o sin espacio: no baja páginas y lo dice", async () => {
    const sin = await montarYPrecargar({ servidor: servidorBase({ sinManifiesto: true }) });
    expect(ultimoEstado(sin)).toMatchObject({ fase: "sin-manifiesto" });
    expect(await sin.caches.has("starseed-build-B2")).toBe(false);

    const lleno = await montarYPrecargar({ servidor: servidorBase(), libres: 1000 });
    expect(ultimoEstado(lleno)).toMatchObject({ fase: "sin-espacio", motivo: "sin-espacio" });
    expect(lleno.estado.llamadas.some((l) => l.ruta === "/escritorios")).toBe(false);
  });
});

describe("sw-v8 · sin red", () => {
  it("cualquier navegación sale de la caché: la página guardada (con o sin consulta) o /offline.html", async () => {
    const sw = await montarYPrecargar();
    sinRed(sw);
    expect(await (await sw.pedir("/escritorios", { modo: "navigate" }))?.text()).toBe("<p>/escritorios v2</p>");
    expect(await (await sw.pedir("/escritorios?vista=2", { modo: "navigate" }))?.text()).toBe("<p>/escritorios v2</p>");
    expect(await (await sw.pedir("/", { modo: "navigate" }))?.text()).toBe("<p>/ v2</p>");
    const otra = await sw.pedir("/pagina/una-que-nunca-se-abrio", { modo: "navigate" });
    expect(otra?.status).toBe(200);
    expect(await otra?.text()).toContain("Sin conexión");
  });

  it("RSC: la carga completa guardada para cualquier árbol del cliente; nunca para precargas por segmento", async () => {
    const sw = await montarYPrecargar();
    sinRed(sw);
    const r = await sw.pedir("/escritorios?_rsc=k3j2", { cabeceras: { RSC: "1", "Next-Router-State-Tree": "%5B%22%22%5D" } });
    expect(r?.headers.get("content-type")).toBe("text/x-component");
    expect(await r?.text()).toBe("rsc:/escritorios:raiz");
    const prefetch = await sw.pedir("/messages?_rsc=p", { cabeceras: { RSC: "1", "Next-Router-Prefetch": "1" } });
    expect(await prefetch?.text()).toBe("rsc:/messages:raiz");
    const segmento = await sw.pedir("/escritorios?_rsc=s", { cabeceras: { RSC: "1", "Next-Router-Segment-Prefetch": "/_tree" } });
    expect(segmento?.status).toBe(504);
    const noGuardada = await sw.pedir("/xr?_rsc=1", { cabeceras: { RSC: "1" } });
    expect(noGuardada?.status).toBe(504); // Next navega «a la antigua» y entra la página guardada o /offline.html
  });

  it("estáticos con ?dpl= (protección de desfase de Vercel) y medios salen de la caché", async () => {
    const sw = await montarYPrecargar();
    sinRed(sw);
    expect(await (await sw.pedir("/_next/static/chunks/esc.js?dpl=dpl_9"))?.text()).toBe("js:/_next/static/chunks/esc.js");
    expect((await sw.pedir("/logo.png"))?.status).toBe(200);
    expect((await sw.pedir("/_next/static/chunks/no-existe.js"))?.status).toBe(504);
  });
});

describe("sw-v8 · API", () => {
  it("lista blanca: red primero; sin red, la última respuesta buena marcada como guardada", async () => {
    const sw = await montarYPrecargar();
    const conRed = await sw.pedir("/api/os/versiones");
    expect(await conRed?.json()).toEqual({ ruta: "/api/os/versiones", v: "0.4.4" });
    sinRed(sw);
    const sinConexion = await sw.pedir("/api/os/versiones");
    expect(await sinConexion?.json()).toEqual({ ruta: "/api/os/versiones", v: "0.4.4" });
    expect(sinConexion?.headers.get("x-starseed-sin-conexion")).toBe("1");
    expect(sinConexion?.headers.get("x-starseed-guardado")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("lo de sesión, consolas o con secretos no lo toca el SW (ni con red ni sin ella); POST tampoco", async () => {
    const sw = await montarYPrecargar();
    expect(await sw.pedir("/api/mando/estado")).toBeNull();
    expect(await sw.pedir("/api/os/versiones?token=abc")).toBeNull();
    expect(await sw.pedir("/api/os/versiones", { metodo: "POST" })).toBeNull();
    sinRed(sw);
    expect(await sw.pedir("/api/mando/estado")).toBeNull();
  });
});

describe("sw-v8 · con red", () => {
  it("la navegación trae SIEMPRE la de la red (cada despliegue al momento) y la guarda para después", async () => {
    let version = "v2";
    const sw = await montarYPrecargar({ servidor: servidorBase({ versionHtml: () => version }) });
    version = "v3";
    const r = await sw.pedir("/escritorios", { modo: "navigate" });
    expect(await r?.text()).toBe("<p>/escritorios v3</p>");
    const ultima = sw.estado.llamadas.at(-1);
    expect(ultima?.init.cache).toBe("no-store");
    expect((await sw.caches.open("starseed-runtime-v9-2026-11-07")).urls()).toContain("/escritorios");
  });

  it("pasarela caída (502/503/504) o red colgada: la copia guardada; un 500 de la app se enseña tal cual", async () => {
    let modo: "503" | "colgar" | "500" | null = null;
    const sw = await montarYPrecargar({
      servidor: servidorBase({
        fallar: (ruta) => {
          if (ruta !== "/escritorios" && ruta !== "/messages") return null;
          if (modo === "503") return html("caída", 503);
          if (modo === "colgar") return "colgar";
          if (modo === "500") return html("error de la app", 500);
          return null;
        },
      }),
    });
    modo = "503";
    expect(await (await sw.pedir("/escritorios", { modo: "navigate" }))?.text()).toBe("<p>/escritorios v2</p>");
    modo = "colgar";
    expect(await (await sw.pedir("/messages", { modo: "navigate" }))?.text()).toBe("<p>/messages v2</p>");
    modo = "500";
    const r = await sw.pedir("/escritorios", { modo: "navigate" });
    expect(r?.status).toBe(500);
  });
});

describe("sw-v8 · cerrar sesión", () => {
  it("borra la API y las páginas con datos de la sesión; las estáticas y el código se quedan; la siguiente pasada rellena", async () => {
    const sw = await montarYPrecargar();
    await sw.pedir("/api/os/versiones");
    await sw.mensaje({ tipo: "OLVIDAR_SESION" });
    expect(await sw.caches.has("starseed-api-v1")).toBe(false);
    const urls = (await sw.caches.open("starseed-build-B2")).urls();
    expect(urls).not.toContain("/messages");
    expect(urls).not.toContain("/messages?__ss_rsc=1");
    for (const u of ["/escritorios", "/escritorios?__ss_rsc=1", "/_next/static/chunks/comun.js"]) expect(urls).toContain(u);
    expect(sw.estado.mensajes).toContainEqual({ tipo: "starseed:sesion-olvidada" });
    await sw.mensaje({ tipo: "PRECARGAR", forzar: true });
    expect((await sw.caches.open("starseed-build-B2")).urls()).toContain("/messages");
  });
});
