import { describe, expect, it } from "vitest";
import {
  agruparPiezas,
  direccionSegura,
  fechaCorta,
  formatearImporte,
  formatearPorcentaje,
  leerFormato,
  ordenarParaAprobar,
  puedeEnviar,
  puedeTransitarBorrador,
  puedeTransitarPieza,
  resumenDonaciones,
  resumenPorRama,
  textoPuntuacion,
  vistaPrevia,
} from "../cola";
import type { Borrador, Donacion, Pieza, Resultado } from "../tipos";

function borrador(extra: Partial<Borrador> = {}): Borrador {
  return {
    id: "b1", rama_id: "fondos", agente_id: null, hallazgo_id: null, campana_id: null, sitio_id: null, canal: "correo_propuesta",
    asunto: null, cuerpo: "Hola", idioma: "es", puntuacion_nivel: null, puntuacion_p: null, puntuacion_medio: null, estado: "para_aprobar",
    motivo_descarte: null, aprobado_por: null, aprobado_en: null, enviado_en: null, respondido_en: null, huella: null, creado_en: "2026-10-10T08:00:00Z",
    ...extra,
  };
}

function pieza(extra: Partial<Pieza> = {}): Pieza {
  return {
    id: "p1", campana_id: null, rama_id: "estudio", agente_id: null, tipo: "imagen", medio: "instagram", formato: "1080x1350",
    ruta: "/piezas/a.png", url: null, sha256: null, estado: "para_aprobar", motivo_descarte: null, aprobado_por: null, aprobado_en: null,
    publicado_en: null, metricas: {}, creado_en: "2026-10-10T08:00:00Z", ...extra,
  };
}

describe("estados", () => {
  it("un borrador solo avanza por el camino permitido", () => {
    expect(puedeTransitarBorrador("para_aprobar", "aprobado")).toBe(true);
    expect(puedeTransitarBorrador("para_aprobar", "enviado")).toBe(false);
    expect(puedeTransitarBorrador("para_aprobar", "respondido")).toBe(false);
    expect(puedeTransitarBorrador("aprobado", "enviado")).toBe(true);
    expect(puedeTransitarBorrador("enviado", "respondido")).toBe(true);
    expect(puedeTransitarBorrador("descartado", "aprobado")).toBe(false);
    expect(puedeTransitarBorrador("respondido", "descartado")).toBe(false);
  });
  it("una pieza no se publica sin aprobarse", () => {
    expect(puedeTransitarPieza("para_aprobar", "publicado")).toBe(false);
    expect(puedeTransitarPieza("para_aprobar", "aprobado")).toBe(true);
    expect(puedeTransitarPieza("aprobado", "publicado")).toBe(true);
    expect(puedeTransitarPieza("publicado", "descartado")).toBe(false);
  });
  it("el agente solo envía lo aprobado, con constancia de quién y cuándo, y nunca los manuales", () => {
    const ok = { estado: "aprobado" as const, aprobado_por: "u1", aprobado_en: "2026-10-10T09:00:00Z", canal: "api_oficial" as const };
    expect(puedeEnviar(ok)).toBe(true);
    expect(puedeEnviar({ ...ok, estado: "para_aprobar" })).toBe(false);
    expect(puedeEnviar({ ...ok, aprobado_por: null })).toBe(false);
    expect(puedeEnviar({ ...ok, aprobado_en: null })).toBe(false);
    expect(puedeEnviar({ ...ok, canal: "manual_alex" })).toBe(false);
    expect(puedeEnviar({ ...ok, estado: "descartado" })).toBe(false);
  });
});

describe("cola «Para aprobar»", () => {
  it("solo incluye lo pendiente, primero lo mejor puntuado y, a igual puntuación, lo más reciente", () => {
    const lista = ordenarParaAprobar([
      borrador({ id: "a", puntuacion_nivel: "bajo" }),
      borrador({ id: "b", puntuacion_nivel: "alto", creado_en: "2026-10-09T08:00:00Z" }),
      borrador({ id: "c", puntuacion_nivel: "alto", creado_en: "2026-10-10T08:00:00Z" }),
      borrador({ id: "d", estado: "aprobado" }),
      borrador({ id: "e", puntuacion_nivel: null }),
    ]);
    expect(lista.map((b) => b.id)).toEqual(["c", "b", "e", "a"]);
  });
  it("no modifica la lista que recibe", () => {
    const entrada = [borrador({ id: "a" }), borrador({ id: "b", puntuacion_nivel: "alto" })];
    ordenarParaAprobar(entrada);
    expect(entrada.map((b) => b.id)).toEqual(["a", "b"]);
  });
  it("puntuación en palabras", () => {
    expect(textoPuntuacion({ puntuacion_nivel: null, puntuacion_p: null })).toBe("sin puntuar");
    expect(textoPuntuacion({ puntuacion_nivel: "alto", puntuacion_p: 0.823 })).toBe("alta (82 %)");
    expect(textoPuntuacion({ puntuacion_nivel: "bajo", puntuacion_p: null })).toBe("baja");
  });
});

describe("piezas de campaña", () => {
  it("las agrupa por campaña y por medio, con las pendientes primero", () => {
    const grupos = agruparPiezas(
      [
        pieza({ id: "1", campana_id: "c1", medio: "youtube", estado: "aprobado" }),
        pieza({ id: "2", campana_id: "c1", medio: "instagram" }),
        pieza({ id: "3", campana_id: "c1", medio: "instagram", creado_en: "2026-10-11T08:00:00Z" }),
        pieza({ id: "4", campana_id: null, medio: "web", estado: "descartado" }),
        pieza({ id: "5", campana_id: "c2", medio: "tiktok" }),
      ],
      { c1: "Semilla de otoño" },
    );
    expect(grupos.map((g) => g.campana)).toEqual(["Semilla de otoño", expect.stringMatching(/^Campaña c2$/), "Sin campaña"]);
    const c1 = grupos[0];
    expect(c1.total).toBe(3);
    expect(c1.paraAprobar).toBe(2);
    expect(c1.medios.map((m) => m.medio)).toEqual(["instagram", "youtube"]);
    expect(c1.medios[0].piezas.map((p) => p.id)).toEqual(["3", "2"]);
  });
  it("sin piezas no hay grupos", () => {
    expect(agruparPiezas([])).toEqual([]);
  });
  it("solo muestra direcciones seguras: https o rutas del propio sitio", () => {
    expect(direccionSegura("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
    expect(direccionSegura("/piezas/a.png")).toBe("/piezas/a.png");
    for (const mal of ["javascript:alert(1)", "data:text/html,<script>", "http://x.example/a.png", "//evil.example/a.png", "file:///etc/passwd", "", "   ", null, undefined, "ftp://x/a"]) {
      expect(direccionSegura(mal as string | null), String(mal)).toBeNull();
    }
    expect(direccionSegura("https://x.example/" + "a".repeat(2100))).toBeNull();
  });
  it("elige la vista previa por extensión y, si no la hay, por el tipo de pieza", () => {
    expect(vistaPrevia({ tipo: "imagen", ruta: null, url: "https://x.example/a.webp?v=2" })).toEqual({ tipo: "imagen", src: "https://x.example/a.webp?v=2" });
    expect(vistaPrevia({ tipo: "video", ruta: "/p/a.mp4", url: null })).toEqual({ tipo: "video", src: "/p/a.mp4" });
    expect(vistaPrevia({ tipo: "imagen", ruta: "/p/a.mp4", url: null }).tipo).toBe("video");
    expect(vistaPrevia({ tipo: "animacion3d", ruta: "/p/render", url: null }).tipo).toBe("video");
    expect(vistaPrevia({ tipo: "cartel", ruta: "/p/render", url: null }).tipo).toBe("imagen");
    expect(vistaPrevia({ tipo: "imagen", ruta: "javascript:alert(1)", url: "http://x.example/a.png" })).toEqual({ tipo: "ninguna", src: null });
    expect(vistaPrevia({ tipo: "imagen", ruta: null, url: null })).toEqual({ tipo: "ninguna", src: null });
  });
  it("la url manda sobre la ruta cuando es segura", () => {
    expect(vistaPrevia({ tipo: "imagen", ruta: "/p/a.png", url: "https://x.example/b.png" }).src).toBe("https://x.example/b.png");
  });
  it("lee el formato «AxB@duración»", () => {
    expect(leerFormato("1080x1920@15s")).toEqual({ ancho: 1080, alto: 1920, segundos: 15 });
    expect(leerFormato("1920x1080")).toEqual({ ancho: 1920, alto: 1080, segundos: null });
    expect(leerFormato("1280x720@6.5s")).toEqual({ ancho: 1280, alto: 720, segundos: 6.5 });
    expect(leerFormato("grande")).toBeNull();
  });
});

describe("resultados y donaciones", () => {
  it("resume por rama solo lo real, y la tasa de respuesta es respondidos entre enviados", () => {
    const resultados: Resultado[] = [
      { id: "r1", rama_id: "fondos", agente_id: null, borrador_id: null, tipo: "aportacion", valor_minor: null, moneda: null, nota: null, creado_en: "2026-10-10T08:00:00Z" },
      { id: "r2", rama_id: "fondos", agente_id: null, borrador_id: null, tipo: "financiacion", valor_minor: 150000, moneda: "eur", nota: null, creado_en: "2026-10-10T08:00:00Z" },
      { id: "r3", rama_id: "fondos", agente_id: null, borrador_id: null, tipo: "donacion", valor_minor: 2000, moneda: "eur", nota: null, creado_en: "2026-10-10T08:00:00Z" },
      { id: "r4", rama_id: "alianzas_ia", agente_id: null, borrador_id: null, tipo: "alianza", valor_minor: null, moneda: null, nota: null, creado_en: "2026-10-10T08:00:00Z" },
      { id: "r5", rama_id: "alianzas_ia", agente_id: null, borrador_id: null, tipo: "voluntariado", valor_minor: null, moneda: null, nota: null, creado_en: "2026-10-10T08:00:00Z" },
    ];
    const bs = [
      borrador({ id: "1", estado: "enviado" }),
      borrador({ id: "2", estado: "respondido" }),
      borrador({ id: "3", estado: "para_aprobar" }),
      borrador({ id: "4", estado: "descartado" }),
      borrador({ id: "5", estado: "aprobado" }),
    ];
    const filas = resumenPorRama(bs, resultados);
    expect(filas).toHaveLength(7);
    const fondos = filas.find((f) => f.rama === "fondos")!;
    expect(fondos).toMatchObject({ borradores: 5, paraAprobar: 1, aprobados: 1, enviados: 2, respondidos: 1, descartados: 1, aportaciones: 1 });
    expect(fondos.tasaRespuesta).toBe(0.5);
    expect(fondos.importes).toEqual({ eur: 152000 });
    const alianzas = filas.find((f) => f.rama === "alianzas_ia")!;
    expect(alianzas).toMatchObject({ alianzas: 1, voluntarios: 1, enviados: 0, tasaRespuesta: 0 });
  });
  it("suma las donaciones confirmadas por moneda y no cuenta las reembolsadas", () => {
    const d = (id: string, importe: number, moneda: string, estado: Donacion["estado"]): Donacion => ({
      id, stripe_id: `cs_${id}`, enlace_id: null, importe_minor: importe, moneda, estado, rama_id: null, campana_id: null,
      confirmada_en: "2026-10-10T08:00:00Z", creado_en: "2026-10-10T08:00:00Z",
    });
    const r = resumenDonaciones([d("a", 2000, "eur", "confirmada"), d("b", 500, "eur", "confirmada"), d("c", 1000, "usd", "confirmada"), d("d", 9999, "eur", "reembolsada")]);
    expect(r).toEqual({ confirmadas: 3, reembolsadas: 1, totales: { eur: 2500, usd: 1000 } });
    expect(resumenDonaciones([])).toEqual({ confirmadas: 0, reembolsadas: 0, totales: {} });
  });
  it("formatea importes en unidades menores, también monedas sin decimales", () => {
    expect(formatearImporte(2000, "eur")).toMatch(/20,00\s?€/);
    expect(formatearImporte(500, "jpy")).toMatch(/500/);
    expect(formatearImporte(1234, "zzz")).toMatch(/12[.,]34/);
    expect(formatearPorcentaje(0.256)).toBe("26 %");
  });
  it("las fechas salen en UTC y una fecha rota no rompe nada", () => {
    expect(fechaCorta("2026-10-10T23:30:00Z")).toMatch(/10 oct/);
    expect(fechaCorta(null)).toBe("—");
    expect(fechaCorta("no es fecha")).toBe("—");
  });
});
