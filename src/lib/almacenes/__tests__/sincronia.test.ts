import { describe, it, expect } from "vitest";
import {
  dividirEnBloques,
  bloquesFaltantes,
  iniciarTransferencia,
  marcarRecibido,
  reanudar,
  pendientes,
  estaCompleta,
  registrarVersion,
  versionesAPodar,
} from "../bloques";
import {
  planificar,
  planPorDefecto,
  debeEjecutar,
  nombreVariacion,
  pasaFiltro,
  type Lado,
  type EntradaArchivo,
} from "../sincronia";

const f = (ruta: string, hash: string, tam = 10): EntradaArchivo => ({ ruta, hash, tam, mtime: 1 });
const lado = (...es: EntradaArchivo[]): Lado => Object.fromEntries(es.map((e) => [e.ruta, e]));
const enc = (s: string) => new TextEncoder().encode(s);

describe("bloques", () => {
  it("el mismo contenido da el mismo id y otro contenido otro", () => {
    const a = dividirEnBloques(enc("aaaabbbb"), 4);
    expect(a).toHaveLength(2);
    expect(a[0].id).not.toBe(a[1].id);
    expect(dividirEnBloques(enc("aaaa"), 4)[0].id).toBe(a[0].id);
    expect(() => dividirEnBloques(enc("x"), 0)).toThrow();
  });

  it("bloques repetidos se piden una sola vez y los que ya hay no", () => {
    const b = dividirEnBloques(enc("aaaaaaaabbbb"), 4);
    const falta = bloquesFaltantes(b, new Set([b[2].id]));
    expect(falta.map((x) => x.id)).toEqual([b[0].id]);
  });

  it("reanuda tras un corte y reinicia si el archivo cambió", () => {
    const b = dividirEnBloques(enc("11112222"), 4);
    let t = iniciarTransferencia("a.txt", "h1", b);
    t = marcarRecibido(t, b[0].id);
    expect(pendientes(reanudar(t, "h1", b)).map((x) => x.id)).toEqual([b[1].id]);
    const nuevo = dividirEnBloques(enc("33334444"), 4);
    const r = reanudar(t, "h2", nuevo);
    expect(r.recibidos).toEqual([]);
    expect(estaCompleta(marcarRecibido(marcarRecibido(t, b[1].id), "no-existe"))).toBe(true);
  });

  it("versiones: se añaden, no se repiten seguidas y la poda solo propone", () => {
    let h = registrarVersion([], { hash: "a", tam: 1, fecha: 1 });
    h = registrarVersion(h, { hash: "a", tam: 1, fecha: 2 });
    h = registrarVersion(h, { hash: "b", tam: 1, fecha: 3 });
    h = registrarVersion(h, { hash: "c", tam: 1, fecha: 4 });
    expect(h).toHaveLength(3);
    expect(versionesAPodar(h, 2).map((v) => v.hash)).toEqual(["a"]);
    expect(h).toHaveLength(3);
    expect(versionesAPodar(h, 0)).toHaveLength(2);
  });
});

describe("sincronia", () => {
  const plan = planPorDefecto("v1");
  const base = (...es: EntradaArchivo[]) => lado(...es);

  it("conflicto: ambos cambiaron → variación, nunca pisa", () => {
    const acc = planificar({
      plan, origenRemoto: "neurona-b",
      local: lado(f("doc.txt", "L1")), remoto: lado(f("doc.txt", "R1")), base: base(f("doc.txt", "B0")),
    });
    expect(acc).toEqual([
      { tipo: "conflicto", ruta: "doc.txt", guardarComo: "doc (conflicto neurona-b R1).txt", hashLocal: "L1", hashRemoto: "R1" },
    ]);
  });

  it("lo que llega de otros pide aceptación por defecto", () => {
    const acc = planificar({ plan, origenRemoto: "x", local: {}, remoto: lado(f("n.txt", "R")), base: {} });
    expect(acc).toEqual([{ tipo: "recibir", ruta: "n.txt", hash: "R", requiereAceptacion: true }]);
    const auto = planificar({ plan: { ...plan, aceptarSinPreguntar: true }, origenRemoto: "x", local: {}, remoto: lado(f("n.txt", "R")), base: {} });
    expect(auto[0]).toMatchObject({ tipo: "recibir", requiereAceptacion: false });
  });

  it("un borrado en un lado solo se propone, nunca se ejecuta", () => {
    const acc = planificar({ plan, origenRemoto: "x", local: lado(f("a", "H")), remoto: {}, base: base(f("a", "H")) });
    expect(acc).toEqual([{ tipo: "proponer_borrado", ruta: "a", lado: "local" }]);
    const inv = planificar({ plan, origenRemoto: "x", local: {}, remoto: lado(f("a", "H")), base: base(f("a", "H")) });
    expect(inv).toEqual([{ tipo: "proponer_borrado", ruta: "a", lado: "remoto" }]);
  });

  it("dirección: «enviar» no recibe y «recibir» no envía", () => {
    const e = { origenRemoto: "x", local: lado(f("l", "1")), remoto: lado(f("r", "2")), base: {} };
    expect(planificar({ ...e, plan: { ...plan, direccion: "enviar" } }).map((a) => a.tipo)).toEqual(["enviar"]);
    expect(planificar({ ...e, plan: { ...plan, direccion: "recibir" } }).map((a) => a.tipo)).toEqual(["recibir"]);
  });

  it("réplica congelada: copia inicial sí, después nada", () => {
    const p = { ...plan, modo: "replica_congelada" as const };
    const e = { plan: p, origenRemoto: "x", local: {}, remoto: lado(f("a", "1")), base: {} };
    expect(planificar(e)).toHaveLength(1);
    expect(planificar({ ...e, copiaInicialHecha: true })).toEqual([]);
  });

  it("filtros por carpeta, tipo y tamaño", () => {
    const filtro = { carpetas: ["fotos"], extensiones: [".JPG"], tamMaximo: 100 };
    expect(pasaFiltro(filtro, f("fotos/a.jpg", "h", 50))).toBe(true);
    expect(pasaFiltro(filtro, f("fotos2/a.jpg", "h", 50))).toBe(false);
    expect(pasaFiltro(filtro, f("fotos/a.png", "h", 50))).toBe(false);
    expect(pasaFiltro(filtro, f("fotos/a.jpg", "h", 500))).toBe(false);
  });

  it("cuándo corre: tiempo real, al conectar, programada y manual", () => {
    const p = (cuando: "tiempo_real" | "al_conectar" | "programada" | "manual") => ({ ...plan, cuando, cadaMs: 1000 });
    expect(debeEjecutar(p("tiempo_real"), "cambio", 0, null)).toBe(true);
    expect(debeEjecutar(p("al_conectar"), "conexion", 0, null)).toBe(true);
    expect(debeEjecutar(p("al_conectar"), "cambio", 0, null)).toBe(false);
    expect(debeEjecutar(p("programada"), "reloj", 500, 0)).toBe(false);
    expect(debeEjecutar(p("programada"), "reloj", 1500, 0)).toBe(true);
    expect(debeEjecutar(p("manual"), "reloj", 9e9, null)).toBe(false);
    expect(debeEjecutar(p("manual"), "boton", 0, null)).toBe(true);
  });

  it("nombreVariacion conserva extensión y no toca carpetas con punto", () => {
    expect(nombreVariacion("a/b.c/doc", "n", "abcdef123")).toBe("a/b.c/doc (conflicto n abcdef)");
    expect(nombreVariacion("x.tar.gz", "n", "abcdef123")).toBe("x.tar (conflicto n abcdef).gz");
  });
});
