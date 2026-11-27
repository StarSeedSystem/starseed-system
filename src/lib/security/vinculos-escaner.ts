/**
 * NFC1126P · Astraura ciber multicapa (architecture/nfc-neuronas.md §14).
 * Doble de revisión de TODO lo que llega por un vínculo antes de abrirse:
 * emisor (firma y reputación), enlace, archivo y permisos. Módulo PURO:
 * sin red, sin disco, sin reloj; las decisiones de la persona entran por
 * `historial` y ajustan los veredictos siguientes. El análisis de contenido
 * reutiliza `src/lib/security/scanner.ts` (no se duplica su catálogo).
 */
import { scanText, type Finding } from "./scanner";

export type TipoVinculo = "tarjeta" | "enlace" | "archivo" | "app" | "cerebro" | "permiso";
export type NivelVeredicto = "seguro" | "sugerencia" | "aviso" | "alerta";
export type DecisionPersona = "confiar" | "abrir-una-vez" | "bloquear";
export type FirmaEmisor = "valida" | "ausente" | "invalida" | "desconocida";

export interface EmisorVinculo {
  id?: string;
  nombre?: string;
  firma?: FirmaEmisor;
  /** 0..100; se ignora si no es un número finito. */
  reputacion?: number;
  conocido?: boolean;
}

export interface PermisoSolicitado {
  nombre: string;
  riesgo?: "bajo" | "medio" | "alto";
}

export interface VinculoRecibido {
  tipo: TipoVinculo;
  url?: string;
  archivo?: string;
  mime?: string;
  /** Texto plano del archivo/tarjeta, para el escáner de datos sensibles. */
  contenido?: string;
  emisor?: EmisorVinculo;
  permisos?: readonly PermisoSolicitado[];
  /** Dominios oficiales declarados por la app o servicio (solo el host). */
  dominiosOficiales?: readonly string[];
}

export interface HallazgoVinculo {
  tipo: string;
  nivel: NivelVeredicto;
  detalle: string;
  /** Un hallazgo bloqueante mantiene el bloqueo aunque la persona confiara antes. */
  bloqueante?: boolean;
}

export interface DecisionRegistrada {
  huella: string;
  decision: DecisionPersona;
}

export interface VeredictoVinculo {
  nivel: NivelVeredicto;
  abre: boolean;
  requiereConfirmacion: boolean;
  motivo: string;
  explicacion: string;
  recomendaciones: string[];
  hallazgos: HallazgoVinculo[];
  datosSensibles: Finding[];
  huella: string;
  aplicada: DecisionPersona | null;
}

export const NIVELES: readonly NivelVeredicto[] = ["seguro", "sugerencia", "aviso", "alerta"];

/* ------------------------------------------------------------------ */
/* Capas: enlace, archivo, emisor y permisos                           */
/* ------------------------------------------------------------------ */

/** Analiza el enlace recibido (esquema, usuario, IP, punycode y dominio parecido). */
export function analizarEnlace(url: string | undefined, oficiales: readonly string[] = []): HallazgoVinculo[] {
  const fuera: HallazgoVinculo[] = [];
  if (typeof url !== "string" || !url.trim()) return fuera;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return [{ tipo: "enlace-invalido", nivel: "aviso", detalle: "El enlace no tiene un formato válido y no se puede comprobar." }];
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return [{
      tipo: "esquema-peligroso", nivel: "alerta", bloqueante: true,
      detalle: `El enlace usa «${u.protocol}», que puede ejecutar código o abrir archivos del aparato.`,
    }];
  }
  if (u.username || u.password) {
    fuera.push({
      tipo: "usuario-falso", nivel: "alerta", bloqueante: true,
      detalle: `El enlace esconde el destino real detrás de «${u.username || "un usuario"}».`,
    });
  }
  const host = normalizarHost(u.hostname);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
    fuera.push({ tipo: "ip-directa", nivel: "aviso", detalle: `El enlace va a una dirección IP (${host}) en vez de a un dominio con nombre.` });
  }
  if (host.startsWith("xn--") || host.includes(".xn--")) {
    fuera.push({ tipo: "dominio-punycode", nivel: "aviso", detalle: "El dominio usa caracteres codificados (punycode): puede imitar letras de otro alfabeto." });
  } else if (/[^\x00-\x7f]/.test(host)) {
    fuera.push({ tipo: "dominio-alfabeto-mixto", nivel: "aviso", detalle: "El dominio mezcla alfabetos: puede imitar a otro sitio." });
  }
  if (u.protocol === "http:" && !esHostLocal(host)) {
    fuera.push({ tipo: "sin-https", nivel: "aviso", detalle: "El enlace no usa HTTPS: lo que viaje por él puede leerse o alterarse." });
  }
  fuera.push(...analizarDominio(host, oficiales));
  return fuera;
}

const EXT_EJECUTABLE = new Set([
  "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse",
  "wsf", "wsh", "hta", "jar", "apk", "dmg", "pkg", "sh", "app", "deb", "rpm",
]);
const EXT_MACRO = new Set(["docm", "xlsm", "pptm", "dotm", "xlam"]);
const EXT_INOFENSIVA = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "pdf", "doc", "docx", "xls",
  "xlsx", "ppt", "pptx", "txt", "md", "csv", "mp3", "mp4", "mov", "wav", "zip", "json",
]);
const MAGIA_EJECUTABLE = ["MZ", "\x7fELF", "\xcf\xfa\xed\xfe", "\xfe\xed\xfa\xce", "\xfe\xed\xfa\xcf", "#!"];
const MIME_INOFENSIVO = /^(?:image|audio|video|text)\/|application\/(?:pdf|json|zip|xml)$/i;

function mimeInofensivo(mime: string | undefined): boolean {
  return !!mime && MIME_INOFENSIVO.test(mime);
}

/** Analiza nombre, tipo declarado y contenido: ejecutables disfrazados y datos sensibles. */
export function analizarArchivo(archivo?: string, mime?: string, contenido?: string): HallazgoVinculo[] {
  const fuera: HallazgoVinculo[] = [];
  if (typeof archivo === "string" && archivo.trim()) {
    const nombre = archivo.trim();
    const partes = nombre.toLowerCase().split(".");
    const ext = partes.length > 1 ? partes[partes.length - 1].replace(/[.\s]+$/, "") : "";
    const previa = partes.length > 2 ? partes[partes.length - 2] : "";
    if (EXT_EJECUTABLE.has(ext)) {
      const disfrazado = EXT_INOFENSIVA.has(previa) || mimeInofensivo(mime);
      fuera.push(disfrazado
        ? { tipo: "ejecutable-disfrazado", nivel: "alerta", bloqueante: true, detalle: `El archivo «${nombre}» esconde un ejecutable detrás de una extensión inofensiva (${previa || mime}).` }
        : { tipo: "ejecutable", nivel: "aviso", detalle: `El archivo «${nombre}» es un ejecutable; ábrelo solo si esperabas recibirlo.` });
    } else if (EXT_MACRO.has(ext)) {
      fuera.push({ tipo: "macro", nivel: "aviso", detalle: `El archivo «${nombre}» puede traer macros que ejecutan acciones al abrirse.` });
    }
    if (/[.\s]$/.test(nombre)) {
      fuera.push({ tipo: "extension-oculta", nivel: "aviso", detalle: "El nombre del archivo termina en punto o espacio: puede ocultar su extensión real." });
    }
  }
  if (typeof contenido === "string" && contenido) {
    const magia = MAGIA_EJECUTABLE.find((m) => contenido.startsWith(m));
    if (magia) {
      fuera.push({
        tipo: "contenido-ejecutable", nivel: "alerta", bloqueante: true,
        detalle: `El contenido empieza como un programa (${magia === "#!" ? "guion" : "binario"}), aunque se presente como «${archivo ?? "otra cosa"}».`,
      });
    }
    const hallazgos = scanText(contenido);
    const graves = hallazgos.filter((f) => f.severity === "critical" || f.severity === "high");
    if (graves.length > 0) {
      fuera.push({ tipo: "datos-sensibles", nivel: "aviso", detalle: `El contenido trae ${graves.length} dato(s) sensible(s): ${graves.slice(0, 2).map((f) => f.label).join(", ")}.` });
    } else if (hallazgos.length > 0) {
      fuera.push({ tipo: "datos-personales", nivel: "sugerencia", detalle: `El contenido trae ${hallazgos.length} dato(s) personales de bajo riesgo.` });
    }
  }
  return fuera;
}

/** Firma y reputación del emisor; sin identidad no se puede confiar de entrada. */
export function analizarEmisor(emisor?: EmisorVinculo): HallazgoVinculo[] {
  const fuera: HallazgoVinculo[] = [];
  if (!emisor || (!emisor.id?.trim() && !emisor.nombre?.trim())) {
    return [{ tipo: "emisor-desconocido", nivel: "aviso", detalle: "No se sabe quién envía esto: no hay identidad de emisor." }];
  }
  if (emisor.firma === "invalida") {
    fuera.push({ tipo: "firma-invalida", nivel: "alerta", bloqueante: true, detalle: "La firma del emisor no es válida: el contenido pudo alterarse o suplantarse." });
  } else if (emisor.firma !== "valida") {
    fuera.push({
      tipo: "firma-ausente", nivel: emisor.conocido ? "sugerencia" : "aviso",
      detalle: emisor.conocido
        ? "Es un contacto conocido, pero este envío no trae firma que lo avale."
        : "El envío no trae una firma verificable del emisor.",
    });
  }
  const rep = emisor.reputacion;
  if (typeof rep === "number" && Number.isFinite(rep)) {
    if (rep < 20) fuera.push({ tipo: "reputacion-muy-baja", nivel: "alerta", bloqueante: true, detalle: `La reputación del emisor es muy baja (${Math.round(rep)}/100).` });
    else if (rep < 50) fuera.push({ tipo: "reputacion-baja", nivel: "aviso", detalle: `La reputación del emisor es baja (${Math.round(rep)}/100).` });
    else if (rep < 70) fuera.push({ tipo: "reputacion-media", nivel: "sugerencia", detalle: `La reputación del emisor es intermedia (${Math.round(rep)}/100).` });
  }
  return fuera;
}

const PERMISO_DURO = /(ejecut|administr|\broot\b|acceso[- ]?total|sistema|instal|mensajes|contactos|ubicaci|micr[oó]fono|c[aá]mara|almacenamiento|cuenta)/i;
const PERMISO_MEDIO = /(internet|red|notificaci|portapapeles|calendario|bluetooth|nfc)/i;

function riesgoPermiso(p: PermisoSolicitado): "bajo" | "medio" | "alto" {
  if (p.riesgo === "alto" || p.riesgo === "medio" || p.riesgo === "bajo") return p.riesgo;
  if (PERMISO_DURO.test(p.nombre)) return "alto";
  if (PERMISO_MEDIO.test(p.nombre)) return "medio";
  return "bajo";
}

/** Permisos que pide: uno peligroso o varios sensibles a la vez bloquean. */
export function analizarPermisos(tipo: TipoVinculo, permisos?: readonly PermisoSolicitado[]): HallazgoVinculo[] {
  const fuera: HallazgoVinculo[] = [];
  const lista = Array.isArray(permisos)
    ? permisos.filter((p): p is PermisoSolicitado => !!p && typeof p.nombre === "string" && p.nombre.trim().length > 0)
    : [];
  if (lista.length === 0) return fuera;
  const altos = lista.filter((p) => riesgoPermiso(p) === "alto");
  const medios = lista.filter((p) => riesgoPermiso(p) === "medio");
  const duro = altos.some((p) => /(ejecut|administr|\broot\b|acceso[- ]?total|sistema)/i.test(p.nombre));
  const nombres = (ps: readonly PermisoSolicitado[]) => ps.slice(0, 3).map((p) => p.nombre).join(", ");
  if (duro) {
    fuera.push({ tipo: "permiso-peligroso", nivel: "alerta", bloqueante: true, detalle: `Pide permisos que pueden tomar el control del aparato (${nombres(altos)}).` });
  } else if (altos.length >= 3) {
    fuera.push({ tipo: "permiso-excesivo", nivel: "alerta", bloqueante: true, detalle: `Pide ${altos.length} permisos sensibles a la vez (${nombres(altos)}…): no son necesarios para lo que dice ser.` });
  } else if (altos.length >= 1) {
    fuera.push({ tipo: "permiso-alto", nivel: "aviso", detalle: `Pide acceso a ${nombres(altos)}; confirma que tiene sentido.` });
  } else if (medios.length >= 4) {
    fuera.push({ tipo: "permiso-excesivo", nivel: "aviso", detalle: `Pide ${medios.length} permisos de riesgo medio a la vez.` });
  } else if (medios.length >= 1) {
    fuera.push({ tipo: "permiso-medio", nivel: "sugerencia", detalle: `Pide permisos de riesgo medio (${nombres(medios)}).` });
  }
  if (tipo !== "app") {
    fuera.push({ tipo: "permiso-inesperado", nivel: "aviso", detalle: `Un ${tipo} no debería pedir permisos; esto quiere acceder a más de lo que muestra.` });
  }
  return fuera;
}

const RANGO: Record<NivelVeredicto, number> = { seguro: 0, sugerencia: 1, aviso: 2, alerta: 3 };

/** El más grave de dos niveles (útil para combinar capas). */
export function nivelMasGrave(a: NivelVeredicto, b: NivelVeredicto): NivelVeredicto {
  return RANGO[a] >= RANGO[b] ? a : b;
}

function bajarUnNivel(n: NivelVeredicto): NivelVeredicto {
  return NIVELES[Math.max(0, RANGO[n] - 1)];
}

/** Dominios oficiales de referencia para detectar imitaciones por parecido. */
const DOMINIOS_CONOCIDOS: readonly string[] = [
  "starseed-os.vercel.app", "starseed.social", "vercel.app", "vercel.com",
  "supabase.com", "supabase.co", "github.com", "google.com", "googleapis.com",
  "apple.com", "icloud.com", "microsoft.com", "openai.com", "chatgpt.com",
  "telegram.org", "t.me", "whatsapp.com", "wa.me", "paypal.com", "stripe.com",
  "huggingface.co",
];

/** FNV-1a de 32 bits: huella estable y no criptográfica para el aprendizaje. */
function fnv1a(texto: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < texto.length; i++) h = Math.imul((h ^ texto.charCodeAt(i)) >>> 0, 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function normalizarHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
}

function esHostLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
}

/** Distancia de edición acotada: si los largos se llevan más de 2, no es parecido. */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(prev[j] + 1, actual[j - 1] + 1, prev[j - 1] + coste);
    }
    prev = actual;
  }
  return prev[b.length];
}

function analizarDominio(host: string, oficiales: readonly string[]): HallazgoVinculo[] {
  const fuera: HallazgoVinculo[] = [];
  if (!host) return fuera;
  const lista = [...new Set([...oficiales, ...DOMINIOS_CONOCIDOS].map(normalizarHost).filter(Boolean))];
  for (const oficial of lista) {
    if (host === oficial || host.endsWith(`.${oficial}`)) continue;
    if (host.includes(oficial)) {
      fuera.push({
        tipo: "dominio-imita", nivel: "alerta", bloqueante: true,
        detalle: `El dominio «${host}» contiene a «${oficial}» con un añadido para engañar.`,
      });
/* ------------------------------------------------------------------ */
/* Huellas estables y aprendizaje de las decisiones                    */
/* ------------------------------------------------------------------ */

export function huellaEmisor(emisor?: EmisorVinculo): string | null {
  const id = emisor?.id?.trim() || emisor?.nombre?.trim();
  return id ? `emisor:${fnv1a(id.toLowerCase())}` : null;
}

function hostDe(url?: string): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    return normalizarHost(new URL(url.trim()).hostname) || null;
  } catch {
    return null;
  }
}

export function huellaDestino(v: VinculoRecibido): string | null {
  const host = hostDe(v.url);
  if (host) return `destino:${fnv1a(host)}`;
  if (typeof v.archivo === "string" && v.archivo.trim()) return `destino:${fnv1a(v.archivo.trim().toLowerCase())}`;
  return null;
}

export function huellaVinculo(v: VinculoRecibido): string {
  const base = [
    v.tipo,
    (v.url ?? "").trim().toLowerCase(),
    (v.archivo ?? "").trim().toLowerCase(),
    huellaEmisor(v.emisor) ?? "",
    typeof v.contenido === "string" && v.contenido ? fnv1a(v.contenido.slice(0, 2000)) : "",
  ].join("|");
  return `vinculo:${fnv1a(base)}`;
}

/** Guarda (o sustituye) una decisión y devuelve un historial NUEVO, sin mutar. */
export function registrarDecision(
  historial: readonly DecisionRegistrada[] | null | undefined,
  huella: string,
  decision: DecisionPersona,
): DecisionRegistrada[] {
  const lista = Array.isArray(historial) ? historial.filter((d) => d && d.huella && d.huella !== huella) : [];
  if (typeof huella !== "string" || !huella.trim()) return [...lista];
  return [...lista, { huella, decision }].slice(-500);
}

function buscarDecision(
  historial: readonly DecisionRegistrada[] | null | undefined,
  entrada: VinculoRecibido,
  huella: string,
): DecisionPersona | null {
  if (!Array.isArray(historial)) return null;
  const claves = [huella, huellaEmisor(entrada.emisor), huellaDestino(entrada)]
    .filter((c): c is string => typeof c === "string" && c.length > 0);
  for (const clave of claves) {
    const encontrada = [...historial].reverse().find((d) => d && d.huella === clave);
    if (encontrada) return encontrada.decision;
  }
  return null;
}

const EXPLICACION_BASE: Record<NivelVeredicto, string> = {
  seguro: "Todo en orden: puedes abrirlo.",
  sugerencia: "Puedes abrirlo; conviene tener en cuenta lo que se señala.",
  aviso: "Confirma antes de abrir: hay algo que no encaja.",
  alerta: "Bloqueado: no se abre hasta que tú lo decidas.",
};

const RECOMENDACIONES: Record<NivelVeredicto, readonly string[]> = {
  seguro: ["Ábrelo con normalidad."],
  sugerencia: ["Revisa los avisos y sigue."],
  aviso: ["Confirma que esperabas este contenido.", "Si no lo pediste, no lo abras."],
  alerta: ["No lo abras ni lo instales.", "Si no lo pediste, bórralo y avisa a quien te lo envió por otro medio."],
};

/**
 * Veredicto completo de un vínculo recibido: seguro · sugerencia · aviso · alerta.
 * `historial` son las decisiones de la persona y ajustan el resultado siguiente.
 */
export function evaluarVinculo(entrada: VinculoRecibido, historial: readonly DecisionRegistrada[] = []): VeredictoVinculo {
  const oficiales = Array.isArray(entrada.dominiosOficiales) ? entrada.dominiosOficiales : [];
  const hallazgos: HallazgoVinculo[] = [
    ...analizarEmisor(entrada.emisor),
    ...analizarEnlace(entrada.url, oficiales),
    ...analizarArchivo(entrada.archivo, entrada.mime, entrada.contenido),
    ...analizarPermisos(entrada.tipo, entrada.permisos),
  ];
  const datosSensibles = typeof entrada.contenido === "string" && entrada.contenido ? scanText(entrada.contenido) : [];
  let nivel = hallazgos.reduce<NivelVeredicto>((max, h) => nivelMasGrave(max, h.nivel), "seguro");
  const huella = huellaVinculo(entrada);
  const aplicada = buscarDecision(historial, entrada, huella);
  if (aplicada === "bloquear") {
    nivel = "alerta";
    hallazgos.push({ tipo: "memoria-bloqueo", nivel: "alerta", bloqueante: true, detalle: "Bloqueaste antes algo de este emisor o destino; se mantiene el bloqueo." });
  } else if (aplicada === "confiar" && !hallazgos.some((h) => h.bloqueante)) {
    nivel = bajarUnNivel(nivel);
  }
  const bloqueo = hallazgos.find((h) => h.nivel === "alerta" && h.bloqueante) ?? hallazgos.find((h) => h.nivel === "alerta");
  const aviso = hallazgos.find((h) => h.nivel === "aviso");
  const motivo = bloqueo?.detalle ?? aviso?.detalle ?? hallazgos[0]?.detalle ?? "";
  const recomendaciones = [...RECOMENDACIONES[nivel]];
  if (aplicada === "confiar") recomendaciones.push("Se aplicó la confianza que diste antes a este emisor o destino.");
  if (aplicada === "bloquear") recomendaciones.push("Se aplicó el bloqueo que diste antes a este emisor o destino.");
  return {
    nivel,
    abre: nivel === "seguro" || nivel === "sugerencia",
    requiereConfirmacion: nivel === "aviso",
    motivo,
    explicacion: `${EXPLICACION_BASE[nivel]}${motivo ? ` ${motivo}` : ""}`.trim(),
    recomendaciones,
    hallazgos,
    datosSensibles,
    huella,
    aplicada,
  };
}

  }
  let cercano = 99;
  let referencia = "";
  for (const oficial of lista) {
    const d = distancia(host, oficial);
    if (d < cercano) { cercano = d; referencia = oficial; }
  }
  if (cercano === 1) {
    fuera.push({
      tipo: "dominio-parecido", nivel: "alerta", bloqueante: true,
      detalle: `El dominio «${host}» se parece demasiado a «${referencia}»: puede ser una imitación.`,
    });
  } else if (cercano === 2) {
    fuera.push({
      tipo: "dominio-parecido", nivel: "aviso",
      detalle: `El dominio «${host}» se parece a «${referencia}»; confirma que es el oficial.`,
    });
  }
  return fuera;
}
