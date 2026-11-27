/**
 * Astraura ciber multicapa para lo que llega por un vínculo (NFC1126P).
 * Módulo puro: sin red, sin disco. Contrato: architecture/nfc-neuronas.md §14.
 */
import { scanRecibido } from "./scanner";

export type Veredicto = "seguro" | "sugerencia" | "aviso" | "alerta";
export type TipoRecibido = "tarjeta" | "enlace" | "archivo" | "app" | "cerebro" | "permiso";

export interface EmisorVinculo {
  firmaValida: boolean;
  /** 0..1; sin dato = emisor desconocido. */
  reputacion?: number;
}

export interface Recibido {
  tipo: TipoRecibido;
  emisor: EmisorVinculo;
  url?: string;
  nombreArchivo?: string;
  texto?: string;
  permisos?: string[];
  permisosEsperados?: string[];
}

export interface Motivo {
  codigo: string;
  gravedad: Exclude<Veredicto, "seguro">;
  explicacion: string;
}

export interface DecisionPersona {
  codigo: string;
  accion: "permitir" | "rechazar";
}

export interface OpcionesEscaneo {
  dominiosConfianza?: string[];
  decisiones?: DecisionPersona[];
}

export interface ResultadoEscaneo {
  veredicto: Veredicto;
  motivos: Motivo[];
  explicacion: string;
  requiereConfirmar: boolean;
  bloquea: boolean;
}

export const DOMINIOS_CONFIANZA = ["starseed-os.vercel.app", "starseed-nexus.vercel.app"];
const ORDEN: Veredicto[] = ["seguro", "sugerencia", "aviso", "alerta"];

const EXT_EJECUTABLE = [
  "exe", "msi", "bat", "cmd", "scr", "com", "apk", "sh", "command", "pkg", "dmg", "jar", "js", "vbs", "ps1", "app",
];
const EXT_INOCENTE = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "txt", "doc", "docx", "xls", "xlsx", "mp3", "mp4", "mov"];
const ACORTADORES = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly"];
const PERMISOS_CRITICOS = ["borrar_todo", "admin", "root", "ejecutar_codigo", "claves", "pagos", "control_total"];
const PERMISOS_SENSIBLES = ["microfono", "camara", "contactos", "ubicacion", "archivos", "almacenamiento", "mensajes"];
const LIMITE_PERMISOS_EXTRA = 2;

const mot = (codigo: string, gravedad: Motivo["gravedad"], explicacion: string): Motivo => ({
  codigo,
  gravedad,
  explicacion,
});

/** Distancia de Levenshtein (cadenas cortas: hosts). */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return fila[b.length];
}

const normalizaHost = (h: string): string =>
  h.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").replace(/rn/g, "m").replace(/vv/g, "w");

function analizarEnlace(url: string, confianza: string[]): Motivo[] {
  const motivos: Motivo[] = [];
  const crudo = url.trim();
  if (/^(javascript|data|vbscript|file):/i.test(crudo)) {
    return [mot("protocolo_peligroso", "alerta", "El enlace ejecuta código o abre datos locales: se bloquea.")];
  }
  let u: URL;
  try {
    u = new URL(crudo);
  } catch {
    return [mot("enlace_invalido", "aviso", "El enlace no es válido: confirma antes de abrirlo.")];
  }
  const host = u.hostname.toLowerCase();
  if (u.username || u.password) {
    motivos.push(mot("destino_oculto", "alerta", "El enlace esconde su destino real tras un usuario@."));
  }
  if (host.split(".").some((p) => p.startsWith("xn--"))) {
    motivos.push(mot("dominio_punycode", "alerta", "El dominio usa letras que imitan a otras (punycode)."));
  }
  const esConocido = confianza.some((d) => host === d || host.endsWith("." + d));
  if (!esConocido) {
    const parecido = confianza.find(
      (d) => distancia(host, d) <= 2 || normalizaHost(host) === normalizaHost(d),
    );
    if (parecido) {
      motivos.push(mot("dominio_parecido", "alerta", "El dominio imita a " + parecido + ": puede ser una suplantación."));
    }
  }
  if (u.protocol === "http:") {
    motivos.push(mot("sin_cifrado", "aviso", "El enlace no está cifrado (http)."));
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    motivos.push(mot("ip_directa", "aviso", "El enlace apunta a una dirección IP, no a un nombre."));
  }
  if (ACORTADORES.includes(host)) {
    motivos.push(mot("enlace_acortado", "aviso", "Enlace acortado: no se ve su destino."));
  }
  return motivos;
}

function analizarArchivo(nombre: string): Motivo[] {
  if (/[‪-‮⁦-⁩]/.test(nombre)) {
    return [mot("nombre_invertido", "alerta", "El nombre del archivo oculta su extensión real con texto invertido.")];
  }
  const partes = nombre.trim().toLowerCase().split(".");
  const ext = partes.length > 1 ? partes[partes.length - 1] : "";
  if (!EXT_EJECUTABLE.includes(ext)) return [];
  const anterior = partes.length > 2 ? partes[partes.length - 2] : "";
  if (EXT_INOCENTE.includes(anterior)) {
    return [mot("ejecutable_disfrazado", "alerta", "Parece un ." + anterior + ", pero es un ejecutable (." + ext + ").")];
  }
  return [mot("ejecutable", "aviso", "Es un archivo ejecutable (." + ext + "): confirma que lo esperabas.")];
}

function analizarPermisos(pedidos: string[], esperados: string[] | undefined): Motivo[] {
  const motivos: Motivo[] = [];
  const ok = new Set((esperados ?? []).map((p) => p.toLowerCase()));
  const extra = pedidos.map((p) => p.toLowerCase()).filter((p) => !ok.has(p));
  const critico = extra.filter((p) => PERMISOS_CRITICOS.includes(p));
  if (critico.length > 0) {
    motivos.push(mot("permiso_critico", "alerta", "Pide un permiso crítico que no esperabas: " + critico.join(", ") + "."));
  }
  if (extra.length > LIMITE_PERMISOS_EXTRA) {
    motivos.push(mot("permisos_excesivos", "aviso", "Pide más permisos de los necesarios: " + extra.join(", ") + "."));
  }
  return motivos;
}

function analizarEmisor(e: EmisorVinculo): Motivo[] {
  if (!e.firmaValida) {
    return [mot("firma_invalida", "alerta", "La firma del emisor no es válida: no se abre.")];
  }
  if (e.reputacion === undefined) {
    return [mot("emisor_sin_reputacion", "sugerencia", "Emisor sin historial: ábrelo solo si lo conoces.")];
  }
  if (e.reputacion < 0.3) {
    return [mot("emisor_dudoso", "aviso", "El emisor tiene mala reputación.")];
  }
  return [];
}

function analizarTexto(texto: string): Motivo[] {
  const hallazgos = scanRecibido(texto);
  if (hallazgos.length === 0) return [];
  const grave = hallazgos.some((h) => h.severity === "critical" || h.severity === "high");
  return [
    mot(
      "datos_sensibles",
      grave ? "aviso" : "sugerencia",
      "El contenido lleva " + hallazgos.length + " dato(s) sensible(s) (" + hallazgos[0].label + ").",
    ),
  ];
}

/** Mueve la gravedad un escalón según lo que la persona decidió antes (una alerta nunca baja). */
function ajustar(m: Motivo, decisiones: DecisionPersona[]): Motivo {
  if (m.gravedad === "alerta") return m;
  const propias = decisiones.filter((d) => d.codigo === m.codigo);
  const permitidas = propias.filter((d) => d.accion === "permitir").length;
  const rechazadas = propias.length - permitidas;
  const i = ORDEN.indexOf(m.gravedad);
  if (rechazadas >= 2 && rechazadas > permitidas) return { ...m, gravedad: ORDEN[i + 1] as Motivo["gravedad"] };
  if (permitidas >= 2 && permitidas > rechazadas && i > 1) return { ...m, gravedad: ORDEN[i - 1] as Motivo["gravedad"] };
  return m;
}

const FRASE: Record<Veredicto, string> = {
  seguro: "Sin riesgos detectados: se abre.",
  sugerencia: "Se puede abrir; ten en cuenta la sugerencia.",
  aviso: "Pide tu confirmación antes de abrirse.",
  alerta: "Bloqueado por seguridad.",
};

export function evaluarRecibido(r: Recibido, opciones: OpcionesEscaneo = {}): ResultadoEscaneo {
  const confianza = opciones.dominiosConfianza ?? DOMINIOS_CONFIANZA;
  const bruto = [
    ...analizarEmisor(r.emisor),
    ...(r.url ? analizarEnlace(r.url, confianza) : []),
    ...(r.nombreArchivo ? analizarArchivo(r.nombreArchivo) : []),
    ...(r.permisos?.length ? analizarPermisos(r.permisos, r.permisosEsperados) : []),
    ...(r.texto ? analizarTexto(r.texto) : []),
    ...(r.url ? analizarTexto(r.url) : []),
  ];
  const motivos = bruto.map((m) => ajustar(m, opciones.decisiones ?? []));
  const veredicto = motivos.reduce<Veredicto>(
    (peor, m) => (ORDEN.indexOf(m.gravedad) > ORDEN.indexOf(peor) ? m.gravedad : peor),
    "seguro",
  );
  const detalle = motivos.map((m) => m.explicacion).join(" ");
  return {
    veredicto,
    motivos,
    explicacion: detalle ? FRASE[veredicto] + " " + detalle : FRASE[veredicto],
    requiereConfirmar: veredicto === "aviso",
    bloquea: veredicto === "alerta",
  };
}
