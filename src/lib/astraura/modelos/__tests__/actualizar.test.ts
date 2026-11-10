// Autoactualización, almacén con migración e instalación con pregunta previa (MOD1110A).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import {
  avisoDiscreto, debeRevisar, decidirAplicarMejora, fronteraDeFilas, fusionar, mejorasTrasRevision, parsearCapacidadesOllama,
  parsearEciCsv, parsearIndiceOllama, parsearTagsOllama, revisarFuentes, urlPermitida, URL_ECI, URL_INDICE_OLLAMA, urlTags, urlFamilia,
} from "../actualizar-catalogo";
import { ajustesPredeterminados, guardarAjustes, leerAjustes, leerCatalogoGuardado, guardarCatalogo, leerRevision, guardarRevision, marcarInstalado, leerInstalados, migrarAjustes, CLAVE_AJUSTES, type AlmacenTexto } from "../almacen";
import { catalogoCompleto, leerCatalogoModelos, modelosDesdeCapas } from "../catalogo";
import { catalogoSemilla } from "../catalogo-datos";
import { ejecutarInstalacion, planInstalar, type Traer } from "../instalar";
import { construirPerfilNeurona } from "../perfil-neurona";
import { recomendarTodos } from "../recomendar";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const propios = modelosDesdeCapas(capas);
const mac32 = construirPerfilNeurona({ id: "mac32", plataforma: "tauri", gpuRenderer: "Apple M2 Max", ramGb: 32, ramReal: true, discoLibreGb: 300, ollama: true, backend158: true });

// Fragmentos con la misma forma que las páginas reales de ollama.com.
const fila = (tag: string, gb: string, ctx: number, entrada = "Text, Image") =>
  `<a href="/library/${tag}" class="md:hidden flex"><span>${tag}</span><span class="font-mono">abc</span> • ${gb} • ${ctx}K context window  •<span class="x"> ${entrada} input • 1 month ago</span></a>`;
const tagsQwen = (extra = "") => [fila("qwen3.5:9b", "6.6GB - 7.6GB", 256), fila("qwen3.5:4b", "3.3GB - 4.0GB", 256), fila("qwen3.5:27b", "17GB - 20GB", 256), extra].join("\n");
const csv = (extra = "") => `Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Country (of organization),Model accessibility,Accessibility group,model_versions
Qwen3.5-9B,Qwen3.5-9B,140.5,1,2,2026-02-24,Alibaba,China,Open weights (restricted use),Open weights,
"Claude, Fable 5.2",x,174.24,1,2,2026-11-09,Anthropic,US,API access,Closed weights,
GPT-6 Astra,x,169.16,1,2,2026-09-03,OpenAI,US,API access,Closed weights,
${extra}`;

describe("lectores de las fuentes", () => {
  it("CSV de Epoch con comillas, y frontera = récords de modelos cerrados", () => {
    const f = parsearEciCsv(csv());
    expect(f).toHaveLength(3);
    expect(f[1].nombre).toBe("Claude, Fable 5.2");
    const fr = fronteraDeFilas(f);
    expect(fr.map((p) => p.eci)).toEqual([169.16, 174.24]);
  });
  it("etiquetas de Ollama: tamaño (el menor del rango), contexto y entrada", () => {
    const t = parsearTagsOllama(tagsQwen(fila("gpt-oss:20b", "14GB", 128, "Text")));
    expect(t.find((x) => x.tag === "qwen3.5:9b")).toMatchObject({ descargaGb: 6.6, contextoK: 256, vision: true });
    expect(t.find((x) => x.tag === "gpt-oss:20b")).toMatchObject({ descargaGb: 14, vision: false });
  });
  it("insignias y página rara", () => {
    expect(parsearCapacidadesOllama(`<div class="mb-0 flex flex-wrap gap-2"><span>tools</span><span>thinking</span></div>`)).toEqual({ tools: true, vision: false, thinking: true });
    expect(parsearCapacidadesOllama("<html>nada</html>")).toBeNull();
    expect(parsearTagsOllama("<html>nada</html>")).toEqual([]);
    expect(parsearIndiceOllama(`<a href="/library/qwen4">a</a><a href="/library/qwen4">b</a><a href="/library/bonsai-2">c</a>`)).toEqual(["qwen4", "bonsai-2"]);
  });
});

describe("lista cerrada de fuentes", () => {
  it("solo Epoch y la biblioteca de Ollama", () => {
    expect(urlPermitida(URL_ECI)).toBe(true);
    expect(urlPermitida(URL_INDICE_OLLAMA)).toBe(true);
    expect(urlPermitida(urlTags("qwen3.5"))).toBe(true);
    expect(urlPermitida(urlFamilia("gpt-oss"))).toBe(true);
  });
  it("rechaza otros hosts, esquemas, puertos y rutas (incluidas comunidades y APIs de terceros)", () => {
    for (const u of [
      "http://ollama.com/library/qwen3.5", "https://abliteration.ai/v1/models", "https://ollama.com/library/huihui_ai/qwen3.5-abliterated",
      "https://ollama.com/huihui_ai/x", "https://ollama.com:8443/library/x", "https://evil.com/library/x", "https://epoch.ai/data/otro.csv",
      "https://ollama.com/library/../etc", "https://ollama.com/search?q=abliterated", "https://user@ollama.com/library/x", "no es url",
    ]) expect(urlPermitida(u), u).toBe(false);
  });
});

describe("fusión con fechas", () => {
  const hoy = "2026-12-01";
  it("etiqueta que sigue: comprobado = hoy; tamaño distinto se actualiza y se anota", () => {
    const { catalogo, cambios } = fusionar(catalogoSemilla(), { hoy, tags: { "qwen3.5": parsearTagsOllama(tagsQwen().replace("6.6GB", "9.9GB")) } });
    const m = catalogo.modelos.find((x) => x.id === "qwen3.5:9b")!;
    expect(m.descargaGb).toBe(9.9);
    expect(m.comprobado).toBe(hoy);
    expect(cambios.some((c) => c.tipo === "tamano" && c.id === "qwen3.5:9b")).toBe(true);
    expect(catalogo.revisado).toBe(hoy);
  });
  it("etiqueta que desaparece pasa a «sin-comprobar» y deja de recomendarse", () => {
    const tags = parsearTagsOllama([fila("qwen3.5:4b", "3.3GB", 256), fila("qwen3.5:27b", "17GB", 256)].join(""));
    const { catalogo, cambios } = fusionar(catalogoSemilla(), { hoy, tags: { "qwen3.5": tags } });
    expect(catalogo.modelos.find((x) => x.id === "qwen3.5:9b")!.estado).toBe("sin-comprobar");
    expect(cambios.some((c) => c.tipo === "retirado")).toBe(true);
    const r = recomendarTodos({ catalogo: [...catalogo.modelos, ...propios], perfil: mac32 });
    for (const x of Object.values(r)) expect(x.modelo?.id).not.toBe("qwen3.5:9b");
  });
  it("una fuente caída NO cambia nada (ni borra ni rejuvenece)", () => {
    const antes = catalogoSemilla();
    const { catalogo, cambios } = fusionar(antes, { hoy, eci: null, tags: { "qwen3.5": null, gemma4: [] }, indice: null });
    expect(cambios).toEqual([]);
    expect(catalogo.modelos.map((m) => [m.id, m.estado, m.comprobado, m.descargaGb])).toEqual(antes.modelos.map((m) => [m.id, m.estado, m.comprobado, m.descargaGb]));
  });
  it("puntuación y frontera se refrescan desde Epoch con su fecha", () => {
    const { catalogo, cambios } = fusionar(catalogoSemilla(), { hoy, eci: parsearEciCsv(csv()) });
    const m = catalogo.modelos.find((x) => x.id === "qwen3.5:9b")!;
    expect(m.puntuacion).toMatchObject({ eci: 140.5, comprobado: hoy });
    expect(cambios.some((c) => c.tipo === "puntuacion")).toBe(true);
    expect(catalogo.frontera.at(-1)?.eci).toBe(174.24);
  });
  it("familias nuevas entran como candidatas y NUNCA se recomiendan; solo se avisan una vez", () => {
    const obs = { hoy, indice: ["qwen9", "gemma4", "bonsai-2", "otra-cosa"], tags: { qwen9: parsearTagsOllama(fila("qwen9:9b", "7GB", 512)) }, caps: { qwen9: { tools: true, vision: true, thinking: false } } };
    const { catalogo, cambios } = fusionar(catalogoSemilla(), obs);
    expect(cambios.filter((c) => c.tipo === "familia-nueva").map((c) => c.id).sort()).toEqual(["bonsai-2", "qwen9"]);
    const c = catalogo.modelos.find((x) => x.id === "qwen9:9b")!;
    expect(c.estado).toBe("candidato");
    const r = recomendarTodos({ catalogo: [...catalogo.modelos, ...propios], perfil: mac32 });
    for (const x of Object.values(r)) expect(x.modelo?.id).not.toBe("qwen9:9b");
    const otra = fusionar(catalogo, obs);
    expect(otra.cambios.filter((c) => c.tipo === "familia-nueva")).toEqual([]);
  });
});

describe("cuándo revisar y qué avisar", () => {
  const DIA = 24 * 3600 * 1000;
  it("como mucho una vez al día y solo con conexión", () => {
    expect(debeRevisar({ ahoraMs: 1000, ultimoIntentoMs: null, enLinea: true })).toBe(true);
    expect(debeRevisar({ ahoraMs: DIA - 1, ultimoIntentoMs: 0, enLinea: true })).toBe(false);
    expect(debeRevisar({ ahoraMs: DIA, ultimoIntentoMs: 0, enLinea: true })).toBe(true);
    expect(debeRevisar({ ahoraMs: 10 * DIA, ultimoIntentoMs: 0, enLinea: false })).toBe(false);
    expect(debeRevisar({ ahoraMs: 1, ultimoIntentoMs: 0, enLinea: true, forzar: true })).toBe(true);
  });
  it("sin conexión a ninguna fuente: el catálogo queda igual, con su fecha", async () => {
    const cat = catalogoSemilla();
    const r = await revisarFuentes(cat, "2026-12-01", async () => { throw new Error("sin red"); });
    expect(r.revisado).toBe(false);
    expect(r.catalogo).toBe(cat);
    expect(r.catalogo.revisado).toBe("2026-11-10");
  });
  it("revisa por fuentes, nunca pide una URL fuera de la lista y detecta la mejora para la neurona", async () => {
    const pedidas: string[] = [];
    const cat = catalogoSemilla();
    // Quitamos la mejor opción vigente en 32 GB para que la revisión «traiga» un modelo mejor puntuado.
    cat.modelos = cat.modelos.map((m) => (m.id === "gemma4:26b" ? { ...m, puntuacion: { ...m.puntuacion!, eci: 120 } } : m));
    const traer = async (url: string) => {
      pedidas.push(url);
      if (url === URL_ECI) return csv(`Gemma 4 26B A4B,x,160.5,1,2,2026-04-02,Google,US,Open weights (unrestricted),Open weights,`);
      if (url.endsWith("/tags")) return tagsQwen();
      return "<html></html>";
    };
    const r = await revisarFuentes(cat, "2026-12-01", traer, { perfil: mac32, propios });
    expect(r.revisado).toBe(true);
    expect(pedidas.every(urlPermitida)).toBe(true);
    expect(r.mejoras.length).toBeGreaterThan(0);
    const aviso = avisoDiscreto(r.mejoras, []);
    expect(aviso?.texto).toMatch(/modelo mejor/);
    expect(avisoDiscreto(r.mejoras, [aviso!.clave])?.clave).not.toBe(aviso!.clave);
  });
  it("sin cambios de mejora no hay aviso; el aviso no se repite", () => {
    const a = recomendarTodos({ catalogo: [...catalogoSemilla().modelos, ...propios], perfil: mac32 });
    expect(mejorasTrasRevision(a, a)).toEqual([]);
    expect(avisoDiscreto([], [])).toBeNull();
  });
  it("reutiliza la decisión de «aplicar solo»: lo fijado a mano no se toca", () => {
    const m = { caso: "conversacion" as const, de: null, a: catalogoSemilla().modelos[0] };
    expect(decidirAplicarMejora({ automatico: true, manual: true, actualId: "otro", mejora: m }).motivo).toBe("fijado-a-mano");
    expect(decidirAplicarMejora({ automatico: false, mejora: m }).motivo).toBe("auto-desactivado");
    expect(decidirAplicarMejora({ automatico: true, actualId: "otro", mejora: m }).aplicar).toBe(true);
  });
});

function almacen(): AlmacenTexto & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) };
}

describe("almacén y migración", () => {
  it("cuentas antiguas sin la clave reciben el modo automático", () => {
    expect(leerAjustes(almacen())).toEqual(ajustesPredeterminados());
    expect(leerAjustes(almacen()).modo).toBe("automatico");
    expect(leerAjustes(null).modo).toBe("automatico");
  });
  it("migra la forma antigua y sanea lo ilegible", () => {
    expect(migrarAjustes({ auto: false }).modo).toBe("manual");
    const m = migrarAjustes({ modo: "manual", porCaso: { conversacion: "qwen3.5:9b", voz: 5, inventado: "x" }, ramDeclaradaGb: -4, privacidad: { externoParaPrivados: "sí" }, avisosVistos: [1, "a"] });
    expect(m.porCaso).toEqual({ conversacion: "qwen3.5:9b" });
    expect(m.ramDeclaradaGb).toBeNull();
    expect(m.privacidad.externoParaPrivados).toBe(false);
    expect(m.avisosVistos).toEqual(["a"]);
  });
  it("ida y vuelta, y un JSON roto no rompe nada", () => {
    const a = almacen();
    guardarAjustes(a, { ...ajustesPredeterminados(), modo: "manual", ramDeclaradaGb: 16 });
    expect(leerAjustes(a)).toMatchObject({ modo: "manual", ramDeclaradaGb: 16 });
    a.datos.set(CLAVE_AJUSTES, "{roto");
    expect(leerAjustes(a).modo).toBe("automatico");
    const c = catalogoSemilla();
    guardarCatalogo(a, c);
    expect(leerCatalogoGuardado(a).modelos).toHaveLength(c.modelos.length);
    expect(leerCatalogoModelos({ esquema: 1, modelos: [{ id: "x" }] }).modelos.length).toBe(c.modelos.length); // inválido ⇒ semilla
    expect(leerRevision(a)).toEqual({ ultimoIntentoMs: null, ultimoResultado: null });
    guardarRevision(a, { ultimoIntentoMs: 5, ultimoResultado: "ok" });
    expect(leerRevision(a).ultimoIntentoMs).toBe(5);
    marcarInstalado(a, "qwen3.5:9b");
    expect(leerInstalados(a)).toEqual(["qwen3.5:9b"]);
    expect(leerCatalogoGuardado(null).modelos.length).toBeGreaterThan(0);
  });
});

describe("instalar: siempre preguntar antes de descargar", () => {
  const m = catalogoCompleto(catalogoSemilla(), capas).find((x) => x.id === "qwen3.5:9b")!;
  const flujo = (lineas: string[]): Traer => async () => ({
    ok: true, status: 200,
    body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(lineas.join("\n") + "\n")); c.close(); } }),
  });
  it("la pregunta enseña el tamaño y el disco", () => {
    const plan = planInstalar(m, mac32);
    expect(plan.pregunta).toContain("6,6 GB");
    expect(plan.pregunta).toMatch(/No se descarga nada hasta que aceptes/);
    expect(plan.comando).toBe("ollama pull qwen3.5:9b");
    expect(plan.bloqueo).toBeNull();
  });
  it("sin confirmación NO toca la red", async () => {
    const traer = vi.fn(flujo([]));
    const r = await ejecutarInstalacion(planInstalar(m, mac32), { confirmado: false, traer });
    expect(r.sinHacerNada).toBe(true);
    expect(traer).not.toHaveBeenCalled();
  });
  it("bloqueado (sin Ollama o sin disco) tampoco descarga", async () => {
    const traer = vi.fn(flujo([]));
    const sin = { ...mac32, runtimes: mac32.runtimes.filter((r) => r !== "ollama") };
    expect((await ejecutarInstalacion(planInstalar(m, sin), { confirmado: true, traer })).sinHacerNada).toBe(true);
    const lleno = { ...mac32, discoLibreGb: 3 };
    const p = planInstalar(m, lleno);
    expect(p.bloqueo).toMatch(/Faltan/);
    expect((await ejecutarInstalacion(p, { confirmado: true, traer })).sinHacerNada).toBe(true);
    expect(traer).not.toHaveBeenCalled();
  });
  it("con confirmación descarga y da progreso; si falla da el comando", async () => {
    const pasos: number[] = [];
    const ok = await ejecutarInstalacion(planInstalar(m, mac32), {
      confirmado: true, onProgreso: (p) => pasos.push(p),
      traer: flujo([JSON.stringify({ status: "pulling", total: 100, completed: 50 }), JSON.stringify({ status: "success" })]),
    });
    expect(ok.ok).toBe(true);
    expect(pasos).toContain(50);
    const mal = await ejecutarInstalacion(planInstalar(m, mac32), { confirmado: true, traer: async () => { throw new Error("Failed to fetch"); } });
    expect(mal.ok).toBe(false);
    expect(mal.mensaje).toContain("ollama pull qwen3.5:9b");
  });
});
