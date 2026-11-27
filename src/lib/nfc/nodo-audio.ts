// Nodos de audio por lugar: audioguías, descripciones de zona, nodos informativos (contrato: architecture/nfc-neuronas.md §12).
// Módulo puro: sin red, disco ni Node. Un nodo puede ofrecer audio; el visitante configura reproducción, idioma, volumen y biblioteca.

export const TIPO_AUDIO = ["audioguia", "descripcion_zona", "nodo_informativo"] as const;
export type TipoAudio = (typeof TIPO_AUDIO)[number];

export const MODO_REPRODUCCION = ["al_acercarse", "preguntar", "no_reproducir"] as const;
export type ModoReproduccion = (typeof MODO_REPRODUCCION)[number];

export interface PistaAudio {
  id: string;
  titulo: string;
  duracionSeg: number;
  /** Ruta interna («/audio/...») o URL https. Nunca javascript: ni http. */
  url: string;
  idioma: string;
}

export interface ConfigAudioNodo {
  version: 1;
  tipo: TipoAudio;
  titulo: string;
  descripcion: string;
  pistas: PistaAudio[];
  idiomaPrincipal: string;
  idiomasDisponibles: string[];
  modoReproduccion: ModoReproduccion;
  /** 0-1, volumen por defecto del nodo. */
  volumenDefecto: number;
  /** Si el visitante puede guardar este audio en su Biblioteca. */
  guardarEnBiblioteca: boolean;
}

export interface PreferenciasVisitanteAudio {
  /** Cómo quiere el visitante que se reproduzca al acercarse. */
  modoReproduccion: ModoReproduccion;
  /** Idioma preferido; «auto» = usa el del sistema / principal del nodo. */
  idiomaPreferido: string;
  /** 0-1, volumen personal del visitante. */
  volumen: number;
  /** Si quiere guardar en su Biblioteca al escuchar. */
  guardarEnBiblioteca: boolean;
}

export interface PreferenciasVisitanteResueltas {
  modoReproduccion: ModoReproduccion;
  idioma: string;
  volumen: number;
  guardarEnBiblioteca: boolean;
}

export type ResultadoAudio = { ok: true; config: ConfigAudioNodo } | { ok: false; errores: string[] };

const esTexto = (x: unknown): x is string => typeof x === "string";
const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const incluye = <T extends string>(lista: readonly T[], x: unknown): x is T => esTexto(x) && (lista as readonly string[]).includes(x);

function urlValida(u: string): boolean {
  if (u.length === 0 || u.length > 500 || /[\s<>"]/.test(u)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return /^https:\/\//i.test(u);
  return true;
}

export function configAudioPorDefecto(tipo: TipoAudio): ConfigAudioNodo {
  const base: ConfigAudioNodo = {
    version: 1,
    tipo,
    titulo: "",
    descripcion: "",
    pistas: [],
    idiomaPrincipal: "es",
    idiomasDisponibles: ["es"],
    modoReproduccion: "preguntar",
    volumenDefecto: 0.8,
    guardarEnBiblioteca: true,
  };
  if (tipo === "descripcion_zona") {
    return { ...base, modoReproduccion: "al_acercarse" };
  }
  return base;
}

function validarPistas(x: unknown, errores: string[]): PistaAudio[] {
  const pistas: PistaAudio[] = [];
  if (!Array.isArray(x) || x.length === 0) {
    errores.push("Debe haber al menos una pista de audio.");
    return pistas;
  }
  if (x.length > 50) {
    errores.push("Máximo 50 pistas por nodo.");
    return pistas;
  }
  x.forEach((p, i) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const n = i + 1;
    if (!esTexto(r.id) || r.id.trim().length === 0 || r.id.length > 64) {
      return void errores.push(`Pista ${n}: id inválido (1-64 caracteres).`);
    }
    if (!esTexto(r.titulo) || r.titulo.trim().length === 0 || r.titulo.length > 120) {
      return void errores.push(`Pista ${n}: título 1-120 caracteres.`);
    }
    if (!esNumero(r.duracionSeg) || r.duracionSeg <= 0 || r.duracionSeg > 7200) {
      return void errores.push(`Pista ${n}: duración 1-7200 segundos.`);
    }
    if (!esTexto(r.url) || !urlValida(r.url)) {
      return void errores.push(`Pista ${n}: URL inválida (ruta interna o https).`);
    }
    if (!esTexto(r.idioma) || r.idioma.trim().length === 0 || r.idioma.length > 10) {
      return void errores.push(`Pista ${n}: código de idioma inválido.`);
    }
    pistas.push({ id: r.id.trim(), titulo: r.titulo.trim(), duracionSeg: r.duracionSeg, url: r.url, idioma: r.idioma.trim() });
  });
  return pistas;
}

export function validarAudioNodo(x: unknown): ResultadoAudio {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["La configuración no tiene forma de objeto."] };
  const o = x as Record<string, unknown>;

  if (o.version !== 1) errores.push("Versión no admitida (solo 1).");
  if (!incluye(TIPO_AUDIO, o.tipo)) errores.push("Tipo de audio desconocido (debe ser: audioguia, descripcion_zona o nodo_informativo).");
  const tipo = incluye(TIPO_AUDIO, o.tipo) ? o.tipo : undefined;

  const titulo = esTexto(o.titulo) ? o.titulo.trim() : "";
  if (titulo.length === 0 || titulo.length > 80) errores.push("Título: 1-80 caracteres.");

  const descripcion = esTexto(o.descripcion) ? o.descripcion.trim() : "";
  if (descripcion.length > 500) errores.push("Descripción: máximo 500 caracteres.");

  const pistas = validarPistas(o.pistas, errores);

  const idiomaPrincipal = esTexto(o.idiomaPrincipal) ? o.idiomaPrincipal.trim().toLowerCase() : "";
  const idiomasDisponibles: string[] = [];
  if (Array.isArray(o.idiomasDisponibles)) {
    for (const lang of o.idiomasDisponibles) {
      if (esTexto(lang) && lang.trim().length > 0 && lang.length <= 10 && !idiomasDisponibles.includes(lang.trim().toLowerCase())) {
        idiomasDisponibles.push(lang.trim().toLowerCase());
      }
    }
  }
  if (idiomaPrincipal && !idiomasDisponibles.includes(idiomaPrincipal)) {
    errores.push("El idioma principal debe estar en la lista de idiomas disponibles.");
  }

  if (!incluye(MODO_REPRODUCCION, o.modoReproduccion)) errores.push("Modo de reproducción inválido.");
  const modoReproduccion = incluye(MODO_REPRODUCCION, o.modoReproduccion) ? o.modoReproduccion : undefined;

  const volumenDefecto = esNumero(o.volumenDefecto) ? o.volumenDefecto : -1;
  if (volumenDefecto < 0 || volumenDefecto > 1) errores.push("Volumen por defecto: 0-1.");

  if (typeof o.guardarEnBiblioteca !== "boolean") errores.push("guardarEnBiblioteca debe ser booleano.");

  if (errores.length > 0 || !tipo || !modoReproduccion) return { ok: false, errores };

  const config: ConfigAudioNodo = {
    version: 1,
    tipo,
    titulo,
    descripcion,
    pistas,
    idiomaPrincipal: idiomaPrincipal || "es",
    idiomasDisponibles: idiomasDisponibles.length > 0 ? idiomasDisponibles : ["es"],
    modoReproduccion,
    volumenDefecto,
    guardarEnBiblioteca: Boolean(o.guardarEnBiblioteca),
  };
  return { ok: true, config };
}

export function preferenciasVisitantePorDefecto(): PreferenciasVisitanteAudio {
  return { modoReproduccion: "preguntar", idiomaPreferido: "auto", volumen: 0.8, guardarEnBiblioteca: true };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function resolverPreferenciasVisitante(
  config: ConfigAudioNodo,
  prefs: PreferenciasVisitanteAudio
): PreferenciasVisitanteResueltas {
  const modo = incluye(MODO_REPRODUCCION, prefs.modoReproduccion) ? prefs.modoReproduccion : config.modoReproduccion;

  let idioma = prefs.idiomaPreferido?.trim().toLowerCase() || "auto";
  if (idioma === "auto") idioma = config.idiomaPrincipal;
  else if (!config.idiomasDisponibles.includes(idioma)) idioma = config.idiomaPrincipal;

  const volumen = clamp01(esNumero(prefs.volumen) ? prefs.volumen : config.volumenDefecto);
  const guardar = typeof prefs.guardarEnBiblioteca === "boolean" ? prefs.guardarEnBiblioteca : config.guardarEnBiblioteca;

  return { modoReproduccion: modo, idioma, volumen, guardarEnBiblioteca: guardar };
}

export function audioDisponibleOffline(config: ConfigAudioNodo, pistasDescargadas: Set<string>): boolean {
  return config.pistas.some((p) => {
    const esLocal = p.url.startsWith("/");
    const descargada = pistasDescargadas.has(p.id);
    return esLocal || descargada;
  });
}