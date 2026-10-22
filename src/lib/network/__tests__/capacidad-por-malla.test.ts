/**
 * capacidad-por-malla (Ola 1017A · tarea E) — protocolo `capacidad.*` y CLIENTE
 * `pedirCapacidad` contra un canal falso (sin red, sin disco, sin procesos):
 * guardas, éxito, trozos desordenados, error, cancelar y tiempo agotado.
 */
import { describe, expect, it } from "vitest";
import {
  esMensajeCapacidadMalla,
  esTipoCapacidad,
  parseCapacidadMallaMensaje,
  pedirCapacidad,
  type TipoCapacidad,
} from "@/lib/network/capacidad-por-malla";

/** Canal falso: `enviar`/`suscribir` en memoria; `recibir` simula al servidor. */
class CanalFalso {
  enviados: { peerId: string; data: string }[] = [];
  suscritos: ((peerId: string, data: string) => void)[] = [];
  enviar(peerId: string, data: string): boolean {
    this.enviados.push({ peerId, data });
    return true;
  }
  suscribir(manejar: (peerId: string, data: string) => void): () => void {
    const lista = this.suscritos;
    lista.push(manejar);
    return () => lista.splice(lista.indexOf(manejar), 1);
  }
  recibir(peerId: string, data: string): void {
    for (const m of [...this.suscritos]) m(peerId, data);
  }
  primerId(): string {
    return (JSON.parse(this.enviados[0]!.data) as { id: string }).id;
  }
}

function opciones(canal: CanalFalso, extra: Partial<Parameters<typeof pedirCapacidad>[1]> = {}): Parameters<typeof pedirCapacidad>[1] {
  return { peerId: "servidor", tipo: "imagen", cuerpo: { indicacion: "un olivo dorado" }, sesionId: "s-1", suscribir: (m) => canal.suscribir(m), ...extra };
}
const enviarPor = (canal: CanalFalso) => (peerId: string, data: string) => canal.enviar(peerId, data);
describe("protocolo capacidad.*", () => {
  it("guarda los cinco mensajes bien formados; rechaza basura, namespace ajeno y tipo raro", () => {
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1", tipo: "voz", cuerpo: {} })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.trozo", id: "1", indice: 0, texto: "x" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.fin", id: "1" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.error", id: "1", estado: 503, mensaje: "x" })).toBe(true);
    expect(esMensajeCapacidadMalla({ t: "capacidad.cancelar", id: "1" })).toBe(true);
    expect(esMensajeCapacidadMalla(null)).toBe(false);
    expect(esMensajeCapacidadMalla("texto")).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "ia.pedir", id: "1", tipo: "voz", cuerpo: {} })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.pedir", id: "1", tipo: "magia", cuerpo: {} })).toBe(false);
    expect(esMensajeCapacidadMalla({ t: "capacidad.trozo", id: "1", texto: "x" })).toBe(false);
  });

  it("esTipoCapacidad y parse defensivo (JSON roto ⇒ null, nunca lanza)", () => {
    expect(esTipoCapacidad("transcodificar")).toBe(true);
    expect(esTipoCapacidad("voladora")).toBe(false);
    expect(parseCapacidadMallaMensaje(JSON.stringify({ t: "capacidad.fin", id: "1" }))).toEqual({ t: "capacidad.fin", id: "1" });
    expect(parseCapacidadMallaMensaje("{roto")).toBeNull();
  });
});
describe("pedirCapacidad (nunca lanza)", () => {
  it("tipo no reconocido ⇒ ok:false sin mandar nada por el canal", async () => {
    const canal = new CanalFalso();
    const r = await pedirCapacidad(enviarPor(canal), opciones(canal, { tipo: "magia" as TipoCapacidad }));
    expect(r).toEqual({ ok: false, motivo: 'Tipo de capacidad no reconocido: "magia".' });
    expect(canal.enviados).toHaveLength(0);
  });

  it("éxito: reúne los trozos en orden y cierra con ok:true", async () => {
    const canal = new CanalFalso();
    const promesa = pedirCapacidad(enviarPor(canal), opciones(canal));
    expect(canal.enviados).toHaveLength(1);
    expect(JSON.parse(canal.enviados[0]!.data)).toMatchObject({ t: "capacidad.pedir", tipo: "imagen", id: "s-1" });
    const id = canal.primerId();
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id, indice: 0, texto: "Hola" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id, indice: 1, texto: " mundo" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.fin", id }));
    await expect(promesa).resolves.toEqual({ ok: true, texto: "Hola mundo" });
  });

  it("trozos desordenados: se reensamblan por índice y lo de otra sesión se ignora", async () => {
    const canal = new CanalFalso();
    const promesa = pedirCapacidad(enviarPor(canal), opciones(canal));
    const id = canal.primerId();
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id: "otra", indice: 9, texto: "ruido" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id, indice: 2, texto: "c" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id, indice: 0, texto: "a" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.trozo", id, indice: 1, texto: "b" }));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.fin", id }));
    await expect(promesa).resolves.toEqual({ ok: true, texto: "abc" });
  });

  it("error del servidor ⇒ ok:false con motivo y ocupado, sin lanzar", async () => {
    const canal = new CanalFalso();
    const promesa = pedirCapacidad(enviarPor(canal), opciones(canal));
    canal.recibir("servidor", JSON.stringify({ t: "capacidad.error", id: canal.primerId(), estado: 429, mensaje: "cola llena", ocupado: true }));
    await expect(promesa).resolves.toEqual({ ok: false, motivo: "cola llena", ocupado: true });
  });

  it("cancelar: abortar la signal manda capacidad.cancelar y resuelve ok:false", async () => {
    const canal = new CanalFalso();
    const control = new AbortController();
    const promesa = pedirCapacidad(enviarPor(canal), opciones(canal, { signal: control.signal }));
    control.abort();
    await expect(promesa).resolves.toMatchObject({ ok: false });
    const ultimo = JSON.parse(canal.enviados[canal.enviados.length - 1]!.data) as { t: string; id: string };
    expect(ultimo).toEqual({ t: "capacidad.cancelar", id: "s-1" });
  });

  it("tiempo agotado ⇒ ok:false con «sin respuesta», manda cancelar y se baja del canal", async () => {
    const canal = new CanalFalso();
    const promesa = pedirCapacidad(enviarPor(canal), opciones(canal, { timeoutMs: 25 }));
    const r = (await promesa) as { ok: boolean; motivo: string };
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("sin respuesta");
    const ultimo = JSON.parse(canal.enviados[canal.enviados.length - 1]!.data) as { t: string };
    expect(ultimo.t).toBe("capacidad.cancelar");
    expect(canal.suscritos).toHaveLength(0);
  });
});
