import { afterEach, describe, expect, it } from "vitest";
import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import { crearConectorBase, instalarConectoresBase, TIPOS_BASE } from "../adaptadores";
import { fichaDeTipo } from "../fichas";
import { construirMapaVias } from "../mapa-vias";
import { SISTEMAS_VIAS } from "../mapa-vias-datos";
import { __vaciarConectores, alCambiarConectores, conectoresRegistrados, descubrirVias, registrarConector } from "../registro";
import type { ConectorMedio, ViaViva } from "../tipos";

function enl(p: Partial<EnlaceDisponible> & Pick<EnlaceDisponible, "id" | "tipo">): EnlaceDisponible {
  return { etiqueta: p.id, alcanza: {}, abierto: true, sinInternet: true, admite: { mensaje: true, archivo: true, flujo: false }, ...p };
}
const viva = (e: EnlaceDisponible): ViaViva => ({ conectorId: e.tipo, enlace: e, ficha: fichaDeTipo(e.tipo, e) });

afterEach(() => __vaciarConectores());

describe("fichas y adaptadores", () => {
  it("la ficha lee lo medido del enlace y el cifrado de CIF1108A", () => {
    const f = fichaDeTipo("ble", enl({ id: "ble:1", tipo: "ble", rttMs: 40, capacidadKbps: 300, maxBytes: 1000, cifrado: "cifrado" }));
    expect(f).toMatchObject({ anchoKbps: 300, latenciaMs: 40, mtu: 1000, cifrado: "cifrado", medida: true, llevaFlujos: false });
    expect(f.permisos).toContain("bluetooth");
    expect(fichaDeTipo("lora").mtu).toBe(200);
    expect(fichaDeTipo("lora").tiempoAire).toBe("escaso");
    expect(fichaDeTipo("rele").coste).toBe("servidor");
  });

  it("los siete medios de hoy quedan registrados y cada uno ve solo sus enlaces", async () => {
    const todos = TIPOS_BASE.map((t) => enl({ id: `${t}:x`, tipo: t }));
    const quitar = instalarConectoresBase({ fuente: async () => todos });
    expect(conectoresRegistrados().map((c) => c.id).sort()).toEqual([...TIPOS_BASE].sort());
    const vias = await descubrirVias();
    expect(vias).toHaveLength(7);
    expect(vias.every((v) => v.conectorId === v.enlace.tipo)).toBe(true);
    quitar();
    expect(conectoresRegistrados()).toHaveLength(0);
  });

  it("una fuente que falla no rompe: sin enlaces", async () => {
    const c = crearConectorBase("ble", { fuente: async () => { throw new Error("x"); } });
    expect(await c.descubrir()).toEqual([]);
    expect(await c.enlazar("B")).toBe(false);
    expect(await c.enviar("ble:x", "hola")).toBe(false);
  });
});

describe("registrarConector", () => {
  it("enchufa hardware nuevo sin tocar nada más y avisa", async () => {
    let avisos = 0;
    const baja = alCambiarConectores(() => { avisos++; });
    const nuevo: ConectorMedio = {
      id: "meshtastic-serie", tipo: "lora-serie", etiqueta: "Meshtastic por serie",
      descubrir: async () => [enl({ id: "serie:1", tipo: "lora" })],
      enlazar: async () => true, enviar: async () => true, alRecibir: () => () => {}, cerrar: () => {},
      ficha: (e) => fichaDeTipo("lora", e),
    };
    const quitar = registrarConector(nuevo);
    expect((await descubrirVias()).map((v) => v.conectorId)).toEqual(["meshtastic-serie"]);
    quitar();
    expect(conectoresRegistrados()).toHaveLength(0);
    expect(avisos).toBe(2);
    baja();
  });

  it("un conector roto se salta", async () => {
    registrarConector({ id: "roto", tipo: "x", etiqueta: "roto", descubrir: async () => { throw new Error("no"); }, enlazar: async () => false, enviar: async () => false, alRecibir: () => () => {}, cerrar: () => {}, ficha: () => fichaDeTipo("x") });
    expect(await descubrirVias()).toEqual([]);
  });
});

describe("construirMapaVias", () => {
  it("cubre los 14 sistemas del contrato", () => {
    expect(SISTEMAS_VIAS.map((s) => s.id)).toEqual(["mensajes", "llamadas", "archivos", "publicaciones", "paginas", "comunidades", "grupos", "canales", "transmisiones", "biblioteca", "conciencia", "cuenta", "avisos", "actualizaciones"]);
    expect(construirMapaVias([], false)).toHaveLength(14);
  });

  it("sin internet y con un Bluetooth abierto: mensajes y archivos funcionan; publicaciones no; llamadas no", () => {
    const ble = viva(enl({ id: "ble:1", tipo: "ble", etiqueta: "Bluetooth directo", cifrado: "cifrado" }));
    const m = new Map(construirMapaVias([ble], false).map((f) => [f.sistema.id, f]));
    expect(m.get("mensajes")).toMatchObject({ ahora: "funciona", medios: ["Bluetooth directo · cifrado"] });
    expect(m.get("archivos")?.ahora).toBe("funciona");
    expect(m.get("publicaciones")?.ahora).toBe("no");
    expect(m.get("llamadas")?.ahora).toBe("no");
    expect(m.get("biblioteca")?.ahora).toBe("parcial");
    expect(m.get("llamadas")?.falta[0]).toMatch(/Acercar/);
  });

  it("con internet pero sin medios locales funciona por el servidor y dice que falta abrir uno", () => {
    const m = new Map(construirMapaVias([], true).map((f) => [f.sistema.id, f]));
    expect(m.get("mensajes")?.medios).toEqual(["Internet (servidor)"]);
    expect(m.get("mensajes")?.falta[0]).toMatch(/Abrir un medio sin internet/);
    expect(m.get("publicaciones")?.ahora).toBe("funciona");
  });

  it("un enlace cerrado no cuenta", () => {
    const e = viva(enl({ id: "local:1", tipo: "local", abierto: false, admite: { mensaje: true, archivo: true, flujo: true } }));
    expect(construirMapaVias([e], false).find((f) => f.sistema.id === "llamadas")?.ahora).toBe("no");
  });

  it("la entrada 'cuenta' ahora es parcial: con sesión guardada se queda dentro y se enrola por QR", () => {
    const cuenta = SISTEMAS_VIAS.find((s) => s.id === "cuenta");
    expect(cuenta?.sinInternet).toBe("parcial");
    expect(cuenta?.porQue).toMatch(/sesión guardada/);
    expect(cuenta?.falta).toContain("Probar en dos aparatos reales");
    expect(cuenta?.falta).toContain("Crear una cuenta nueva sin ninguna neurona de confianza cerca (necesita un ancla: QR de otra persona o internet)");
  });
});
