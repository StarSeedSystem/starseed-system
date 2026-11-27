import { describe, it, expect } from "vitest";
import {
  ACCIONES, ACCIONES_SOLO_PROPIAS, RELACIONES, dejarDeIgnorar, esIgnorada, esRecordada, establecerRelacion,
  establecerExcepcion, ignorar, olvidar, preferenciasPorDefecto, quitarExcepcion, recordar, resolver, sanear,
  type Accion, type AvisoEncuentro, type PerfilVisible, type PreferenciasNfc, type PreferenciasRelacion,
  type Relacion, type UbicacionEncuentro,
} from "@/lib/nfc/preferencias";
import {
  describirCapacidad, viasDisponibles, type EntornoNfc,
} from "@/lib/nfc/respaldo";

const h = (c: string, n: number) => c.repeat(n);
const propia = { id: "propia", nombre: "Mía" };
const ajena = { id: "ajena", nombre: "Ajena" };

describe("preferenciasNfc - pruebas puras", () => {
  it("ACCIONES tiene 16 acciones", () => {
    expect(ACCIONES).toHaveLength(16);
  });

  it("ACCIONES_SOLO_PROPIAS tiene control_remoto y acceso_cerebros", () => {
    expect(ACCIONES_SOLO_PROPIAS).toHaveLength(2);
    expect(ACCIONES_SOLO_PROPIAS).toContain("control_remoto");
    expect(ACCIONES_SOLO_PROPIAS).toContain("acceso_cerebros");
  });

  it("RELACIONES tiene las 6 relaciones", () => {
    expect(RELACIONES).toHaveLength(6);
    expect(RELACIONES).toContain("misma_cuenta");
    expect(RELACIONES).toContain("cuenta_reconocida");
    expect(RELACIONES).toContain("cuenta_nueva");
    expect(RELACIONES).toContain("nodo_propio");
    expect(RELACIONES).toContain("nodo_publico");
    expect(RELACIONES).toContain("etiqueta");
  });

  it("porDefectoRelacion - misma_cuenta devuelve perfil mostrar y sugerencias", () => {
    const mismaCuenta = preferenciasPorDefecto().porRelacion.misma_cuenta;
    expect(mismaCuenta.perfil).toBe("mostrar");
    expect(mismaCuenta.sugerenciasAstraura).toBe(true);
  });

it("porDefectoRelacion - cuenta_nueva devuelve perfil pedir y contactos", () => {
    const cuentaNueva = preferenciasPorDefecto().porRelacion.cuenta_nueva;
    expect(cuentaNueva.perfil).toBe("pedir");
    expect(cuentaNueva.ofrecidas).toEqual(["anadir_contacto", "mandar_mensaje"]);
  });

  it("porDefectoRelacion - etiqueta devuelve perfil ocultar y abrir_oferta_nodo", () => {
    const etiqueta = preferenciasPorDefecto().porRelacion.etiqueta;
    expect(etiqueta.perfil).toBe("ocultar");
    expect(etiqueta.ofrecidas).toEqual(["abrir_oferta_nodo"]);
  });

  it("porDefectoRelacion - cuenta_reconocida", () => {
    const reconocida = preferenciasPorDefecto().porRelacion.cuenta_reconocida;
    expect(reconocida.perfil).toBe("mostrar");
    expect(reconocida.ofrecidas).toEqual(["anadir_contacto", "mandar_mensaje", "enviar_archivo", "invitar_grupo"]);
  });

  it("porDefectoRelacion - nodo_propio", () => {
    const propio = preferenciasPorDefecto().porRelacion.nodo_propio;
    expect(propio.perfil).toBe("mostrar");
    expect(propio.ofrecidas).toEqual(["abrir_oferta_nodo", "registrar_ubicacion", "compartir_capacidades", "control_remoto"]);
  });

  it("porDefectoRelacion - nodo_publico perfil pedir", () => {
    const publico = preferenciasPorDefecto().porRelacion.nodo_publico;
    expect(publico.perfil).toBe("pedir");
    expect(publico.ofrecidas).toEqual(["abrir_oferta_nodo", "registrar_entrada_evento", "registrar_ubicacion"]);
  });

  it("porDefectoRelacion - etiqueta devuelve perfil ocultar y abrir_oferta_nodo", () => {
    const etiqueta = preferenciasPorDefecto().porRelacion.etiqueta;
    expect(etiqueta.perfil).toBe("ocultar");
    expect(etiqueta.ofrecidas).toEqual(["abrir_oferta_nodo"]);
  });

it("sanear filtra acciones sensibles para cuentas ajenas - automaticas", () => {
    const prefs = preferenciasPorDefecto();
    const cuentaNuevaSanada = sanear("cuenta_nueva", { ...prefs.porRelacion.cuenta_nueva, automaticas: ["control_remoto", "enviar_archivo"], ofrecidas: ["control_remoto", "enviar_archivo"] });
    // Para cuenta_nueva, auto se pone en []
    expect(cuentaNuevaSanada.automaticas).toEqual([]);
    // offertidas: ACCIONES_SOLO_PROPIAS tiene control_remoto y acceso_cerebros
    // enviar_archivo NO está en ACCIONES_SOLO_PROPIAS, así que pasa el filtro
    // control_remoto SÍ está en ACCIONES_SOLO_PROPIAS, así que se filtra
    expect(cuentaNuevaSanada.ofrecidas).toEqual(["enviar_archivo"]);
  });

  it("sanear mantiene automáticas para misma cuenta", () => {
    const prefs = preferenciasPorDefecto();
    const mismaCuentaSanada = sanear("misma_cuenta", { ...prefs.porRelacion.misma_cuenta, automaticas: ["control_remoto"] });
    expect(mismaCuentaSanada.automaticas).toContain("control_remoto");
  });

  it("resolver usa preferencias por defecto", () => {
    const resuelto = resolver(preferenciasPorDefecto(), "misma_cuenta");
    expect(resuelto.perfil).toBeDefined();
    expect(resuelto.automaticas).toBeDefined();
    expect(resuelto.ofrecidas).toBeDefined();
    expect(resuelto.aviso).toBeDefined();
    expect(resuelto.ubicacion).toBeDefined();
  });

  it("resolver con excepcion por neurona", () => {
    const prefs = establecerExcepcion(preferenciasPorDefecto(), "ajena", { perfil: "ocultar" });
    const resuelto = resolver(prefs, "cuenta_reconocida", "ajena");
    expect(resuelto.perfil).toBeDefined();
  });

  it("establecerRelacion actualiza perfil sin mutar estructura completa", () => {
    const prefs = preferenciasPorDefecto();
    const nueva = establecerRelacion(prefs, "misma_cuenta", { perfil: "mostrar" });
    expect(nueva.porRelacion.misma_cuenta.perfil).toBe("mostrar");
    // Verificar que el objeto es nuevo (no es la referencia exacta)
    expect(nueva).not.toBe(prefs);
    // El perfil cambia pero la estructura se mantiene
    expect(typeof nueva.porRelacion.misma_cuenta.perfil).toBe("string");
  });

  it("establecerExcepcion y quitarExcepcion", () => {
    const prefs = preferenciasPorDefecto();
    const conExcepcion = establecerExcepcion(prefs, "ajena", { perfil: "ocultar" });
    expect(conExcepcion.porNeurona.ajena.perfil).toBe("ocultar");
    const sinExcepcion = quitarExcepcion(prefs, "ajena");
    expect(sinExcepcion.porNeurona).toEqual({});
  });

  it("ignorar y dejarDeIgnoran", () => {
    const prefs = preferenciasPorDefecto();
    const ignorada = ignorar(prefs, "ajena");
    expect(ignorada.ignoradas).toContain("ajena");
    const sinIgnorar = dejarDeIgnorar(ignorada, "ajena");
    expect(sinIgnorar.ignoradas).not.toContain("ajena");
  });

  it("recordar y excluye de ignoradas", () => {
    const prefs = preferenciasPorDefecto();
    const recordada = recordar(prefs, "ajena");
    expect(recordada.recordadas).toContain("ajena");
    expect(recordada.ignoradas).not.toContain("ajena");
    const olvidado = olvidar(recordada, "ajena");
    expect(olvidado.recordadas).not.toContain("ajena");
  });

  it("esIgnorada y esRecordada", () => {
    const prefs = preferenciasPorDefecto();
    expect(esIgnorada(prefs, "ajena")).toBe(false);
    expect(esRecordada(prefs, "ajena")).toBe(false);

    const prefsIgnoradas = ignorar(preferenciasPorDefecto(), "ajena");
    expect(esIgnorada(prefsIgnoradas, "ajena")).toBe(true);
    expect(esRecordada(prefsIgnoradas, "ajena")).toBe(false);

    const prefsRecordadas = recordar(prefsIgnoradas, "ajena");
    expect(esIgnorada(prefsRecordadas, "ajena")).toBe(false);
    expect(esRecordada(prefsRecordadas, "ajena")).toBe(true);
  });

  it("porDefectoRelacion - cuenta_reconocida", () => {
    const reconocida = preferenciasPorDefecto().porRelacion.cuenta_reconocida;
    expect(reconocida.perfil).toBe("mostrar");
    expect(reconocida.ofrecidas).toEqual(["anadir_contacto", "mandar_mensaje", "enviar_archivo", "invitar_grupo"]);
  });

  it("porDefectoRelacion - nodo_propio", () => {
    const propio = preferenciasPorDefecto().porRelacion.nodo_propio;
    expect(propio.perfil).toBe("mostrar");
    expect(propio.ofrecidas).toEqual(["abrir_oferta_nodo", "registrar_ubicacion", "compartir_capacidades", "control_remoto"]);
  });

  it("porDefectoRelacion - nodo_publico perfil pedir", () => {
    const publico = preferenciasPorDefecto().porRelacion.nodo_publico;
    expect(publico.perfil).toBe("pedir");
    expect(publico.ofrecidas).toEqual(["abrir_oferta_nodo", "registrar_entrada_evento", "registrar_ubicacion"]);
  });
});

describe("respaldo - pruebas puras", () => {
  it("describirCapacidad devuelve via y nfc", () => {
    const conTodo: EntornoNfc = { nfc: "lector", ble: true, pantalla: true };
    const resultado = describirCapacidad(conTodo);
    expect(resultado.via).toBe("nfc");
    expect(resultado.nfc).toBe("lector");
    expect(Array.isArray(resultado.respaldo)).toBe(true);
  });

  it("viasDisponibles con todo", () => {
    expect(viasDisponibles({ nfc: "lector", ble: true, pantalla: true } as EntornoNfc)).toEqual(["nfc", "ble", "qr"]);
  });

  it("viasDisponibles solo NFC", () => {
    expect(viasDisponibles({ nfc: "lector", ble: false, pantalla: false } as EntornoNfc)).toEqual(["nfc"]);
  });

  it("viasDisponibles solo QR", () => {
    expect(viasDisponibles({ nfc: "web", ble: false, pantalla: true } as EntornoNfc)).toEqual(["qr"]);
  });

  it("viasDisponibles sin NFC ni BLE", () => {
    expect(viasDisponibles({ nfc: "ninguno", ble: false, pantalla: false } as EntornoNfc)).toEqual([]);
  });
});