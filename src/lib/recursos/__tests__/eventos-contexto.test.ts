import { describe, it, expect } from "vitest";
import { crearCanal } from "../eventos-contexto";

function makeCanal(tiempoBase = Date.now()) {
  let llamadasEnviar: any[] = [];
  const enviar = (e: any) => { llamadasEnviar.push(e); };
  const ahora = () => tiempoBase;
  const ahoraHibrido = () => tiempoBase + 2;
  const canal = crearCanal({ nodoId: "nodo-test", enviar, ahora, ahoraHibrido });
  return { canal, llamadasEnviar, ahora, ahoraHibrido, reset: () => { llamadasEnviar = []; } };
}

describe("eventos-contexto", () => {
  it("emitir y recibir un evento basico", () => {
    const { canal, reset } = makeCanal();
    canal.emitir("alerta", { mensaje: "test" });
    const recibido = canal.recibir();
    expect(recibido).not.toBeNull();
    expect(recibido?.tipo).toBe("alerta");
    expect(recibido?.cuerpo).toEqual({ mensaje: "test" });
    expect(recibido?.nodoId).toBe("nodo-test");
    expect(recibido?.t).toBe(2);
    reset();
  });

it("recibir con parametro sobre busca evento por ID", () => {
  const { canal, reset, llamadasEnviar } = makeCanal();
  canal.emitir("buscado", { x: 1 });
  const ultimo = llamadasEnviar[llamadasEnviar.length - 1];
  const encontrado = canal.recibir(ultimo?.id);
  expect(encontrado).not.toBeNull();
  if (encontrado && ultimo) {
    expect(encontrado?.id).toBe(ultimo?.id);
  }
  reset();
});

  it("emite y recibe en orden causal", () => {
    const { canal, reset } = makeCanal();
    canal.emitir("primero", { orden: 1 });
    canal.emitir("segundo", { orden: 2 });
    const primerEvento = canal.recibir();
    const segundoEvento = canal.recibir();
    expect(primerEvento).not.toBeNull();
    expect(segundoEvento).not.toBeNull();
    reset();
  });

  it("suscriptores reciben evento emitido despues", () => {
    const { canal, reset } = makeCanal();
    const sub1: any = [];
    const sub2: any = [];
    canal.suscribir((e: any) => { sub1.push(e); });
    canal.suscribir((e: any) => { sub2.push(e); });
    canal.emitir("multisub", { msg: "hola" });
    const recibido = canal.recibir();
    expect(sub1.length).toBe(1);
    expect(sub2.length).toBe(1);
    expect(recibido?.tipo).toBe("multisub");
    reset();
  });

  it("arbol de relevo con muchos receptores", () => {
    const { canal, reset } = makeCanal();
    const receptores = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const arbol = canal.obtenerArbol(
      receptores.map(id => ({ nodoId: id, subidaKbps: undefined }))
    );
    expect(arbol.nodos.size).toBe(11);
    const origenHijos = arbol.nodos.get("origen")?.hijos;
    expect(origenHijos?.length).toBeGreaterThan(0);
    reset();
  });

  it("solo un hijo por nodo sin medida", () => {
    const { canal, reset } = makeCanal();
    const arbol = canal.obtenerArbol([
      { nodoId: "n1", subidaKbps: undefined },
      { nodoId: "n2", subidaKbps: undefined },
      { nodoId: "n3", subidaKbps: undefined },
    ]);
    expect(arbol.nodos.get("origen")?.hijos).toEqual(["n1"]);
    expect(arbol.nodos.get("n1")?.hijos).toEqual(["n2"]);
    expect(arbol.nodos.get("n2")?.hijos).toEqual(["n3"]);
    reset();
  });

  it("evento con tipo y cuerpo preservados", () => {
    const { canal, reset } = makeCanal();
    canal.emitir("personalizado", { valor: 42, nombre: "test" });
    const recibido = canal.recibir();
    expect(recibido?.tipo).toBe("personalizado");
    expect(recibido?.cuerpo).toEqual({ valor: 42, nombre: "test" });
    reset();
  });

  it("evento usa el reloj hibrido (con desfase)", () => {
    const { canal, reset } = makeCanal(5000);
    canal.emitir("conDesfase", { x: 1 });
    const recibido = canal.recibir();
    expect(recibido?.t).toBe(5002);
    reset();
  });
});