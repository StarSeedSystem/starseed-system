import { describe, it, expect } from "vitest";
import {
  AlmacenCapas,
  almacenamientoEnMemoria,
  type TrozoCapa,
} from "../almacen";
import type { EntradaCapa } from "../catalogo";

const shaHex = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const bytes = (texto: string): ArrayBuffer => new TextEncoder().encode(texto).buffer;

async function trozoDe(datos: ArrayBuffer, indice: number): Promise<TrozoCapa> {
  return { indice, sha256: await shaHex(datos), datos };
}

async function entradaDe(trozos: ArrayBuffer[]): Promise<EntradaCapa> {
  const total = trozos.reduce((s, t) => s + t.byteLength, 0);
  const entero = new Uint8Array(total);
  let d = 0;
  for (const t of trozos) {
    entero.set(new Uint8Array(t), d);
    d += t.byteLength;
  }
  return {
    id: "capa-prueba",
    familia: "familia/prueba",
    capa: "reflejo",
    modelo: "Prueba",
    version: "1.0",
    formato: "cact",
    runtime: "needle-wasm",
    parametros: "121 M",
    disco_mb: 8,
    ram_min_mb: 64,
    sha256: await shaHex(entero.buffer),
    fuente_oficial: "https://huggingface.co/familia/prueba",
    espejos: [],
    estado: "recomendado",
    medios: ["web"],
  };
}

describe("AlmacenCapas · guardarCapa", () => {
  it("guarda con SHA bueno por trozo y total, y abre el archivo entero", async () => {
    const trozosDatos = [bytes("hola "), bytes("capa "), bytes("needle")];
    const trozos = await Promise.all(trozosDatos.map(trozoDe));
    const entrada = await entradaDe(trozosDatos);
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    const res = await almacen.guardarCapa(entrada, trozos);
    expect(res.ok).toBe(true);
    const abierto = await almacen.abrirCapa(entrada.id);
    expect(new TextDecoder().decode(abierto!)).toBe("hola capa needle");
    const estado = await almacen.estado();
    expect(estado.capas[0]?.completa).toBe(true);
    expect(estado.usadosBytes).toBe(16);
  });

  it("rechaza un trozo con SHA que no cuadra", async () => {
    const datos = bytes("trozo");
    const trozo = await trozoDe(datos, 0);
    trozo.sha256 = "0".repeat(64);
    const entrada = await entradaDe([datos]);
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    const res = await almacen.guardarCapa(entrada, [trozo]);
    expect(res).toEqual({ ok: false, motivo: "sha-trozo" });
    expect(await almacen.abrirCapa(entrada.id)).toBeNull();
  });

  it("rechaza y borra la capa si el SHA total no es el del catálogo", async () => {
    const datos = [bytes("aa"), bytes("bb")];
    const trozos = await Promise.all(datos.map(trozoDe));
    const entrada = await entradaDe(datos);
    entrada.sha256 = "f".repeat(64); // SHA del catálogo que no corresponde
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    const res = await almacen.guardarCapa(entrada, trozos);
    expect(res).toEqual({ ok: false, motivo: "sha-total" });
    const estado = await almacen.estado();
    expect(estado.usadosBytes).toBe(0);
    expect(estado.capas).toEqual([]);
  });

  it("rechaza una entrada sin SHA del catálogo (§11: sin SHA no se usa jamás)", async () => {
    const datos = bytes("x");
    const trozo = await trozoDe(datos, 0);
    const entrada = await entradaDe([datos]);
    entrada.sha256 = "";
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    const res = await almacen.guardarCapa(entrada, [trozo]);
    expect(res).toEqual({ ok: false, motivo: "sha-desconocido" });
  });

  it("reanuda: los trozos ya guardados no se duplican y se retoman", async () => {
    const datos = [bytes("uno"), bytes("dos"), bytes("tres")];
    const trozos = await Promise.all(datos.map(trozoDe));
    const entrada = await entradaDe(datos);
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    // Simula una descarga interrumpida: solo llegó el trozo 0.
    await almacen.guardarTrozo(entrada, trozos[0]);
    expect(await almacen.trozosGuardados(entrada.id)).toEqual([0]);
    const antes = (await almacen.estado()).usadosBytes;
    // Llega de nuevo el 0 (reintento) y después el 1: no suma el 0 dos veces.
    await almacen.guardarTrozo(entrada, trozos[0]);
    await almacen.guardarTrozo(entrada, trozos[1]);
    expect((await almacen.estado()).usadosBytes).toBe(antes + 3);
    // Se retoma y se cierra con los tres trozos.
    const res = await almacen.guardarCapa(entrada, [trozos[1], trozos[2], trozos[0]]);
    expect(res.ok).toBe(true);
    expect(new TextDecoder().decode((await almacen.abrirCapa(entrada.id))!)).toBe("unodostres");
  });
});

describe("AlmacenCapas · LRU y fijadas", () => {
  const capaGuardada = async (
    almacen: AlmacenCapas,
    id: string,
    cuerpo: string,
  ): Promise<EntradaCapa> => {
    const datos = [bytes(cuerpo)];
    const entrada = { ...(await entradaDe(datos)), id };
    const trozo = await trozoDe(datos[0], 0);
    expect((await almacen.guardarCapa(entrada, [trozo])).ok).toBe(true);
    return entrada;
  };

  it("hacerSitio expulsa la menos usada sin tocar las fijadas", async () => {
    let reloj = 0;
    const almacen = new AlmacenCapas(almacenamientoEnMemoria(), {
      ahora: () => ++reloj,
    });
    const vieja = await capaGuardada(almacen, "vieja", "12345"); // 5 B
    await capaGuardada(almacen, "fijada", "12345"); // 5 B, fijada
    await almacen.fijar("fijada", true);
    await capaGuardada(almacen, "nueva", "12345"); // 5 B
    // Presupuesto de 10 B: hay 15; debe expulsar "vieja" (LRU) y respetar la fijada.
    const expulsadas = await almacen.hacerSitio(10);
    expect(expulsadas).toEqual(["vieja"]);
    expect(await almacen.abrirCapa("fijada")).not.toBeNull();
    expect(await almacen.abrirCapa(vieja.id)).toBeNull();
    expect((await almacen.estado()).usadosBytes).toBe(10);
  });

  it("hacerSitio no expulsa nada si ya cabe en el presupuesto", async () => {
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    await capaGuardada(almacen, "a", "12345");
    expect(await almacen.hacerSitio(100)).toEqual([]);
  });

  it("fijar sobre una capa inexistente devuelve false", async () => {
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    expect(await almacen.fijar("fantasma", true)).toBe(false);
  });
});

describe("AlmacenCapas · presupuesto y persist()", () => {
  it("pide persist() al pasar de 50 MB escritos, una sola vez", async () => {
    let llamadas = 0;
    const almacen = new AlmacenCapas(almacenamientoEnMemoria(), {
      pedirPersistencia: async () => {
        llamadas += 1;
        return true;
      },
      umbralPersistBytes: 10,
    });
    await almacen.guardarTrozo(
      await entradaDe([bytes("aaaaaa")]),
      await trozoDe(bytes("aaaaaa"), 0),
    );
    expect(llamadas).toBe(0); // 6 B < 10
    await almacen.guardarTrozo(
      await entradaDe([bytes("aaaaaa")]),
      await trozoDe(bytes("bbbbbb"), 1),
    );
    expect(llamadas).toBe(1); // 12 B ≥ 10
    await almacen.guardarTrozo(
      await entradaDe([bytes("aaaaaa")]),
      await trozoDe(bytes("cccccc"), 2),
    );
    expect(llamadas).toBe(1); // no repite
    expect((await almacen.estado()).persistente).toBe(true);
  });

  it("sin pedirPersistencia no falla y marca umbral igualmente", async () => {
    const almacen = new AlmacenCapas(almacenamientoEnMemoria(), {
      umbralPersistBytes: 2,
    });
    const ok = await almacen.guardarTrozo(
      await entradaDe([bytes("aaa")]),
      await trozoDe(bytes("aaa"), 0),
    );
    expect(ok).toBe(true);
    expect((await almacen.estado()).persistente).toBe(true);
  });

  it("estado() informa tamaño, último uso y fijada por capa", async () => {
    let reloj = 100;
    const almacen = new AlmacenCapas(almacenamientoEnMemoria(), {
      ahora: () => reloj,
    });
    const datos = [bytes("abcd")];
    const entrada = await entradaDe(datos);
    await almacen.guardarCapa(entrada, [await trozoDe(datos[0], 0)]);
    await almacen.fijar(entrada.id, true);
    reloj = 200;
    await almacen.abrirCapa(entrada.id);
    const info = (await almacen.estado()).capas[0];
    expect(info).toMatchObject({
      id: entrada.id,
      bytes: 4,
      ultimoUso: 200,
      fijada: true,
      completa: true,
      trozosGuardados: 1,
    });
  });

  it("responde el presupuesto: hacerSitio con 0 solo deja fijadas", async () => {
    const almacen = new AlmacenCapas(almacenamientoEnMemoria());
    const datos = [bytes("zz")];
    const entrada = await entradaDe(datos);
    await almacen.guardarCapa(entrada, [await trozoDe(datos[0], 0)]);
    const expulsadas = await almacen.hacerSitio(0);
    expect(expulsadas).toEqual([entrada.id]);
    expect((await almacen.estado()).usadosBytes).toBe(0);
  });
});
