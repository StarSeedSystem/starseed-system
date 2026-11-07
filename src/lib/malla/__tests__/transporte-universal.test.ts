/**
 * Transporte universal: envío con conmutación (dependencias inyectadas), sobres, forma corta para
 * relé/LoRa y recepción con acuse y sin duplicados. Y la máquina de estados de la llamada directa.
 */
import { describe, expect, it, vi } from "vitest";
import {
  alRecibirMensaje,
  crearEnviador,
  despacharTextoTransporte,
  esTextoTransporte,
  formaCorta,
  leerFormaCorta,
  type DepsEnvio,
  type SobreMensaje,
} from "@/lib/malla/transporte-universal";
import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import { transicionLlamada } from "@/lib/malla/llamada-directa";

const base = { abierto: true, sinInternet: false, admite: { mensaje: true, archivo: true, flujo: false } };
const local: EnlaceDisponible = { ...base, id: "local:1", tipo: "local", etiqueta: "Móvil", alcanza: { syncDeviceId: "B" }, sinInternet: true };
const cuenta: EnlaceDisponible = { ...base, id: "cuenta:B", tipo: "cuenta", etiqueta: "Móvil (cuenta)", alcanza: { syncDeviceId: "B" }, ruta: "internet-directo" };
const rele: EnlaceDisponible = { ...base, id: "rele", tipo: "rele", etiqueta: "Relé", alcanza: { difusion: true }, admite: { mensaje: true, archivo: false, flujo: false } };

function deps(p: Partial<DepsEnvio> = {}): DepsEnvio {
  let n = 0;
  return {
    listar: async () => [rele, cuenta, local],
    enviarP2P: () => true,
    enviarRele: async () => ({ ok: true, detalle: "relé cifrado subido" }),
    enviarLora: async () => ({ ok: false, detalle: "sin radio" }),
    esperarAcuse: async () => true,
    nuevoId: () => `id${++n}`,
    origen: () => ({ s: "A" }),
    ...p,
  };
}

describe("crearEnviador — el enlace más directo, con conmutación y diciendo cuál usó", () => {
  it("usa el enlace local y queda confirmado por su acuse", async () => {
    const enviarP2P = vi.fn(() => true);
    const r = await crearEnviador(deps({ enviarP2P }))({ syncDeviceId: "B", identidadRele: "fp" }, "nota", { texto: "hola" });
    expect(r).toMatchObject({ ok: true, confirmado: true, enlace: { id: "local:1", tipo: "local" } });
    expect(enviarP2P).toHaveBeenCalledTimes(1);
    const sobre = JSON.parse((enviarP2P.mock.calls[0] as unknown as [EnlaceDisponible, string])[1]) as SobreMensaje;
    expect(sobre).toMatchObject({ t: "tu.msg", v: 1, c: "nota", b: { texto: "hola" }, de: { s: "A" } });
  });

  it("si el local no acepta el envío, pasa al siguiente (la malla de la cuenta)", async () => {
    const r = await crearEnviador(deps({ enviarP2P: (e) => e.tipo !== "local" }))({ syncDeviceId: "B" }, "nota", 1);
    expect(r.enlace?.id).toBe("cuenta:B");
    expect(r.intentos.map((i) => [i.enlaceId, i.ok])).toEqual([
      ["local:1", false],
      ["cuenta:B", true],
    ]);
  });

  it("sin acuse prueba el siguiente y, si el relé lo sube, lo dice como enviado sin confirmar", async () => {
    const r = await crearEnviador(deps({ esperarAcuse: async () => false }))({ syncDeviceId: "B", identidadRele: "fp" }, "nota", 1, { esperarAcuseMs: 5 });
    expect(r).toMatchObject({ ok: true, confirmado: false, enlace: { id: "rele" } });
    expect(r.intentos.map((i) => i.detalle)).toEqual([expect.stringMatching(/sin acuse/), expect.stringMatching(/sin acuse/), "relé cifrado subido"]);
  });

  it("sin nada abierto lo dice; sin identidad para el relé no lo intenta", async () => {
    const vacio = await crearEnviador(deps({ listar: async () => [] }))({ syncDeviceId: "B" }, "nota", 1);
    expect(vacio).toMatchObject({ ok: false, enlace: null, motivo: expect.stringMatching(/ningún enlace abierto/) });
    const soloRele = await crearEnviador(deps({ listar: async () => [rele] }))({ uid: "u" }, "nota", 1);
    expect(soloRele.ok).toBe(false);
    expect(soloRele.descartados[0].motivo).toBe("no llega a ese destino");
  });
});

describe("forma corta (relé y LoRa) y recepción", () => {
  it("la forma corta usa solo los campos que deja pasar la radio y se lee de vuelta", () => {
    const sobre: SobreMensaje = { t: "tu.msg", v: 1, id: "abc", c: "estacion", b: { p: 1 } };
    const corta = formaCorta(sobre, "u1");
    expect(Object.keys(corta).sort()).toEqual(["cv", "to", "txt"]);
    expect(leerFormaCorta(corta)).toEqual({ id: "abc", canal: "estacion", cuerpo: { p: 1 }, to: "u1" });
    expect(leerFormaCorta({ to: "", txt: "x", cv: "otro:1" })).toBeNull();
  });

  it("entrega una sola vez aunque llegue por dos caminos, y acusa recibo por el mismo canal", () => {
    const recibidos: unknown[] = [];
    const baja = alRecibirMensaje("prueba-dup", (m) => recibidos.push(m.cuerpo));
    const respuestas: string[] = [];
    const texto = JSON.stringify({ t: "tu.msg", v: 1, id: "dup-1", c: "prueba-dup", b: { n: 7 } });
    expect(esTextoTransporte(texto)).toBe(true);
    despacharTextoTransporte(texto, { tipo: "local", enlaceId: "local:1", etiqueta: "Móvil" }, (t) => respuestas.push(t));
    despacharTextoTransporte(texto, { tipo: "cuenta", enlaceId: "cuenta:B", etiqueta: "Móvil" }, (t) => respuestas.push(t));
    expect(recibidos).toEqual([{ n: 7 }]);
    expect(respuestas.map((r) => JSON.parse(r))).toEqual([
      { t: "tu.ack", id: "dup-1" },
      { t: "tu.ack", id: "dup-1" },
    ]);
    baja();
  });

  it("ignora lo que no es de esta capa", () => {
    expect(esTextoTransporte('{"t":"archivo.chunk"}')).toBe(false);
    expect(esTextoTransporte(new ArrayBuffer(2))).toBe(false);
  });
});

describe("llamada directa — máquina de estados", () => {
  it("sigue el ciclo llamar → aceptada → colgar → reposo", () => {
    expect(transicionLlamada("inactiva", "llamar")).toBe("llamando");
    expect(transicionLlamada("llamando", "aceptada")).toBe("en-curso");
    expect(transicionLlamada("en-curso", "colgar")).toBe("terminada");
    expect(transicionLlamada("terminada", "reposo")).toBe("inactiva");
  });

  it("no acepta eventos fuera de lugar (no se puede contestar sin timbre ni llamar dos veces)", () => {
    expect(transicionLlamada("inactiva", "contestar")).toBeNull();
    expect(transicionLlamada("en-curso", "llamar")).toBeNull();
    expect(transicionLlamada("en-curso", "sonar-recibido")).toBeNull();
    expect(transicionLlamada("inactiva", "colgar")).toBeNull();
    expect(transicionLlamada("entrante", "rechazar")).toBe("terminada");
    expect(transicionLlamada("llamando", "sin-respuesta")).toBe("terminada");
  });
});

describe("crearEnviador — red local de la app nativa (MLT1107A)", () => {
  const nativo: EnlaceDisponible = {
    ...base,
    id: "nativo:192.168.1.20",
    tipo: "nativo",
    etiqueta: "Tablet · red local",
    alcanza: { syncDeviceId: "B", neuronDeviceId: "N-B" },
    sinInternet: true,
    ruta: "misma-red-local",
  };

  it("va por el canal nativo antes que la malla de la cuenta y el acuse de la otra app lo confirma", async () => {
    const enviarNativo = vi.fn(async () => ({ ok: true, detalle: "entregado: la app del otro aparato acusó recibo (3 ms)" }));
    const enviarP2P = vi.fn(() => true);
    const r = await crearEnviador(deps({ listar: async () => [rele, cuenta, nativo], enviarNativo, enviarP2P }))({ neuronDeviceId: "N-B", syncDeviceId: "B" }, "chat", { txt: "hola" });
    expect(r).toMatchObject({ ok: true, confirmado: true, enlace: { id: "nativo:192.168.1.20", tipo: "nativo" } });
    expect(r.intentos).toEqual([{ enlaceId: "nativo:192.168.1.20", tipo: "nativo", ok: true, detalle: expect.stringMatching(/acusó recibo/) }]);
    expect(enviarP2P).not.toHaveBeenCalled();
    const sobre = JSON.parse((enviarNativo.mock.calls[0] as unknown as [EnlaceDisponible, string])[1]) as SobreMensaje;
    expect(sobre).toMatchObject({ t: "tu.msg", c: "chat", b: { txt: "hola" } });
  });

  it("si la otra app no acusa (o no hay canal nativo), sigue por el siguiente enlace y lo dice", async () => {
    const falla = await crearEnviador(deps({ listar: async () => [nativo, cuenta], enviarNativo: async () => ({ ok: false, detalle: "La app de 192.168.1.20 no acusa recibo" }) }))({ syncDeviceId: "B" }, "chat", 1);
    expect(falla.enlace?.id).toBe("cuenta:B");
    expect(falla.intentos[0]).toMatchObject({ enlaceId: "nativo:192.168.1.20", ok: false, detalle: expect.stringMatching(/no acusa/) });
    const sinCanal = await crearEnviador(deps({ listar: async () => [nativo, cuenta] }))({ syncDeviceId: "B" }, "chat", 1);
    expect(sinCanal.intentos[0]).toMatchObject({ ok: false, detalle: expect.stringMatching(/no está activo/) });
    expect(sinCanal.enlace?.id).toBe("cuenta:B");
  });

  it("lo que llega por el canal nativo se entrega a sus oyentes con su vía", () => {
    const visto: string[] = [];
    alRecibirMensaje("nativo-prueba", (m) => visto.push(`${m.origen.tipo} ${m.origen.enlaceId} ${m.origen.etiqueta}`));
    despacharTextoTransporte(JSON.stringify({ t: "tu.msg", v: 1, id: "n1", c: "nativo-prueba", b: 1 }), { tipo: "nativo", enlaceId: "nativo:192.168.1.10", etiqueta: "Mac · red local" }, () => undefined);
    expect(visto).toEqual(["nativo nativo:192.168.1.10 Mac · red local"]);
  });
});
