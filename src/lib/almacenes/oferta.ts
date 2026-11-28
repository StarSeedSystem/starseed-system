/**
 * oferta.ts — la capacidad de almacenamiento como señal de capa (ALC1125F).
 *
 * Una neurona puede ofrecer parte de su almacén a la malla igual que ofrece
 * internet o cómputo: aquí vive la oferta (cuánto, a quién, cuándo y con qué
 * tope), su saneado y el anuncio que viaja en la ficha de capacidades. Es un
 * módulo PURO: no toca red, disco ni relojes; la hora y las medidas se inyectan.
 *
 * Apagada por defecto: nadie ofrece nada hasta que su dueño lo encienda en ESA
 * neurona. Lo que se comparte se cifra en la neurona del dueño (§5 del contrato).
 */

/** A quién puede ofrecerse la capacidad (§5: privada, grupo, comunidad, pública). */
export const AUDIENCIAS_ALMACEN = ["privada", "grupo", "comunidad", "publica"] as const;
export type AudienciaAlmacen = (typeof AUDIENCIAS_ALMACEN)[number];

/** Ventana horaria local (0-23) en que la neurona ofrece; cruzar medianoche vale. */
export interface VentanaOfertaAlmacen {
  desdeHora: number;
  hastaHora: number;
}

/** Topes de la oferta: hasta cuánto y bajo qué condiciones del aparato. */
export interface TopesOfertaAlmacen {
  /** Tope duro en MB; 0 = usar lo ofrecido como tope. */
  maxMb: number;
  /** Solo ofrecer mientras el aparato esté cargando. */
  soloCargando: boolean;
  /** Reserva mínima de batería (%), salvo que esté cargando. */
  reservaBateriaPct: number;
}

/** Oferta completa de almacenamiento de una neurona. */
export interface OfertaAlmacen {
  /** Dueño de la capacidad (la cuenta que puede verla si es privada). */
  cuentaId: string;
  activa: boolean;
  /** Cuánto ofrece, en MB. 0 = nada (nunca se inventa). */
  ofrecerMb: number;
  audiencias: AudienciaAlmacen[];
  grupos: string[];
  comunidades: string[];
  ventanas: VentanaOfertaAlmacen[];
  topes: TopesOfertaAlmacen;
  /** Almacenes/volúmenes concretos que respaldan la oferta (ids estables). */
  volumenes: string[];
}

/** Lo que viaja en la ficha: sin listas privadas de grupos ni ventanas. */
export interface OfertaAlmacenAnuncio {
  activa: true;
  ofrecerMb: number;
  audiencias: AudienciaAlmacen[];
  maxMb: number;
  volumenes: string[];
}

export const OFERTA_ALMACEN_POR_DEFECTO: OfertaAlmacen = {
  cuentaId: "",
  activa: false,
  ofrecerMb: 0,
  audiencias: [],
  grupos: [],
  comunidades: [],
  ventanas: [],
  topes: { maxMb: 0, soloCargando: true, reservaBateriaPct: 30 },
  volumenes: [],
};

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function enteroAcotado(v: unknown, porDefecto: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function listaTextos(v: unknown, maximo = 64): string[] {
  if (!Array.isArray(v)) return [];
  const salida: string[] = [];
  for (const e of v) {
    if (typeof e !== "string") continue;
    const t = e.trim().slice(0, 160);
    if (t && !salida.includes(t)) salida.push(t);
    if (salida.length >= maximo) break;
  }
  return salida;
}

function listaAudiencias(v: unknown): AudienciaAlmacen[] {
  if (!Array.isArray(v)) return [];
  const salida: AudienciaAlmacen[] = [];
  for (const e of v) {
    const a = e as AudienciaAlmacen;
    if (AUDIENCIAS_ALMACEN.includes(a) && !salida.includes(a)) salida.push(a);
  }
  return salida;
}

function listaVentanas(v: unknown): VentanaOfertaAlmacen[] {
  if (!Array.isArray(v)) return [];
  const salida: VentanaOfertaAlmacen[] = [];
  for (const e of v.slice(0, 24)) {
    if (!esObjeto(e)) continue;
    const { desdeHora, hastaHora } = e;
    if (!Number.isInteger(desdeHora) || !Number.isInteger(hastaHora)) continue;
    if ((desdeHora as number) < 0 || (desdeHora as number) > 23) continue;
    if ((hastaHora as number) < 0 || (hastaHora as number) > 23) continue;
    salida.push({ desdeHora: desdeHora as number, hastaHora: hastaHora as number });
  }
  return salida;
}

function copiaPorDefecto(): OfertaAlmacen {
  return {
    ...OFERTA_ALMACEN_POR_DEFECTO,
    audiencias: [],
    grupos: [],
    comunidades: [],
    ventanas: [],
    volumenes: [],
    topes: { ...OFERTA_ALMACEN_POR_DEFECTO.topes },
  };
}

/**
 * Convierte lo que haya guardado (cualquier cosa) en una oferta válida. Nunca
 * lanza: lo que no encaja se descarta y lo ausente vuelve al defecto apagado.
 */
export function sanearOfertaAlmacen(crudo: unknown): OfertaAlmacen {
  if (!esObjeto(crudo)) return copiaPorDefecto();
  const topes = esObjeto(crudo.topes) ? crudo.topes : {};
  return {
    cuentaId: typeof crudo.cuentaId === "string" ? crudo.cuentaId.trim().slice(0, 160) : "",
    activa: crudo.activa === true,
    ofrecerMb: enteroAcotado(crudo.ofrecerMb, 0, 0, Number.MAX_SAFE_INTEGER),
    audiencias: listaAudiencias(crudo.audiencias),
    grupos: listaTextos(crudo.grupos),
    comunidades: listaTextos(crudo.comunidades),
    ventanas: listaVentanas(crudo.ventanas),
    topes: {
      maxMb: enteroAcotado(topes.maxMb, 0, 0, Number.MAX_SAFE_INTEGER),
      soloCargando: topes.soloCargando !== false,
      reservaBateriaPct: enteroAcotado(topes.reservaBateriaPct, 30, 0, 100),
    },
    volumenes: listaTextos(crudo.volumenes),
  };
}

/** Quién pregunta por la oferta: su cuenta, sus grupos y sus comunidades. */
export interface QuienConsultaAlmacen {
  cuentaId: string;
  grupos?: string[];
  comunidades?: string[];
}

const coincide = (propios: string[], ajenos: string[] | undefined): boolean =>
  !!ajenos && ajenos.some((x) => propios.includes(x));

/**
 * ¿Esta oferta es visible para quien pregunta? Apagada o sin audiencia, para
 * nadie. «Privada» exige la misma cuenta no vacía; grupo y comunidad, coincidir.
 */
export function ofertaAlmacenVisiblePara(oferta: OfertaAlmacen, quien: QuienConsultaAlmacen): boolean {
  if (!oferta.activa || oferta.audiencias.length === 0) return false;
  return oferta.audiencias.some((audiencia) => {
    if (audiencia === "publica") return true;
    if (audiencia === "privada") return oferta.cuentaId !== "" && quien.cuentaId === oferta.cuentaId;
    if (audiencia === "grupo") return coincide(oferta.grupos, quien.grupos);
    return coincide(oferta.comunidades, quien.comunidades);
  });
}

/** Estado medido del aparato que ofrece, con la hora inyectada (nada de relojes). */
export interface EstadoOfertaAlmacen {
  /** Hora local 0-23 para evaluar las ventanas. */
  hora: number;
  cargando?: boolean;
  bateriaPct?: number | null;
  /** MB libres MEDIDOS en el almacén; null/ausente = sin medir. */
  libreMb?: number | null;
  /** MB ya comprometidos con otras tareas (se descuentan del libre). */
  comprometidoMb?: number;
}

export interface ResultadoPrestableAlmacen {
  prestaMb: number;
  disponible: boolean;
  motivo: string;
}

function horaValida(hora: number): number {
  const h = Math.floor(Number.isFinite(hora) ? hora : 0) % 24;
  return h < 0 ? h + 24 : h;
}

function dentroDeVentana(ventanas: VentanaOfertaAlmacen[], hora: number): boolean {
  if (ventanas.length === 0) return true;
  const h = horaValida(hora);
  return ventanas.some(({ desdeHora, hastaHora }) =>
    desdeHora === hastaHora
      ? true
      : desdeHora < hastaHora
        ? h >= desdeHora && h < hastaHora
        : h >= desdeHora || h < hastaHora,
  );
}

/**
 * Cuánto puede ofrecer esta neurona AHORA: mínimo de lo ofrecido, el tope duro y
 * el espacio libre medido menos lo comprometido. Sin medida, no se inventa nada.
 */
export function capacidadAlmacenPrestable(
  oferta: OfertaAlmacen,
  estado: EstadoOfertaAlmacen,
): ResultadoPrestableAlmacen {
  const no = (motivo: string): ResultadoPrestableAlmacen => ({ prestaMb: 0, disponible: false, motivo });
  if (!oferta.activa) return no("La oferta de almacenamiento está apagada en esta neurona.");
  if (oferta.ofrecerMb <= 0) return no("No hay capacidad declarada que ofrecer.");
  if (oferta.audiencias.length === 0) return no("No hay audiencia declarada para la oferta.");
  if (!dentroDeVentana(oferta.ventanas, estado.hora)) return no("Fuera de las ventanas horarias de la oferta.");
  const cargando = estado.cargando === true;
  if (oferta.topes.soloCargando && !cargando) return no("La oferta solo se anuncia mientras el aparato está cargando.");
  if (!cargando && typeof estado.bateriaPct === "number" && estado.bateriaPct < oferta.topes.reservaBateriaPct) {
    return no(`Batería al ${Math.round(estado.bateriaPct)}% por debajo de la reserva del ${oferta.topes.reservaBateriaPct}%.`);
  }
  const libre = estado.libreMb;
  if (typeof libre !== "number" || !Number.isFinite(libre)) {
    return no("Sin medida de espacio libre: no se ofrece lo que no se puede confirmar.");
  }
  const comprometido = typeof estado.comprometidoMb === "number" && Number.isFinite(estado.comprometidoMb)
    ? Math.max(0, estado.comprometidoMb)
    : 0;
  const tope = oferta.topes.maxMb > 0 ? oferta.topes.maxMb : oferta.ofrecerMb;
  const prestaMb = Math.floor(Math.min(oferta.ofrecerMb, tope, Math.max(0, libre - comprometido)));
  if (prestaMb <= 0) return no("Sin espacio libre suficiente tras los topes y lo ya comprometido.");
  return { prestaMb, disponible: true, motivo: `Ofrece ${prestaMb} MB de almacenamiento a la malla.` };
}

/**
 * Lo que se anuncia en la ficha de capacidades: solo si está encendida y tiene
 * algo que ofrecer. No viajan grupos, comunidades ni ventanas: eso queda aquí.
 */
export function anuncioOfertaAlmacen(oferta: OfertaAlmacen): OfertaAlmacenAnuncio | undefined {
  if (!oferta.activa || oferta.ofrecerMb <= 0 || oferta.audiencias.length === 0) return undefined;
  return {
    activa: true,
    ofrecerMb: oferta.ofrecerMb,
    audiencias: [...oferta.audiencias],
    maxMb: oferta.topes.maxMb,
    volumenes: [...oferta.volumenes],
  };
}

/** Textos de interfaz en español (sin hexadecimales: los colores son del tema). */
export const TextosOfertaAlmacen = {
  titulo: "Almacenamiento compartido",
  ayuda: "Ofrece capacidad de esta neurona a la malla. Apagado por defecto; lo compartido se cifra aquí.",
  apagada: "Apagada",
  encendida: "Ofreciendo",
  cuanto: "Cuánto ofreces",
  aQuien: "A quién",
  cuando: "Cuándo",
  tope: "Tope",
  soloCargando: "Solo mientras carga",
  sinMedida: "Sin medida de espacio libre",
  audiencias: {
    privada: "Mi cuenta",
    grupo: "Mis grupos",
    comunidad: "Mis comunidades",
    publica: "Público",
  },
} as const;

export function etiquetaAudiencia(audiencia: AudienciaAlmacen): string {
  return TextosOfertaAlmacen.audiencias[audiencia] ?? audiencia;
}
