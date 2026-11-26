/**
 * ble1124a — Bluetooth directo como enlace del transporte universal (2026-11-08 · BLE1108A).
 * ═══════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/bluetooth-directo.md`.
 *
 * Petición de Alex: «el P2P sin router debe ir directo entre las antenas de los aparatos, no por una red
 * externa». La app nativa (macOS y Android) lleva ahora un portador Bluetooth de baja energía entre
 * neuronas (`native/src-tauri/src/ble*.rs`, `BleStarSeed.kt`): se anuncia con un UUID que rota y que solo
 * tu cuenta reconoce, conecta sola con tus neuronas cercanas y lleva tramas JSON con acuse. Aquí está lo
 * que convierte en un enlace más (`ble:<id>`, «Bluetooth directo»):
 *
 *   · LIGADURA por enlace: el mismo saludo firmado de la red local (`nl.hola` con la prueba de cuenta) por los que aún no dijeron quién son. Quien recibe un saludo válido contesta y el enlace queda LIGADO a esa neurona: desde entonces es un enlace más del transporte universal.
 *   · Una cola por enlace: `control` (mensajes, saludos, control Wi-Fi) delante de `datos` (archivos, en
 * orden estricto). Cada trama espera el ACUSE de la otra app (`ble_enviar`); 6 fallos seguidos → ese
 * enlace se da por caído 30 s (y se dice). Ritmo: el 60 % del cupo del otro (su saludo lo dice).
 *   · Lo que llega de un enlace ligado va a sus oyentes de siempre: `tu.*` al transporte universal,
 * `archivo.*` al motor de archivos (que SIEMPRE pregunta), `enlace.wifi.*` a quien negocie el Wi-Fi
 * directo (WFD1108A). De un enlace sin ligar, solo se escucha el saludo.
 */

import { describe, it, expect } from "vitest";
import {
  LIMITES_BLE_DEFECTO,
  MAX_ARCHIVO_BLE,
  T_OFERTA_WIFI,
  T_RESPUESTA_WIFI,
  duracionArchivoBle,
  enlaceDeIdBle,
  esEnlaceBle,
  leerEstadoBle,
  leerControlEnlace,
  leerEstadoBle,
  ligarBle,
  ligaduraDeEnlace,
  podarLigadurasBle,
  saludosBle,
  senalesBluetoothDirecto,
  textoVelocidadBle,
  trozoArchivoBle,
  type EstadoBleNativo,
  type LigaduraBle,
} from "@/lib/malla/bluetooth-directo";

const T = 1_800_000_000_000;

function estado(p: Partial<EstadoBleNativo> = {}): EstadoBleNativo {
  return {
    disponible: true,
    activo: true,
    radio: "encendida",
    motivo: "",
    plataforma: "android",
    roles: ["central", "periferico"],
    l2cap: true,
    anunciando: true,
    con_cuenta: true,
    vecinos: [],
    enlaces: [],
    ultimo_seq: 0,
    max_cuerpo: 16384,
    limite_mensajes: 120,
    limite_ventana_ms: 10_000,
    paquete_max: 512,
    ...p,
  };
}

const enlace = (id: string, p: Partial<EstadoBleNativo["enlaces"][number]> = {}) => ({
  id,
  rol: "central",
  vecino: null,
  neurona: null,
  rssi: -60,
  paquete: 182,
  rtt_ms: null,
  kbps: null,
  pendientes: 0,
  bytes_enviados: 0,
  bytes_recibidos: 0,
  abierto_hace_ms: 1000,
  ...p,
});

const lig = (enlace: string, neurona: string, at = T): LigaduraBle => ({
  enlace,
  neurona,
  huella: `fp-${neurona}`,
  nombre: `Neurona ${neurona}`,
  limites: { ...LIMITES_BLE_DEFECTO },
  at,
});

describe("Bluetooth directo · lo puro (BLE1108A)", () => {
  it("ids de enlace `ble:<id>` y nada más", () => {
    expect(idEnlaceBle("b3")).toBe("ble:b3");
    expect(enlaceDeIdBle("ble:b3")).toBe("b3");
    for (const no of ["ble:", "ble:x3", "ble:b", "nativo:192.168.1.2", "local:ble:b3", null, undefined, "ble:b1;rm"]) {
      expect(esEnlaceBle(no as string)).toBe(false);
    }
  });

  it("el estado de la app se sanea: lo raro se descarta, nunca se inventa", () => {
    expect(leerEstadoBle(null)).toBeNull();
    expect(leerEstadoBle({ radio: "encendida" })).toBeNull();
    const e = leerEstadoBle({
      disponible: true,
      activo: true,
      radio: "encendida",
      motivo: "ok",
      vecinos: [
        { id: "v0a1b2c3d", rssi: -500, propia: true, neurona: "n-1", tipo: "android", servidor: true, visto_hace_ms: 300, enlace: "b1" },
        { id: "malo", rssi: -40 },
        { id: "v00000000", rssi: -40, enlace: "b1; DROP" },
      ],
    })!;
    expect(e.vecinos.map((v) => v.id)).toEqual(["v0a1b2c3d", "v00000000"]);
    expect(e.vecinos[0].rssi).toBe(-127);
    expect(e.vecinos[1].enlace).toBeNull();
    expect(e.enlaces).toHaveLength(1);
    expect(e.enlaces[0]).toMatchObject({ id: "b1", rol: "periferico", rtt_ms: 42, kbps: null });
    expect(e.max_cuerpo).toBe(LIMITES_BLE_DEFECTO.maxCuerpo);
  });

  it("trozos de archivo de 10 KiB: en base64 caben en una trama de 16 KiB", () => {
    expect(trozoArchivoBle()).toBe(10 * 1024);
    const b64 = Math.ceil(trozoArchivoBle() / 3) * 4;
    const chunk = JSON.stringify({ t: "archivo.chunk", id: "f".repeat(36), index: 99_999, datosB64: "A".repeat(b64) });
    expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(LIMITES_BLE_DEFECTO.maxCuerpo - 512);
  });

  it("ligaduras: una por enlace y una por neurona; caducan y se van con su enlace", () => {
    let l = ligarBle([], lig("b1", "n-1"));
    l = ligarBle(l, lig("b2", "n-2"));
    l = ligarBle(l, lig("b3", "n-1"));
    expect(l.map((x) => `${x.enlace}:${x.neurona}`).sort()).toEqual(["b2:n-2", "b3:n-1"]);
    expect(ligaduraDeEnlace(l, "b3", T)?.neurona).toBe("n-1");
    expect(ligaduraDeEnlace(l, "b3", T + 6 * 60_000)).toBeNull();
    expect(podarLigadurasBle(l, new Set(["b3"]), T).map((x) => x.enlace)).toEqual(["b3"]);
  });

  it("saludosBle: a la reconocida por el anuncio; a ciegas, solo a las de la cuenta o vinculadas (≤ 6)", () => {
    const enlaces = [enlace("b1", { neurona: "n-tab" }), enlace("b2", { rol: "periferico" })];
    const base = { enlaces, ligaduras: [], vinculos: [{ neurona: "n-amiga", nombre: "Amiga", huella: "fp" }], cuenta: ["n-mac", "n-tab", "n-movil"], conClave: true, yo: "n-mac", ultimoHola: {}, ahora: T };
    const s = saludosBle(base);
    expect(s).toContainEqual({ enlace: "b1", para: "n-tab" });
    expect(s.filter((x) => x.enlace === "b2").map((x) => x.para).sort()).toEqual(["n-amiga", "n-movil", "n-tab"]);
    // Sin clave de faro: a ciegas solo las vinculadas (la reconocida por anuncio no lleva prueba de cuenta).
    expect(saludosBle({ ...base, conClave: false }).map((x) => `${x.enlace}:${x.para}`)).toEqual(["b2:n-amiga"]);
    // Recién saludado o recién ligado: nada.
    expect(saludosBle({ ...base, ultimoHola: { b1: T - 1000, b2: T - 1000 } })).toEqual([]);
    expect(saludosBle({ ...base, ligaduras: [lig("b1", "n-tab", T - 1000)] }).some((x) => x.enlace === "b1")).toBe(false);
  });

  it("enlacesBle: solo los ligados, con lo MEDIDO y los límites honestos", () => {
    const e = estado({ enlaces: [enlace("b1", { rtt_ms: 84, kbps: 160 }), enlace("b2")] });
    const out = enlacesBle({ estado: e, ligaduras: [{ ...lig("b1", "n-tab"), sync: "s-tab", cuenta: "u1" }], ahora: T, caidas: {} });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "ble:b1",
      tipo: "ble",
      abierto: true,
      sinInternet: true,
      ruta: null,
      rttMs: 84,
      capacidadKbps: 160,
      maxBytes: MAX_ARCHIVO_BLE,
      admite: { mensaje: true, archivo: true, flujo: false },
      alcanza: { neuronDeviceId: "n-tab", syncDeviceId: "s-tab", uid: "u1" },
    });
    expect(enlacesBle({ estado: e, ligaduras: [lig("b1", "n-tab")], ahora: T, caidas: { b1: T + 1 } })[0].abierto).toBe(false);
    expect(enlacesBle({ estado: { ...e, radio: "apagada" }, ligaduras: [lig("b1", "n-tab")], ahora: T, caidas: {} })).toEqual([]);
  });

  it("velocidad y duración: lo medido o una horquilla que dice «sin medir»", () => {
    expect(textoVelocidadBle(160)).toBe("≈ 20 KB/s (medido)");
    expect(textoVelocidadBle(null)).toContain("sin medir");
    expect(duracionArchivoBle(20 * 1024 * 1024, 160)).toMatch(/^≈ \d+ min$/);
    expect(duracionArchivoBle(1_000_000, null)).toMatch(/^entre .* y .* \(sin medir\)$/);
  });

  it("señales del radar: cada vecino con su RSSI; de quién es, solo si es de tu cuenta", () => {
    const e = estado({
      vecinos: [
        { id: "v0a1b2c3d", rssi: -55, propia: true, neurona: "n-tab", tipo: "android", servidor: true, visto_hace_ms: 2000, enlace: "b1" },
        { id: "v11111111", rssi: -80, propia: false, neurona: null, tipo: "escritorio", servidor: true, visto_hace_ms: 500, enlace: null },
      ],
      enlaces: [enlace("b1", { rtt_ms: 90, kbps: 200 })],
    });
    const s = senalesBluetoothDirecto(e, T, new Map([["n-tab", "Maggaboard"]]));
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ id: "ble-directo:v0a1b2c3d", antenna: "ble", label: "Maggaboard", compatible: true, simulated: false });
    expect(s[0].starseed).toMatchObject({ via: "direct-link", neuronId: "n-tab", ownAccount: true });
    expect(s[0].metrics.find((m) => m.label === "Señal")?.value).toBe("-55 dBm");
    expect(s[1].starseed).toBeNull();
    expect(s[1].compatible).toBe(false);
    expect(s[0].quality!).toBeGreaterThan(s[1].quality!);
    expect(senalesBluetoothDirecto(estado({ radio: "sin-permiso", vecinos: e.vecinos }), T)).toEqual([]);
    expect(senalesBluetoothDirecto(null, T)).toEqual([]);
  });

  it("control del enlace Wi-Fi (WFD1108A): oferta y respuesta saneadas, caducadas fuera", () => {
    const oferta = {
      t: T_OFERTA_WIFI,
      v: 1,
      s: "sesion-0001",
      de: "n-tab",
      para: "n-mac",
      modo: "hotspot",
      ssid: "DIRECT-StarSeed",
      banda: "5",
      ip: "192.168.49.1",
      puerto: 47071,
      secreto: { iv: "AAAAAAAAAAAAAAAA", ct: "c2VjcmV0bw==" },
      caduca: T + 5 * 60_000,
      ts: T,
    };
    expect(leerControlEnlace(oferta, T)).toEqual(oferta);
    expect(leerControlEnlace({ ...oferta, ip: "8.8.8.8" }, T)).not.toHaveProperty("ip");
    expect(leerControlEnlace({ ...oferta, caduca: T - 1 }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, caduca: T + 60 * 60_000 }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, modo: "bluetooth" }, T)).toBeNull();
    expect(leerControlEnlace({ ...oferta, s: "x" }, T)).toBeNull();
    expect(leerControlEnlace(oferta, T + 11 * 60_000)).toBeNull();
  });

  it("kotlin_habla_con_ble_android_rs()", () => {
    assert!(KOTLIN.contains("package app.starseed.nativa"));
    for (f in [
      "external fun evento(json: String)",
      "external fun datos(enlace: String, hex: String)",
      "external fun siguiente(enlace: String): String",
      "external fun esperarOrden(ms: Long): String",
      "external fun rapido(enlace: String, hex: String)",
      "external fun siguienteRapido(enlace: String, max: Int): String",
    ]) {
      assert!(KOTLIN.contains(f), "{f}");
    }
    let rust = include_str!("/Users/alex/Documents/starseed-wt/BLE1124A/native/src-tauri/src/ble_android.rs");
    for s in [
      "Java_app_starseed_nativa_PuenteBle_evento",
      "Java_app_starseed_nativa_PuenteBle_datos",
      "Java_app_starseed_nativa_PuenteBle_siguiente",
      "Java_app_starseed_nativa_PuenteBle_esperarOrden",
      "Java_app_starseed_nativa_PuenteBle_rapido",
      "Java_app_starseed_nativa_PuenteBle_siguienteRapido",
    ] {
      assert!(rust.contains(s), "{s}");
    }
    // Each order that sends Rust sends Kotlin, and each event of Kotlin reads Rust.
    for o in ["radio", "visto", "conectado", "mtu", "desconectado", "nota", "psm", "l2cap-abierto", "l2cap-cerrado"] {
      assert!(KOTLIN.contains(&format!("\"{o}\" ->")), "evento {o}");
      assert!(rust.contains(&format!("\"{o}\" =>")), "evento {o} en Rust");
    }
  });

  it("kotlin_hex_de_paquetes_es_de_dos_digitos_por_byte()", () => {
    let ini = KOTLIN.find("fun aHex(b: ByteArray): String").expect("aHex");
    let fin = ini + KOTLIN[ini..].find("fun deHex(").expect("deHex");
    let codifica = &KOTLIN[ini..fin];
    assert!(codifica.contains("CharArray(b.size * 2)"), "un carácter por nibble: nunca se recorta el paquete");
    assert!(codifica.contains("HEX[v ushr 4]") && codifica.contains("HEX[v and 0x0f]"), "los ceros a la izquierda también salen");
    let decodifica = &KOTLIN.find("fun deDecode(").expect("deDecode");
    let codifica = &KOTLIN[fin..fin + 400];
    assert!(decodifica.contains("s.length % 2 != 0") && decodifica.contains("return null"), "un hex impar no es un paquete");
  });

  it("kotlin_del_canal_rapido_esta_guardado_y_es_pequeño()", () => {
    for f in [
      "listenUsingInsecureL2capChannel",
      "createInsecureL2capChannel",
      "Build.VERSION.SDK_INT < 29",
      "PHY_LE_2M_MASK",
      "Build.VERSION.SDK_INT < 26",
      "PLAZO_ESCRITURA_FLUJO_MS",
      "onCharacteristicReadRequest",
      "PuenteBle.rapido(k, aHex(",
    ] {
      assert!(KOTLIN.contains(f), "Kotlin sin «{f}»");
    }
  });

  it("kotlin_es_gemelo_de_la_tormenta_de_la_prueba_35()", () => {
    let ini = KOTLIN.find("STATE_DISCONNECTED) {\n                    val c = centrales.remove(k)").expect("desconexión del servidor");
    let f = &KOTLIN[ini..ini + 1400];
    let repetida = f.find("if (c == null) {").expect("una desconexión sin conexión previa es repetida");
    let cancela = f.find("cancelConnection(d)").expect("la real se libera");
    assert!(repetida < cancela, "la repetida sale ANTES de cancelar otra vez (el bucle de la prueba 35)");
    assert!(f[repetida..cancela].contains("return@post");
    let an = KOTLIN.find("private fun anunciar(forzar: Boolean = true)").expect("anunciar con forzar");
    let g = &KOTLIN[an..an + 900];
    assert!(g.contains("ahora - anuncioPedidoMs < CONFIRMAR_ANUNCIO_MS) return"), "un arranque en curso no se reinicia");
    assert!(KOTLIN.contains("CONFIRMAR_ANUNCIO_MS = 3_000L") && crate::ble_autocura::CONFIRMAR_ANUNCIO_MS == 3_000);
    assert!(KOTLIN.contains("ENTRE_CURAS_MAX_MS = 1_800_000L") && crate::ble_autocura::ENTRE_CURAS_MAX_MS == 1_800_000);
    assert!(KOTLIN.contains("plazoEntreCuras(curasSeguidas)"));
    assert!(KOTLIN.contains("nota(\"contador-enlaces"));
  });

  it("hitos_de_kotlin_son_los_que_rust_acepta()", () => {
    let mut vistos = Vec::new();
    let mut resto = KOTLIN;
    while let Some(i) = resto.find("nota(\"") {
      let r = &resto[i + 6..];
      let f = r.find('"').unwrap();
      vistos.push(r[..f].to_string());
      resto = &r[f..];
    }
    for h in ["servicios-descubiertos", "suscrito", "sin-suscripcion", "listo-tarde", "suscripcion-reintento"] {
      assert!(vistos.iter().any(|v| v == h), "Kotlin no anota «{h}»");
      assert!(crate::ble::NOTAS_RADIO.contains(&h));
    }
    for v in &vistos {
      assert!(crate::ble::NOTAS_RADIO.contains(&v.as_str()), "Rust no acepta la nota «{v}»");
    }
    assert!(KOTLIN.contains("VIGIA_SUSCRIPCION_MS"), "el periférico vigila la suscripción del otro");
    assert!(KOTLIN.contains("REINTENTOS_SUSCRIPCION"), "el central reintenta la suscripción");
    assert!(KOTLIN.contains("VIGIA_ESCRITURA_MS = 500L"));
  });

  it("(BLE1109A) El canal L2CAP de Kotlin: guardado por versión, sin cifrado de aire (va por encima), con vigía de escritura, PHY de 2M y E/S fuera del hilo principal. Y el bloque no toca el camino de GATT.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109B) Causa raíz de la regresión de prueba.31: nada que pueda bloquear (crear el socket L2CAP, leer su PSM, `accept()`) corre en el hilo principal ni en un callback GATT; el PSM se publica con el socket ya listo; el PSM del otro se lee solo tras «ligado»; y el PHY 2M no se pide al conectar.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1108C) `reanudarRadio` solo arranca lo que falta (anuncio y escaneo): no toca el servidor GATT ni los clientes ni para un anuncio en marcha, así que un enlace con datos en vuelo jamás se cae por él.", () => {
    // ... (omitted for brevity)
  });

  it("(MLL1111C) El gemelo Kotlin de `ble_autocura` (desconexión repetida, anuncio que junta peticiones, plazo creciente y contador real) sigue escrito como en Rust.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1108C) Los hitos que Kotlin anota son los que Rust acepta, y cubren descubrimiento, suscripción, «listo-tarde» y reintento; el periférico vigila que el otro se suscribe.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109A) El canal L2CAP de Kotlin: guardado por versión, sin cifrar por el aire (va por encima), con vigía de escritura, PHY de 2M y E/S fuera del hilo principal. Todo el marco y la decisión de carril viven en hilos propios (nunca en el principal).", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109B) `bombear` despierta al hilo del canal Y deja seguir a GATT: Rust decide por qué carril sale cada paquete.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109A) Bytes del flujo L2CAP en hex (hasta un trozo de `ble_l2cap::TROZO_MAX`; lo demás se ignora).", () => {
    // ... (omitted for brevity)
  });

  it("(BLX1118A) El turno de conexión como central (una a la vez en todo el adaptador y, por dirección, nunca dos peticiones. Lo que llega mientras hay una en curso se guarda (solo la última por dirección; máximo `MAX_COLA`) y se atiende al terminar.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109B) Un intento completo con una dirección. `None` = hubo enlace (o ya lo había); `Some(r)` = por qué no.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109B) Parar y encender el escaneo (cuando el objeto desapareció o el escaneo lleva mudo mucho tiempo).", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1108C) La suscripción a SALIDA no quedó: se anota y se reintenta hasta `REINTENTOS_SUSCRIPCION` veces (a 1 s) antes de cerrar el enlace, en vez de quedarse esperando un enlace que nunca abre.", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109A) El canal L2CAP de Kotlin: guardado por versión, sin cifrado de aire (va por encima), con vigía de escritura, PHY de 2M y E/S fuera del hilo principal. Todo el marco y la decisión de carril viven en hilos propios (nunca en el principal).", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109B) `leer_psm` y `al_psm` del otro lado: el mismo valor que en macOS y Android (`ble_l2cap::leer_psm`).", () => {
    // ... (omitted for brevity)
  });

  it("(BLE1109A) El canal L2CAP de Kotlin: guardado por versión, sin cifrado de aire (va por encima), con vigía de escritura, PHY de 2M y E/S fuera del hilo principal. Todo el marco y la decisión de carril viven en hilos propios (nunca en el principal).", () => {
    // ... (duplicate)
  });

  // Additional tests omitted for brevity...
});
