// GEN1114A · entradas firmadas por el aparato en la puerta
// (architecture/astraura-chats-identidad-firma.md §3.4, §3.5.1, §3.6 y §8.1).
//
// La puerta NO es de confianza: no verifica la firma (eso lo hacen la Mac y el A1) y nunca toca lo
// firmado. Aquí solo se comprueban la forma y los límites, para contestar pronto y no guardar basura:
//   · `carga` es base64url ESTRICTO (sin relleno y canónico): solo hay una forma de escribir esos
//     bytes, así que la Mac decodifica exactamente los bytes que firmó el aparato;
//   · se decodifica y se lee para comprobar cuenta, destino, chat, plazos y reglas de rol, pero lo
//     que se guarda y se entrega es la cadena `carga` recibida, tal cual, nunca una copia rehecha;
//   · `v: 1` (sin sobre de firma) → 400 `sin-firma`, sea cual sea el rol. No hay opción para
//     aceptarlo.
// Todo lo de este archivo es puro (sin red ni base de datos).

import { ErrorChats, destinoDe, validarEntrada } from "./chats-genesis.mjs";

export const AUD = "starseed.genesis.chats.v1";
/** Cuerpo entero de una entrada v2 (bytes del JSON recibido) [REV §3.5]. */
export const CUERPO_MAX_V2 = 48 * 1024;
/** `carga` decodificada [REV §3.4]. */
export const CARGA_MAX = 32 * 1024;
export const MAX_ADELANTO_MS = 5 * 60_000;
/** Lo `alto` caduca a los 30 min también en la puerta (§3.6, §5.2). */
export const LIMITE_ALTO_MS = 30 * 60_000;

const RE_B64URL = /^[A-Za-z0-9_-]+$/;
const RE_HUELLA = /^[0-9a-f]{64}$/;
const RE_FIRMA = /^[A-Za-z0-9_-]{86}$/;
export const RE_ID_CHAT = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const CARGA_MAX_B64 = Math.ceil((CARGA_MAX * 4) / 3);

const forma = (m) => new ErrorChats(400, "forma", m);

/** Caracteres (puntos de código), como cuenta Python: un emoji es 1, no 2. */
export const largo = (s) => {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
};

/**
 * Decodifica base64url sin relleno y SOLO si es la forma canónica (volver a codificar da la misma
 * cadena). Devuelve `null` si no lo es. Así nadie puede dar dos escrituras distintas de los mismos
 * bytes, y lo que decodifique la Mac es lo mismo que decodifica aquí la puerta.
 */
export function b64urlEstricto(s) {
  if (typeof s !== "string" || s.length === 0 || !RE_B64URL.test(s) || s.length % 4 === 1) return null;
  const bytes = Buffer.from(s, "base64url");
  return bytes.toString("base64url") === s ? bytes : null;
}

// ── Riesgo (§3.6), copia exacta de la tabla; igual en Python (genesis_firma_logica.py) y TS ───────
const BAJO_PUENTE = Object.freeze({
  "puente:hermes-avisos": Object.freeze(["estado", "olas", "cola", "puertas", "agentes", "ayuda"]),
  "puente:peticiones": Object.freeze(["estado", "ayuda"]),
});

/**
 * `"bajo"` si no despierta a ningún agente; `"alto"` en todo lo demás (por defecto, alto).
 *   · dirección `decir` a `mando` sin `modelo` → bajo (con modelo u otro canal, `responder`, `reenviar` → alto);
 *   · puente A: órdenes estado/olas/cola/puertas/agentes/ayuda → bajo; texto suelto (va a Hermes),
 *     `decir`, `a`, `aprobar`, `rechazar`, `soltar`, `reasignar` → alto;
 *   · puente B: estado/ayuda → bajo; texto suelto, `encargos`, `pausa`, `sigue`, `cancela` → alto;
 *   · `revocarme` y `revocar-aparato` → bajo.
 */
export function riesgoDeEntrada(e) {
  if (!e || typeof e !== "object") return "alto";
  if (e.fuente === "direccion") {
    if (e.accion === "revocarme" || e.accion === "revocar-aparato") return "bajo";
    if (e.accion !== "decir" || e.modelo) return "alto";
    const canales = Array.isArray(e.canales) ? e.canales : [];
    return canales.every((c) => c === "mando") ? "bajo" : "alto";
  }
  const bajos = BAJO_PUENTE[e.fuente];
  if (!bajos) return "alto";
  if (e.accion === "orden" && e.orden && typeof e.orden === "object" && bajos.includes(e.orden.nombre)) return "bajo";
  return "alto";
}

// ── Acciones nuevas de la dirección [REV §3.4] ───────────────────────────────────────────────────
export const ACCIONES_RETIRADA = Object.freeze(["revocarme", "revocar-aparato"]);

function validarRetirada(c) {
  if (c.fuente !== "direccion") throw forma("las retiradas van por «direccion»");
  const permitidas = new Set(["v", "nonce", "t", "fuente", "accion", ...(c.accion === "revocar-aparato" ? ["huella"] : [])]);
  const sobra = Object.keys(c).find((k) => !permitidas.has(k));
  if (sobra) throw forma(`«${sobra}» no vale en «${c.accion}»`);
  // La forma común (v, nonce, t) la comprueba validarEntrada con una «decir» de mentira.
  validarEntrada({ v: c.v, nonce: c.nonce, t: c.t, fuente: "direccion", accion: "decir", texto: "x" });
  const e = { v: 1, nonce: c.nonce, t: c.t, fuente: "direccion", accion: c.accion };
  if (c.accion === "revocar-aparato") {
    if (typeof c.huella !== "string" || !RE_HUELLA.test(c.huella)) throw forma("«huella» debe ser 64 hex en minúsculas");
    e.huella = c.huella;
  }
  return e;
}

/** `validarEntrada` de GEN1113 ampliada SOLO con las dos acciones de retirada (§3.5.1). */
export function validarEntradaV2(c) {
  if (c && typeof c === "object" && !Array.isArray(c) && ACCIONES_RETIRADA.includes(c.accion)) return validarRetirada(c);
  return validarEntrada(c);
}

function fecha(v, nombre) {
  if (typeof v !== "string" || v.length < 10 || v.length > 40) throw forma(`«${nombre}» debe ser una fecha ISO`);
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) throw forma(`«${nombre}» debe ser una fecha ISO`);
  return ms;
}

/**
 * Comprueba la FORMA de una `EntradaFirmada` (§3.4) y devuelve `{carga, entrada, riesgo}`:
 * `carga` es el objeto leído de los bytes (solo para comprobar), `entrada` la validada y `riesgo`
 * el de la tabla. Lanza ErrorChats: 400 `sin-firma`/`forma`, 403 `firma-cuenta`, 413 `grande`.
 * No verifica la firma ni decide nada con lo que dice la carga más allá de rechazar.
 */
export function validarEntradaFirmada(cuerpo, sub, ahora = Date.now()) {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw forma("entrada vacía");
  if (cuerpo.v !== 2) throw new ErrorChats(400, "sin-firma", "Este aparato no está emparejado para escribir (la entrada no va firmada)");
  if (typeof cuerpo.carga !== "string") throw forma("falta «carga»");
  if (cuerpo.carga.length > CARGA_MAX_B64) throw new ErrorChats(413, "grande", "la carga pasa de 32 KB");
  const bytes = b64urlEstricto(cuerpo.carga);
  if (!bytes) throw forma("«carga» debe ser base64url canónico sin relleno");
  if (bytes.length > CARGA_MAX) throw new ErrorChats(413, "grande", "la carga pasa de 32 KB");
  if (typeof cuerpo.firma !== "string" || !RE_FIRMA.test(cuerpo.firma) || b64urlEstricto(cuerpo.firma)?.length !== 64) {
    throw forma("«firma» debe ser base64url de 64 bytes (r‖s)");
  }
  if (typeof cuerpo.aparato !== "string" || !RE_HUELLA.test(cuerpo.aparato)) throw forma("«aparato» debe ser la huella (64 hex)");

  let carga;
  try {
    carga = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw forma("«carga» no es JSON UTF-8 válido");
  }
  if (!carga || typeof carga !== "object" || Array.isArray(carga)) throw forma("«carga» debe ser un objeto");
  if (carga.aud !== AUD) throw forma("«aud» no es el de los chats de Genesis");
  if (typeof carga.cuenta !== "string" || carga.cuenta !== sub) {
    throw new ErrorChats(403, "firma-cuenta", "la carga está firmada para otra cuenta que la de esta sesión");
  }
  if (carga.aparato !== cuerpo.aparato) throw forma("«carga.aparato» no es el aparato del sobre");
  if (!Number.isSafeInteger(carga.seq) || carga.seq < 1) throw forma("«seq» debe ser un entero ≥ 1");
  const t = fecha(carga.t, "t");
  const caduca = fecha(carga.caduca, "caduca");
  if (t > ahora + MAX_ADELANTO_MS) throw forma("La hora de este aparato va adelantada más de 5 min; corrígela y vuelve a enviar");
  if (caduca <= ahora) throw forma("la entrada ya caducó");
  if (carga.destino !== "mac" && carga.destino !== "a1") throw forma("«destino» debe ser mac o a1");
  if (typeof carga.chat !== "string" || !RE_ID_CHAT.test(carga.chat)) throw forma("«chat» no es un id de chat");
  if (typeof carga.chatNombre !== "string" || largo(carga.chatNombre) < 1 || largo(carga.chatNombre) > 80) {
    throw forma("«chatNombre» debe tener de 1 a 80 caracteres");
  }
  const entrada = validarEntradaV2(carga.entrada);
  if (carga.destino !== destinoDe(entrada.fuente)) throw forma("«destino» no corresponde a la fuente de la entrada");
  if (ACCIONES_RETIRADA.includes(entrada.accion) && carga.chat !== "genesis") throw forma("las retiradas van al chat «genesis»");
  return { carga, entrada, riesgo: riesgoDeEntrada(entrada) };
}
