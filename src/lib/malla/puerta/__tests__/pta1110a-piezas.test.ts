// PTA1110A · piezas puras: trama binaria, avisos sin bucle, clasificación, IA de la neurona, política de puertos, reparto en llamada.
import { describe, expect, it } from "vitest";
import { BIN_ACUSE, BIN_DATOS, codificarBin, decodificarBin } from "@/lib/malla/puerta/binario";
import { AvisosRuta, ENFRIAMIENTO_MS, clasificarTrafico, textoIndicador, velocidadTexto } from "@/lib/malla/puerta/actividad";
import { esUrlIaMalla, nodosIaPorMalla } from "@/lib/malla/puerta/ia";
import { interpretarAjustes, veredictoPuerto, carrilPermitido } from "@/lib/malla/puerta/politica";
import { datosTienenTurnoEnLlamada, esTextoDatosPuerta, FRACCION_DATOS_LLAMADA_BLE } from "@/lib/malla/bluetooth-directo-motor";

describe("trama binaria", () => {
  it("ida y vuelta de datos y acuse; basura -> null", () => {
    const b = codificarBin({ tipo: BIN_DATOS, s: "tun-1", n: 70000, b: new Uint8Array([1, 2, 3]) });
    const d = decodificarBin(b);
    expect(d && d.tipo === BIN_DATOS && d.s === "tun-1" && d.n === 70000 && Array.from(d.b)).toEqual([1, 2, 3]);
    const a = decodificarBin(codificarBin({ tipo: BIN_ACUSE, s: "tun-1", n: 9 }));
    expect(a).toEqual({ tipo: BIN_ACUSE, s: "tun-1", n: 9 });
    expect(decodificarBin(new Uint8Array([9, 9, 9]))).toBeNull();
    expect(decodificarBin(new Uint8Array(20))).toBeNull();
    expect(() => codificarBin({ tipo: BIN_ACUSE, s: "", n: 1 })).toThrow();
  });
  it("cabecera mucho menor que el JSON con base64", () => {
    const carga = new Uint8Array(1000);
    const json = JSON.stringify({ c: "puerta", k: "dat", s: "tun-1", n: 5, b: btoa(String.fromCharCode(...carga)) }).length;
    expect(codificarBin({ tipo: BIN_DATOS, s: "tun-1", n: 5, b: carga }).length).toBeLessThan(json * 0.8);
  });
});

describe("avisos de ruta sin bucle", () => {
  const por = { nombre: "MaggaBook", enlace: "Bluetooth directo" };
  it("el primer estado es silencioso, un cambio real avisa una vez y el parpadeo no repite", () => {
    let t = 0;
    const a = new AvisosRuta(() => t);
    expect(a.observar({ conInternet: true, por: null, hayPuertas: true })).toBeNull();
    expect(a.observar({ conInternet: false, por, hayPuertas: true })).toBeNull(); // 1.ª confirmación
    const av = a.observar({ conInternet: false, por, hayPuertas: true });
    expect(av?.texto).toContain("ahora por MaggaBook vía Bluetooth directo");
    // parpadeo: sube y baja cada ciclo -> ningún aviso nuevo dentro del enfriamiento
    let n = 0;
    for (let i = 0; i < 20; i++) {
      t += 4000;
      if (a.observar({ conInternet: i % 2 === 0, por: i % 2 ? por : null, hayPuertas: true })) n++;
    }
    expect(n).toBe(0);
    t += ENFRIAMIENTO_MS;
    a.observar({ conInternet: true, por: null, hayPuertas: true });
    expect(a.observar({ conInternet: true, por: null, hayPuertas: true })?.tipo).toBe("salida-propia");
  });
});

describe("clasificación e indicador", () => {
  it("tipos por host y puerto", () => {
    expect(clasificarTrafico("abc.supabase.co", 443)).toBe("datos");
    expect(clasificarTrafico("api.openai.com", 443)).toBe("ia");
    expect(clasificarTrafico("ia.neurona.local", 8000)).toBe("ia");
    expect(clasificarTrafico("huggingface.co", 443)).toBe("capas");
    expect(clasificarTrafico("ejemplo.org", 80)).toBe("navegacion");
    expect(clasificarTrafico("x.test", 443, { hostsStarSeed: ["x.test"] })).toBe("datos");
  });
  it("textos", () => {
    expect(velocidadTexto(30000)).toBe("240 kb/s");
    expect(velocidadTexto(null)).toBe("sin medir");
    expect(textoIndicador({ nombre: "MaggaBook", enlace: "Bluetooth directo", saltos: 0, bytesPorSegundo: 30000 })).toBe("Internet por: MaggaBook · Bluetooth directo · 240 kb/s");
  });
});

describe("IA de esta neurona por la malla", () => {
  const puertas = [
    { id: "n1", nombre: "MaggaBook", enlace: "Bluetooth directo", saltos: 0, puntuacion: 5, capas: [{ tipo: "ia-neurona", puertos: [8000, 11434] }, { tipo: "lan", puertos: [80] }] },
    { id: "n2", nombre: "Otra", enlace: "LAN", saltos: 1, puntuacion: 9, capas: [] },
  ];
  it("un nodo vecino por puerto declarado, nada más", () => {
    const n = nodosIaPorMalla(puertas);
    expect(n.map((x) => x.url)).toEqual(["http://ia.neurona.local:8000", "http://ia.neurona.local:11434"]);
    expect(n.every((x) => x.tipo === "vecino")).toBe(true);
  });
  it("solo el alias reservado cuenta como IA por la malla", () => {
    expect(esUrlIaMalla("http://ia.neurona.local:8000/v1")).toBe(true);
    expect(esUrlIaMalla("http://127.0.0.1:8000")).toBe(false);
  });
});

describe("política de puertos y migración", () => {
  const aj = interpretarAjustes(null);
  it("web por defecto; nunca los peligrosos; el resto pregunta", () => {
    for (const p of [80, 443, 8080, 8443]) expect(veredictoPuerto(aj, p)).toBe("si");
    expect(veredictoPuerto(aj, 25)).toBe("no");
    expect(veredictoPuerto(aj, 9090)).toBe("preguntar");
    expect(veredictoPuerto({ ...aj, otrosPuertos: "nunca" }, 9090)).toBe("no");
    expect(veredictoPuerto({ ...aj, otrosPuertos: "siempre" }, 9090)).toBe("si");
    expect(veredictoPuerto({ ...aj, otrosPuertos: "siempre" }, 445)).toBe("no");
  });
  it("migra lo guardado antiguo", () => {
    const v = interpretarAjustes(JSON.stringify({ usarPuertas: false, puertosWeb: [] }));
    expect(v.modoUso).toBe("nunca");
    expect(v.puertosWeb).toEqual(expect.arrayContaining([80, 443, 8080, 8443]));
    expect(interpretarAjustes(JSON.stringify({ usarPuertas: true })).modoUso).toBe("automatico");
    expect(interpretarAjustes("{{no json").modoUso).toBe(aj.modoUso);
  });
  it("carriles", () => {
    const sin = { ...aj, carriles: { ...aj.carriles, bluetooth: false } };
    expect(carrilPermitido(sin, "ble")).toBe(false);
    expect(carrilPermitido(sin, "relay")).toBe(true);
  });
});

describe("reparto de datos durante una llamada", () => {
  it("los datos tienen turno solo mientras estén por debajo de su fracción", () => {
    expect(FRACCION_DATOS_LLAMADA_BLE).toBeGreaterThanOrEqual(0.15);
    expect(FRACCION_DATOS_LLAMADA_BLE).toBeLessThanOrEqual(0.2);
    expect(datosTienenTurnoEnLlamada(0, 0)).toBe(true);
    expect(datosTienenTurnoEnLlamada(0, 1000)).toBe(true);
    expect(datosTienenTurnoEnLlamada(500, 1000)).toBe(false);
    // simulación: 1000 turnos de 100 B; el reparto converge a la fracción
    let d = 0;
    let o = 0;
    for (let i = 0; i < 1000; i++) (datosTienenTurnoEnLlamada(d, o) ? (d += 100) : (o += 100));
    expect(d / (d + o)).toBeGreaterThan(0.15);
    expect(d / (d + o)).toBeLessThan(0.21);
  });
  it("un trozo del túnel es datos, no control", () => {
    expect(esTextoDatosPuerta('{"t":"tu.msg","c":"puerta","k":"dat","s":"a"}')).toBe(true);
    expect(esTextoDatosPuerta('{"t":"tu.msg","c":"puerta","k":"ack"}')).toBe(false);
    expect(esTextoDatosPuerta('{"t":"chat"}')).toBe(false);
  });
});
