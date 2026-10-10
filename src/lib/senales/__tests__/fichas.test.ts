import { describe, expect, it } from "vitest";
import { anonimizarAjenas, cuentaDe } from "../cuentas";
import { construirVivo } from "../aparatos";
import { fichaDeYo } from "../medios";
import { datosDeEnlace, fichaDeSenal, fuenteDeMetrica, haceTexto, noMedido, seccionPosicion } from "../fichas";
import { reubicar } from "../escalas";
import type { Dato, FichaMapa } from "../tipos-vivo";
import { AHORA, SENALES_MEDIO, aparato, contexto, fila, medioPresencia, senal } from "../__fixtures__/vivo";

const todosLosDatos = (f: FichaMapa): Dato[] => f.secciones.flatMap((s) => s.datos);
const seccion = (f: FichaMapa, id: string) => f.secciones.find((s) => s.id === id);
const ficha = (s: ReturnType<typeof senal>, vivo = null as Parameters<typeof fichaDeSenal>[1]["vivo"]) =>
  fichaDeSenal(s, { ahora: AHORA, cuenta: cuentaDe(s), vivo });

/** Reglas que debe cumplir CUALQUIER ficha: nada sin fuente, y «no medido» siempre con su porqué. */
function esHonesta(f: FichaMapa) {
  for (const d of todosLosDatos(f)) {
    expect(d.fuente.trim().length, `${d.etiqueta} sin fuente`).toBeGreaterThan(0);
    expect(["medido", "declarado", "estimado", "no-medido"]).toContain(d.estado);
    if (d.estado === "no-medido") expect(!!d.nota?.trim(), `${d.etiqueta} no medido sin motivo`).toBe(true);
    expect(d.valor.trim().length, `${d.etiqueta} sin valor`).toBeGreaterThan(0);
  }
  for (const sec of f.secciones) expect(sec.datos.length, sec.id).toBeGreaterThan(0);
}

const lora = (o = {}) => senal("lora:7", {
  antenna: "lora", quality: 0.7, signalType: "LoRa · Meshtastic",
  metrics: [{ label: "SNR", value: "2.5 dB" }, { label: "RSSI", value: "-90 dBm" }, { label: "Batería", value: "80 %" }],
  placement: { angleRad: -1, radiusFrac: 0.5, accuracyFrac: 0.03, mode: "gps", distanceM: 800, accuracyM: 35, detail: "gps" },
  ...o,
});

describe("fuente de cada métrica", () => {
  it("separa lo que MIDE un instrumento de lo que DECLARA el propio nodo", () => {
    expect(fuenteDeMetrica(lora(), "SNR")).toMatchObject({ estado: "medido" });
    expect(fuenteDeMetrica(lora(), "Batería")).toMatchObject({ estado: "declarado" });
    expect(fuenteDeMetrica(senal("ble:1", { antenna: "ble" }), "RSSI")).toMatchObject({ estado: "medido" });
    expect(fuenteDeMetrica(senal("ble:1", { antenna: "ble" }), "Servicios GATT")).toMatchObject({ estado: "declarado" });
    expect(fuenteDeMetrica(aparato("a"), "Enlace P2P")).toMatchObject({ estado: "medido" });
    expect(fuenteDeMetrica(aparato("a"), "Versión del OS")).toMatchObject({ estado: "declarado" });
  });

  it("lo que oye otra neurona se dice así: declarado y medido por ella, no por ti", () => {
    const s = senal("remoto:n1:lora:7", { antenna: "lora", signalType: "LoRa · la oye Rosa" });
    const f = fuenteDeMetrica(s, "SNR");
    expect(f.estado).toBe("declarado");
    expect(f.fuente).toContain("Rosa");
  });

  it("una etiqueta desconocida cae en su familia de antena, sin inventar un instrumento", () => {
    expect(fuenteDeMetrica(senal("ip:x", { antenna: "ip" }), "Algo raro").fuente).toContain("Red IP");
  });
});

describe("posición: cada número con su fuente y su margen", () => {
  it("GPS: distancia y rumbo reales, precisión de referencia marcada como estimada", () => {
    const d = seccionPosicion(lora()).datos;
    expect(d.find((x) => x.etiqueta === "Distancia")).toMatchObject({ valor: "800 m", estado: "medido" });
    expect(d.find((x) => x.etiqueta === "Rumbo")?.estado).toBe("medido");
    expect(d.find((x) => x.etiqueta === "Precisión")).toMatchObject({ estado: "estimado", valor: "± 35 m" });
  });

  it("RF: distancia ESTIMADA con su rango y el rumbo «no medido»", () => {
    const s = lora({ placement: { angleRad: 0, radiusFrac: 0.4, accuracyFrac: 0.1, mode: "rf", distanceM: 400, accuracyM: 100, detail: "rf" } });
    const d = seccionPosicion(s).datos;
    expect(d.find((x) => x.etiqueta === "Distancia")).toMatchObject({ estado: "estimado" });
    expect(d.find((x) => x.etiqueta === "Distancia")?.valor.startsWith("≈")).toBe(true);
    expect(d.find((x) => x.etiqueta === "Rango de precisión")?.valor).toMatch(/^entre .+ y .+$/);
    expect(d.find((x) => x.etiqueta === "Rumbo")).toMatchObject({ estado: "no-medido" });
    expect(d.find((x) => x.etiqueta === "Regla del mapa")?.valor).toContain("larga");
  });

  it("un BLE reubicado dice que usa la escala corta", () => {
    const ble = reubicar(senal("ble:1", { antenna: "ble", placement: { angleRad: 0, radiusFrac: 0.16, accuracyFrac: 0.1, mode: "rf", distanceM: 4, accuracyM: 4, detail: "BLE" } }));
    expect(seccionPosicion(ble).datos.find((x) => x.etiqueta === "Regla del mapa")?.valor).toContain("corta");
  });

  it("sin posición: lo dice, y la distancia al centro solo es la calidad (o un radio fijo si ni eso hay)", () => {
    const sector = (q: number | null) => aparato("a", { quality: q, qualityDetail: "presencia" });
    const conCalidad = seccionPosicion(sector(0.8)).datos;
    expect(conCalidad.find((x) => x.etiqueta === "Distancia")).toMatchObject({ estado: "no-medido" });
    expect(conCalidad.find((x) => x.etiqueta === "Qué significa el radio")?.valor).toContain("calidad");
    const fija = seccionPosicion(sector(null)).datos;
    expect(fija.find((x) => x.etiqueta === "Cómo se colocó")?.valor).toContain("radio fijo");
    expect(fija.find((x) => x.etiqueta === "Qué significa el radio")?.valor).toContain("nada");
  });
});

describe("ficha de una señal", () => {
  it("un nodo LoRa: qué es, calidad, enlace, posición y medidas, todo con fuente", () => {
    const f = ficha(lora());
    expect(f.secciones.map((s) => s.id)).toEqual(["quees", "calidad", "enlace", "posicion", "medidas"]);
    esHonesta(f);
    const enlace = seccion(f, "enlace")!.datos;
    expect(enlace[0].valor).toContain("Radio LoRa");
    expect(enlace.find((d) => d.etiqueta === "Lo que mide el radio")?.valor).toBe("SNR 2.5 dB · RSSI -90 dBm");
    expect(enlace.find((d) => d.etiqueta === "Latencia")).toMatchObject({ estado: "no-medido" });
  });

  it("lo que el instrumento no dio sale como «no medido» con su motivo", () => {
    const f = ficha(lora({ metrics: [] }));
    const medidas = seccion(f, "medidas")!.datos;
    for (const e of ["SNR", "RSSI", "Saltos", "Posición", "Batería"]) expect(medidas.find((d) => d.etiqueta === e)).toMatchObject({ estado: "no-medido" });
    esHonesta(f);
    expect(seccion(ficha(senal("ble:2", { antenna: "ble", signalType: "BLE advertising" })), "medidas")!.datos.find((d) => d.etiqueta === "RSSI")).toMatchObject({ estado: "no-medido" });
  });

  it("una señal sin calidad dice «no medido» y por qué; la de un faro no se disfraza de radio", () => {
    expect(seccion(ficha(senal("a", { quality: null, qualityDetail: "la fuente no da ninguna métrica" })), "calidad")!.datos[0]).toMatchObject({ estado: "no-medido", nota: "la fuente no da ninguna métrica" });
    const faro = seccion(ficha(senal("beacon:1", { antenna: "relay", qualityDetail: "frescura del faro" })), "calidad")!.datos[0];
    expect(faro.estado).toBe("estimado");
    expect(faro.nota).toMatch(/No es radio/);
  });

  it("el serie y la portadora IP no fingen una «última vez oída»", () => {
    for (const s of [senal("serial:0", { antenna: "serial" }), senal("ip:external", { antenna: "ip" })]) {
      expect(seccion(ficha(s), "medidas")!.datos.find((d) => d.etiqueta === "Última vez oída")).toMatchObject({ valor: "no aplica", estado: "no-medido" });
    }
  });

  it("el simulador se declara", () => {
    expect(seccion(ficha(lora({ simulated: true })), "quees")!.datos.some((d) => d.etiqueta === "Simulador")).toBe(true);
  });
});

describe("cuentas ajenas: ni nombre ni ids en la ficha", () => {
  it("anonimizada, la ficha entera no contiene nada que identifique a la otra cuenta", () => {
    const orig = senal("beacon:zz", {
      antenna: "relay", label: "Casa de María", signalType: "Faro de presencia · red sináptica (IP)",
      metrics: [{ label: "Último faro", value: "hace 3 s" }, { label: "ID de nodo", value: "!abc123" }, { label: "Nodos que ve", value: "4" }],
      starseed: { via: "relay-beacon", sourceId: "dev-SECRETO", neuronId: "neu-SECRETA", name: "Casa de María", ownAccount: false, capabilities: [] },
    });
    const [a] = anonimizarAjenas([orig]);
    const f = ficha(a);
    const txt = JSON.stringify(f);
    expect(txt).not.toMatch(/María|SECRET|abc123|beacon:zz/);
    expect(f.titulo).toBe("Neurona de otra cuenta");
    expect(todosLosDatos(f).find((d) => d.etiqueta === "Cuenta")?.valor).toBe("otra cuenta (anónima)");
    esHonesta(f);
  });
});

describe("ficha de un aparato con la vista en vivo", () => {
  const presencia = { conectado: true, medios: [medioPresencia("a", "m-a1", { sid: "sync-a" }), medioPresencia("a", "m-a2", { visible: false, etiqueta: "App nativa StarSeed OS", tipo: "app-nativa" })] };
  const filas = [fila("yo", { esEsteDispositivo: true }), fila("a", { enlace: { estado: "conectado", latenciaMs: 15, ruta: { clase: "internet-directo", tipoLocal: "srflx", tipoRemoto: "host", protocolo: "udp", rttMs: 15, bytesEnviados: 3072, bytesRecibidos: 5_242_880, medidoEn: AHORA } } })];
  const a = aparato("a", { metrics: [
    { label: "Estado", value: "en línea" }, { label: "Enlace P2P", value: "conectado · 15 ms" }, { label: "Ruta", value: "internet directo" },
    { label: "Tráfico P2P", value: "x" }, { label: "ID de sync", value: "sync-a" }, { label: "Versión del OS", value: "1.58" },
  ] });
  const vivo = construirVivo([a, senal("remoto:a:ble:1", { antenna: "ble" })], contexto({ filas, presencia }));
  const f = ficha(a, vivo);

  it("tiene estado, enlace real, medios abiertos y lo que oye", () => {
    expect(f.secciones.map((s) => s.id)).toEqual(["quees", "calidad", "enlace", "posicion", "medios", "oye", "medidas"]);
    esHonesta(f);
    expect(seccion(f, "quees")!.datos[0]).toMatchObject({ etiqueta: "Estado ahora", valor: "activa ahora", estado: "medido" });
    const enlace = seccion(f, "enlace")!.datos;
    expect(enlace[0].valor).toBe("P2P · internet directo");
    expect(enlace.find((d) => d.etiqueta === "Latencia")).toMatchObject({ valor: "15 ms", estado: "medido" });
    expect(enlace.find((d) => d.etiqueta === "Tráfico")?.valor).toBe("3.0 KB enviados · 5.0 MB recibidos");
    expect(enlace.find((d) => d.etiqueta === "Enlace medido con")?.valor).toBe("Chrome · m-a1");
    expect(seccion(f, "medios")!.datos.map((d) => d.etiqueta)).toEqual(["Chrome · m-a1", "App nativa StarSeed OS"]);
    expect(seccion(f, "medios")!.datos[1].valor).toContain("en segundo plano");
    expect(seccion(f, "oye")!.datos[0]).toMatchObject({ valor: "1", estado: "declarado" });
  });

  it("no repite «Enlace P2P / Ruta / Tráfico» en los datos medidos, y el resumen dice cómo te llega", () => {
    const medidas = seccion(f, "medidas")!.datos.map((d) => d.etiqueta);
    expect(medidas).not.toContain("Enlace P2P");
    expect(medidas).not.toContain("Ruta");
    expect(medidas).toContain("Versión del OS");
    expect(f.resumen).toContain("P2P · internet directo");
    expect(f.resumen).toContain("15 ms");
  });

  it("sin medios abiertos y sin presencia lo explica, en vez de callar", () => {
    const vacio = ficha(aparato("b"), construirVivo([aparato("b")], contexto({ filas: [fila("b")], presencia: { conectado: false, medios: [] } })));
    esHonesta(vacio);
    const medios = seccion(vacio, "medios")!.datos[0];
    expect(medios).toMatchObject({ estado: "no-medido" });
    expect(medios.nota).toMatch(/presencia en vivo no está conectada/);
    expect(seccion(vacio, "enlace")!.datos.find((d) => d.etiqueta === "Motivo")).toBeTruthy();
  });

  it("un aparato desconectado explica por qué no hay enlace", () => {
    const f2 = ficha(aparato("c"), construirVivo([aparato("c")], contexto({ filas: [fila("c", { online: false })] })));
    expect(f2.resumen).toMatch(/Sin enlace: desconectada/);
  });
});

describe("enlace directo sin internet: la cuenta es declarada, no verificada", () => {
  it("la ficha lo dice y no la presenta como cuenta ajena anónima", () => {
    const v = construirVivo([], contexto({ locales: [{ id: "local:1", nombre: "Móvil de Rosa", uid: "otra", desde: AHORA, rttMs: 6, ruta: "misma-red-local", capacidadKbps: null }] }));
    const f = ficha(v.extras[0], v);
    const cuenta = todosLosDatos(f).find((d) => d.etiqueta === "Cuenta")!;
    expect(cuenta).toMatchObject({ valor: "otra cuenta o sin verificar", estado: "declarado" });
    expect(cuenta.nota).toMatch(/nunca para dar permisos/);
    expect(f.titulo).toBe("Móvil de Rosa");
    esHonesta(f);
  });
});

describe("medios y «Tú»", () => {
  it("un medio de otro aparato dice que sus antenas las anuncia él (declarado), no que las midas tú", () => {
    const v = construirVivo([aparato("a")], contexto({ filas: [fila("a")], presencia: { conectado: true, medios: [medioPresencia("a", "m1")] } }));
    const f = v.medios[0].ficha;
    esHonesta(f);
    const antenas = seccion(f, "senales")!.datos;
    expect(antenas.find((d) => d.etiqueta === "Internet")).toMatchObject({ estado: "declarado" });
    expect(antenas.find((d) => d.etiqueta === "Radio LoRa")).toMatchObject({ estado: "no-medido" });
    expect(antenas.find((d) => d.etiqueta === "Reticulum")).toMatchObject({ estado: "no-medido" });
  });

  it("«Tú»: tus antenas son medidas aquí; sin radio o sin GPS se dice no medido", () => {
    const yo = fichaDeYo({
      neuronaId: "yo", nombre: "Mac de Alex", plataforma: "macOS", medio: { id: "m", tipo: "local", etiqueta: "Chrome 154 · localhost:9002" },
      senales: { ...SENALES_MEDIO, lora: { estado: "ready", transporte: "serial", nodos: 3 } },
      radio: { estado: "ready", transporte: "serial", nodos: 3, region: null, gps: false, simulador: false },
    }, 2);
    esHonesta(yo);
    expect(seccion(yo, "antenas")!.datos.find((d) => d.etiqueta === "Internet")).toMatchObject({ estado: "medido" });
    expect(seccion(yo, "antenas")!.datos.find((d) => d.etiqueta === "Radio LoRa")?.valor).toContain("3 nodos");
    expect(seccion(yo, "lora")!.datos.find((d) => d.etiqueta === "Posición GPS de tu radio")).toMatchObject({ estado: "no-medido" });
    expect(seccion(yo, "lora")!.datos.find((d) => d.etiqueta === "Región LoRa")).toMatchObject({ estado: "no-medido" });
    expect(yo.resumen).toContain("2 señales");
    const sin = fichaDeYo({ neuronaId: null, nombre: "", medio: null, senales: null, radio: { estado: "sin-radio", transporte: null, nodos: 0, region: null, gps: false, simulador: false } }, 0);
    esHonesta(sin);
    expect(seccion(sin, "antenas")!.datos[0]).toMatchObject({ estado: "no-medido" });
  });
});

describe("utilidades de ficha", () => {
  it("haceTexto y noMedido", () => {
    expect(haceTexto(AHORA - 40_000, AHORA)).toBe("hace 40 s");
    expect(haceTexto(AHORA - 3 * 60_000, AHORA)).toBe("hace 3 min");
    expect(haceTexto(AHORA - 5 * 3_600_000, AHORA)).toBe("hace 5 h");
    expect(haceTexto(AHORA - 4 * 86_400_000, AHORA)).toBe("hace 4 días");
    expect(haceTexto(null, AHORA)).toBe("sin dato");
    expect(noMedido("X", "f", "porque sí")).toEqual({ etiqueta: "X", valor: "no medido", fuente: "f", estado: "no-medido", nota: "porque sí" });
  });

  it("el enlace sin canal no se presenta como medido", () => {
    const d = datosDeEnlace({ clase: "sin-enlace", etiqueta: "Sin enlace", latenciaMs: null, motivo: "conectando" }, null, false);
    expect(d[0].estado).toBe("no-medido");
    expect(d.find((x) => x.etiqueta === "Latencia")).toMatchObject({ estado: "no-medido" });
  });
});
