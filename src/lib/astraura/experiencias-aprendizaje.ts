// Lo que sale de las experiencias: líneas para Needle y curvas de calibración.
import type { Experiencia, Capa, Almacen, Valoracion, ResultadoHerramienta, LineaExperiencias } from "./experiencias";
import { nueva, anotar, cerrar, marcarSubida } from "./experiencias";

interface SalidaNeedle {
  herramientas?: string[];
  llamadas?: { nombre: string; argumentos?: Record<string, unknown> }[];
  razonamiento?: string;
}

export interface LineaNeedle {
  query: string;
  tools: string[];
  answers: { name: string; arguments: Record<string, unknown> }[];
  reasoning: string;
}

// Solo intenciones acertadas → JSONL que entiende `needle finetune`.
export function paraNeedle(exps: Experiencia[]): LineaNeedle[] {
  const fuera: LineaNeedle[] = [];
  for (const e of exps) {
    if (e.tipo !== "intencion" || !e.resultado) continue;
    const s = e.salida as SalidaNeedle | null;
    if (!s || typeof s !== "object" || !s.herramientas || !s.llamadas) continue;
    fuera.push({
      query: e.entrada,
      tools: s.herramientas,
      answers: s.llamadas.map((c) => ({ name: c.nombre, arguments: c.argumentos ?? {} })),
      reasoning: s.razonamiento ?? "",
    });
  }
  return fuera;
}

export interface TramoCalibracion {
  n: number;
  aciertos: number;
}

// Aciertos por décima de confianza, solo con resultado conocido.
export function calibracion(exps: Experiencia[], capa: Capa = "jev"): Record<string, TramoCalibracion> {
  const tramos: Record<string, TramoCalibracion> = {};
  for (const e of exps) {
    if (e.capa !== capa || e.resultado === null || e.confianza === null) continue;
    const k = (Math.floor(e.confianza * 10) / 10).toFixed(1);
    const t = (tramos[k] ??= { n: 0, aciertos: 0 });
    t.n += 1;
    if (e.resultado) t.aciertos += 1;
  }
  return tramos;
}

// ── Aprender en el cliente (contrato §8) ────────────────────────────────────
// La persona valora (👍/👎), corrige y las herramientas informan si acertaron.
// Todo se guarda primero en IDB; subir al corpus del ámbito es OTRO paso, con
// consentimiento (`aprendizaje_colectivo` encendido y el ámbito de acuerdo), y
// lo privado no sale jamás del dispositivo ni de los servidores propios.

export type PrivacidadAmbito = "privada" | "ambito" | "publica";

export interface AprendizajeAmbito {
  /** El ámbito permite compartir lo aprendido (en comunidades lo fijan sus admins). */
  permite: boolean;
  privacidad: PrivacidadAmbito;
  /** Servidor propio del ámbito; si falta se usa el de StarSeed. */
  servidorUrl?: string;
}

export interface AjustesAprendizaje {
  /** Interruptor general: `aprendizaje_colectivo`. */
  aprendizajeColectivo: boolean;
  porAmbito: Record<string, AprendizajeAmbito>;
  /** Corpus de StarSeed (Oracle). Vacío = aún no configurado. */
  servidorStarSeed?: string;
}

export const AJUSTES_APRENDIZAJE_DEFECTO: AjustesAprendizaje = {
  aprendizajeColectivo: false,
  porAmbito: {},
  servidorStarSeed: "",
};

// El valor por defecto se puede fijar con la variable NEXT_PUBLIC_ASTRAURA_CORPUS_URL;
// nunca se escribe la URL en el código si no es pública y del repo.
export function servidorStarSeedPorDefecto(): string {
  return process.env.NEXT_PUBLIC_ASTRAURA_CORPUS_URL ?? "";
}

export interface DatosValoracion {
  ambito: string;
  capa: Capa;
  modelo: string;
  /** Lo que la persona preguntó (entrada de la respuesta valorada). */
  entrada: string;
  respuesta: string;
  valoracion: Valoracion;
  /** Texto corregido por la persona, si pulsó «corregir». */
  correccion?: string;
  /** Cómo les fue a las herramientas que usó la respuesta, si las hubo. */
  herramientas?: ResultadoHerramienta[];
  medio?: string;
}

// Guarda la experiencia en el almacén (IDB en el navegador) con ámbito, capa,
// modelo y resultado de herramientas. Devuelve el id de la experiencia.
export async function registrarValoracion(datos: DatosValoracion, almacen: Almacen): Promise<string> {
  const conCorreccion = Boolean(datos.correccion && datos.correccion.trim());
  const e = await nueva({
    capa: datos.capa,
    tipo: conCorreccion ? "correccion" : "valoracion",
    entrada: datos.entrada,
    salida: datos.respuesta,
    dominio: datos.ambito,
    medio: datos.medio,
    ambito: datos.ambito,
    modelo: datos.modelo,
    valoracion: datos.valoracion,
    correccion: conCorreccion ? datos.correccion : undefined,
    herramientas: datos.herramientas,
  });
  await anotar(e, almacen);
  // La valoración ya es el resultado: no espera cierre posterior.
  await cerrar(
    e.id,
    datos.valoracion === "positiva",
    conCorreccion ? "corregida por la persona" : "valorada por la persona",
    almacen,
  );
  return e.id;
}

/** Servidor al que sube el corpus de un ámbito, o null si no debe subir. */
export function servidorDe(ambito: string, ajustes: AjustesAprendizaje): string | null {
  const a = ajustes.porAmbito[ambito];
  if (!ajustes.aprendizajeColectivo) return null;
  if (!a || !a.permite || a.privacidad === "privada") return null;
  const url = a.servidorUrl || ajustes.servidorStarSeed || servidorStarSeedPorDefecto();
  return url || null;
}

/** ¿Esta experiencia puede salir hacia el corpus? Regla dura: lo privado, jamás. */
export function puedeCompartirse(e: Experiencia, ajustes: AjustesAprendizaje): boolean {
  const ambito = e.ambito ?? e.dominio ?? "";
  if (!ambito) return false;
  if (e.tipo !== "valoracion" && e.tipo !== "correccion") return false;
  return servidorDe(ambito, ajustes) !== null;
}

/** Experiencias de aprendizaje aún sin marca de subida. */
export function pendientesDeSubir(lineas: LineaExperiencias[]): Experiencia[] {
  const subidas = new Set<string>();
  const exps: Experiencia[] = [];
  for (const d of lineas) {
    if ("ref" in d) {
      if ("subida" in d) subidas.add(d.ref);
    } else if (d.id) {
      exps.push(d);
    }
  }
  return exps.filter((e) => !subidas.has(e.id));
}

/** Quién envía de verdad (se inyecta: en producción, fetch; en pruebas, memoria). */
export type EnviadorCorpus = (url: string, experiencias: Experiencia[]) => Promise<boolean>;

export interface ResumenSubida {
  subidas: number;
  omitidas: number;
  fallidas: number;
}

// Sube SOLO lo consentido: aprendizaje_colectivo encendido, ámbito de acuerdo
// y nada privado. Agrupa por servidor del ámbito y marca cada experiencia subida.
export async function subirPendientes(
  almacen: Almacen,
  ajustes: AjustesAprendizaje,
  enviar: EnviadorCorpus,
): Promise<ResumenSubida> {
  const resumen: ResumenSubida = { subidas: 0, omitidas: 0, fallidas: 0 };
  const pendientes = pendientesDeSubir(await almacen.lineas()).filter(
    (e) => e.tipo === "valoracion" || e.tipo === "correccion",
  );
  const porServidor = new Map<string, Experiencia[]>();
  for (const e of pendientes) {
    const ambito = e.ambito ?? e.dominio ?? "";
    const url = ambito ? servidorDe(ambito, ajustes) : null;
    if (!url) {
      resumen.omitidas += 1;
      continue;
    }
    const lista = porServidor.get(url) ?? [];
    lista.push(e);
    porServidor.set(url, lista);
  }
  for (const [url, lista] of porServidor) {
    const ok = await enviar(url, lista);
    for (const e of lista) {
      if (ok) {
        await marcarSubida(e.id, almacen);
        resumen.subidas += 1;
      } else {
        resumen.fallidas += 1; // se reintentará en la próxima llamada
      }
    }
  }
  return resumen;
}
