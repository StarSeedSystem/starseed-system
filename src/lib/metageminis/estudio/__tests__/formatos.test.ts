/**
 * Pruebas del catálogo de formatos del Estudio MetaGeminis.
 * Lo que garantizan: que no falte ningún medio de la petición, que cada dato cite una fuente con fecha, que los
 * números sean coherentes (relación, duraciones, impresos a 300 ppp), que el vocabulario encaje con la tabla de
 * piezas y que `formatos.json` (lo que lee el motor de Python) sea idéntico al catálogo.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  FORMATOS,
  FUENTES,
  IDS_FORMATO,
  areaSegura,
  caducados,
  diasDesdeConsulta,
  formatoDePieza,
  formatoPorId,
  formatosDeMedio,
  margenesComunes,
  mediosDelCatalogo,
  pesoMaximo,
  problemasDelCatalogo,
  rectValido,
  relacion,
} from "../formatos";
import { FORMATO_RE, TIPOS_PIEZA } from "../../tipos";

const RAIZ = path.join(__dirname, "..", "..", "..", "..", "..");

describe("coherencia del catálogo", () => {
  it("no tiene problemas internos", () => {
    expect(problemasDelCatalogo()).toEqual([]);
  });

  it("los ids son únicos", () => {
    expect(new Set(IDS_FORMATO).size).toBe(IDS_FORMATO.length);
    expect(new Set(FUENTES.map((f) => f.id)).size).toBe(FUENTES.length);
  });

  it("los tipos de pieza son los de la tabla de piezas", () => {
    for (const f of FORMATOS) for (const t of f.tipos) expect(TIPOS_PIEZA, `${f.id}: ${t}`).toContain(t);
  });

  it("el medio cumple la restricción de metageminis_piezas.medio", () => {
    for (const f of FORMATOS) expect(f.medio, f.id).toMatch(/^[a-z0-9_]{2,40}$/);
  });

  it("formatoDePieza produce valores que acepta la base de datos", () => {
    for (const f of FORMATOS) {
      expect(FORMATO_RE.test(formatoDePieza(f)), f.id).toBe(true);
      expect(FORMATO_RE.test(formatoDePieza(f, 15)), f.id).toBe(true);
      expect(FORMATO_RE.test(formatoDePieza(f, 12.5)), f.id).toBe(true);
    }
    expect(formatoDePieza({ ancho: 1080, alto: 1920 }, 15)).toBe("1080x1920@15s");
    expect(formatoDePieza({ ancho: 1080, alto: 1080 })).toBe("1080x1080");
  });

  it("la relación de aspecto se calcula bien", () => {
    expect(relacion(1080, 1920)).toBe("9:16");
    expect(relacion(1080, 1350)).toBe("4:5");
    expect(relacion(1080, 1080)).toBe("1:1");
    expect(relacion(1920, 1080)).toBe("16:9");
    expect(relacion(1000, 1500)).toBe("2:3");
    expect(relacion(1200, 630)).toBe("1.9:1");
  });

  it("las duraciones y los pesos son positivos y coherentes", () => {
    for (const f of FORMATOS) {
      const d = f.duracion;
      if (d?.max !== undefined) expect(d.max, f.id).toBeGreaterThan(0);
      for (const clase of ["imagen", "video"] as const) {
        const p = pesoMaximo(f, clase);
        if (p !== undefined) expect(p, `${f.id}.${clase}`).toBeGreaterThan(0);
        const r = f.pesoRecomendado?.[clase];
        if (r !== undefined && p !== undefined) expect(r, `${f.id}.${clase}`).toBeLessThanOrEqual(p);
      }
    }
  });

  it("los formatos con vídeo declaran un contenedor de vídeo y los de imagen uno de imagen", () => {
    for (const f of FORMATOS) {
      if (f.tipos.some((t) => t === "video" || t === "animacion3d")) {
        expect(f.contenedores.some((c) => c === "mp4" || c === "webm" || c === "mov" || c === "gif"), f.id).toBe(true);
      }
      if (f.tipos.includes("imagen")) {
        expect(f.contenedores.some((c) => c === "jpg" || c === "png" || c === "gif" || c === "pdf" || c === "mp4"), f.id).toBe(true);
      }
    }
  });
});

describe("cobertura de lo que pidió Alex", () => {
  const medios = mediosDelCatalogo();
  const requeridos = [
    "instagram", "tiktok", "youtube", "x_twitter", "linkedin", "facebook", "mastodon", "bluesky", "telegram", "whatsapp",
    "pinterest", "reddit", "threads", "discord", "twitch", "banner_iab", "web", "correo", "cartel_impreso", "pantalla_dooh", "estaciones",
  ];
  it.each(requeridos)("hay formatos de %s", (medio) => {
    expect(medios).toContain(medio);
    expect(formatosDeMedio(medio).length).toBeGreaterThan(0);
  });

  it("incluye cada formato nombrado en la petición", () => {
    const ids = [
      "instagram-feed-1x1", "instagram-feed-4x5", "instagram-stories", "instagram-reels", "tiktok", "youtube-horizontal",
      "youtube-shorts", "youtube-miniatura", "facebook-post", "facebook-portada", "facebook-evento", "open-graph", "correo-cabecera",
      "cartel-a3", "cartel-a4", "dooh-horizontal", "dooh-vertical", "iab-300x250", "iab-728x90", "iab-160x600", "iab-320x50", "iab-300x600", "iab-970x250",
    ];
    for (const id of ids) expect(formatoPorId(id), id).toBeTruthy();
  });

  it("los banners IAB y los impresos tienen las medidas exactas", () => {
    const medidas: Record<string, [number, number]> = {
      "iab-300x250": [300, 250], "iab-728x90": [728, 90], "iab-160x600": [160, 600], "iab-320x50": [320, 50], "iab-300x600": [300, 600],
      "iab-970x250": [970, 250], "open-graph": [1200, 630], "dooh-horizontal": [1920, 1080], "dooh-vertical": [1080, 1920],
    };
    for (const [id, [w, h]] of Object.entries(medidas)) {
      const f = formatoPorId(id)!;
      expect([f.ancho, f.alto], id).toEqual([w, h]);
    }
  });

  it("A3 y A4 a 300 ppp coinciden con ISO 216", () => {
    const px = (mm: number) => Math.round((mm * 300) / 25.4);
    const a3 = formatoPorId("cartel-a3")!;
    expect([a3.ancho, a3.alto]).toEqual([px(297), px(420)]);
    expect([a3.ancho, a3.alto]).toEqual([3508, 4961]);
    const a4 = formatoPorId("cartel-a4")!;
    expect([a4.ancho, a4.alto]).toEqual([px(210), px(297)]);
    expect(a3.dpi).toBe(300);
    expect(a3.sangradoPx).toBe(Math.round((3 * 300) / 25.4));
  });
});

describe("fuentes y fechas de verificación", () => {
  it("cada fuente tiene URL https (o ruta del repositorio) y fecha ISO", () => {
    for (const f of FUENTES) {
      if (f.confianza === "repositorio") expect(f.url, f.id).toMatch(/^src\//);
      else expect(f.url, f.id).toMatch(/^https:\/\//);
      expect(f.consultada, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(f.consultada), f.id).toBeLessThanOrEqual(Date.parse("2026-10-10"));
      expect(["oficial", "secundaria", "calculo", "repositorio"]).toContain(f.confianza);
    }
  });

  it("las fuentes de repositorio apuntan a un archivo que existe", () => {
    for (const f of FUENTES.filter((x) => x.confianza === "repositorio")) expect(existsSync(path.join(RAIZ, f.url)), f.url).toBe(true);
  });

  it("nada está caducado a fecha de verificación y los días se calculan", () => {
    expect(caducados("2026-10-10")).toEqual([]);
    expect(caducados("2027-02-01").length).toBe(FORMATOS.length);
    expect(diasDesdeConsulta(formatoPorId("tiktok")!, "2026-10-20")).toBe(10);
  });

  it("cuando hay un conflicto entre fuentes, el límite es el más estricto que se cita", () => {
    // Bluesky: 3 min (frente a 10) y 50 MB (frente a 300 MB).
    const b = formatoPorId("bluesky-video")!;
    expect(b.duracion?.max).toBe(180);
    expect(pesoMaximo(b, "video")).toBe(50_000_000);
    // LinkedIn: 15 min (frente a 30) y 500 MB (frente a 5 GB); imagen 5 MB (frente a 8).
    const l = formatoPorId("linkedin-video")!;
    expect(l.duracion?.max).toBe(900);
    expect(pesoMaximo(l, "video")).toBe(500_000_000);
    expect(pesoMaximo(formatoPorId("linkedin-imagen")!, "imagen")).toBe(5_000_000);
    // Instagram Reels: 20 min (SocialCal 2026-03-30; antes se usaba 90 s de Moda) y margen inferior de 672 px (frente a 340).
    const r = formatoPorId("instagram-reels")!;
    expect(r.duracion?.max).toBe(1200);
    expect(r.duracion?.recomendada).toEqual([12, 20]);
    expect(r.margenes.abajo).toBe(672);
    // Todos los formatos con conflictos declarados lo explican con texto.
    for (const f of FORMATOS) for (const c of f.conflictos ?? []) expect(c.length, f.id).toBeGreaterThan(30);
  });

  it("los números de Mastodon vienen tal cual de la API de la instancia", () => {
    expect(pesoMaximo(formatoPorId("mastodon-imagen")!, "imagen")).toBe(16_777_216);
    expect(pesoMaximo(formatoPorId("mastodon-video")!, "video")).toBe(103_809_024);
  });

  it("los banners animados cumplen el tope de Google Ads (menos de 5 fps, 30 s, 150 kB)", () => {
    for (const f of formatosDeMedio("banner_iab")) {
      expect(f.fps?.max, f.id).toBeLessThan(5);
      expect(f.duracion?.max, f.id).toBeLessThanOrEqual(30);
      expect(pesoMaximo(f, "imagen"), f.id).toBeLessThanOrEqual(150_000);
    }
    expect(pesoMaximo(formatoPorId("iab-320x50")!, "imagen")).toBe(50_000);
  });
});

describe("zonas seguras", () => {
  it("el área segura nunca sale del lienzo y deja sitio útil", () => {
    for (const f of FORMATOS) {
      const a = areaSegura(f);
      expect(a.x, f.id).toBeGreaterThanOrEqual(0);
      expect(a.y, f.id).toBeGreaterThanOrEqual(0);
      expect(a.x + a.ancho, f.id).toBeLessThanOrEqual(f.ancho);
      expect(a.y + a.alto, f.id).toBeLessThanOrEqual(f.alto);
      expect(a.ancho * a.alto, f.id).toBeGreaterThan(f.ancho * f.alto * 0.2);
    }
  });

  it("el grupo vertical comparte un único archivo con los márgenes más estrictos", () => {
    const comunes = margenesComunes(["instagram-reels", "tiktok", "youtube-shorts", "whatsapp-estado", "instagram-stories", "threads-video"]);
    expect(comunes).toEqual({ arriba: 269, abajo: 672, izquierda: 65, derecha: 100 });
    const reels = formatoPorId("instagram-reels")!;
    const area = areaSegura(reels, comunes);
    expect(area).toEqual({ x: 65, y: 269, ancho: 915, alto: 979 });
  });

  it("un texto en la zona de la marca de duración de YouTube se rechaza", () => {
    const m = formatoPorId("youtube-miniatura")!;
    expect(rectValido(m, { x: 60, y: 60, ancho: 600, alto: 200 })).toBe(true);
    expect(rectValido(m, { x: 1000, y: 600, ancho: 240, alto: 80 })).toBe(false);
    expect(rectValido(m, { x: 10, y: 10, ancho: 300, alto: 100 })).toBe(false);
  });

  it("margenesComunes lanza si el formato no existe", () => {
    expect(() => margenesComunes(["no-existe"])).toThrow();
  });
});

describe("paridad con formatos.json (lo que lee el motor de Python)", () => {
  const ruta = path.join(RAIZ, "scripts", "sociales", "estudio", "formatos.json");

  it("existe y coincide con el catálogo", () => {
    expect(existsSync(ruta)).toBe(true);
    const json = JSON.parse(readFileSync(ruta, "utf8")) as { formatos: Array<Record<string, unknown>>; fuentes: unknown[] };
    expect(json.formatos.length).toBe(FORMATOS.length);
    expect(json.fuentes).toEqual(JSON.parse(JSON.stringify(FUENTES)));
    for (const f of FORMATOS) {
      const j = json.formatos.find((x) => x.id === f.id);
      expect(j, f.id).toBeTruthy();
      expect(j).toMatchObject(JSON.parse(JSON.stringify(f)));
      expect(j!.relacion).toBe(relacion(f.ancho, f.alto));
      expect(j!.formato_pieza).toBe(formatoDePieza(f));
    }
  });
});
