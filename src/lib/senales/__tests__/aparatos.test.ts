import { describe, expect, it } from "vitest";
import { COLOR_ESTADO, TEXTO_ESTADO, construirVivo, estadoAparato, senalDeEnlaceLocal, subtituloAparato } from "../aparatos";
import { cuentaDe } from "../cuentas";
import { AHORA, aparato, contexto, enlaceLocal, fila, medioPresencia, senal } from "../__fixtures__/vivo";

describe("estado de un aparato", () => {
  it("la presencia en vivo manda: a la vista = activa, abierto sin verse = segundo plano", () => {
    expect(estadoAparato([medioPresencia("a", "m1", { visible: true })], false)).toBe("activa");
    expect(estadoAparato([medioPresencia("a", "m1", { visible: false }), medioPresencia("a", "m2", { visible: true })], false)).toBe("activa");
    expect(estadoAparato([medioPresencia("a", "m1", { visible: false })], false)).toBe("segundo-plano");
  });

  it("sin presencia solo hay latido: «en línea» o desconectada, nunca «activa ahora» sin verla", () => {
    expect(estadoAparato([], true)).toBe("en-linea");
    expect(estadoAparato([], false)).toBe("desconectada");
  });

  it("cada estado tiene color y texto propios", () => {
    const estados = Object.keys(TEXTO_ESTADO) as (keyof typeof TEXTO_ESTADO)[];
    expect(new Set(estados.map((e) => COLOR_ESTADO[e])).size).toBe(4);
    expect(new Set(estados.map((e) => TEXTO_ESTADO[e])).size).toBe(4);
  });
});

describe("construirVivo: aparatos, medios y enlaces", () => {
  const miFila = fila("yo", { esEsteDispositivo: true, syncDeviceId: "sync-yo" });

  it("clasifica el enlace y el estado de cada aparato por su fila y su presencia", () => {
    const filas = [
      miFila,
      fila("a", { enlace: { estado: "conectado", latenciaMs: 12, ruta: { clase: "misma-red-local", tipoLocal: "host", tipoRemoto: "host", protocolo: "udp", rttMs: 12, bytesEnviados: 1, bytesRecibidos: 2, medidoEn: AHORA } } }),
      fila("b", { online: false, ultimoVisto: undefined }),
    ];
    const v = construirVivo([aparato("a"), aparato("b")], contexto({ filas, presencia: { conectado: true, medios: [medioPresencia("a", "m-a1")] } }));
    expect(v.enlaces.get("neuron:a")).toMatchObject({ clase: "p2p-red-local", latenciaMs: 12 });
    expect(v.enlaces.get("neuron:b")?.clase).toBe("sin-enlace");
    expect(v.estados.get("neuron:a")).toBe("activa");
    expect(v.estados.get("neuron:b")).toBe("desconectada");
    expect(v.presenciaConectada).toBe(true);
  });

  it("un aparato con faro en el relé pero sin canal llega por el relé", () => {
    const a = aparato("a", { metrics: [{ label: "Faro en el relé", value: "hace 5 s" }] });
    const v = construirVivo([a], contexto({ filas: [fila("a")] }));
    expect(v.enlaces.get("neuron:a")?.clase).toBe("rele");
  });

  it("los medios abiertos orbitan a su aparato; el medio de la pestaña actual NO sale; los de este aparato orbitan a «Tú»", () => {
    const presencia = {
      conectado: true,
      medios: [
        medioPresencia("a", "m-a1"),
        medioPresencia("a", "m-a2", { visible: false }),
        medioPresencia("yo", "m-yo"), // esta pestaña
        medioPresencia("yo", "m-yo-app", { tipo: "app-nativa", etiqueta: "App nativa StarSeed OS" }), // otro medio de este aparato
        medioPresencia("fantasma", "m-f"), // aparato que no está en la lista de señales
      ],
    };
    const v = construirVivo([aparato("a")], contexto({ filas: [miFila, fila("a")], presencia }));
    expect(v.medios.map((m) => [m.m, m.padreId, m.propio])).toEqual([
      ["m-a1", "neuron:a", false], ["m-a2", "neuron:a", false], ["m-yo-app", "yo", true],
    ]);
    expect(v.medios.find((m) => m.m === "m-a2")?.visible).toBe(false);
  });

  it("marca como «enlazado» solo el medio cuyo id de sincronización es el del canal conectado", () => {
    const presencia = { conectado: true, medios: [medioPresencia("a", "m-a1", { sid: "sync-a" }), medioPresencia("a", "m-a2", { sid: "otro" })] };
    const v = construirVivo([aparato("a")], contexto({ filas: [fila("a", { enlace: { estado: "conectado" } })], presencia }));
    expect(v.medios.map((m) => [m.m, !!m.enlazado])).toEqual([["m-a1", true], ["m-a2", false]]);
    const sin = construirVivo([aparato("a")], contexto({ filas: [fila("a")], presencia }));
    expect(sin.medios.every((m) => !m.enlazado)).toBe(true);
  });

  it("cuenta lo que oye cada aparato (radar compartido por la malla)", () => {
    const v = construirVivo([aparato("a"), senal("remoto:a:ble:1", { antenna: "ble" }), senal("remoto:a:lora:2"), senal("remoto:b:lora:2")], contexto({ filas: [fila("a")] }));
    expect(v.oidas.get("neuron:a")).toBe(2);
    expect(v.oidas.get("neuron:b")).toBe(1);
  });

  it("sin presencia en vivo solo se sabe el latido, y se declara que la presencia no está conectada", () => {
    const v = construirVivo([aparato("a"), aparato("b")], contexto({ filas: [fila("a", { online: true }), fila("b", { online: false })], presencia: { conectado: false, medios: [] } }));
    expect(v.presenciaConectada).toBe(false);
    expect(v.estados.get("neuron:a")).toBe("en-linea");
    expect(v.estados.get("neuron:b")).toBe("desconectada");
    expect(v.medios).toEqual([]);
  });

  it("un enlace directo sin internet que casa con un aparato lo convierte en «directo» y no añade señal nueva", () => {
    const v = construirVivo([aparato("a")], contexto({ filas: [fila("a")], locales: [enlaceLocal("local:1", { syncDeviceId: "sync-a", rttMs: 4 })] }));
    expect(v.enlaces.get("neuron:a")).toMatchObject({ clase: "directo-sin-internet", latenciaMs: 4 });
    expect(v.extras).toEqual([]);
    expect(v.estados.get("neuron:a")).toBe("en-linea");
  });

  it("un enlace directo que no es ningún aparato del registro entra como señal nueva de cuenta, con la cuenta DECLARADA", () => {
    const v = construirVivo([], contexto({ locales: [enlaceLocal("local:9", { uid: "uid-yo" }), enlaceLocal("local:8", { uid: "otra" }), enlaceLocal("local:7")] }));
    expect(v.extras.map((e) => e.id)).toEqual(["local:9", "local:8", "local:7"]);
    expect(v.extras.map((e) => cuentaDe(e))).toEqual(["propia", "otra", "otra"]);
    expect(v.extras[0].starseed?.via).toBe("direct-link");
    expect(v.enlaces.get("local:9")).toMatchObject({ clase: "directo-sin-internet", latenciaMs: 9 });
    expect(v.estados.get("local:9")).toBe("en-linea");
  });
});

describe("señal de un enlace directo", () => {
  it("lleva solo lo medido: la calidad sale de la latencia real y sin latencia no hay calidad", () => {
    const s = senalDeEnlaceLocal(enlaceLocal("local:1", { rttMs: 9, capacidadKbps: null, plataforma: undefined }), "u", AHORA);
    expect(s.quality).toBeGreaterThan(0.8);
    expect(s.qualityDetail).toContain("9 ms");
    expect(s.metrics.map((m) => m.label)).toEqual(["Latencia", "Ruta"]);
    expect(s.placement.mode).toBe("sector");
    expect(senalDeEnlaceLocal(enlaceLocal("local:2", { rttMs: null }), "u", AHORA).quality).toBeNull();
    expect(senalDeEnlaceLocal(enlaceLocal("abc"), null, AHORA).id).toBe("local:abc");
  });
});

describe("subtituloAparato", () => {
  const p2p = { clase: "p2p-red-local" as const, etiqueta: "x", latenciaMs: 12 };
  const sin = { clase: "sin-enlace" as const, etiqueta: "Sin enlace", latenciaMs: null, motivo: "desconectada" };
  it("estado y enlace medido, sin repetir", () => {
    expect(subtituloAparato("activa", p2p)).toBe("activa ahora · 12 ms · red local");
    expect(subtituloAparato("en-linea", sin)).toBe("en línea · sin enlace");
  });
  it("un aparato desconectado se dice una sola vez", () => {
    expect(subtituloAparato("desconectada", sin)).toBe("desconectada");
  });
});
