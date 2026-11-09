/**
 * matriz-enlaces — qué carriles directos caben entre CUALQUIER pareja de plataformas (2026-11-09 · MTZ1109A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Contrato: `architecture/matriz-enlaces-directos.md`.
 *
 * Alex: «debes asegurar que todas las conexiones compatibles entre sí también funcionen, de todo tipo». Directo es
 * SIN router y SIN hotspot que haga salir a un aparato de su Wi‑Fi. Cada neurona anuncia en su saludo firmado qué
 * carriles tiene (`lanas`) y su `plataforma`; de ahí sale, igual en las dos puntas, qué carriles usa la PAREJA,
 * en este orden fijo:
 *   1 · awdl          solo Apple ↔ Apple
 *   2 · wifi-aware    solo Android ↔ Android
 *   3 · wifi-direct   entre dos cualquiera de Android / Windows / Linux (GO: primero quien conserva su Wi‑Fi, luego id menor)
 *   4 · ble-l2cap     si los dos lo tienen (canal rápido de Bluetooth)
 *   5 · ble-gatt      con roles compatibles (uno central, otro periférico)
 *   6 · lan-tcp       si están en la misma red
 * El punto de acceso sigue siendo un permiso aparte (opt-in), fuera de este orden. Una app anterior sin `lanas` se
 * infiere de su plataforma y de sus campos viejos (`lanasInferidas`).
 */

import type { CapacidadesWifi } from "./enlace-wifi-directo";

/* ══════════════════════════ Tipos ══════════════════════════ */

/** Los seis carriles, con estos nombres exactos en todo el código. */
export type Lana = "awdl" | "wifi-aware" | "wifi-direct" | "ble-l2cap" | "ble-gatt" | "lan-tcp";

/** Orden de preferencia (de más a menos directo y rápido). */
export const ORDEN_LANAS: readonly Lana[] = ["awdl", "wifi-aware", "wifi-direct", "ble-l2cap", "ble-gatt", "lan-tcp"];

export type PlataformaMatriz = "macos" | "windows" | "linux" | "android" | "ios" | "web";
export const PLATAFORMAS_MATRIZ: readonly PlataformaMatriz[] = ["macos", "windows", "linux", "android", "ios", "web"];

/** Lo que una neurona anuncia en su saludo (la misma forma por el cable y en memoria). */
export interface LanasAnunciadas {
  "lan-tcp": boolean;
  "ble-gatt": { central: boolean; periferico: boolean };
  "ble-l2cap": boolean;
  "wifi-direct": { go: boolean; cliente: boolean; concurrente: boolean };
  "wifi-aware": boolean;
  awdl: boolean;
  "punto-acceso-optin": boolean;
}

export const SIN_LANAS: LanasAnunciadas = {
  "lan-tcp": false,
  "ble-gatt": { central: false, periferico: false },
  "ble-l2cap": false,
  "wifi-direct": { go: false, cliente: false, concurrente: false },
  "wifi-aware": false,
  awdl: false,
  "punto-acceso-optin": false,
};

/** Una neurona tal como la ve la matriz. */
export interface NeuronaLanas {
  id: string;
  plataforma: PlataformaMatriz;
  lanas: LanasAnunciadas;
}

const NOMBRE_PLATAFORMA: Record<PlataformaMatriz, string> = {
  macos: "Mac",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  web: "Web/PWA",
};
export function nombrePlataforma(p: PlataformaMatriz): string {
  return NOMBRE_PLATAFORMA[p];
}

const NOMBRE_LANA: Record<Lana, string> = {
  awdl: "AWDL",
  "wifi-aware": "Wi‑Fi Aware",
  "wifi-direct": "Wi‑Fi Direct",
  "ble-l2cap": "Bluetooth rápido (L2CAP)",
  "ble-gatt": "Bluetooth",
  "lan-tcp": "red local",
};
export function nombreLanaMatriz(l: Lana): string {
  return NOMBRE_LANA[l];
}

/* ══════════════════════════ Plataforma ══════════════════════════ */

/** Normaliza cualquier texto de plataforma (saludo, ficha, capacidades) a una de las seis. Lo raro es «web» (sin antenas). */
export function plataformaMatriz(x: unknown): PlataformaMatriz {
  const s = typeof x === "string" ? x.toLowerCase() : "";
  if (/android/.test(s)) return "android";
  if (/ios|iphone|ipad/.test(s)) return "ios";
  if (/mac|darwin|apple/.test(s)) return "macos";
  if (/win/.test(s)) return "windows";
  if (/linux|ubuntu|debian|fedora/.test(s)) return "linux";
  return "web";
}

const APPLE = new Set<PlataformaMatriz>(["macos", "ios"]);
const DIRECT = new Set<PlataformaMatriz>(["android", "windows", "linux"]);

/* ══════════════════════════ Lectura / inferencia ══════════════════════════ */

const b = (x: unknown): boolean => x === true;

/** Lee las `lanas` de un saludo ajeno: lo que no es booleano, falso; null si no es un objeto. Puro. */
export function leerLanas(x: unknown): LanasAnunciadas | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const g = (o["ble-gatt"] && typeof o["ble-gatt"] === "object" ? o["ble-gatt"] : {}) as Record<string, unknown>;
  const w = (o["wifi-direct"] && typeof o["wifi-direct"] === "object" ? o["wifi-direct"] : {}) as Record<string, unknown>;
  return {
    "lan-tcp": b(o["lan-tcp"]),
    "ble-gatt": { central: b(g.central), periferico: b(g.periferico) },
    "ble-l2cap": b(o["ble-l2cap"]),
    "wifi-direct": { go: b(w.go), cliente: b(w.cliente), concurrente: b(w.concurrente) },
    "wifi-aware": b(o["wifi-aware"]),
    awdl: b(o.awdl),
    "punto-acceso-optin": b(o["punto-acceso-optin"]),
  };
}

/**
 * lanasInferidas — lo que una app ANTERIOR (sin `lanas` en su saludo) tenía de verdad, por su plataforma y sus
 * campos viejos. Hasta WFA1109A/MTZ1109A solo macOS y Android hablaban Bluetooth (GATT + L2CAP), y Windows y Linux
 * solo la red local. Los carriles Wi‑Fi salen de las capacidades `enlace.wifi.*` si se conocen. Sin parte nativa
 * conocida (navegador), ninguna antena. Puro.
 */
export function lanasInferidas(plataforma: unknown, opciones: { cap?: CapacidadesWifi | null; nativo?: boolean } = {}): LanasAnunciadas {
  const p = plataformaMatriz(plataforma);
  const cap = opciones.cap ?? null;
  const nativo = opciones.nativo ?? (!!cap || false);
  if (p === "web" || !nativo) return { ...SIN_LANAS, "ble-gatt": { ...SIN_LANAS["ble-gatt"] }, "wifi-direct": { ...SIN_LANAS["wifi-direct"] } };
  const ble = p === "macos" || p === "android" || p === "ios";
  const lanas = cap?.lanas ?? [];
  const wd = !!cap && cap.ap.includes("wifi-direct") && cap.cliente.includes("wifi-direct");
  return {
    "lan-tcp": true,
    "ble-gatt": { central: ble, periferico: ble },
    "ble-l2cap": ble,
    "wifi-direct": {
      go: wd || (p === "android" && lanas.includes("wifi-direct-concurrente")),
      cliente: wd || (p === "android" && lanas.includes("wifi-direct-concurrente")),
      concurrente: lanas.includes("wifi-direct-concurrente"),
    },
    "wifi-aware": p === "android" && (lanas.includes("wifi-aware") || (!!cap && cap.ap.includes("wifi-aware") && cap.cliente.includes("wifi-aware"))),
    awdl: APPLE.has(p) && lanas.includes("awdl"),
    "punto-acceso-optin": lanas.includes("punto-acceso-optin"),
  };
}

/** Las lanas de un saludo: las anunciadas si vienen; si no, las inferidas de la plataforma y los campos viejos. Puro. */
export function lanasDeSaludo(
  lanas: unknown,
  plataforma: unknown,
  extras: { cap?: CapacidadesWifi | null; nativo?: boolean } = {},
): { plataforma: PlataformaMatriz; lanas: LanasAnunciadas; anunciadas: boolean } {
  const leidas = leerLanas(lanas);
  const pl = plataformaMatriz(plataforma ?? extras.cap?.plataforma);
  return leidas ? { plataforma: pl, lanas: leidas, anunciadas: true } : { plataforma: pl, lanas: lanasInferidas(pl, extras), anunciadas: false };
}

/* ── Lo propio, desde las órdenes nativas ── */

/** Lo que dicen `ble_estado`, `enlace_wifi_capacidades` y `awdl_estado` (cualquiera puede faltar). */
export interface EntradaNativa {
  plataforma: unknown;
  /** `ble_estado` ya saneado o crudo: `disponible` y, si la parte nativa los trae, `l2cap` y `roles` (`central`/`periferico`). */
  ble?: { disponible?: unknown; l2cap?: unknown; roles?: unknown; plataforma?: unknown } | null;
  /** `enlace_wifi_capacidades`. */
  wifi?: CapacidadesWifi | null;
  /** `awdl_estado`: `disponible` / `activo`. */
  awdl?: { disponible?: unknown; activo?: unknown } | null;
  /** ¿Hay parte nativa (canal TCP 47071)? */
  nativo: boolean;
  puntoAccesoOptin?: boolean;
}

/**
 * lanasDeNativo — el valor LOCAL de `lanas`, construido con lo que dicen las órdenes nativas. Así los carriles
 * nuevos de Windows y Linux aparecen solos cuando sus agentes los publican (`ble_estado`: roles/l2cap;
 * `enlace_wifi_capacidades`: ap/cliente `wifi-direct` y `lanas`). Si la orden no trae un campo, se usa lo que la
 * plataforma tiene de fábrica SOLO cuando el carril está disponible. Puro.
 */
export function lanasDeNativo(e: EntradaNativa): LanasAnunciadas {
  const p = plataformaMatriz(e.plataforma ?? e.wifi?.plataforma ?? e.ble?.plataforma);
  if (p === "web" || !e.nativo) return lanasInferidas("web");
  const cap = e.wifi ?? null;
  const lanasWifi = cap?.lanas ?? [];
  const ble = e.ble ?? null;
  const bleOk = !!ble && ble.disponible === true;
  const roles = Array.isArray(ble?.roles) ? (ble?.roles as unknown[]) : null;
  const porDefecto = p === "macos" || p === "android" || p === "ios" || p === "linux" || p === "windows";
  const central = bleOk && (roles ? roles.includes("central") : porDefecto);
  const periferico = bleOk && (roles ? roles.includes("periferico") : porDefecto);
  // L2CAP: lo dice la parte nativa si puede; si no, de fábrica en macOS, iOS, Android y Linux (Windows no lo tiene).
  const l2capDefecto = p === "macos" || p === "ios" || p === "android" || p === "linux";
  const l2cap = bleOk && (central || periferico) && (typeof ble?.l2cap === "boolean" ? ble.l2cap : l2capDefecto);
  const wdAp = !!cap && cap.ap.includes("wifi-direct");
  const wdCli = !!cap && cap.cliente.includes("wifi-direct");
  const concurrente = lanasWifi.includes("wifi-direct-concurrente");
  const awdlOk = APPLE.has(p) && (lanasWifi.includes("awdl") || e.awdl?.disponible === true || e.awdl?.activo === true);
  return {
    "lan-tcp": true,
    "ble-gatt": { central, periferico },
    "ble-l2cap": l2cap,
    "wifi-direct": DIRECT.has(p) ? { go: wdAp, cliente: wdCli, concurrente } : { go: false, cliente: false, concurrente: false },
    "wifi-aware": p === "android" && (lanasWifi.includes("wifi-aware") || (!!cap && cap.ap.includes("wifi-aware") && cap.cliente.includes("wifi-aware"))),
    awdl: awdlOk,
    "punto-acceso-optin": e.puntoAccesoOptin === true || lanasWifi.includes("punto-acceso-optin"),
  };
}

/** Las lanas de una plataforma con TODO lo previsto ya publicado (para la tabla y las pruebas). iOS: planificado, como macOS. */
export function lanasPlenas(p: PlataformaMatriz): LanasAnunciadas {
  switch (p) {
    case "macos":
    case "ios":
      return { ...SIN_LANAS, "lan-tcp": true, "ble-gatt": { central: true, periferico: true }, "ble-l2cap": true, awdl: true, "wifi-direct": { ...SIN_LANAS["wifi-direct"] } };
    case "android":
      return { ...SIN_LANAS, "lan-tcp": true, "ble-gatt": { central: true, periferico: true }, "ble-l2cap": true, "wifi-aware": true, "wifi-direct": { go: true, cliente: true, concurrente: true } };
    case "linux":
      return { ...SIN_LANAS, "lan-tcp": true, "ble-gatt": { central: true, periferico: true }, "ble-l2cap": true, "wifi-direct": { go: true, cliente: true, concurrente: false } };
    case "windows":
      return { ...SIN_LANAS, "lan-tcp": true, "ble-gatt": { central: true, periferico: true }, "ble-l2cap": false, "wifi-direct": { go: true, cliente: true, concurrente: false } };
    default:
      return lanasInferidas("web");
  }
}

/* ══════════════════════════ Decisión de la pareja ══════════════════════════ */

export interface DecisionLana {
  lana: Lana;
  /** Bluetooth: quién hace de central y quién de periférico. */
  roles?: { central: string; periferico: string };
  /** Wi‑Fi Direct: quién es el propietario del grupo (GO) y quién el cliente. */
  go?: string;
  cliente?: string;
  /** Neuronas que dejarían su Wi‑Fi de casa mientras dure (Wi‑Fi Direct sin concurrencia). */
  dejanWifi?: string[];
  /** Solo si están en la misma red: no se sabe todavía. */
  condicional?: boolean;
  motivo: string;
}

export interface DecisionPareja {
  a: string;
  b: string;
  /** Carriles que valen para los dos, en orden de preferencia (los caídos ya fuera). */
  lanas: DecisionLana[];
  /** Carriles que no valen (o caídos ahora) con el motivo, en el mismo orden. */
  descartadas: Array<{ lana: Lana; motivo: string; caida?: boolean }>;
  /** Los dos permitieron la red directa por punto de acceso (opt-in, fuera del orden). */
  puntoAcceso: boolean;
  /** Frase del límite de la pareja para la persona. */
  limite: string;
}

export interface OpcionesPareja {
  /** ¿Están en la misma red local? Sin decir (undefined), `lan-tcp` entra como condicional. */
  mismaRed?: boolean;
  /** Carriles que fallaron hace poco para esta pareja (en espera): salen y entra el siguiente. */
  caidas?: ReadonlySet<Lana> | readonly Lana[];
}

/** Quién es GO en Wi‑Fi Direct: primero quien conserva su Wi‑Fi (concurrente), luego el id menor. Null si no hay combinación. */
export function elegirGoWifiDirect(a: NeuronaLanas, b: NeuronaLanas): { go: string; cliente: string } | null {
  const wa = a.lanas["wifi-direct"];
  const wb = b.lanas["wifi-direct"];
  const cands: Array<{ go: NeuronaLanas; cli: NeuronaLanas }> = [];
  if (wa.go && wb.cliente) cands.push({ go: a, cli: b });
  if (wb.go && wa.cliente) cands.push({ go: b, cli: a });
  if (!cands.length) return null;
  cands.sort((x, y) => {
    const cx = x.go.lanas["wifi-direct"].concurrente ? 1 : 0;
    const cy = y.go.lanas["wifi-direct"].concurrente ? 1 : 0;
    if (cx !== cy) return cy - cx;
    return x.go.id < y.go.id ? -1 : x.go.id > y.go.id ? 1 : 0;
  });
  return { go: cands[0].go.id, cliente: cands[0].cli.id };
}

/** Roles Bluetooth: uno central y otro periférico. Si valen las dos asignaciones, central el id menor (las dos puntas coinciden). */
export function elegirRolesBle(a: NeuronaLanas, b: NeuronaLanas): { central: string; periferico: string } | null {
  const ab = a.lanas["ble-gatt"].central && b.lanas["ble-gatt"].periferico;
  const ba = b.lanas["ble-gatt"].central && a.lanas["ble-gatt"].periferico;
  if (ab && ba) return a.id < b.id ? { central: a.id, periferico: b.id } : { central: b.id, periferico: a.id };
  if (ab) return { central: a.id, periferico: b.id };
  if (ba) return { central: b.id, periferico: a.id };
  return null;
}

/** Frase del límite de una pareja de plataformas (la que sale en la tabla de Ajustes). */
export function limiteDePareja(pa: PlataformaMatriz, pb: PlataformaMatriz, lanas: readonly Lana[]): string {
  const par = (x: PlataformaMatriz, y: PlataformaMatriz) => (pa === x && pb === y) || (pa === y && pb === x);
  const quien = `${NOMBRE_PLATAFORMA[pa]} ↔ ${NOMBRE_PLATAFORMA[pb]}`;
  if (pa === "web" || pb === "web") return "Web/PWA: sin antenas directas; usa la red local por la app nativa o la malla";
  const apple = (p: PlataformaMatriz) => APPLE.has(p);
  const noApple = (p: PlataformaMatriz) => !APPLE.has(p);
  if (apple(pa) && apple(pb)) return `${quien}: Wi‑Fi P2P por AWDL y Bluetooth`;
  if ((apple(pa) && noApple(pb)) || (apple(pb) && noApple(pa))) {
    const otro = apple(pa) ? pb : pa;
    const apl = apple(pa) ? pa : pb;
    const nom = `${NOMBRE_PLATAFORMA[apl]} ↔ ${NOMBRE_PLATAFORMA[otro]}`;
    const wifiMotivo = apl === "ios" ? "iOS no tiene Wi‑Fi Direct" : "macOS no tiene Wi‑Fi Direct";
    if (otro === "windows") return `${nom}: solo Bluetooth (${wifiMotivo})`;
    return `${nom}: Bluetooth, con canal rápido L2CAP (${wifiMotivo}); el punto de acceso solo si lo permites`;
  }
  if (par("android", "android")) return `${quien}: Wi‑Fi Aware o, si falta, Wi‑Fi Direct; los dos conservan su Wi‑Fi`;
  if (lanas.includes("wifi-direct")) return `${quien}: Wi‑Fi Direct estándar (el grupo lo lleva quien conserva su Wi‑Fi) y Bluetooth`;
  return `${quien}: ${lanas.length ? lanas.map(nombreLanaMatriz).join(" y ") : "sin carril directo común"}`;
}

/**
 * decidirPareja — los carriles directos de ESTAS dos neuronas, en orden, con roles y GO. Pura y simétrica
 * (`decidirPareja(a, b)` y `decidirPareja(b, a)` dan lo mismo salvo el orden de los nombres): las dos puntas
 * calculan igual sin hablar.
 */
export function decidirPareja(a: NeuronaLanas, b: NeuronaLanas, o: OpcionesPareja = {}): DecisionPareja {
  const caidas = new Set<Lana>(o.caidas ?? []);
  const lanas: DecisionLana[] = [];
  const descartadas: DecisionPareja["descartadas"] = [];
  const roles = elegirRolesBle(a, b);

  const evaluar = (lana: Lana): { ok: true; d: DecisionLana } | { ok: false; motivo: string } => {
    switch (lana) {
      case "awdl":
        if (!(APPLE.has(a.plataforma) && APPLE.has(b.plataforma))) return { ok: false, motivo: "AWDL solo existe entre aparatos Apple" };
        if (!(a.lanas.awdl && b.lanas.awdl)) return { ok: false, motivo: "AWDL no está disponible en las dos" };
        return { ok: true, d: { lana, motivo: "Wi‑Fi P2P por AWDL, sin router ni hotspot" } };
      case "wifi-aware":
        if (!(a.plataforma === "android" && b.plataforma === "android")) return { ok: false, motivo: "Wi‑Fi Aware solo existe entre dos Android" };
        if (!(a.lanas["wifi-aware"] && b.lanas["wifi-aware"])) return { ok: false, motivo: "Wi‑Fi Aware no está disponible en las dos" };
        return { ok: true, d: { lana, motivo: "Wi‑Fi Aware, sin router ni hotspot" } };
      case "wifi-direct": {
        if (!(DIRECT.has(a.plataforma) && DIRECT.has(b.plataforma))) return { ok: false, motivo: "Wi‑Fi Direct solo entre Android, Windows y Linux (Apple y la web no lo tienen)" };
        const r = elegirGoWifiDirect(a, b);
        if (!r) return { ok: false, motivo: "Wi‑Fi Direct: ninguna de las dos puede ser propietaria del grupo y la otra cliente" };
        const dejan = [a, b].filter((n) => !n.lanas["wifi-direct"].concurrente).map((n) => n.id).sort();
        return { ok: true, d: { lana, go: r.go, cliente: r.cliente, ...(dejan.length ? { dejanWifi: dejan } : {}), motivo: dejan.length ? "Wi‑Fi Direct estándar (una neurona deja su Wi‑Fi mientras dure)" : "Wi‑Fi Direct estándar, las dos conservan su Wi‑Fi" } };
      }
      case "ble-l2cap":
        if (!(a.lanas["ble-l2cap"] && b.lanas["ble-l2cap"])) return { ok: false, motivo: "el canal rápido de Bluetooth (L2CAP) no está en las dos" };
        if (!roles) return { ok: false, motivo: "Bluetooth: los roles no encajan (hace falta una central y otra periférica)" };
        return { ok: true, d: { lana, roles, motivo: "Bluetooth con canal rápido L2CAP" } };
      case "ble-gatt":
        if (!roles) return { ok: false, motivo: "Bluetooth: ninguna de las dos puede hacer de central con la otra de periférica" };
        return { ok: true, d: { lana, roles, motivo: "Bluetooth (GATT)" } };
      case "lan-tcp":
        if (!(a.lanas["lan-tcp"] && b.lanas["lan-tcp"])) return { ok: false, motivo: "la red local necesita la app nativa en las dos" };
        if (o.mismaRed === false) return { ok: false, motivo: "no están en la misma red" };
        return { ok: true, d: { lana, ...(o.mismaRed === undefined ? { condicional: true } : {}), motivo: "red local (si están en la misma red)" } };
    }
  };

  for (const l of ORDEN_LANAS) {
    const r = evaluar(l);
    if (!r.ok) descartadas.push({ lana: l, motivo: r.motivo });
    else if (caidas.has(l)) descartadas.push({ lana: l, motivo: "falló hace poco con esta pareja; se reintenta más tarde", caida: true });
    else lanas.push(r.d);
  }
  const todas = ORDEN_LANAS.filter((l) => evaluar(l).ok);
  return {
    a: a.id,
    b: b.id,
    lanas,
    descartadas,
    puntoAcceso: a.lanas["punto-acceso-optin"] && b.lanas["punto-acceso-optin"] && a.plataforma !== "web" && b.plataforma !== "web",
    limite: limiteDePareja(a.plataforma, b.plataforma, todas),
  };
}

/**
 * lanasParaPesado — los carriles que llevan trozos A LA VEZ para lo pesado: el mejor Wi‑Fi P2P, el mejor Bluetooth
 * (L2CAP o GATT: es un solo enlace de radio) y la red local. El resto de carriles no suma. Puro.
 */
export function lanasParaPesado(d: DecisionPareja): Lana[] {
  const wifi = d.lanas.find((x) => x.lana === "awdl" || x.lana === "wifi-aware" || x.lana === "wifi-direct");
  const ble = d.lanas.find((x) => x.lana === "ble-l2cap" || x.lana === "ble-gatt");
  const lan = d.lanas.find((x) => x.lana === "lan-tcp");
  return [wifi?.lana, ble?.lana, lan?.lana].filter((x): x is Lana => !!x);
}

/** Carril al que pertenece un enlace del transporte (por su id y tipo), o null si no es uno de los seis. */
export function lanaDeEnlace(id: string, tipo: string): Lana | null {
  if (tipo === "ble") return "ble-gatt";
  if (tipo === "nativo" || tipo === "local") {
    if (/^nativo:awdl:/i.test(id)) return "awdl";
    if (/^nativo:fe[89ab][0-9a-f]:/i.test(id)) return "wifi-aware";
    return "lan-tcp";
  }
  return null;
}

/** Todas las parejas ORDENADAS de las seis plataformas con todo publicado (la matriz 6×6 del contrato). */
export function matrizPlena(opciones: OpcionesPareja = { mismaRed: true }): Array<{ de: PlataformaMatriz; con: PlataformaMatriz; decision: DecisionPareja }> {
  const out: Array<{ de: PlataformaMatriz; con: PlataformaMatriz; decision: DecisionPareja }> = [];
  for (const de of PLATAFORMAS_MATRIZ) {
    for (const con of PLATAFORMAS_MATRIZ) {
      out.push({
        de,
        con,
        decision: decidirPareja({ id: `${de}-1`, plataforma: de, lanas: lanasPlenas(de) }, { id: `${con}-2`, plataforma: con, lanas: lanasPlenas(con) }, opciones),
      });
    }
  }
  return out;
}

/* ══════════════════════════ Tabla de la cuenta (Ajustes › Neuronas › Medios) ══════════════════════════ */

export interface NeuronaDeCuenta extends NeuronaLanas {
  nombre: string;
  /** ¿Es este aparato? */
  esta?: boolean;
  /** ¿Anunció sus carriles ella misma (true) o se infirieron de una app anterior (false)? */
  anunciadas?: boolean;
}

export interface FilaCompatibilidad {
  a: NeuronaDeCuenta;
  b: NeuronaDeCuenta;
  decision: DecisionPareja;
  /** Carriles de ahora, ya con nombre, en orden. */
  carriles: string[];
  /** Nota sobre carriles en espera por un fallo reciente. */
  enEspera: string[];
  /** Aviso de datos incompletos (app anterior que no anuncia sus carriles). */
  aviso?: string;
}

/** Una fila por pareja NO ordenada de las neuronas de la cuenta. Puro y estable (orden de entrada). */
export function filasCompatibilidad(
  neuronas: readonly NeuronaDeCuenta[],
  opciones: { mismaRed?: boolean; caidas?: (a: string, b: string) => readonly Lana[] } = {},
): FilaCompatibilidad[] {
  const out: FilaCompatibilidad[] = [];
  for (let i = 0; i < neuronas.length; i++) {
    for (let j = i + 1; j < neuronas.length; j++) {
      const a = neuronas[i];
      const b = neuronas[j];
      const caidas = opciones.caidas?.(a.id, b.id) ?? [];
      const decision = decidirPareja(a, b, { mismaRed: opciones.mismaRed, caidas });
      const sinDatos = [a, b].filter((n) => n.anunciadas === false && n.plataforma !== "web").map((n) => n.nombre);
      out.push({
        a,
        b,
        decision,
        carriles: decision.lanas.map((l) => nombreLanaMatriz(l.lana)),
        enEspera: decision.descartadas.filter((d) => d.caida).map((d) => nombreLanaMatriz(d.lana)),
        ...(sinDatos.length ? { aviso: `${sinDatos.join(" y ")}: app anterior, sin carriles anunciados; se estiman por su plataforma` } : {}),
      });
    }
  }
  return out;
}
