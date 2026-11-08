export type ClaseRuta =
  | "misma-red-local"
  | "internet-directo"
  | "reenviado-turn"
  | "desconocida";

export interface RutaEnlace {
  clase: ClaseRuta;
  tipoLocal: string | null;
  tipoRemoto: string | null;
  /** (BLE1108B) Direcciones del par elegido, si el navegador las da (con mDNS no hay). */
  direccionLocal?: string | null;
  direccionRemota?: string | null;
  protocolo: string | null;
  rttMs: number | null;
  bytesEnviados: number | null;
  bytesRecibidos: number | null;
  medidoEn: number;
}

type Estadistica = Record<string, unknown>;

/**
 * Lo que devuelve `RTCPeerConnection.getStats()` es un `RTCStatsReport`: se comporta como un
 * Map (tiene `values()` y `forEach`) pero NO es `instanceof Map`, y su iterador da pares
 * `[id, estadística]`. (2026-09-27) La primera versión preguntaba `instanceof Map`, recorría
 * los pares como si fueran estadísticas y en un navegador real toda ruta salía «desconocida».
 */
export type FuenteEstadisticas =
  | Iterable<Estadistica>
  | Map<string, Estadistica>
  | { values(): Iterable<unknown> }
  | { forEach(cb: (valor: unknown) => void): void };

function aLista(stats: FuenteEstadisticas): Estadistica[] {
  const s = stats as { values?: () => Iterable<unknown>; forEach?: (cb: (v: unknown) => void) => void };
  let crudos: unknown[];
  if (typeof s.values === "function") crudos = Array.from(s.values());
  else if (typeof s.forEach === "function") {
    crudos = [];
    s.forEach((v) => crudos.push(v));
  } else crudos = Array.from(stats as Iterable<unknown>);
  return crudos
    .map((e) => (Array.isArray(e) && e.length === 2 && e[1] && typeof e[1] === "object" ? e[1] : e))
    .filter((e): e is Estadistica => !!e && typeof e === "object" && !Array.isArray(e));
}

export function resumirRuta(stats: FuenteEstadisticas, ahora: number): RutaEnlace {
  const entradas = aLista(stats);
  const porId = new Map<string, Estadistica>();
  for (const entrada of entradas) {
    if (typeof entrada.id === "string") porId.set(entrada.id, entrada);
  }

  // Cadena de selección del par activo, en orden de confianza:
  // 1. El par que anuncia la entrada «transport» vía `selectedCandidatePairId` (solo si ese id
  //    existe en el informe y el par ya está «succeeded» — puede no estar todavía, o el
  //    navegador puede omitir la entrada del par).
  // 2. Si no, cualquier par «succeeded» y «nominated» (el que ICE marcó como ganador).
  // Los ids ausentes del índice `porId` no son un error: se descartan y se prueba el siguiente
  // criterio, de modo que un informe parcial nunca devuelve una ruta inventada.
  const idSeleccionado = entradas.find(
    (entrada) => entrada.type === "transport" && typeof entrada.selectedCandidatePairId === "string",
  )?.selectedCandidatePairId;
  const seleccionado = typeof idSeleccionado === "string" ? porId.get(idSeleccionado) : undefined;
  const par =
    (seleccionado && esParUtil(seleccionado) ? seleccionado : undefined) ??
    entradas.find(
      (entrada) => esParUtil(entrada) && entrada.nominated === true,
    );
  if (!par) {
    return rutaDesconocida(ahora);
  }

  const local = candidato(porId, par.localCandidateId);
  const remoto = candidato(porId, par.remoteCandidateId);
  const tipoLocal = texto(local?.candidateType);
  const tipoRemoto = texto(remoto?.candidateType);
  const direccionLocal = texto(local?.address) ?? texto(local?.ip);
  const direccionRemota = texto(remoto?.address) ?? texto(remoto?.ip);
  const protocolo = texto(local?.protocol) ?? texto(remoto?.protocol);
  const rttSegundos = numero(par.currentRoundTripTime);

  return {
    clase: clasificarPar({ tipoLocal, tipoRemoto, direccionLocal, direccionRemota }),
    tipoLocal,
    tipoRemoto,
    ...(direccionLocal ? { direccionLocal } : {}),
    ...(direccionRemota ? { direccionRemota } : {}),
    protocolo,
    rttMs: rttSegundos === null ? null : Math.round(rttSegundos * 1_000),
    bytesEnviados: numero(par.bytesSent),
    bytesRecibidos: numero(par.bytesReceived),
    medidoEn: ahora,
  };
}

export function etiquetaRuta(clase: ClaseRuta): string {
  const etiquetas: Record<ClaseRuta, string> = {
    "misma-red-local": "misma red local",
    "internet-directo": "internet directo (NAT atravesado)",
    "reenviado-turn": "relé TURN",
    desconocida: "ruta desconocida",
  };
  return etiquetas[clase];
}

function esParUtil(entrada: Estadistica): boolean {
  return entrada.type === "candidate-pair" && entrada.state === "succeeded";
}

function candidato(porId: Map<string, Estadistica>, id: unknown): Estadistica | undefined {
  return typeof id === "string" ? porId.get(id) : undefined;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/* ══════════ Clasificador común de la ruta (BLE1108B) ══════════
 * Lo usan los dos lados (remitente y receptor), el panel de Señales y la info del mensaje: la ruta se decide
 * por las DIRECCIONES del par elegido, no solo por el tipo de candidato. El 08-11 la tableta decía «P2P por
 * internet (NAT atravesado)» y la Mac «red local» para la misma transferencia: un par prflx/srflx entre dos
 * direcciones privadas de la misma red es red local aunque la señalización haya pasado por internet. */

/** IPv4 como número de 32 bits, o null. */
function ipv4(d: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(d.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

/** Los 8 grupos de 16 bits de una IPv6 (admite «::» y la zona «%wlan0»), o null. */
function ipv6(d: string): number[] | null {
  const s = d.trim().split("%")[0].toLowerCase();
  if (!s.includes(":")) return null;
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapeada) return null; // se trata como IPv4 antes
  const [cabeza, cola, extra] = s.split("::");
  if (extra !== undefined) return null;
  const trozos = (x: string | undefined) => (x ? x.split(":") : []);
  const h = trozos(cabeza);
  const c = cola === undefined ? [] : trozos(cola);
  if (cola === undefined && h.length !== 8) return null;
  const relleno = cola === undefined ? [] : Array(Math.max(0, 8 - h.length - c.length)).fill("0");
  const todo = [...h, ...relleno, ...c];
  if (todo.length !== 8) return null;
  const n = todo.map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return n.some(Number.isNaN) ? null : n;
}

function normalizar(d: string): { v4: number | null; v6: number[] | null } {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(d.trim());
  const v4 = ipv4(mapeada ? mapeada[1] : d);
  return { v4, v6: v4 === null ? ipv6(d) : null };
}

export type TipoDireccion = "privada" | "enlace-local" | "publica" | "desconocida";

/** RFC 1918, ULA (fc00::/7) y enlace local (169.254/16, fe80::/10) son «privadas»; CGNAT 100.64/10 NO (es de operador). */
export function tipoDireccion(d: string | null | undefined): TipoDireccion {
  if (!d) return "desconocida";
  const { v4, v6 } = normalizar(d);
  if (v4 !== null) {
    const a = v4 >>> 24;
    const b = (v4 >>> 16) & 255;
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "privada";
    if (a === 169 && b === 254) return "enlace-local";
    if (a === 127) return "privada";
    return "publica";
  }
  if (v6) {
    if ((v6[0] & 0xfe00) === 0xfc00) return "privada";
    if ((v6[0] & 0xffc0) === 0xfe80) return "enlace-local";
    if (v6.every((x, i) => (i === 7 ? x === 1 : x === 0))) return "privada";
    return "publica";
  }
  return "desconocida";
}

/**
 * ¿Están en la misma subred? Sin máscara real, la heurística de casa: 192.168/16 por /24; 10/8 y 172.16/12 por
 * /16; enlace local, siempre (es el mismo enlace); ULA por /64. Puro.
 */
export function mismaSubred(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x.v4 !== null && y.v4 !== null) {
    const ta = tipoDireccion(a);
    const tb = tipoDireccion(b);
    if (ta === "enlace-local" && tb === "enlace-local") return true;
    if (ta !== "privada" || tb !== "privada") return false;
    const mascara = (x.v4 >>> 24 === 192 ? 0xffffff00 : 0xffff0000) >>> 0;
    return ((x.v4 & mascara) >>> 0) === ((y.v4 & mascara) >>> 0);
  }
  if (x.v6 && y.v6) {
    const ta = tipoDireccion(a);
    const tb = tipoDireccion(b);
    if (ta === "enlace-local" && tb === "enlace-local") return true;
    if (ta !== "privada" || tb !== "privada") return false;
    return x.v6.slice(0, 4).every((g, i) => g === y.v6![i]);
  }
  return false;
}

export interface EntradaClasificarPar {
  tipoLocal: string | null;
  tipoRemoto: string | null;
  direccionLocal?: string | null;
  direccionRemota?: string | null;
}

/**
 * clasificarPar — la ruta del par de candidatos elegido, igual en los dos lados. Puro.
 *  1. relé TURN si cualquiera es `relay`;
 *  2. con las dos direcciones privadas y en la misma subred (aunque sean srflx/prflx o la señalización haya
 *     ido por internet) → red local; también host↔host (sin direcciones: mDNS);
 *  3. público↔público, o srflx/prflx entre redes distintas → internet directo (NAT atravesado);
 *  4. si no se sabe, desconocida.
 */
export function clasificarPar(p: EntradaClasificarPar): ClaseRuta {
  const { tipoLocal, tipoRemoto } = p;
  if (tipoLocal === "relay" || tipoRemoto === "relay") return "reenviado-turn";
  const l = p.direccionLocal ?? null;
  const r = p.direccionRemota ?? null;
  const tl = tipoDireccion(l);
  const tr = tipoDireccion(r);
  const privadas = (tl === "privada" || tl === "enlace-local") && (tr === "privada" || tr === "enlace-local");
  if (privadas && l && r && mismaSubred(l, r)) return "misma-red-local";
  // host↔host es red local; salvo que las dos direcciones se sepan PÚBLICAS (dos IPv6 globales de redes distintas).
  if (tipoLocal === "host" && tipoRemoto === "host" && !(tl === "publica" && tr === "publica")) return "misma-red-local";
  if (tl === "publica" && tr === "publica") return "internet-directo";
  if ([tipoLocal, tipoRemoto].some((tipo) => tipo === "srflx" || tipo === "prflx")) return "internet-directo";
  if (tl === "publica" || tr === "publica") return "internet-directo";
  return "desconocida";
}

function rutaDesconocida(medidoEn: number): RutaEnlace {
  return {
    clase: "desconocida",
    tipoLocal: null,
    tipoRemoto: null,
    protocolo: null,
    rttMs: null,
    bytesEnviados: null,
    bytesRecibidos: null,
    medidoEn,
  };
}
