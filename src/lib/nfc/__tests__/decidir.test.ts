import { describe, it, expect } from "vitest";
import { decidir } from "../decidir";
import { establecerExcepcion, establecerRelacion, ignorar, preferenciasPorDefecto, recordar, type Relacion } from "../preferencias";
import type { TarjetaNeurona } from "../tarjeta";

const h = (c: string, n: number) => c.repeat(n);
const tarjeta = (o: Partial<TarjetaNeurona> = {}): TarjetaNeurona => ({
  version: 1, neuronaId: "ajena", clavePublica: h("a", 64), cuenta: { modo: "alias", valor: "luna" },
  claveEfimera: h("b", 64), nonce: h("c", 32), emitidaEn: 1, ofertas: ["pagina"],
  transportes: [{ tipo: "ble", direccion: "x" }], firma: h("d", 128), ...o,
});
const propia = tarjeta({ neuronaId: "propia" });
const ver = (relacion: Relacion, ajena = tarjeta(), prefs = preferenciasPorDefecto()) => decidir({ propia, ajena, relacion, prefs });

describe("decidir · valores por defecto", () => {
  it("misma cuenta: perfil completo, sugerencias y todo ofrecido sin automático", () => {
    const d = ver("misma_cuenta");
    expect(d.mostrar).toBe(true);
    expect(d.perfil).toEqual({ tipo: "completo", neuronaId: "ajena", cuenta: { modo: "alias", valor: "luna" } });
    expect(d.automaticas).toEqual([]);
    expect(d.ofrecidas).toContain("enviar_cerebro");
    expect(d.ofrecidas).toContain("control_remoto");
    expect(d.sugerenciasAstraura).toBe(true);
  });
  it("cuenta nueva: perfil pendiente, solo contacto y mensaje, nada automático", () => {
    const d = ver("cuenta_nueva");
    expect(d.perfil).toEqual({ tipo: "pendiente", neuronaId: "ajena" });
    expect(d.ofrecidas).toEqual(["anadir_contacto", "mandar_mensaje"]);
    expect(d.automaticas).toEqual([]);
    expect(d.sugerenciasAstraura).toBe(false);
  });
  it("etiqueta: solo neurona y abrir la oferta", () => {
    const d = ver("etiqueta");
    expect(d.perfil.tipo).toBe("solo_neurona");
    expect(d.ofrecidas).toEqual(["abrir_oferta_nodo"]);
  });
  it("nodo público: oferta, entrada a evento y ubicación", () => {
    expect([...ver("nodo_publico").ofrecidas].sort()).toEqual(["abrir_oferta_nodo", "registrar_entrada_evento", "registrar_ubicacion"]);
  });
});

describe("decidir · seguridad con lo desconocido", () => {
  const todas = ["anadir_contacto", "enviar_archivo", "enviar_cerebro", "vincular_capa", "control_remoto", "acceso_cerebros", "compartir_internet"] as const;
  for (const r of ["cuenta_nueva", "nodo_publico", "etiqueta"] as const) {
    it(`${r}: nunca automático aunque las preferencias lo pidan`, () => {
      const prefs = { ...preferenciasPorDefecto() };
      prefs.porRelacion = { ...prefs.porRelacion, [r]: { ...prefs.porRelacion[r], ofrecidas: [...todas], automaticas: [...todas] } };
      const d = ver(r, tarjeta(), prefs);
      expect(d.automaticas).toEqual([]);
    });
  }
  it("una excepción por neurona no mete control remoto en una cuenta ajena", () => {
    const prefs = establecerExcepcion(preferenciasPorDefecto(), "ajena", { ofrecidas: ["control_remoto", "mandar_mensaje"], automaticas: ["control_remoto"] });
    const d = ver("cuenta_reconocida", tarjeta(), prefs);
    expect(d.ofrecidas).toEqual(["mandar_mensaje"]);
    expect(d.automaticas).toEqual([]);
  });
  it("cuenta reconocida: solo se automatiza lo no sensible", () => {
    const prefs = establecerRelacion(preferenciasPorDefecto(), "cuenta_reconocida", { automaticas: ["anadir_contacto", "enviar_archivo"] });
    const d = ver("cuenta_reconocida", tarjeta(), prefs);
    expect(d.automaticas).toEqual(["anadir_contacto"]);
    expect(d.ofrecidas).toContain("enviar_archivo");
  });
  it("misma cuenta sí puede automatizar acciones sensibles si se configura", () => {
    const prefs = establecerRelacion(preferenciasPorDefecto(), "misma_cuenta", { automaticas: ["enviar_cerebro"] });
    const d = ver("misma_cuenta", tarjeta(), prefs);
    expect(d.automaticas).toEqual(["enviar_cerebro"]);
    expect(d.ofrecidas).not.toContain("enviar_cerebro");
  });
});

describe("decidir · privacidad y disponibilidad", () => {
  it("tarjeta ajena sin cuenta: solo neurona aunque la preferencia sea mostrar", () => {
    const d = ver("misma_cuenta", tarjeta({ cuenta: { modo: "nada" } }));
    expect(d.perfil).toEqual({ tipo: "solo_neurona", neuronaId: "ajena" });
  });
  it("preferencia ocultar no enseña la cuenta", () => {
    const prefs = establecerRelacion(preferenciasPorDefecto(), "cuenta_reconocida", { perfil: "ocultar" });
    expect(ver("cuenta_reconocida", tarjeta(), prefs).perfil.tipo).toBe("solo_neurona");
  });
  it("sin transporte común no se ofrece mover datos", () => {
    const d = ver("misma_cuenta", tarjeta({ transportes: [{ tipo: "lan", direccion: "y" }] }));
    expect(d.ofrecidas).not.toContain("enviar_archivo");
    expect(d.ofrecidas).toContain("mandar_mensaje");
    expect(d.noDisponibles).toContain("enviar_archivo");
  });
  it("sin oferta no se ofrece abrir la oferta del nodo", () => {
    const d = ver("nodo_publico", tarjeta({ ofertas: [] }));
    expect(d.ofrecidas).toEqual(["registrar_ubicacion"]);
    expect(d.noDisponibles.sort()).toEqual(["abrir_oferta_nodo", "registrar_entrada_evento"]);
  });
  it("la ubicación y el aviso salen de las preferencias", () => {
    const prefs = establecerRelacion(preferenciasPorDefecto(), "misma_cuenta", { ubicacion: "privada", aviso: "silenciar" });
    const d = ver("misma_cuenta", tarjeta(), prefs);
    expect(d.ubicacion).toBe("privada");
    expect(d.aviso).toBe("silenciar");
  });
});

describe("decidir · ignorar y recordar", () => {
  it("una neurona ignorada no se muestra y no ofrece nada", () => {
    const d = ver("misma_cuenta", tarjeta(), ignorar(preferenciasPorDefecto(), "ajena"));
    expect(d).toMatchObject({ mostrar: false, motivoOculto: "ignorada", ofrecidas: [], automaticas: [], aviso: "silenciar" });
  });
  it("ignorar otra neurona no afecta a esta", () => {
    expect(ver("cuenta_nueva", tarjeta(), ignorar(preferenciasPorDefecto(), "otra")).mostrar).toBe(true);
  });
  it("una cuenta nueva recordada pasa a reconocida", () => {
    const d = ver("cuenta_nueva", tarjeta(), recordar(preferenciasPorDefecto(), "ajena"));
    expect(d.relacion).toBe("cuenta_reconocida");
    expect(d.perfil.tipo).toBe("completo");
    expect(d.ofrecidas).toContain("enviar_archivo");
  });
  it("recordar no cambia la relación de un nodo público", () => {
    expect(ver("nodo_publico", tarjeta(), recordar(preferenciasPorDefecto(), "ajena")).relacion).toBe("nodo_publico");
  });
  it("no muta las preferencias", () => {
    const prefs = preferenciasPorDefecto();
    const copia = JSON.stringify(prefs);
    ver("misma_cuenta", tarjeta(), prefs);
    expect(JSON.stringify(prefs)).toBe(copia);
  });
});
