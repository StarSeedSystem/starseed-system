// Tarjetas y ofertas digitales no publicitarias (contrato: architecture/nfc-neuronas.md §13).
// Módulo puro: sin red, disco ni Node. La firma Ed25519 se verifica con noble-ed25519 (inyectable).

export const TIPO_TARJETA_OFERTA = [
  "presentacion", "amistad", "evento", "pagina", "grupo", "partido",
  "perfil", "cuenta", "cerebro", "repositorio", "archivo", "app", "programa", "enlace_libre",
] as const;
export type TipoTarjetaOferta = (typeof TIPO_TARJETA_OFERTA)[number];

export interface ContenidoTarjetaOferta {
  [clave: string]: unknown;
}

export interface TarjetaOferta {
  version: 1;
  tipo: TipoTarjetaOferta;
  emisor: string;
  titulo: string;
  contenido: ContenidoTarjetaOferta;
  emitidaEn: number;
  caducidad?: number;
  firma?: string;
  marcaComercial?: boolean;
}

export type ResultadoValidarTarjetaOferta =
  | { ok: true; tarjeta: TarjetaOferta }
  | { ok: false; motivo: string };

export type ResultadoCrearTarjetaOferta =
  | { ok: true; tarjeta: TarjetaOferta }
  | { ok: false; errores: string[] };

const MAX_TITULO = 100;

export function tipoTarjetaOfertaValido(t: string): t is TipoTarjetaOferta {
  return TIPO_TARJETA_OFERTA.includes(t as TipoTarjetaOferta);
}

export function accionPrincipalPorTipo(tipo: TipoTarjetaOferta): string {
  switch (tipo) {
    case "presentacion":
    case "amistad":
      return "anadir_contacto";
    case "evento":
      return "registrar_entrada_evento";
    case "pagina":
    case "enlace_libre":
      return "abrir_enlace";
    case "grupo":
    case "partido":
      return "invitar_grupo";
    case "perfil":
      return "ver_perfil";
    case "cuenta":
      return "ver_cuenta";
    case "cerebro":
      return "abrir_cerebro";
    case "repositorio":
      return "abrir_repositorio";
    case "archivo":
      return "abrir_archivo";
    case "app":
      return "abrir_app";
    case "programa":
      return "abrir_programa";
  }
}

function esTexto(v: unknown): v is string {
  return typeof v === "string";
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function esEnteroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function crearTarjetaOferta(params: {
  tipo: TipoTarjetaOferta;
  emisor: string;
  titulo: string;
  contenido: ContenidoTarjetaOferta;
  emitidaEn: number;
  caducidad?: number;
}): ResultadoCrearTarjetaOferta {
  const errores: string[] = [];

  if (!tipoTarjetaOfertaValido(params.tipo)) {
    errores.push("Tipo de tarjeta no válido.");
  }
  if (!esTexto(params.emisor) || params.emisor.length === 0) {
    errores.push("El emisor es obligatorio.");
  }
  if (!esTexto(params.titulo) || params.titulo.trim().length === 0 || params.titulo.length > MAX_TITULO) {
    errores.push(`El título debe tener entre 1 y ${MAX_TITULO} caracteres.`);
  }
  if (!esObjeto(params.contenido)) {
    errores.push("El contenido debe ser un objeto.");
  }
  if (!esEnteroPositivo(params.emitidaEn)) {
    errores.push("La fecha de emisión debe ser un entero positivo (ms desde epoch).");
  }
  if (params.caducidad !== undefined) {
    if (!esEnteroPositivo(params.caducidad)) {
      errores.push("La caducidad debe ser un entero positivo (ms desde epoch).");
    } else if (params.caducidad <= params.emitidaEn) {
      errores.push("La caducidad debe ser posterior a la emisión.");
    }
  }

  if (errores.length > 0) return { ok: false, errores };

  const tarjeta: TarjetaOferta = {
    version: 1,
    tipo: params.tipo,
    emisor: params.emisor,
    titulo: params.titulo.trim(),
    contenido: params.contenido,
    emitidaEn: params.emitidaEn,
    marcaComercial: false,
  };
  if (params.caducidad !== undefined) tarjeta.caducidad = params.caducidad;

  return { ok: true, tarjeta };
}

export function validarTarjetaOferta(
  tarjeta: unknown,
  clavePublica?: string,
  ahora?: number,
): ResultadoValidarTarjetaOferta {
  if (!esObjeto(tarjeta)) return { ok: false, motivo: "no es un objeto" };
  const t = tarjeta as Record<string, unknown>;

  if (t.version !== 1) return { ok: false, motivo: "versión no soportada" };
  if (!tipoTarjetaOfertaValido(t.tipo as string)) return { ok: false, motivo: "tipo no válido" };
  if (!esTexto(t.emisor) || t.emisor.length === 0) return { ok: false, motivo: "emisor" };
  if (!esTexto(t.titulo) || t.titulo.length === 0 || t.titulo.length > MAX_TITULO) return { ok: false, motivo: "título" };
  if (!esObjeto(t.contenido)) return { ok: false, motivo: "contenido" };
  if (!esEnteroPositivo(t.emitidaEn)) return { ok: false, motivo: "emitidaEn" };
  if (t.caducidad !== undefined && (!esEnteroPositivo(t.caducidad) || t.caducidad <= (t.emitidaEn as number))) {
    return { ok: false, motivo: "caducidad" };
  }
  if (t.firma !== undefined && (!esTexto(t.firma) || t.firma.length !== 128 || !/^[0-9a-f]{128}$/.test(t.firma))) {
    return { ok: false, motivo: "firma" };
  }
  if (t.marcaComercial !== undefined && typeof t.marcaComercial !== "boolean") {
    return { ok: false, motivo: "marcaComercial" };
  }

  const validad: TarjetaOferta = {
    version: 1,
    tipo: t.tipo as TipoTarjetaOferta,
    emisor: t.emisor,
    titulo: t.titulo,
    contenido: t.contenido as ContenidoTarjetaOferta,
    emitidaEn: t.emitidaEn as number,
  };
  if (t.caducidad !== undefined) validad.caducidad = t.caducidad as number;
  if (t.firma !== undefined) validad.firma = t.firma;
  if (t.marcaComercial !== undefined) validad.marcaComercial = t.marcaComercial;

  if (clavePublica && validad.firma) {
    if (!verificarFirmaTarjetaOferta(validad, clavePublica)) {
      return { ok: false, motivo: "firma" };
    }
  }

  if (ahora !== undefined && caducada(validad, ahora)) {
    return { ok: false, motivo: "caducada" };
  }

  return { ok: true, tarjeta: validad };
}

const enc = new TextEncoder();

function bytesAFirmar(t: Omit<TarjetaOferta, "firma">): Uint8Array {
  const { version, tipo, emisor, titulo, contenido, emitidaEn, caducidad, marcaComercial } = t;
  const canon = { version, tipo, emisor, titulo, contenido, emitidaEn, caducidad: caducidad ?? null, marcaComercial: marcaComercial ?? false };
  return enc.encode(JSON.stringify(canon));
}

type Firmante = (mensaje: Uint8Array, clavePrivadaHex: string) => string;
type Verificador = (mensaje: Uint8Array, firmaHex: string, clavePublicaHex: string) => boolean;

let _firmante: Firmante | null = null;
let _verificador: Verificador | null = null;

export function __setCrypto(firmante: Firmante, verificador: Verificador): void {
  _firmante = firmante;
  _verificador = verificador;
}

export function firmarTarjetaOferta(tarjeta: Omit<TarjetaOferta, "firma">, clavePrivadaHex: string): TarjetaOferta {
  if (!_firmante) throw new Error("Firmante no configurado. Usa __setCrypto con noble-ed25519.");
  const bytes = bytesAFirmar(tarjeta);
  const firma = _firmante(bytes, clavePrivadaHex);
  return { ...tarjeta, firma };
}

export function verificarFirmaTarjetaOferta(tarjeta: TarjetaOferta, clavePublicaHex: string): boolean {
  if (!_verificador) throw new Error("Verificador no configurado. Usa __setCrypto con noble-ed25519.");
  if (!tarjeta.firma) return false;
  const { firma, ...sinFirma } = tarjeta;
  const bytes = bytesAFirmar(sinFirma);
  try {
    return _verificador(bytes, firma, clavePublicaHex);
  } catch {
    return false;
  }
}

export function caducada(tarjeta: TarjetaOferta, ahora: number): boolean {
  return tarjeta.caducidad !== undefined && ahora > tarjeta.caducidad;
}

export function esComercialNoSolicitada(tarjeta: TarjetaOferta): boolean {
  return tarjeta.marcaComercial === true;
}

export function marcarComercialNoSolicitada(tarjeta: TarjetaOferta): TarjetaOferta {
  return { ...tarjeta, marcaComercial: true };
}

export function puedeBloquearEmisor(tarjeta: TarjetaOferta): boolean {
  return esComercialNoSolicitada(tarjeta);
}