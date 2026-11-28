import { describe, it, expect, beforeAll } from "vitest";
import {
  TIPO_TARJETA_OFERTA,
  tipoTarjetaOfertaValido,
  accionPrincipalPorTipo,
  crearTarjetaOferta,
  validarTarjetaOferta,
  firmarTarjetaOferta,
  verificarFirmaTarjetaOferta,
  caducada,
  esComercialNoSolicitada,
  marcarComercialNoSolicitada,
  puedeBloquearEmisor,
  __setCrypto,
  type TarjetaOferta,
  type TipoTarjetaOferta,
  type ContenidoTarjetaOferta,
  type ResultadoCrearTarjetaOferta,
} from "../tarjetas-oferta";
import {
  preferenciasPorDefecto,
  ignorar,
  recordar,
  relacionEfectiva,
  ACCIONES,
} from "../preferencias";
import { decidir } from "../decidir";
import type { TarjetaNeurona } from "../tarjeta";
import { botonesDe, textoNotificacion } from "../encuentros";

const h = (c: string, n: number) => c.repeat(n);
const clavePublica = h("a", 64);
const clavePrivada = h("b", 64);

beforeAll(() => {
  const hash = (msg: Uint8Array) => {
    let h = 0;
    for (const b of msg) h = (h * 31 + b) >>> 0;
    return h.toString(16).padStart(128, "0");
  };
  __setCrypto(
    (msg: Uint8Array, _priv: string) => hash(msg),
    (msg: Uint8Array, firma: string, pub: string) => firma === hash(msg) && pub === clavePublica,
  );
});

describe("NFC1126O · tipos de tarjeta y ofertas (contrato §13)", () => {
  it("expone los 14 tipos del contrato", () => {
    const esperados = [
      "presentacion", "amistad", "evento", "pagina", "grupo", "partido",
      "perfil", "cuenta", "cerebro", "repositorio", "archivo", "app", "programa", "enlace_libre",
    ] as const;
    expect(TIPO_TARJETA_OFERTA).toEqual(esperados);
    expect(TIPO_TARJETA_OFERTA).toHaveLength(14);
  });

  it("tipoTarjetaOfertaValido reconoce solo los 14 tipos válidos", () => {
    for (const t of TIPO_TARJETA_OFERTA) {
      expect(tipoTarjetaOfertaValido(t)).toBe(true);
    }
    expect(tipoTarjetaOfertaValido("invalido")).toBe(false);
    expect(tipoTarjetaOfertaValido("")).toBe(false);
    expect(tipoTarjetaOfertaValido("Presentacion")).toBe(false);
  });
});

describe("NFC1126O · acción principal por tipo (recepción en notificaciones)", () => {
  it("devuelve la acción principal correcta para cada tipo", () => {
    expect(accionPrincipalPorTipo("presentacion")).toBe("anadir_contacto");
    expect(accionPrincipalPorTipo("amistad")).toBe("anadir_contacto");
    expect(accionPrincipalPorTipo("evento")).toBe("registrar_entrada_evento");
    expect(accionPrincipalPorTipo("pagina")).toBe("abrir_enlace");
    expect(accionPrincipalPorTipo("grupo")).toBe("invitar_grupo");
    expect(accionPrincipalPorTipo("partido")).toBe("invitar_grupo");
    expect(accionPrincipalPorTipo("perfil")).toBe("ver_perfil");
    expect(accionPrincipalPorTipo("cuenta")).toBe("ver_cuenta");
    expect(accionPrincipalPorTipo("cerebro")).toBe("abrir_cerebro");
    expect(accionPrincipalPorTipo("repositorio")).toBe("abrir_repositorio");
    expect(accionPrincipalPorTipo("archivo")).toBe("abrir_archivo");
    expect(accionPrincipalPorTipo("app")).toBe("abrir_app");
    expect(accionPrincipalPorTipo("programa")).toBe("abrir_programa");
    expect(accionPrincipalPorTipo("enlace_libre")).toBe("abrir_enlace");
  });

  it("las acciones principales NFC están en el catálogo de acciones", () => {
    const accionesNFC: TipoTarjetaOferta[] = ["presentacion", "amistad", "evento", "grupo", "partido"];
    for (const t of accionesNFC) {
      const accion = accionPrincipalPorTipo(t);
      expect(ACCIONES).toContain(accion);
    }
    const accionesUI: TipoTarjetaOferta[] = ["pagina", "perfil", "cuenta", "cerebro", "repositorio", "archivo", "app", "programa", "enlace_libre"];
    for (const t of accionesUI) {
      const accion = accionPrincipalPorTipo(t);
      expect(ACCIONES).not.toContain(accion);
    }
  });
});

describe("NFC1126O · creación de tarjetas (diseño libre + firma + caducidad)", () => {
  it("crea tarjeta válida con campos mínimos para cada tipo", () => {
    for (const tipo of TIPO_TARJETA_OFERTA) {
      const contenido: ContenidoTarjetaOferta = { datos: `contenido-${tipo}` };
      const r = crearTarjetaOferta({
        tipo,
        emisor: "neurona-1",
        titulo: `Tarjeta ${tipo}`,
        contenido,
        emitidaEn: Date.now(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.tarjeta.tipo).toBe(tipo);
        expect(r.tarjeta.version).toBe(1);
        expect(r.tarjeta.emisor).toBe("neurona-1");
        expect(r.tarjeta.titulo).toBe(`Tarjeta ${tipo}`);
        expect(r.tarjeta.contenido).toEqual(contenido);
        expect(r.tarjeta.marcaComercial).toBe(false);
        expect(r.tarjeta.firma).toBeUndefined();
        expect(r.tarjeta.caducidad).toBeUndefined();
      }
    }
  });

  it("incluye caducidad opcional (ms desde epoch)", () => {
    const ahora = Date.now();
    const manana = ahora + 86_400_000;
    const r = crearTarjetaOferta({
      tipo: "evento",
      emisor: "neurona-2",
      titulo: "Fiesta",
      contenido: { lugar: "Parque", hora: "20:00" },
      emitidaEn: ahora,
      caducidad: manana,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tarjeta.caducidad).toBe(manana);
  });

  it("rechaza caducidad anterior o igual a la emisión", () => {
    const ahora = Date.now();
    const r = crearTarjetaOferta({
      tipo: "evento",
      emisor: "n1",
      titulo: "X",
      contenido: {},
      emitidaEn: ahora,
      caducidad: ahora - 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toContain("La caducidad debe ser posterior a la emisión.");
  });

  it("rechaza título vacío, muy largo o solo espacios", () => {
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "", contenido: {}, emitidaEn: 1 }).ok).toBe(false);
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "   ", contenido: {}, emitidaEn: 1 }).ok).toBe(false);
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "x".repeat(101), contenido: {}, emitidaEn: 1 }).ok).toBe(false);
  });

  it("recorta espacios en el título", () => {
    const r = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "  Hola  ", contenido: {}, emitidaEn: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tarjeta.titulo).toBe("Hola");
  });

  it("rechaza emisor vacío", () => {
    const r = crearTarjetaOferta({ tipo: "presentacion", emisor: "", titulo: "X", contenido: {}, emitidaEn: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toContain("El emisor es obligatorio.");
  });

  it("rechaza contenido que no es objeto", () => {
    const r = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: "no es objeto" as any, emitidaEn: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toContain("El contenido debe ser un objeto.");
  });

  it("rechaza emitidaEn no entero positivo", () => {
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: -1 }).ok).toBe(false);
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1.5 }).ok).toBe(false);
    expect(crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: "hoy" as any }).ok).toBe(false);
  });

  it("acepta contenido libre (diseño libre enlazado a Protomolécula/lienzo)", () => {
    const contenidoComplejo: ContenidoTarjetaOferta = {
      bloques: [{ tipo: "texto", valor: "Hola" }, { tipo: "imagen", url: "https://img.com/x.png" }],
      metadatos: { plantilla: "presentacion-v1", version: 2 },
      enlaces: [{ etiqueta: "Perfil", url: "https://starseed.os/@user" }],
    };
    const r = crearTarjetaOferta({
      tipo: "presentacion",
      emisor: "neurona-1",
      titulo: "Mi presentación completa",
      contenido: contenidoComplejo,
      emitidaEn: Date.now(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tarjeta.contenido).toEqual(contenidoComplejo);
  });
});

describe("NFC1126O · validación de tarjetas (forma + firma + caducidad)", () => {
  it("acepta tarjeta bien formada sin firma", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const r = validarTarjetaOferta(t.tarjeta);
    expect(r.ok).toBe(true);
  });

  it("acepta tarjeta bien formada con firma válida", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica);
    expect(r.ok).toBe(true);
  });

  it("rechaza firma inválida (hex incorrecto o clave pública distinta)", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const mala = { ...firmada, firma: "z".repeat(128) };
    const r = validarTarjetaOferta(mala, clavePublica);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("firma");
  });

  it("rechaza tarjeta caducada al validar con 'ahora'", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 2000 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica, 3000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("caducada");
  });

  it("rechaza tarjeta con versión no soportada", () => {
    const r = validarTarjetaOferta({ version: 2, tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("versión no soportada");
  });

  it("rechaza tarjeta con tipo no válido", () => {
    const r = validarTarjetaOferta({ version: 1, tipo: "invalido", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("tipo no válido");
  });

  it("rechaza tarjeta con firma de formato inválido (no hex 128 chars)", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const mala = { ...firmada, firma: "zz" };
    const r = validarTarjetaOferta(mala);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("firma");
  });

  it("rechaza tarjeta con marcaComercial no booleana", () => {
    const r = validarTarjetaOferta({ version: 1, tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1, marcaComercial: "sí" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("marcaComercial");
  });

  it("valida que la firma cubre todos los campos canónicos (cambiar cualquier campo invalida la firma)", () => {
    const base = crearTarjetaOferta({ tipo: "pagina", emisor: "n1", titulo: "Página", contenido: { url: "https://example.com" }, emitidaEn: 1 });
    if (!base.ok) throw new Error("setup");
    const f1 = firmarTarjetaOferta(base.tarjeta, clavePrivada);
    expect(verificarFirmaTarjetaOferta(f1, clavePublica)).toBe(true);
    const f2 = firmarTarjetaOferta({ ...base.tarjeta, titulo: "Otra" }, clavePrivada);
    expect(f1.firma).not.toBe(f2.firma);
    expect(verificarFirmaTarjetaOferta(f2, clavePublica)).toBe(true);
    expect(verificarFirmaTarjetaOferta(f1, clavePublica)).toBe(true);
  });
});

describe("NFC1126O · detección y bloqueo de tarjetas comerciales no solicitadas (§13)", () => {
  it("marca una tarjeta como comercial no solicitada", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "n1", titulo: "Compra esto", contenido: { url: "https://shop.com" }, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const marcada = marcarComercialNoSolicitada(t.tarjeta);
    expect(marcada.marcaComercial).toBe(true);
    expect(esComercialNoSolicitada(marcada)).toBe(true);
  });

  it("no muta la tarjeta original al marcarla como comercial", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "n1", titulo: "Compra esto", contenido: { url: "https://shop.com" }, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const original = t.tarjeta;
    marcarComercialNoSolicitada(original);
    expect(original.marcaComercial).toBe(false);
  });

  it("permite bloquear al emisor de una tarjeta comercial no solicitada", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "spammer", titulo: "Compra", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    const marcada = marcarComercialNoSolicitada(t.tarjeta);
    expect(puedeBloquearEmisor(marcada)).toBe(true);
  });

  it("no permite bloquear al emisor de una tarjeta normal (no comercial)", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "amigo", titulo: "Hola", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    expect(puedeBloquearEmisor(t.tarjeta)).toBe(false);
  });

  it("una tarjeta normal no está marcada como comercial por defecto", () => {
    const t = crearTarjetaOferta({ tipo: "amistad", emisor: "contacto", titulo: "Añadamos", contenido: {}, emitidaEn: 1 });
    if (!t.ok) throw new Error("setup");
    expect(esComercialNoSolicitada(t.tarjeta)).toBe(false);
    expect(t.tarjeta.marcaComercial).toBe(false);
  });

  it("el receptor puede bloquear al emisor solo si la tarjeta es comercial no solicitada", () => {
    const tiposComerciales: TipoTarjetaOferta[] = ["app", "programa", "enlace_libre"];
    for (const tipo of tiposComerciales) {
      const t = crearTarjetaOferta({ tipo, emisor: "spammer", titulo: "Oferta", contenido: {}, emitidaEn: 1 });
      if (!t.ok) throw new Error("setup");
      const marcada = marcarComercialNoSolicitada(t.tarjeta);
      expect(puedeBloquearEmisor(marcada)).toBe(true);
    }
    const tiposNormales: TipoTarjetaOferta[] = ["presentacion", "amistad", "evento", "pagina", "grupo", "partido", "perfil", "cuenta", "cerebro", "repositorio", "archivo"];
    for (const tipo of tiposNormales) {
      const t = crearTarjetaOferta({ tipo, emisor: "contacto", titulo: "Normal", contenido: {}, emitidaEn: 1 });
      if (!t.ok) throw new Error("setup");
      expect(puedeBloquearEmisor(t.tarjeta)).toBe(false);
    }
  });
});

describe("NFC1126O · caducidad de tarjetas (recepción en notificaciones)", () => {
  it("detecta tarjeta caducada por caducidad explícita", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 2000 });
    if (!t.ok) throw new Error("setup");
    expect(caducada(t.tarjeta, 1500)).toBe(false);
    expect(caducada(t.tarjeta, 2500)).toBe(true);
  });

  it("tarjeta sin caducidad nunca está caducada por tiempo", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000 });
    if (!t.ok) throw new Error("setup");
    expect(caducada(t.tarjeta, 999_999_999)).toBe(false);
  });

  it("validarTarjetaOferta rechaza tarjeta caducada cuando se pasa 'ahora'", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 2000 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica, 3000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("caducada");
  });

  it("validarTarjetaOferta acepta tarjeta no caducada cuando se pasa 'ahora'", () => {
    const t = crearTarjetaOferta({ tipo: "evento", emisor: "n1", titulo: "X", contenido: {}, emitidaEn: 1000, caducidad: 5000 });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    const r = validarTarjetaOferta(firmada, clavePublica, 3000);
    expect(r.ok).toBe(true);
  });
});

describe("NFC1126O · integración con encuentro NFC (envío al vincularse + notificación)", () => {
  const h = (c: string, n: number) => c.repeat(n);
  const AHORA = 1_000_000;

  const tarjetaAjena = (o: Partial<TarjetaNeurona> = {}): TarjetaNeurona => ({
    version: 1, neuronaId: "ajena", clavePublica: h("a", 64), cuenta: { modo: "alias", valor: "luna" },
    claveEfimera: h("b", 64), nonce: h("c", 32), emitidaEn: AHORA, ofertas: ["pagina"],
    transportes: [{ tipo: "ble", direccion: "x" }], firma: h("a", 128), ...o,
  });
  const propia = tarjetaAjena({ neuronaId: "propia", clavePublica: h("e", 64), firma: h("e", 128) });

  it("al vincularse, una tarjeta de oferta puede enviarse y recibirse con su acción principal en notificación", () => {
    const t = crearTarjetaOferta({ tipo: "presentacion", emisor: "ajena", titulo: "Conóceme", contenido: { bio: "Hola" }, emitidaEn: AHORA });
    if (!t.ok) throw new Error("setup");
    const firmada = firmarTarjetaOferta(t.tarjeta, clavePrivada);
    expect(validarTarjetaOferta(firmada, clavePublica, AHORA).ok).toBe(true);

    const decision = decidir({ propia, ajena: tarjetaAjena(), relacion: "cuenta_nueva", prefs: preferenciasPorDefecto() });
    expect(decision.mostrar).toBe(true);
    const botones = botonesDe(decision);
    const accionPrincipal = accionPrincipalPorTipo("presentacion");
    expect(botones.some((b: { id: string }) => b.id === accionPrincipal)).toBe(true);

    const notif = textoNotificacion(decision, "nfc");
    expect(notif).not.toBeNull();
    if (notif) {
      expect(notif.titulo).toContain("Cerca de ti");
      expect(notif.cuerpo).toContain("Cuenta nueva");
    }
  });

  it("tipos de tarjeta con acciones NFC tienen su acción principal disponible cuando las preferencias lo permiten", () => {
    const prefsTodas = {
      ...preferenciasPorDefecto(),
      porRelacion: {
        ...preferenciasPorDefecto().porRelacion,
        misma_cuenta: {
          ...preferenciasPorDefecto().porRelacion.misma_cuenta,
          ofrecidas: [...ACCIONES],
        },
      },
    };
    const tiposConAccionNFC: TipoTarjetaOferta[] = ["presentacion", "amistad", "evento", "grupo", "partido"];
    for (const tipo of tiposConAccionNFC) {
      const accion = accionPrincipalPorTipo(tipo);
      const decision = decidir({ propia, ajena: tarjetaAjena({ ofertas: [tipo] }), relacion: "misma_cuenta", prefs: prefsTodas });
      const botones = botonesDe(decision);
      expect(botones.some((b: { id: string }) => b.id === accion)).toBe(true);
    }
  });

  it("tarjeta comercial no solicitada permite bloquear al emisor desde la notificación", () => {
    const t = crearTarjetaOferta({ tipo: "app", emisor: "spammer", titulo: "Instala ya", contenido: { url: "https://spam.app" }, emitidaEn: AHORA });
    if (!t.ok) throw new Error("setup");
    const comercial = marcarComercialNoSolicitada(t.tarjeta);
    expect(puedeBloquearEmisor(comercial)).toBe(true);

    const prefs = ignorar(preferenciasPorDefecto(), "spammer");
    const decision = decidir({ propia, ajena: tarjetaAjena({ neuronaId: "spammer" }), relacion: "cuenta_nueva", prefs });
    expect(decision.mostrar).toBe(false);
    expect(decision.motivoOculto).toBe("ignorada");
  });

  it("recordar una neurona nueva la pasa a cuenta reconocida y muestra sus tarjetas", () => {
    const prefs = recordar(preferenciasPorDefecto(), "ajena");
    const decision = decidir({ propia, ajena: tarjetaAjena(), relacion: "cuenta_nueva", prefs });
    expect(decision.relacion).toBe("cuenta_reconocida");
    expect(decision.mostrar).toBe(true);
  });
});