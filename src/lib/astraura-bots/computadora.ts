/**
 * Bots/dots de Astraura · COMPUTADORA del bot (BOT1011K). Contrato: architecture/astraura-bots.md §7. PURO.
 * Cada bot de Astraura tiene SU computadora aislada fuera de tu aparato: A1 → neurona propia con Docker → GitHub
 * Actions (solo lotes). Un invitado nunca. Navegador, archivos y terminal nacen APAGADOS; la red sale por lista.
 * Honestidad: `permisoParaOrden` es la primera puerta y falla cerrada (P2 del anexo §18), NO el aislamiento: aísla el
 * contenedor (sin sudo, sin socket de Docker, salida por lista); un intérprete dentro puede lo que él le deje, no más.
 */
import { esInvitado, type Bot } from "./tipos";

export const MEDIOS_COMPUTADORA = ["a1", "neurona", "actions"] as const;
export type MedioComputadora = (typeof MEDIOS_COMPUTADORA)[number];
export const esMedioComputadora = (x: unknown): x is MedioComputadora => MEDIOS_COMPUTADORA.some((m) => m === x);
/** `lista`: solo destinos permitidos · `defecto`: los de fábrica más la lista · `nada`: sin salida. */
export const REDES_COMPUTADORA = ["lista", "defecto", "nada"] as const;
export type RedComputadora = (typeof REDES_COMPUTADORA)[number];
export interface PermisosComputadora { navegador: boolean; archivos: boolean; terminal: boolean; red: RedComputadora }
/** Todo apagado y la red por lista: cada permiso se concede aparte. */
export const PERMISOS_COMPUTADORA_DEFECTO: Readonly<PermisosComputadora> = Object.freeze({ navegador: false, archivos: false, terminal: false, red: "lista" });
/** Lee permisos guardados o recibidos: lo que no sea exactamente `true` queda apagado. */
export function normalizarPermisos(x: unknown): PermisosComputadora {
  const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  const red = REDES_COMPUTADORA.find((r) => r === o.red) ?? PERMISOS_COMPUTADORA_DEFECTO.red;
  return { navegador: o.navegador === true, archivos: o.archivos === true, terminal: o.terminal === true, red };
}
export interface MedioDisponible { medio: MedioComputadora; libre: boolean; interactivo: boolean }
export type EleccionComputadora = { medio: MedioComputadora } | { motivo: string };
export const SIN_COMPUTADORA = "próximamente: falta una computadora para este bot; nada se ejecuta en tu aparato.";

/** Orden a1 → neurona → actions; `actions` nunca para trabajo interactivo; un invitado nunca. */
export function elegirComputadora(bot: Pick<Bot, "origen" | "activo">, disponibles: readonly MedioDisponible[],
  necesita: { interactivo: boolean }): EleccionComputadora {
  if (esInvitado(bot)) return { motivo: "Un bot invitado nunca tiene computadora: solo ve lo que tú le pases." };
  if (!bot.activo) return { motivo: "El bot está en pausa: su computadora no se enciende." };
  let soloLotes = false;
  for (const medio of MEDIOS_COMPUTADORA) {
    const libres = disponibles.filter((d) => d.medio === medio && d.libre === true);
    if (!necesita.interactivo && libres.length > 0) return { medio };
    if (medio !== "actions" && libres.some((d) => d.interactivo === true)) return { medio };
    if (libres.length > 0) soloLotes = true;
  }
  return { motivo: soloLotes ? "Solo hay computadora libre para trabajos por lotes, sin navegador interactivo." : SIN_COMPUTADORA };
}
export type RequisitoOrden = "nada" | "terminal" | "navegador" | "red" | "nunca";
export interface DecisionOrden { permitido: boolean; requiere: RequisitoOrden; motivo: string }
export const MAX_ORDEN = 4000;
const no = (requiere: RequisitoOrden, motivo: string): DecisionOrden => ({ permitido: false, requiere, motivo });

/** Sintaxis que esconde otra orden, aunque vaya entre comillas (un `bash -c` la ejecutaría). */
const EVASION = /\$\(|`|<\(|>\(|\$\{|[\0\r]/;
const PROHIBIDA = /^(docker.*|podman|sudo|su|doas|ssh.*|scp|sftp|eval|alias|env|printenv|proc|\.env(\..*)?)$/;
const [NOMBRES, NOMBRES_PUNTO] = ["docker sudo su doas ssh scp sftp eval alias env printenv proc", ".env .env.local .env.production"].map((s) => s.split(" "));
const VARIABLE = /\$[\w?!#@*$-]/;
const [SHELLS, VOLCADOS, RED_SIEMPRE, NAVEGADORES] = ["sh bash zsh dash ksh fish busybox", "set export declare typeset",
  "curl wget aria2c nc ncat netcat telnet ftp rsync npx ping dig nslookup", "chromium chromium-browser google-chrome chrome firefox playwright"].map((s) => new Set(s.split(" ")));
const INSTALAR = ["install", "add", "i", "ci", "get", "update", "upgrade"];
const RED_CON = new Map<string, readonly string[]>([["git", ["clone", "fetch", "pull", "push", "ls-remote", "submodule"]],
  ...["pip", "pip3", "npm", "yarn", "pnpm", "apt", "apt-get", "apk", "gem", "cargo", "go", "conda"].map((c): [string, readonly string[]] => [c, INSTALAR])]);
interface Tramo { ws: { texto: string; expande: boolean }[]; tub: boolean }
/** Tramos (por `;`, `&`, `|` o salto de línea fuera de comillas; `tub`: le llega una tubería) de palabras sin comillas
 *  (`expande`: la shell la cambiaría por $X, {a,b}, {a..b} o @(…)); null si quedan comillas abiertas. */
function partir(orden: string): Tramo[] | null {
  const tramos: Tramo[] = [{ ws: [], tub: false }];
  let p = "", hay = false, exp = false, q = "", ll = 0;
  const cerrar = () => { if (hay) tramos[tramos.length - 1].ws.push({ texto: p, expande: exp }); p = ""; hay = exp = false; ll = 0; };
  for (let i = 0; i < orden.length; i++) {
    const c = orden[i];
    if (q === "'") { if (c === "'") q = ""; else p += c; continue; }
    if (c === "\\") { if (orden[i + 1] !== "\n") p += orden[i + 1] ?? ""; i++; hay = true; continue; }
    const dos = orden.slice(i, i + 2);
    if (VARIABLE.test(dos) || (!q && /^\$['"]/.test(dos))) exp = true;
    if (q === '"') { if (c === '"') q = ""; else p += c; continue; }
    if (c === "'" || c === '"') { q = c; hay = true; continue; }
    if (";&|\n".includes(c)) { cerrar(); const t = tramos[tramos.length - 1]; tramos.push({ ws: [], tub: c === "|" || (t.tub && !t.ws.length) }); continue; }
    if (/\s/.test(c)) { cerrar(); continue; }
    p += c; hay = true;
    if (c === "{") ll = 1; else if (ll && (c === "," || dos === "..")) ll = 2;
    else if ((c === "}" && ll === 2) || /[@+!?*]\($/.test(p)) exp = true;
  }
  cerrar();
  return q ? null : tramos.filter((t) => t.ws.length > 0);
}
/** ¿Este comodín podría alcanzar un nombre prohibido? Si el patrón no se entiende, se supone que sí. */
function comodinPeligroso(pieza: string): boolean {
  const patron = pieza.replace(/[.+^$()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\[!/g, "[^");
  try { return (pieza.startsWith(".") ? NOMBRES_PUNTO : NOMBRES).some((n) => new RegExp(`^${patron}$`).test(n)); } catch { return true; }
}
/** Falla cerrada: primero lo que no se permite nunca; luego terminal, red y navegador. */
export function permisoParaOrden(permisos: PermisosComputadora, orden: string): DecisionOrden {
  const texto = orden.trim();
  if (!texto || texto.length > MAX_ORDEN) return no("nunca", `La orden ha de tener entre 1 y ${MAX_ORDEN} caracteres.`);
  if (EVASION.test(texto)) return no("nunca", "La orden esconde otra dentro ($(), comillas invertidas, <() o ${}): escríbela directa.");
  const tramos = partir(texto);
  if (!tramos) return no("nunca", "La orden deja comillas sin cerrar.");
  let red = false, nav = false;
  for (const { ws: tramo, tub } of tramos) {
    const conShell = tramo.some((w) => SHELLS.has(w.texto.split("/").pop() ?? ""));
    const inicio = tramo.findIndex((w) => !/^\w+=/.test(w.texto));
    const volcado = VOLCADOS.has(tramo[0].texto) && tramo.every((w, i) => i === 0 || w.texto === "-p" || w.texto === "-x");
    if (volcado) return no("nunca", "Volcar las variables de la computadora del bot no se permite.");
    const piezas: string[] = [];
    for (const [i, w] of tramo.entries()) {
      if (w.expande || (conShell && /\$\S/.test(w.texto))) return no("nunca", "Una orden del bot no usa variables ni expansiones de la shell ($X, {a,b}, @(…)): escribe el valor.");
      const trozos = w.texto.split(/[\s/=,:<>(){};&|'"!]+/).filter(Boolean);
      for (const [j, t] of trozos.entries()) {
        const exento = t === "[" || t === "[[" || (t === "*" && j === trozos.length - 1 && i !== inicio && !w.texto.startsWith("/"));
        if (PROHIBIDA.test(t) || (/[*?[]/.test(t) && !exento && comodinPeligroso(t))) {
          return no("nunca", `«${t}» no se permite nunca en la computadora del bot (docker, sudo, ssh, /proc ni .env).`);
        }
        piezas.push(t);
      }
    }
    if (tub && piezas.some((t) => SHELLS.has(t))) return no("nunca", "Pasar texto por una tubería a una shell esconde la orden: escríbela directa.");
    red ||= piezas.some((t) => RED_SIEMPRE.has(t) || (RED_CON.get(t)?.some((s) => piezas.includes(s)) ?? false));
    nav ||= piezas.some((t) => NAVEGADORES.has(t));
  }
  if (!permisos.terminal) return no("terminal", "La terminal de la computadora del bot está apagada: actívala en sus permisos.");
  if (red && permisos.red === "nada") return no("red", "La red de la computadora del bot está apagada y esta orden descarga o conecta fuera.");
  if (nav && !permisos.navegador) return no("navegador", "El navegador de la computadora del bot está apagado.");
  return { permitido: true, requiere: "nada", motivo: "Orden permitida en la computadora aislada del bot." };
}
