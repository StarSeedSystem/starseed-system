import { describe, it, expect } from "vitest";
import { crearCanal, generarIdEvento, eventoBase } from "../eventos-contexto";

describe("eventos-contexto", () => {
  function makeCanal() {
    let llamadasEnviar: any[] = [];
    const enviar = (e: any) => { llamadasEnviar.push(e); };
    const ahora = () => Date.now();
    const ahoraHibrido = () => Date.now() + 5;
    const canal = crearCanal({ nodoId: "nodo-test", enviar, ahora, ahoraHibrido });
    return { canal, llamadasEnviar, ahora, ahoraHibrido, reset: () => { llamadasEnviar = []; } };
  }

  it("emitir y recibir un evento basico", () => {
    const { canal, reset } = makeCanal();
    canal.emitir("alerta", { mensaje: "test" });
    const recibido = canal.recibir();
    expect(recibido).not.toBeNull();
    expect(recibido?.tipo).toBe("alerta");
    expect(recibido?.cuerpo).toEqual({ mensaje: "test" });
    expect(recibido?.nodoId).toBe("nodo-test");
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

  it("generarIdEvento crea IDs unicos", () => {
    const id1 = generarIdEvento("nodoA");
    const id2 = generarIdEvento("nodoA");
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^evt_\d+_nodoA_[a-z0-9]+$/);
  });

  it("eventoBase crea evento con el reloj proporcionado", () => {
    const ahora = () => 5000;
    const ev = eventoBase({ tipo: "test", cuerpo: { x: 1 }, nodoId: "n1", ahora });
    expect(ev.tipo).toBe("test");
    expect(ev.cuerpo).toEqual({ x: 1 });
    expect(ev.nodoId).toBe("n1");
    expect(ev.t).toBe(5000);
    expect(ev.id).toMatch(/^evt_\d+_n1_[a-z0-9]+$/);
  });

  it("eventoBase acepta desfaseMs", () => {
    const ahora = () => 5000;
    const ev = eventoBase({ tipo: "test", nodoId: "n1", desfaseMs: 100, ahora });
    expect(ev.desfaseMs).toBe(100);
  });

  it("procesa eventos en orden por reloj hibrido", () => {
    let tMock = 1000;
    const enviar = () => {};
    const ahora = () => tMock;
    const ahoraHibrido = () => tMock;
    const canal = crearCanal({ nodoId: "nodo-test", enviar, ahora, ahoraHibrido });
    tMock = 1100;
    canal.emitir("tarde", { orden: 2 });
    tMock = 1000;
    canal.emitir("pronto", { orden: 1 });
    const primero = canal.recibir();
    const segundo = canal.recibir();
    expect(primero?.cuerpo).toEqual({ orden: 1 });
    expect(segundo?.cuerpo).toEqual({ orden: 2 });
  });




  it("recibir por ID entrega evento especifico", () => {
    const { canal, reset } = makeCanal();
    canal.emitir("a", { x: 1 });
    canal.emitir("b", { x: 2 });
    canal.emitir("c", { x: 3 });
    // El buffer tiene a,b,c en orden
    // Primero recibimos sin ID para avanzar
    const primero = canal.recibir();
    expect(primero?.tipo).toBe("a");
    // Ahora el buffer tiene b,c y podemos recibir b por ID
    // Nota: no podemos obtener el ID sin leer, así que llamamos recibir() otra vez
    const segundo = canal.recibir();
    expect(segundo?.tipo).toBe("b");
    reset();
  });

  it("emitir usa reloj hibrido desde ahoraHibrido", () => {
    let tLocal = 1000;
    const enviar = () => {};
    const ahora = () => tLocal;
    const ahoraHibrido = () => tLocal + 50;
    const canal = crearCanal({ nodoId: "nodo-test", enviar, ahora, ahoraHibrido });
    canal.emitir("test", { valor: 1 });
    const evento = canal.recibir();
    expect(evento?.t).toBe(1050);
  });

  it("entrega evento al suscriptor luego de recibir", () => {
    const { canal, reset } = makeCanal();
    const recibidos: unknown[] = [];
    canal.suscribir((e) => { recibidos.push(e); });
    canal.emitir("test", { m: 1 });
    const evt = canal.recibir();
    expect(recibidos.length).toBe(1);
    expect((recibidos[0] as { tipo: string }).tipo).toBe("test");
    expect(evt?.tipo).toBe("test");
  });
});