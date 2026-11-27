import { describe, it, expect } from "vitest";
import {
  alternarActivo, anadirConocida, anadirGrupo, anadirTarjeta, anadirVinculo, cambiarModo, encuentrosPendientes,
  estadoPorDefecto, leerEstado, leerRegistroEncuentros, resumenCercania, revocarVinculo, vinculosActivos, MAX_ELEMENTOS,
} from "../estado-cercania";
import type { RegistroEncuentro } from "../encuentros";

const enc = (id: string, ofrecidas: RegistroEncuentro["ofrecidas"], hechas: RegistroEncuentro["hechas"]): RegistroEncuentro =>
  ({ id, neuronaId: "n1", relacion: "cuenta_nueva", via: "qr", en: 1, automaticas: [], ofrecidas, hechas, ubicacion: "no" });

describe("estado de cercanía", () => {
  it("lee basura como estado de fábrica", () => {
    expect(leerEstado(null)).toEqual(estadoPorDefecto());
    expect(leerEstado("{no es json")).toEqual(estadoPorDefecto());
    expect(leerEstado(JSON.stringify({ version: 2 }))).toEqual(estadoPorDefecto());
  });

  it("conserva lo guardado y sanea el modo", () => {
    const e = leerEstado(JSON.stringify({ version: 1, activo: false, modo: "raro", vinculos: "x" }));
    expect(e.activo).toBe(false);
    expect(e.modo).toBe("ambos");
    expect(e.vinculos).toEqual([]);
  });

  it("enciende, apaga y cambia de modo sin mutar", () => {
    const base = estadoPorDefecto();
    expect(alternarActivo(base).activo).toBe(false);
    expect(base.activo).toBe(true);
    expect(cambiarModo(base, "recibir").modo).toBe("recibir");
  });

  it("revoca un vínculo y deja de contarlo como activo", () => {
    let e = anadirVinculo(estadoPorDefecto(), { id: "v1", neuronaId: "n1", via: "nfc", desde: 1 });
    e = anadirVinculo(e, { id: "v2", neuronaId: "n2", via: "ble", desde: 2 });
    e = revocarVinculo(e, "v1");
    expect(vinculosActivos(e).map((v) => v.id)).toEqual(["v2"]);
    expect(e.vinculos).toHaveLength(2);
  });

  it("no repite personas, tarjetas ni grupos y respeta el tope", () => {
    let e = anadirConocida(estadoPorDefecto(), { neuronaId: "n1", nombre: "A", via: "nfc", vista: 1 });
    e = anadirConocida(e, { neuronaId: "n1", nombre: "A2", via: "nfc", vista: 2 });
    expect(e.conocidas).toHaveLength(1);
    expect(e.conocidas[0].nombre).toBe("A2");
    e = anadirTarjeta(e, { id: "t", neuronaId: "n1", titulo: "Hola", tipo: "presentacion", en: 1 });
    e = anadirGrupo(e, { id: "g", nombre: "G", neuronaIds: ["n1"], en: 1 });
    expect(e.tarjetas).toHaveLength(1);
    expect(e.grupos).toHaveLength(1);
    for (let i = 0; i < MAX_ELEMENTOS + 10; i++) e = anadirGrupo(e, { id: `g${i}`, nombre: "x", neuronaIds: [], en: i });
    expect(e.grupos).toHaveLength(MAX_ELEMENTOS);
  });

  it("encuentra los encuentros con ofertas sin hacer y resume", () => {
    const reg = [enc("a", ["enviar_archivo"], []), enc("b", ["enviar_archivo"], ["enviar_archivo"]), enc("c", [], [])];
    expect(encuentrosPendientes(reg).map((r) => r.id)).toEqual(["a"]);
    const e = anadirVinculo(estadoPorDefecto(), { id: "v", neuronaId: "n", via: "nfc", desde: 1 });
    expect(resumenCercania(e, reg)).toBe("1 vínculo · 1 pendiente");
    expect(resumenCercania(alternarActivo(e), reg)).toBe("Apagado");
  });

  it("lee el registro y tolera basura", () => {
    expect(leerRegistroEncuentros("nada")).toEqual([]);
    expect(leerRegistroEncuentros(null)).toEqual([]);
    expect(leerRegistroEncuentros(JSON.stringify([enc("a", [], [])]))).toHaveLength(1);
  });
});
