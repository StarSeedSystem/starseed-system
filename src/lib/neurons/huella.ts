/*
 * huella — ¿son estas dos neuronas el MISMO aparato? (2026-10-09 · «una neurona por dispositivo»)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Por qué hace falta. Cada MEDIO (Chrome en localhost:9002, Chrome en Vercel, la app nativa, la
 * app instalada en iOS, el navegador de Claude…) tiene su propio almacenamiento y, con él, su
 * propio id de neurona. Medido en la cuenta de Alex el 2026-10-09: 10 filas en `neuron_devices`
 * para 4 aparatos reales — la Mac M1 aparecía 4 veces, cada Android 2 veces, más una fila vacía.
 *
 * Aquí se decide, SIN red y sin adivinar, si dos fichas de capacidades describen el mismo
 * aparato. Solo se comparan rasgos del HARDWARE que todos los medios del aparato ven igual
 * (sistema, núcleos, memoria, modelo de GPU, pantalla, nombre de máquina); los del medio
 * (navegador, almacenamiento de ese origen, si es app instalada) no cuentan.
 *
 * Módulo PURO (sin DOM, sin Supabase): lo usan el reconocimiento automático, la lista de
 * «¿Es esta una neurona que ya configuraste?» y la fusión del panel de Neuronas.
 */

/** Lo mínimo de una ficha de capacidades que mira la huella (subconjunto de NeuronCapabilities). */
export interface CapsHuella {
  platform?: string;
  cores?: number | string;
  memoryGb?: number | string;
  gpuRenderer?: string;
  touch?: boolean | string;
  /** «AxB@dpr» con los lados ordenados (no cambia al girar el aparato). */
  pantalla?: string;
  /** Huella corta del nombre de máquina (app nativa o servidor local de la misma máquina). */
  maquina?: string;
}

/** Lo mínimo de una neurona para agrupar. */
export interface NeuronaHuella {
  id: string;
  name?: string;
  kind?: string;
  capabilities?: CapsHuella | null;
  last_seen_at?: string;
  created_at?: string;
}

export type FamiliaGpu = "apple" | "qualcomm" | "arm" | "intel" | "nvidia" | "amd" | "otra" | "desconocida";

export interface GpuNormalizada {
  /** Modelo comparable («apple m1», «adreno 730», «mali-g57 mc2»…) o undefined si está oculto. */
  modelo?: string;
  familia: FamiliaGpu;
  /** El navegador oculta el modelo («Apple GPU» en Safari/WebKit) o no hay dato. */
  enmascarada: boolean;
}

const GENERICOS = new Set(["apple gpu", "gpu", "webkit webgl", "mali", "adreno", "powervr", "generic renderer"]);

function familiaDe(s: string): FamiliaGpu {
  if (/apple|\bm[1-9]\b/.test(s)) return "apple";
  if (/adreno|qualcomm/.test(s)) return "qualcomm";
  if (/mali|\barm\b|immortalis/.test(s)) return "arm";
  if (/intel/.test(s)) return "intel";
  if (/nvidia|geforce|rtx|gtx|quadro/.test(s)) return "nvidia";
  if (/amd|radeon/.test(s)) return "amd";
  return s ? "otra" : "desconocida";
}

/**
 * Normaliza el «renderer» de WebGL a un modelo comparable entre navegadores y versiones:
 *   «ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)» → «apple m1»
 *   «ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)» y «Adreno (TM) 730» → «adreno 730»
 *   «ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)» y «Mali-G57 MC2» → «mali-g57 mc2»
 *   «Apple GPU» (Safari, WKWebView) → enmascarada, familia apple
 */
export function normalizarGpu(renderer?: string | null): GpuNormalizada {
  const crudo = String(renderer ?? "").trim().toLowerCase();
  if (!crudo) return { familia: "desconocida", enmascarada: true };
  let s = crudo;
  const angle = s.match(/^angle \((.*)\)$/);
  if (angle) {
    const partes = angle[1].split(",").map((p) => p.trim()).filter(Boolean);
    // La 1.ª parte es el fabricante; el modelo es la siguiente que no sea versión de API.
    const modelo = partes.slice(1).find((p) => !/^(opengl|direct3d|vulkan|metal|unspecified|d3d)/.test(p)) ?? partes[1] ?? partes[0];
    s = modelo ?? s;
  }
  s = s
    .replace(/angle metal renderer:\s*/g, "")
    .replace(/\((tm|r)\)/g, "")
    .replace(/\b(opengl es|opengl|direct3d\d*|vs_\d_\d|ps_\d_\d|d3d\d+|vulkan [\d.]+|unspecified version)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const familia = familiaDe(s || crudo);
  if (!s || GENERICOS.has(s)) return { familia, enmascarada: true };
  return { modelo: s, familia, enmascarada: false };
}

/** Familia de sistema: dos sistemas de familias distintas nunca son el mismo aparato. */
export function familiaSistema(platform?: string): string {
  const p = String(platform ?? "").toLowerCase();
  if (p.includes("android")) return "android";
  if (p === "ios" || p.includes("iphone")) return "ios";
  if (p.includes("ipad")) return "ipados";
  if (p.includes("mac")) return "macos";
  if (p.includes("windows")) return "windows";
  if (p.includes("linux")) return "linux";
  return p || "desconocido";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export type Parecido = "mismo" | "probable" | "posible" | "distinto";

export interface Comparacion {
  parecido: Parecido;
  /** Por qué, en palabras (para enseñarlo). */
  motivos: string[];
}

/** ¿La fila no dice nada del aparato? (fila «fantasma»: solo id, dueño y latido). */
export function esFichaVacia(n: NeuronaHuella): boolean {
  const c = n.capabilities ?? {};
  return !n.name && !c.platform && !c.gpuRenderer && num(c.cores) === undefined;
}

/**
 * Compara dos fichas. Reglas (cada contradicción de hardware descarta):
 *  · familias de sistema distintas → distinto;
 *  · nombre de máquina igual → mismo; distinto → distinto;
 *  · núcleos o memoria distintos (si ambos lo dicen) → distinto;
 *  · modelos de GPU visibles distintos, o familias de GPU distintas → distinto;
 *  · pantalla distinta en un móvil/tableta → distinto (en un ordenador hay monitores externos);
 *  · mismo modelo de GPU + mismos núcleos (+ pantalla o memoria iguales si se saben) → mismo;
 *  · GPU oculta en uno (WebKit) de la misma familia + mismos núcleos → probable (más pantalla → mismo);
 *  · sin contradicciones pero con pocos datos → posible.
 */
export function compararHuellas(a: NeuronaHuella, b: NeuronaHuella): Comparacion {
  const motivos: string[] = [];
  const ca = a.capabilities ?? {};
  const cb = b.capabilities ?? {};
  if (esFichaVacia(a) || esFichaVacia(b)) return { parecido: "distinto", motivos: ["una de las dos no tiene datos del aparato"] };

  const sa = familiaSistema(ca.platform);
  const sb = familiaSistema(cb.platform);
  if (sa !== sb) return { parecido: "distinto", motivos: [`sistemas distintos (${ca.platform ?? "?"} / ${cb.platform ?? "?"})`] };
  motivos.push(`mismo sistema (${ca.platform})`);

  if (ca.maquina && cb.maquina) {
    if (ca.maquina === cb.maquina) return { parecido: "mismo", motivos: [...motivos, "mismo nombre de máquina"] };
    return { parecido: "distinto", motivos: [...motivos, "nombre de máquina distinto"] };
  }

  const na = num(ca.cores);
  const nb = num(cb.cores);
  if (na && nb && na !== nb) return { parecido: "distinto", motivos: [...motivos, `núcleos distintos (${na} / ${nb})`] };
  const ma = num(ca.memoryGb);
  const mb = num(cb.memoryGb);
  if (ma && mb && ma !== mb) return { parecido: "distinto", motivos: [...motivos, `memoria distinta (${ma} / ${mb} GB)`] };

  const ga = normalizarGpu(ca.gpuRenderer);
  const gb = normalizarGpu(cb.gpuRenderer);
  if (!ga.enmascarada && !gb.enmascarada && ga.modelo !== gb.modelo) {
    return { parecido: "distinto", motivos: [...motivos, `GPU distinta (${ga.modelo} / ${gb.modelo})`] };
  }
  if (ga.familia !== "desconocida" && gb.familia !== "desconocida" && ga.familia !== gb.familia) {
    return { parecido: "distinto", motivos: [...motivos, `GPU de otra familia (${ga.familia} / ${gb.familia})`] };
  }

  const movil = ["android", "ios", "ipados"].includes(sa);
  const pa = typeof ca.pantalla === "string" ? ca.pantalla : undefined;
  const pb = typeof cb.pantalla === "string" ? cb.pantalla : undefined;
  if (pa && pb && pa !== pb && movil) return { parecido: "distinto", motivos: [...motivos, `pantalla distinta (${pa} / ${pb})`] };
  const pantallaIgual = !!(pa && pb && pa === pb);

  const nucleosIguales = !!(na && nb && na === nb);
  if (nucleosIguales) motivos.push(`${na} núcleos`);
  if (ma && mb) motivos.push(`${ma} GB de memoria`);
  if (pantallaIgual) motivos.push(`pantalla ${pa}`);

  if (!ga.enmascarada && !gb.enmascarada && ga.modelo === gb.modelo) {
    motivos.push(`misma GPU (${ga.modelo})`);
    if (nucleosIguales && (pantallaIgual || (ma && mb) || !movil)) return { parecido: "mismo", motivos };
    return { parecido: "probable", motivos };
  }
  if ((ga.enmascarada || gb.enmascarada) && ga.familia === gb.familia && ga.familia !== "desconocida" && nucleosIguales) {
    motivos.push(`GPU ${ga.familia} (un navegador oculta el modelo)`);
    return { parecido: pantallaIgual ? "mismo" : "probable", motivos };
  }
  return { parecido: "posible", motivos };
}

/** Un aparato físico con todas las neuronas (filas) que lo representan. */
export interface GrupoAparato<N extends NeuronaHuella = NeuronaHuella> {
  /** La neurona que se queda (la más configurada / antigua). */
  principal: N;
  /** Todas, la principal primero. */
  neuronas: N[];
  /** El parecido más débil que unió el grupo («mismo» o «probable»). */
  certeza: "mismo" | "probable";
  motivos: string[];
}

/** Puntos para elegir la neurona que se queda: nombre propio, antigüedad y actividad. */
function puntosPrincipal(n: NeuronaHuella, nombrados: ReadonlySet<string>): number {
  let p = 0;
  if (nombrados.has(n.id)) p += 4;
  const nombre = String(n.name ?? "");
  if (nombre && !/^(💻|📱|🖥️)?\s*(macos|android|ios|ipados|windows|linux)(\s*·.*)?$/i.test(nombre.trim())) p += 2; // nombre puesto a mano
  const creada = Date.parse(n.created_at ?? "");
  // La más antigua suma hasta medio punto: suele ser la que la persona configuró primero.
  if (Number.isFinite(creada)) p += Math.min(1, Math.max(0, (Date.now() - creada) / (365 * 86_400_000))) * 0.5;
  const visto = Date.parse(n.last_seen_at ?? "");
  if (Number.isFinite(visto) && Date.now() - visto < 7 * 86_400_000) p += 1;
  return p;
}

/**
 * Agrupa las neuronas de la cuenta por aparato físico. Dos se unen si su parecido es «mismo» o
 * «probable» y, además, la unión no junta dentro de un grupo a dos que se contradicen (si A~B y
 * B~C pero A y C son «distinto», C no entra). Devuelve solo los grupos con ≥ 2 neuronas.
 * `nombrados`: ids a los que la persona les puso nombre (prefs); pesan para elegir la principal.
 */
export function agruparPorAparato<N extends NeuronaHuella>(neuronas: readonly N[], nombrados: ReadonlySet<string> = new Set()): GrupoAparato<N>[] {
  const llenas = neuronas.filter((n) => n && n.id && !esFichaVacia(n));
  const grupos: { miembros: N[]; certeza: "mismo" | "probable"; motivos: string[] }[] = [];
  for (const n of llenas) {
    let mejor: { g: (typeof grupos)[number]; p: "mismo" | "probable"; motivos: string[] } | null = null;
    for (const g of grupos) {
      const cmp = g.miembros.map((m) => compararHuellas(n, m));
      if (cmp.some((c) => c.parecido === "distinto" || c.parecido === "posible")) continue;
      const p = cmp.every((c) => c.parecido === "mismo") ? "mismo" : "probable";
      if (!mejor || (p === "mismo" && mejor.p !== "mismo")) mejor = { g, p, motivos: cmp[0]?.motivos ?? [] };
    }
    if (mejor) {
      mejor.g.miembros.push(n);
      if (mejor.p === "probable") mejor.g.certeza = "probable";
      if (mejor.g.motivos.length === 0) mejor.g.motivos = mejor.motivos;
    } else {
      grupos.push({ miembros: [n], certeza: "mismo", motivos: [] });
    }
  }
  return grupos
    .filter((g) => g.miembros.length >= 2)
    .map((g) => {
      const orden = [...g.miembros].sort((x, y) => puntosPrincipal(y, nombrados) - puntosPrincipal(x, nombrados));
      return { principal: orden[0], neuronas: orden, certeza: g.certeza, motivos: g.motivos };
    });
}

/**
 * ¿A qué aparato de la cuenta pertenece ESTE medio? Compara su ficha con las demás neuronas y
 * devuelve los aparatos candidatos ordenados (los «mismo» primero). Para reconocer el aparato
 * sin preguntar basta con que haya EXACTAMENTE un candidato y sea «mismo».
 */
export interface CandidatoAparato<N extends NeuronaHuella = NeuronaHuella> {
  /** La neurona del aparato que se adoptaría (la principal de su grupo). */
  neurona: N;
  /** Las demás filas del mismo aparato (otros medios ya registrados). */
  otras: N[];
  parecido: Exclude<Parecido, "distinto">;
  motivos: string[];
}

export function candidatosParaEsteMedio<N extends NeuronaHuella>(
  propia: NeuronaHuella,
  otras: readonly N[],
  nombrados: ReadonlySet<string> = new Set(),
): CandidatoAparato<N>[] {
  const ajenas = otras.filter((n) => n.id !== propia.id && !esFichaVacia(n));
  const grupos = agruparPorAparato(ajenas, nombrados);
  const enGrupo = new Set(grupos.flatMap((g) => g.neuronas.map((n) => n.id)));
  const unidades: { principal: N; neuronas: N[] }[] = [
    ...grupos.map((g) => ({ principal: g.principal, neuronas: g.neuronas })),
    ...ajenas.filter((n) => !enGrupo.has(n.id)).map((n) => ({ principal: n, neuronas: [n] })),
  ];
  const rango: Record<Exclude<Parecido, "distinto">, number> = { mismo: 0, probable: 1, posible: 2 };
  const out: CandidatoAparato<N>[] = [];
  for (const u of unidades) {
    const cmp = u.neuronas.map((n) => compararHuellas(propia, n));
    // Una contradicción con cualquiera de sus medios descarta el aparato entero.
    if (cmp.some((c) => c.parecido === "distinto")) continue;
    // El parecido del aparato es el MEJOR con alguno de sus medios (ese medio comparte navegador o pantalla).
    const mejor = cmp.reduce((acc, c) => (rango[c.parecido as Exclude<Parecido, "distinto">] < rango[acc.parecido as Exclude<Parecido, "distinto">] ? c : acc), cmp[0]);
    out.push({
      neurona: u.principal,
      otras: u.neuronas.filter((n) => n.id !== u.principal.id),
      parecido: mejor.parecido as Exclude<Parecido, "distinto">,
      motivos: mejor.motivos,
    });
  }
  return out.sort((x, y) => rango[x.parecido] - rango[y.parecido] || Date.parse(y.neurona.last_seen_at ?? "0") - Date.parse(x.neurona.last_seen_at ?? "0"));
}

/** El aparato que se puede adoptar sin preguntar: un único candidato y «mismo». */
export function reconocimientoSeguro<N extends NeuronaHuella>(candidatos: readonly CandidatoAparato<N>[]): CandidatoAparato<N> | null {
  const seguros = candidatos.filter((c) => c.parecido === "mismo");
  return seguros.length === 1 ? seguros[0] : null;
}

/** «390x844@3»: lados ordenados (girar no cambia la huella) y dpr con 2 decimales como mucho. */
export function pantallaDe(ancho?: number, alto?: number, dpr?: number): string | undefined {
  const w = num(ancho);
  const h = num(alto);
  if (!w || !h) return undefined;
  const [a, b] = [Math.round(Math.min(w, h)), Math.round(Math.max(w, h))];
  const d = num(dpr) ?? 1;
  return `${a}x${b}@${Math.round(d * 100) / 100}`;
}
