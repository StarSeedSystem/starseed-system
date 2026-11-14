import { describe, expect, it } from "vitest";
import { construirMarcas, filtrarMarcas, type EntradaMarcas } from "../marcas";
import { fichaDeMarca, accionesDeMarca, DESCONOCIDO, horaDe } from "../ficha-geo";
import { PREFERENCIA_POSICION_DEFECTO, anuncioParaAmbito } from "../modelo-geo";
import { colorCalidad, leyendaDe, capaDisponible, COLOR_DESCONOCIDO } from "../capas";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";

const AHORA = Date.UTC(2026, 10, 14, 12, 0, 0);
const senales: SenalesMedio = {
  internet: { enLinea: true, tipo: "wifi", mbps: 40 },
  malla: { pares: 2, otrasCuentas: 0 },
  lora: { estado: "sin-radio", nodos: 0 },
  bluetooth: { disponible: null },
  serie: { disponible: false, puertos: 0 },
  reticulum: { disponible: false, motivo: "x" },
};
const fila = (id: string, o: Partial<DispositivoMallaRow> = {}): DispositivoMallaRow => ({
  neuronId: id, nombre: `N-${id}`, plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" }, ...o,
});
const medio = (n: string, o: Partial<PresenciaMedio> = {}): PresenciaMedio => ({ n, m: `m-${n}`, tipo: "navegador", etiqueta: "web", visible: true, desde: "", t: AHORA - 5000, s: senales, ...o });
const base = (o: Partial<EntradaMarcas> = {}): EntradaMarcas => ({
  filas: [fila("yo", { esEsteDispositivo: true, tipo: "laptop", plataforma: "macOS" }), fila("tab", { enlace: { estado: "conectado", latenciaMs: 30 } })],
  medios: [medio("tab")],
  yo: { neuronaId: "yo", nombre: "Mi Mac", senales, capas: ["capa:local", "capa:mesh"], posicion: { lat: 40.4168, lon: -3.7038, precisionM: 20, t: AHORA - 1000, fuente: "gps" }, pref: PREFERENCIA_POSICION_DEFECTO },
  ahora: AHORA, ...o,
});

describe("marcas: posición según quién mira", () => {
  it("mi aparato se ve con el punto exacto; la otra neurona, sin posición si no la comparte", () => {
    const [yo, tab] = construirMarcas(base());
    expect(yo.esYo).toBe(true);
    expect(yo.posicion.tipo).toBe("exacta");
    expect(tab.posicion.tipo).toBe("desconocida");
  });

  it("la otra neurona aparece como ZONA si anunció zona, y nunca con el punto", () => {
    const tabPos = { lat: 41.38879, lon: 2.15899, t: AHORA - 2000, fuente: "gps" as const, precisionM: 5 };
    const g = anuncioParaAmbito(tabPos, { ...PREFERENCIA_POSICION_DEFECTO, cuenta: "zona" }, { tipo: "cuenta" })!;
    const [, tab] = construirMarcas(base({ medios: [medio("tab", { g })] }));
    expect(tab.posicion.tipo).toBe("zona");
    expect(JSON.stringify(tab.posicion)).not.toContain("41.38879");
  });

  it("sin permiso de ubicación en este aparato, mi marca queda «desconocida» con el motivo", () => {
    const [yo] = construirMarcas(base({ yo: { ...base().yo, posicion: null } }));
    expect(yo.posicion).toMatchObject({ tipo: "desconocida" });
  });

  it("filtro: «Este aparato» deja solo la mía; los de fase 2 no devuelven nada", () => {
    const m = construirMarcas(base());
    expect(filtrarMarcas(m, "esta").map((x) => x.esYo)).toEqual([true]);
    expect(filtrarMarcas(m, "cuenta")).toHaveLength(2);
    expect(filtrarMarcas(m, "publico")).toEqual([]);
  });

  it("un servidor es un rombo; un móvil, un punto", () => {
    const m = construirMarcas(base({ filas: [fila("yo", { esEsteDispositivo: true }), fila("srv", { tipo: "server" })] }));
    expect(m.find((x) => x.neuronaId === "srv")!.forma).toBe("rombo");
    expect(m.find((x) => x.neuronaId === "yo")!.forma).toBe("punto");
  });

  it("sin ninguna fila sigue habiendo una marca: «yo»; sin nada que mostrar no se inventa nada", () => {
    const m = construirMarcas(base({ filas: [], medios: [] }));
    expect(m).toHaveLength(1);
    expect(m[0].esYo).toBe(true);
  });
});

describe("calidad y ficha: solo lo medido, con su hora; lo demás «desconocido»", () => {
  it("la calidad sale de la latencia medida del canal; sin canal es null (gris)", () => {
    const [, tab] = construirMarcas(base());
    expect(tab.calidad.valor).toBeGreaterThan(0.5);
    expect(tab.calidad.t).toBe(AHORA);
    const [, sin] = construirMarcas(base({ filas: [fila("yo", { esEsteDispositivo: true }), fila("tab")] }));
    expect(sin.calidad.valor).toBeNull();
    expect(colorCalidad(sin.calidad.valor)).toBe(COLOR_DESCONOCIDO);
  });

  it("la ficha dice «desconocido» (no-medido) para lo que no se sabe y no pone número", () => {
    const [, tab] = construirMarcas(base({ filas: [fila("yo", { esEsteDispositivo: true }), fila("tab")], medios: [] }));
    const f = fichaDeMarca(tab);
    const todos = f.secciones.flatMap((s) => s.datos);
    for (const etiqueta of ["Posición", "Enlace con este aparato", "Capas encendidas", "Versión de la interfaz"]) {
      const d = todos.find((x) => x.etiqueta === etiqueta)!;
      expect(d.valor).toBe(DESCONOCIDO);
      expect(d.estado).toBe("no-medido");
      expect(d.nota).toBeTruthy();
    }
    const antenas = f.secciones.find((s) => s.id === "antenas")!.datos;
    expect(antenas.every((a) => a.valor === DESCONOCIDO)).toBe(true);
  });

  it("los valores medidos llevan hora y fuente; Bluetooth no medible es «desconocido»", () => {
    const [, tab] = construirMarcas(base());
    const f = fichaDeMarca(tab);
    const internet = f.secciones.find((s) => s.id === "antenas")!.datos.find((d) => d.etiqueta === "Internet")!;
    expect(internet.estado).toBe("medido");
    expect(internet.valor).toMatch(/medido a las \d\d:\d\d/);
    expect(internet.fuente).toBeTruthy();
    const bt = f.secciones.find((s) => s.id === "antenas")!.datos.find((d) => d.etiqueta === "Bluetooth")!;
    expect(bt.valor).toBe(DESCONOCIDO);
    expect(f.secciones.find((s) => s.id === "enlace")!.datos[0].valor).toMatch(/latencia 30 ms/);
  });

  it("en mi ficha se ve a quién dejo ver mi posición (por defecto, a nadie)", () => {
    const [yo] = construirMarcas(base());
    const d = fichaDeMarca(yo, PREFERENCIA_POSICION_DEFECTO).secciones.find((s) => s.id === "posicion")!.datos;
    expect(d.find((x) => x.etiqueta === "Mis otras neuronas ven")!.valor).toBe("no se comparte");
    expect(d.find((x) => x.etiqueta === "El radar público ve")!.valor).toBe("no se comparte");
  });

  it("los botones que dependen de permisos están desactivados: próximamente", () => {
    const a = accionesDeMarca();
    expect(a.map((x) => x.id)).toEqual(["ver", "pedir-acceso", "configurar"]);
    expect(a.every((x) => !x.habilitada && x.nota === "próximamente")).toBe(true);
  });

  it("la hora inválida no se escribe", () => {
    expect(horaDe(null)).toBe("");
    expect(horaDe(NaN)).toBe("");
    expect(horaDe(AHORA)).toMatch(/^\d\d:\d\d$/);
  });
});

describe("capas y leyenda", () => {
  it("la fase 1 activa Señal, Conciencia y Antenas; el resto, próximamente", () => {
    expect(["senal", "conciencia", "antenas"].every((c) => capaDisponible(c as never))).toBe(true);
    expect(capaDisponible("capacidades")).toBe(false);
    expect(capaDisponible("publico")).toBe(false);
  });
  it("cada capa de fase 1 tiene leyenda con «sin medir/sin anunciar» en hueco", () => {
    for (const c of ["senal", "conciencia", "antenas"] as const) {
      const l = leyendaDe(c);
      expect(l.length).toBeGreaterThan(2);
      expect(l[l.length - 1].hueco).toBe(true);
    }
  });
  it("la escala de calidad: rojo, ámbar, verde y gris sin dato", () => {
    expect([0.1, 0.5, 0.9].map(colorCalidad)).toEqual(["#f87171", "#fbbf24", "#34d399"]);
    expect(colorCalidad(null)).toBe(COLOR_DESCONOCIDO);
  });
});
