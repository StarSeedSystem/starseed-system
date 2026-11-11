/**
 * video-datos/reparto — voz y vídeo comparten UN enlace estrecho: la voz primero, el vídeo con lo que sobra (LLA1111B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (sin navegador ni red; el reloj y las colas se pasan como números).
 *
 * El problema que arregla (prueba 35): el Bluetooth saca SIEMPRE antes su carril de voz que el de vídeo, escribe en
 * «parada y espera» (cada escritura espera su acuse, ≈ 42 ms) y agrupa en una escritura lo que haya en UN carril. Con el
 * micro abierto entra voz cada 60 ms y cada escritura de voz tarda casi eso: el carril de voz nunca está vacío cuando el
 * Bluetooth elige, y el carril de vídeo no sale NUNCA (en la Mac, «kbps=0 motivos=cola-video:…» toda la llamada).
 * Además la sesión de vídeo solo mandaba con menos de 2 KiB de voz en cola: todo o nada.
 *
 * Cómo se reparte ahora:
 *  · Un solo carril. Los fragmentos de vídeo van al carril de la voz, detrás de la voz que ya espera, y la voz nueva
 *    entra directa (nunca espera a la sesión de vídeo). Así cada escritura del Bluetooth lleva voz Y vídeo juntos.
 *  · Modelo del enlace medido: cada escritura acusada (lo que entró en el carril menos lo que queda) da un par
 *    (bytes, duración). Con ellos se ajusta `duración = R + bytes / C` (R: el acuse fijo, ≈ 42 ms en el Bluetooth de
 *    Alex; C: lo que se serializa por ms). En parada y espera, con escrituras cada T ms, cabe `C·(1 − R/T)` por ms: lo
 *    que la voz no usa de eso, con T = `CICLO_OBJETIVO_MS`, es el presupuesto del vídeo. Un canal sin acuse (R ≈ 0) da
 *    toda su capacidad; uno sin cola medible no da pares y no limita.
 *  · Ventana: lo que cabe en una escritura de T ms, `(T − R)·C` bytes (entre 300 B y 1,5 KiB). El vídeo solo se mete
 *    mientras el carril (que cuenta hasta el acuse lo que está en vuelo) tiene menos de DOS ventanas: la escritura en
 *    vuelo y la siguiente. Un paquete de voz que llega espera, como mucho, la escritura en vuelo y sale en la siguiente:
 *    un trozo de vídeo nunca le pone delante más de una escritura. Cada fragmento cabe en una ventana (no en media: la
 *    cabecera de cada fragmento, ≈ 140 B con el id de la llamada, pesaba un 30 % con trozos tan pequeños).
 *  · Ritmo: una cubeta de fichas a la tasa objetivo del vídeo. Un fotograma clave grande sale a trozos a esa tasa,
 *    nunca de golpe (los siguientes diferenciales esperan; el que no cabe se tira y cuenta como «saliendo»).
 *  · Control (cada segundo): baja al presupuesto si lo pasa, ×0,6 si la voz espera más de `RETRASO_ALTO_MS` en el
 *    carril, ×0,7 si el receptor informa de pérdida; sube +15 % (mínimo 4 kbps) si la voz espera poco y el vídeo quiere
 *    más. El escalón (fps primero, luego tamaño) sale del objetivo con `PERFILES_VIDEO_REPARTO`.
 *  · Pausa con histéresis: si el objetivo queda por debajo del suelo (`SUELO_KBPS`, ≈ 1 fotograma por segundo de
 *    160×120) 3 s seguidos, el vídeo se pausa a propósito (el último fotograma se queda en pantalla y el otro lado lo
 *    sabe). Se reanuda solo, con un clave, cuando la voz sola deja el carril holgado `CALMA_REANUDAR_S` seguidos (y al
 *    menos `PAUSA_MINIMA_S` en pausa); si vuelve a pausarse antes de `REINCIDENCIA_S`, la calma pedida se duplica
 *    (hasta 40 s): no parpadea entre estados.
 *
 * LLA1111Q — lo que el enlace de verdad dice, no lo que suponía el simulador (prueba 37, Mac ↔ tableta):
 *  · El modelo se ajusta con la DURACIÓN DE CADA ESCRITURA tal como la mide el emisor (`escrituras` del transporte: de
 *    entregarla a la app nativa a su acuse). Antes se deducía de lo que bajaba la cola entre muestras, y en el Bluetooth
 *    de verdad ese intervalo lleva dentro la espera por fichas de la cubeta del emisor (7,2 escrituras/s): con escrituras
 *    de 300 B, «bytes / (tiempo − 42 ms)» daba 8–35 kb/s en un enlace que mide 192–380 kb/s con mensajes grandes, la
 *    ventana se quedaba en 300 B, las escrituras pequeñas daban poco… y el modelo lo leía como poca capacidad.
 *  · El ritmo de escrituras que el emisor se permite (`escriturasPorS`, de lo que el otro anuncia que admite) es parte
 *    del modelo (`cicloMinMs`): cada escritura cuesta una ficha sea del tamaño que sea, así que el ciclo es
 *    `max(CICLO_OBJETIVO_MS, cicloMinMs)` y la ventana `(ciclo − R)·C` crece hasta llenarlo (ya no 300 B con 4 KB de sitio).
 *  · Con solo voz (tamaños parecidos) C es lo que mide la app nativa con sus mensajes grandes (`nativoKbps`, la línea
 *    `l2cap-kbps`), en vivo; sin ella, lo anunciado. Ya no hay acuse fijo de 42 ms en ningún cálculo con medidas.
 *  · Los umbrales de espera de la voz escalan con el ciclo: con 139 ms por escritura, que la voz espere dos ciclos es lo
 *    normal, no un atasco.
 */

import { reservaVozKbps } from "@/lib/llamadas/voz-datos/reserva"; // VOZ1111J

/* ───────────────────────── Constantes ───────────────────────── */

/** Suelo del vídeo: por debajo no cabe ni ≈ 1 fotograma por segundo de 160×120 (con su clave cada 4 s). */
export const SUELO_KBPS = 12;
/** Ciclo de escritura al que se reparte: cada escritura (voz + vídeo) no debería tardar más (la voz espera ≤ 1 ciclo). */
export const CICLO_OBJETIVO_MS = 100;
/**
 * Con la voz esperando más que esto en el carril (edad del byte más viejo), el vídeo baja. Con el vídeo dentro de su
 * ventana el byte más viejo espera, como mucho, la escritura en vuelo y la siguiente (≈ 2 ciclos); más de 2,6 ciclos es
 * que el enlace ya no da ni para eso.
 */
export const RETRASO_ALTO_MS = 260;
/** Con la voz esperando menos que esto (≈ 2 ciclos: lo normal con la ventana llena), el vídeo puede subir. */
export const RETRASO_BAJO_MS = 210;
/** Con reparto, un fotograma clave como mucho cada esto (si se pierde algo, el receptor pide uno). */
export const CLAVE_MIN_MS = 5000;
/** Segundos seguidos por debajo del suelo antes de pausar. */
export const BAJO_SUELO_PARA_PAUSAR_S = 3;
/** Segundos seguidos con el carril holgado (solo voz) para reanudar. */
export const CALMA_REANUDAR_S = 5;
export const PAUSA_MINIMA_S = 4;
/** Si se vuelve a pausar antes de esto tras reanudar, la calma pedida se duplica. */
export const REINCIDENCIA_S = 20;
export const CALMA_MAXIMA_S = 40;
/**
 * LLA1111Q: tras reanudar, el vídeo va `PRUEBA_S` segundos al suelo sin subir: es una prueba. Con solo voz en el carril el
 * modelo no puede separar acuse y capacidad (tamaños iguales) y lo que dice puede ser viejo (la capacidad que anuncia la
 * radio se mide con mensajes grandes, cada ≈ 30 s): la prueba lo comprueba con poco, y si la voz se atasca durante ella
 * el vídeo vuelve a la pausa AL MOMENTO (con la calma doblada), sin tres segundos más de vídeo encima de la voz.
 */
export const PRUEBA_S = 3;
/** Pérdida de fotogramas que informa el receptor a partir de la cual se baja. */
export const PERDIDA_RECEPTOR_ALTA = 0.15;
export const VENTANA_MIN_BYTES = 300;
/**
 * LLA1111Q: hasta 2,25 KiB por escritura (antes 1,5). Tope por el carril: el vídeo puede tener DOS ventanas en él
 * (la escritura en vuelo y la siguiente) y el Bluetooth tira lo más viejo del carril de voz al pasar de 6 KiB
 * (`MAX_COLA_VOZ_BLE`): 2 × 2304 deja 1,5 KiB para la voz que llega mientras tanto.
 */
export const VENTANA_MAX_BYTES = 2304;
/** Profundidad de la cubeta de fichas (ms a la tasa objetivo). */
export const CUBETA_MS = 400;
/** Sin medida de escrituras se supone esto (bytes por ms ≈ 160 kb/s, lo que midió el canal rápido L2CAP). */
export const BYTES_POR_MS_SUPUESTOS = 20;
/** Pares (bytes, ms) que se recuerdan para el modelo. */
export const PARES_MODELO = 40;
/**
 * VOZ1111L: un par más viejo que esto sale del modelo en cuanto quedan `PARES_MINIMOS_FRESCOS` más nuevos. Con 40 pares
 * y la voz ligera (≈ 5–8 escrituras por segundo) el modelo tardaba 5–8 s en olvidar el carril de antes de una caída o
 * de su vuelta: la ventana del vídeo seguía con la capacidad vieja y el vídeo, en pausa.
 */
export const EDAD_PAR_MS = 1500;
/** VOZ1111L: acuse fijo de una escritura del Bluetooth (medido en el de Alex; `ventanaBytes` supone lo mismo sin modelo). */
export const ACUSE_BLE_MS = 42;
export const PARES_MINIMOS_FRESCOS = 6;

/* ───────────────────────── Modelo del enlace ───────────────────────── */

/** Lo que tarda una escritura: `rMs + bytes / bytesPorMs`. */
export interface ModeloEnlace {
  rMs: number;
  bytesPorMs: number;
  /** De dónde salió: «ajuste» (pares variados), «supuesto» (C supuesta, R de los pares). */
  fuente: "ajuste" | "supuesto";
  /**
   * LLA1111Q: separación mínima entre escrituras que se permite el emisor (ms; 1000 / escrituras por segundo de su
   * cubeta). 0 o ausente: sin tope (un canal sin limitador, como el carril fijo del banco).
   */
  cicloMinMs?: number;
}

/** LLA1111Q: una escritura del carril tal como la midió el emisor (de entregarla a la app nativa a su acuse). */
export interface EscrituraCarril {
  /** Cuándo llegó el acuse (ms del mismo reloj que las muestras). */
  fin: number;
  /** Lo que tardó (ms): sin la espera por fichas, que es del emisor y no del enlace. */
  ms: number;
  /** Bytes de texto (en claro) que llevaba. */
  bytes: number;
}

/** LLA1111Q: el ciclo de escritura al que se reparte con ese modelo: el objetivo o el que permite el emisor. */
export function cicloEfectivoMs(m: ModeloEnlace | null | undefined): number {
  return Math.max(CICLO_OBJETIVO_MS, m?.cicloMinMs ?? 0);
}

/**
 * LLA1111Q: con la voz esperando más que esto, el vídeo baja. Sin limitador de escrituras, 260 ms (LLA1111B). Con él, dos
 * ciclos del emisor (278 ms con 7,2 escrituras/s): la voz que llega espera, como mucho, a la ficha de la siguiente
 * escritura y a esa escritura; más es que el vídeo ya le quita sitio. Siempre por debajo del umbral de atasco de la
 * escalera de la voz (2,5 ciclos): el vídeo cede ANTES de que la voz tenga que bajar.
 */
export function retrasoAltoMs(m: ModeloEnlace | null | undefined): number {
  return Math.max(RETRASO_ALTO_MS, Math.round(2 * cicloEfectivoMs(m)));
}

/** LLA1111Q: con la voz esperando menos que esto, el vídeo puede subir o volver (210 ms; 1,6 ciclos con limitador). */
export function retrasoBajoMs(m: ModeloEnlace | null | undefined): number {
  return Math.max(RETRASO_BAJO_MS, Math.round(1.6 * cicloEfectivoMs(m)));
}

/**
 * LLA1111Q: la espera de la voz con la que decide el reparto. Con limitador de escrituras, el percentil 90 de lo que
 * esperó lo acusado en cada escritura (el máximo de la ventana lo marca una sola escritura grande de otro carril —el
 * espejo del registro— o un acuse lento suelto). Sin limitador, el máximo, como en LLA1111B.
 */
export function esperaVozMs(r: ResumenEnlace): number {
  return r.modelo?.cicloMinMs && typeof r.esperaP90Ms === "number" ? r.esperaP90Ms : r.retrasoMaxMs;
}

/**
 * LLA1111Q: ventana del vídeo para su tasa: dos ciclos de lo que tiene que sacar (nunca más que `ventanaBytes`). Una
 * escritura no necesita llevar más vídeo que eso, y cuanto menos lleva, menos espera la voz que llega detrás.
 */
export function ventanaParaTasa(m: ModeloEnlace | null, anunciadoKbps: number | null | undefined, objetivoKbps: number): number {
  const porCiclo = ((2 * Math.max(0, objetivoKbps)) / 8) * cicloEfectivoMs(m);
  return Math.round(Math.max(VENTANA_MIN_BYTES, Math.min(ventanaBytes(m, anunciadoKbps), porCiclo)));
}

/**
 * Ajusta `ms = R + bytes/C` a los pares (bytes, ms) de escrituras con el carril ocupado. Si los tamaños apenas varían
 * (solo voz) no se puede separar R de C: se supone C (`bytesPorMsSupuestos`, lo anunciado) y R sale de la mediana.
 */
export function ajustarModelo(pares: ReadonlyArray<{ bytes: number; ms: number }>, bytesPorMsSupuestos: number = BYTES_POR_MS_SUPUESTOS, exigirAmplitud = false, duracionesExactas = false): ModeloEnlace | null {
  if (pares.length < 6) return null;
  if (duracionesExactas) return ajustarEscrituras(pares, bytesPorMsSupuestos); // LLA1111Q
  const n = pares.length;
  const mb = pares.reduce((a, p) => a + p.bytes, 0) / n;
  const mm = pares.reduce((a, p) => a + p.ms, 0) / n;
  let vb = 0;
  let cv = 0;
  for (const p of pares) {
    vb += (p.bytes - mb) ** 2;
    cv += (p.bytes - mb) * (p.ms - mm);
  }
  const desv = Math.sqrt(vb / n);
  const supuesto = (): ModeloEnlace => {
    const c = Math.max(1, bytesPorMsSupuestos);
    // VOZ1111L: con escrituras aisladas de voz ligera, que R absorba la serialización hace creer que cabe de más en un carril
    // estrecho (40 kb/s con voz de 10 kb/s: «cabe» 47 kb/s → el vídeo volvía y se volvía a pausar). Se toma el acuse fijo
    // del Bluetooth (`ACUSE_BLE_MS`, el mismo que supone `ventanaBytes`) y la capacidad sale de la escritura típica.
    if (exigirAmplitud) {
      const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const ms = med(pares.map((p) => p.ms));
      const by = med(pares.map((p) => p.bytes));
      if (ms - ACUSE_BLE_MS > 2 && by / (ms - ACUSE_BLE_MS) < c) return { rMs: ACUSE_BLE_MS, bytesPorMs: Math.max(0.5, Math.round((by / (ms - ACUSE_BLE_MS)) * 10) / 10), fuente: "supuesto" };
    }
    const rs = pares.map((p) => p.ms - p.bytes / c).sort((a, b) => a - b);
    return { rMs: Math.round(Math.max(0, Math.min(250, rs[Math.floor(rs.length / 2)]))), bytesPorMs: Math.round(c * 10) / 10, fuente: "supuesto" };
  };
  if (mb <= 0 || desv / mb < 0.25 || vb <= 0) return supuesto();
  // VOZ1111L (`exigirAmplitud`, con escrituras aisladas): la pendiente solo se cree si los tamaños abarcan ≥ 25 ms de
  // serialización a lo anunciado. La voz sola (200–400 B) da diferencias de 10–20 ms, del orden del muestreo (20 ms), y su
  // pendiente salía al azar (≈ 60 kb/s en un carril de 160). Con vídeo en el carril (300 B–1,5 KiB) sí hay ajuste. Si no,
  // «supuesto»: la escritura típica dice cuánto tarda la voz y eso, con lo anunciado, da lo que cabe (como antes de VOZ1111J).
  if (exigirAmplitud) {
    const ord = pares.map((p) => p.bytes).sort((a, b) => a - b);
    const amplitud = ord[Math.floor(ord.length * 0.9)] - ord[Math.floor(ord.length * 0.1)];
    if (amplitud / Math.max(1, bytesPorMsSupuestos) < 25) return supuesto();
  }
  const b = cv / vb;
  if (!(b > 0)) return supuesto();
  const c = Math.max(1, Math.min(250, 1 / b));
  const r = Math.max(0, Math.min(250, mm - mb / c));
  return { rMs: Math.round(r), bytesPorMs: Math.round(c * 10) / 10, fuente: "ajuste" };
}

/**
 * LLA1111Q: el modelo con las duraciones que mide el emisor de cada escritura. La pendiente (C) solo se cree si explica la
 * variación: lo que separan los tamaños (p10–p90) a esa C debe ser al menos 3 veces lo que se desvían las escrituras de la
 * recta (mediana de |residuo|). En un canal sin ruido (el carril fijo del banco) basta cualquier variación y la recta es
 * exacta; en el Bluetooth de verdad el acuse va de 25 a 115 ms de una escritura a otra y la pendiente de escrituras de
 * 300–2000 B es ruido: entonces C es la que mide la radio con sus mensajes grandes (`cSupuesta`) y R la mediana de lo que
 * queda. La pendiente es robusta (mediana de las pendientes entre pares que difieren ≥ 50 B): un acuse lento no la tuerce.
 */
export function ajustarEscrituras(pares: ReadonlyArray<{ bytes: number; ms: number }>, cSupuesta: number): ModeloEnlace | null {
  const n = pares.length;
  if (n < 6) return null;
  const med = (xs: number[]) => {
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
  };
  const supuesto = (): ModeloEnlace => {
    const c = Math.max(0.5, cSupuesta);
    return { rMs: Math.round(Math.max(0, Math.min(250, med(pares.map((p) => p.ms - p.bytes / c))))), bytesPorMs: Math.round(c * 10) / 10, fuente: "supuesto" };
  };
  const pend: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const db = pares[j].bytes - pares[i].bytes;
      if (Math.abs(db) >= 50) pend.push((pares[j].ms - pares[i].ms) / db);
    }
  if (pend.length < 6) return supuesto();
  const bm = med(pend);
  if (!(bm > 0)) return supuesto();
  const c = Math.max(0.5, Math.min(250, 1 / bm));
  const r = med(pares.map((p) => p.ms - p.bytes / c));
  const desvio = med(pares.map((p) => Math.abs(p.ms - (r + p.bytes / c))));
  const tam = pares.map((p) => p.bytes).sort((a, b) => a - b);
  const separa = (tam[Math.floor(0.9 * (n - 1))] - tam[Math.floor(0.1 * (n - 1))]) / c;
  if (separa < Math.max(2, 3 * desvio)) return supuesto();
  return { rMs: Math.round(Math.max(0, Math.min(250, r))), bytesPorMs: Math.round(c * 10) / 10, fuente: "ajuste" };
}

/**
 * Lo que cabe por ms (voz + vídeo) escribiendo cada `cicloMs` con ese modelo, en kbps. LLA1111Q: el ciclo nunca es más
 * corto que el que se permite el emisor (`cicloMinMs`): con 7,2 escrituras/s, cada una puede llevar `(139 − R)·C` bytes.
 */
export function kbpsMaxConCiclo(m: ModeloEnlace, cicloMs: number = CICLO_OBJETIVO_MS): number {
  const t = Math.max(cicloMs, m.cicloMinMs ?? 0);
  return Math.max(0, Math.round(8 * m.bytesPorMs * (1 - m.rMs / t)));
}

/**
 * LLA1111Q: acuse por escritura que se toma mientras aún no hay 6 escrituras medidas (los primeros cientos de ms). Es
 * solo el arranque: en cuanto hay medidas manda el modelo.
 */
export const ACUSE_ARRANQUE_MS = 50;

/** Bytes que puede llevar el carril delante de la voz: lo que cabe en una escritura de un ciclo. */
export function ventanaBytes(m: ModeloEnlace | null, anunciadoKbps?: number | null): number {
  const c = m ? m.bytesPorMs : typeof anunciadoKbps === "number" && anunciadoKbps > 0 ? anunciadoKbps / 8 : BYTES_POR_MS_SUPUESTOS;
  const r = m ? m.rMs : ACUSE_ARRANQUE_MS;
  return Math.round(Math.max(VENTANA_MIN_BYTES, Math.min(VENTANA_MAX_BYTES, (cicloEfectivoMs(m) - r) * c)));
}

/** Cabecera de un fragmento de vídeo en texto (JSON con el id de la llamada), por lo alto. */
export const CABECERA_FRAGMENTO_BYTES = 140;

/** Bytes crudos por fragmento para esa ventana: el fragmento en texto (base64 ≈ 4/3 más la cabecera) cabe en ella. */
export function mtuParaVentana(ventana: number): number {
  return Math.max(200, Math.floor(((ventana - CABECERA_FRAGMENTO_BYTES) * 3) / 4));
}

/* ───────────────────────── Medidor del carril ───────────────────────── */

/** Lo que se mide del carril en cada muestra (cada ~20 ms). */
export interface MuestraCarril {
  /** Bytes en el carril aún sin acuse (`colaVozBytes`). */
  cola: number;
  /** Bytes que entraron en el carril desde que se abrió (voz + vídeo, `bytesEntrados`). */
  entrados: number;
  /** LLA1111Q: las últimas escrituras del carril medidas por el emisor (si el transporte las da). */
  escrituras?: ReadonlyArray<EscrituraCarril> | null;
  /** LLA1111Q: escrituras por segundo que se permite el emisor (null: sin limitador o no se sabe). */
  escriturasPorS?: number | null;
  /** LLA1111Q: lo último que midió la app nativa con mensajes grandes (`l2cap-kbps`), kb/s (null: sin medida). */
  nativoKbps?: number | null;
}

/** LLA1111Q: lo que un transporte de voz puede decir de su carril (todo opcional). */
export interface FuenteCarril {
  colaVozBytes?(): number;
  bytesEntrados?(): number;
  escrituras?(): ReadonlyArray<EscrituraCarril> | null;
  escriturasPorS?(): number | null;
  capacidadKbps?(): number | null;
}

/** LLA1111Q: una muestra del carril con todo lo que el enlace sabe decir de sí mismo (nunca lanza). */
export function muestraDeTransporte(t: FuenteCarril): MuestraCarril {
  const leer = <T>(f: () => T, defecto: T): T => {
    try {
      return f();
    } catch {
      return defecto;
    }
  };
  return {
    cola: leer(() => t.colaVozBytes?.() ?? 0, 0),
    entrados: leer(() => t.bytesEntrados?.() ?? 0, 0),
    escrituras: t.escrituras ? leer(() => t.escrituras!(), null) : undefined,
    escriturasPorS: t.escriturasPorS ? leer(() => t.escriturasPorS!(), null) : undefined,
    nativoKbps: leer(() => t.capacidadKbps?.() ?? null, null),
  };
}

export interface ResumenEnlace {
  /** El modelo medido (null: aún sin escrituras con el carril ocupado, o un canal sin cola medible). */
  modelo: ModeloEnlace | null;
  /** Lo que cabe (voz + vídeo) con escrituras de un ciclo objetivo, kbps (null: sin modelo). */
  maxKbps: number | null;
  /** Todo lo que se acusó en la ventana, por segundo (kbps). */
  entregadoKbps: number;
  /** Voz que entró en la ventana (kbps): lo que entró menos el vídeo que metí yo. */
  vozKbps: number;
  /** Vídeo que metí en el carril en la ventana (kbps). */
  videoKbps: number;
  /** Mayor espera del byte más viejo del carril en la ventana (ms): lo que espera la voz. */
  retrasoMaxMs: number;
  /** Fracción del tiempo con el carril ocupado. */
  ocupacion: number;
  /** LLA1111Q: percentil 90 de lo que esperó en el carril lo acusado en cada escritura (ms; null: ninguna acusada). */
  esperaP90Ms?: number | null;
  /** LLA1111Q: escrituras acusadas en la ventana, por segundo, y bytes medios de cada una. */
  escriturasPorS?: number;
  bytesPorEscritura?: number;
  /** LLA1111Q: lo que mide la app nativa (kb/s) cuando se sabe: para ver en una línea si el modelo y la radio discrepan. */
  nativoKbps?: number | null;
}

/**
 * Mide el carril compartido a partir de dos contadores que el enlace ya tiene: lo que entró y lo que queda sin acuse.
 * acusado = entrados − cola (exacto: solo la voz y el vídeo de la llamada entran en ese carril).
 */
export class MedidorEnlace {
  private hist: Array<{ t: number; e: number }> = [];
  private ultimo: { t: number; acusado: number; entrados: number; cola: number } | null = null;
  private desde = 0;
  private acusadoVentana = 0;
  private ocupadoMs = 0;
  private entradosVentana = 0;
  private videoVentana = 0;
  private retrasoMax = 0;
  private acusadoMax = 0;
  private ultimaEscritura = 0;
  private ocupadoDesdeEscritura = false;
  /** VOZ1111L: cuándo empezó la escritura en vuelo si el carril estaba vacío antes (0: no hay). */
  private inicioAislada = 0;
  private pares: Array<{ bytes: number; ms: number; t?: number; aislada?: boolean }> = [];
  /* LLA1111Q: lo que el emisor mide de cada escritura, su tope de escrituras y lo que mide la app nativa. */
  private ultimaFinEscritura = -Infinity;
  private conEscrituras = false;
  private cicloMin = 0;
  private nativo: number | null = null;
  private esperasAcuse: number[] = [];
  private escriturasVentana = 0;
  private bytesEscriturasVentana = 0;
  /** Edad del byte más viejo del carril ahora (ms). */
  retrasoMs = 0;
  /** El último modelo calculado. */
  modelo: ModeloEnlace | null = null;

  /**
   * `aisladas` (VOZ1111L): contar también las escrituras que empiezan con el carril vacío. Sí para el vídeo (en pausa solo
   * va la voz, ligera, y sin ellas no ve volver la capacidad). No para la escalera de la voz: con paquetes de tamaño casi
   * fijo el ajuste cae en «supuesto» (C = lo anunciado) y en un carril estrecho le hacía creer que cabía el escalón de
   * arriba (subía, descartaba y bajaba: huecos de 60 ms). La voz sigue midiendo con las escrituras seguidas, como antes.
   */
  constructor(
    private readonly bytesPorMsSupuestos: number = BYTES_POR_MS_SUPUESTOS,
    private readonly opc: { aisladas?: boolean } = {},
  ) {}

  muestra(ahora: number, m: MuestraCarril): void {
    // LLA1111Q: las escrituras que midió el emisor (cada una una vez) son los pares del modelo: duración exacta, sin la
    // espera por fichas. Con ellas no se deducen pares de la cola.
    if (m.escrituras) {
      for (const e of m.escrituras) {
        if (!(e.fin > this.ultimaFinEscritura) || !(e.ms > 0) || !(e.bytes > 0)) continue;
        this.ultimaFinEscritura = e.fin;
        this.conEscrituras = true;
        this.pares.push({ bytes: e.bytes, ms: e.ms, t: ahora });
        if (this.pares.length > PARES_MODELO) this.pares.shift();
        this.escriturasVentana++;
        this.bytesEscriturasVentana += e.bytes;
      }
    }
    if (m.escriturasPorS !== undefined) this.cicloMin = typeof m.escriturasPorS === "number" && m.escriturasPorS > 0 ? 1000 / m.escriturasPorS : 0;
    if (typeof m.nativoKbps === "number" && m.nativoKbps > 0) this.nativo = m.nativoKbps;
    const cola = Math.max(0, m.cola);
    const acusado = Math.max(this.acusadoMax, m.entrados - cola);
    this.acusadoMax = acusado;
    if (!this.desde) this.desde = ahora;
    const prev = this.ultimo;
    if (prev) {
      const dt = Math.max(0, ahora - prev.t);
      const dAc = Math.max(0, acusado - prev.acusado);
      this.acusadoVentana += dAc;
      this.entradosVentana += Math.max(0, m.entrados - prev.entrados);
      // Tiempo ocupado: el carril tenía algo al principio o al final del intervalo (un enlace sin cola medible, como
      // un canal WebRTC, nunca cuenta como ocupado: sin medida no hay modelo ni techo).
      if (prev.cola > 0 || cola > 0) this.ocupadoMs += dt;
      if (prev.cola <= 0) this.ocupadoDesdeEscritura = false;
      // VOZ1111L: el carril estaba vacío y entró algo que aún no se acusa: una escritura AISLADA empieza ahora (a mitad
      // del intervalo, ± 10 ms). Su duración también vale para el modelo. Sin esto solo contaban las escrituras seguidas
      // y, con la voz ligera de VOZ1111J en un carril holgado, no entraba ningún par nuevo: el modelo se quedaba con lo
      // medido durante la caída y el vídeo seguía en pausa ~24 s después de volver la capacidad.
      if (this.opc.aisladas !== false && prev.cola <= 0 && cola > 0 && dAc === 0 && m.entrados > prev.entrados) this.inicioAislada = prev.t + dt / 2;
      if (dAc > 0) {
        // LLA1111Q: lo que esperó en el carril lo que acaba de acusarse (el byte más viejo pendiente, hasta ahora).
        if (prev.cola > 0) {
          this.esperasAcuse.push(this.retrasoMs + dt);
          if (this.esperasAcuse.length > 200) this.esperasAcuse.shift();
        }
        // Acabó una escritura (su acuse). Si el carril estuvo ocupado desde la anterior, su duración vale para el modelo.
        if (this.conEscrituras) {
          /* LLA1111Q: los pares ya vienen medidos por el emisor */
        } else if (this.ultimaEscritura && this.ocupadoDesdeEscritura) {
          this.pares.push({ bytes: dAc, ms: ahora - this.ultimaEscritura, t: ahora });
          if (this.pares.length > PARES_MODELO) this.pares.shift();
        } else if (this.inicioAislada && prev.t + dt / 2 > this.inicioAislada) {
          // VOZ1111L: escritura aislada, de que entró a su acuse (los dos a mitad de su intervalo: sin sesgo de muestreo).
          this.pares.push({ bytes: dAc, ms: prev.t + dt / 2 - this.inicioAislada, t: ahora, aislada: true });
          if (this.pares.length > PARES_MODELO) this.pares.shift();
        }
        this.inicioAislada = 0;
        // VOZ1111L: lo viejo se olvida si hay bastante nuevo.
        const corte = ahora - EDAD_PAR_MS;
        let viejos = 0;
        while (viejos < this.pares.length && (this.pares[viejos].t ?? ahora) < corte) viejos++;
        // Solo sin vídeo en el carril (en pausa): con el vídeo en marcha, la memoria de 40 pares de LLA1111B.
        if (this.videoVentana <= 0 && this.opc.aisladas !== false && viejos > 0 && this.pares.length - viejos >= PARES_MINIMOS_FRESCOS) this.pares.splice(0, viejos);
        this.ultimaEscritura = ahora;
        this.ocupadoDesdeEscritura = cola > 0;
      }
    }
    // Historia de lo que entró (para saber cuándo entró el byte más viejo que aún espera).
    const ult = this.hist[this.hist.length - 1];
    if (!ult || m.entrados > ult.e) this.hist.push({ t: ahora, e: m.entrados });
    while (this.hist.length > 1 && this.hist[0].e <= acusado && this.hist[1].e <= acusado) this.hist.shift();
    if (this.hist.length > 400) this.hist.splice(0, this.hist.length - 400);
    if (cola <= 0) this.retrasoMs = 0;
    else {
      // El primer registro con más bytes entrados que los acusados es cuando entró el byte más viejo pendiente.
      const h = this.hist.find((x) => x.e > acusado);
      this.retrasoMs = h ? Math.max(0, ahora - h.t) : 0;
    }
    this.retrasoMax = Math.max(this.retrasoMax, this.retrasoMs);
    this.ultimo = { t: ahora, acusado, entrados: m.entrados, cola };
  }

  /** LLA1111Q: separación mínima entre escrituras que se permite el emisor (0: sin tope o no se sabe todavía). */
  get cicloMinMs(): number {
    return Math.round(this.cicloMin);
  }

  /** Cuenta los bytes de vídeo que YO metí en el carril (para separar la voz de lo que entró). */
  videoMetido(bytes: number): void {
    this.videoVentana += Math.max(0, bytes);
  }

  /** Pares (bytes, ms) recientes, para pruebas y diagnóstico. */
  paresRecientes(): ReadonlyArray<{ bytes: number; ms: number }> {
    return this.pares;
  }

  /** Cierra la ventana (≈ 1 s) y devuelve el resumen. */
  cerrarVentana(ahora: number): ResumenEnlace {
    const ms = Math.max(1, ahora - (this.desde || ahora));
    const kbps = (b: number, t: number) => Math.round((b * 8) / Math.max(1, t));
    // VOZ1111L: las escrituras aisladas solo cuentan mientras NO entra vídeo (en pausa: para ver volver la capacidad). Con
    // el vídeo en marcha el modelo es el de LLA1111B (escrituras seguidas, «supuesto» con lo anunciado), que es lo que fija
    // su escalón en carriles de 80 kb/s.
    const soloVoz = this.videoVentana <= 0 && this.opc.aisladas !== false;
    // LLA1111Q: con duraciones del emisor, C supuesta = lo que mide la app nativa (en vivo) o lo anunciado, y la pendiente
    // solo se cree con tamaños que abarquen ≥ 25 ms de serialización (la voz sola no los tiene; con vídeo, sí).
    const cSup = this.nativo ? this.nativo / 8 : this.bytesPorMsSupuestos;
    const nuevo = this.conEscrituras ? ajustarModelo(this.pares, cSup, true, true) : ajustarModelo(soloVoz ? this.pares : this.pares.filter((p) => !p.aislada), this.bytesPorMsSupuestos, soloVoz);
    if (nuevo) this.modelo = nuevo;
    if (this.modelo) {
      const ciclo = Math.round(this.cicloMin);
      if (ciclo > 0) this.modelo = { ...this.modelo, cicloMinMs: ciclo };
      else if (this.modelo.cicloMinMs) this.modelo = { rMs: this.modelo.rMs, bytesPorMs: this.modelo.bytesPorMs, fuente: this.modelo.fuente };
    }
    const esp = [...this.esperasAcuse].sort((a, b) => a - b);
    const r: ResumenEnlace = {
      modelo: this.modelo,
      maxKbps: this.modelo ? kbpsMaxConCiclo(this.modelo) : null,
      entregadoKbps: kbps(this.acusadoVentana, ms),
      vozKbps: kbps(Math.max(0, this.entradosVentana - this.videoVentana), ms),
      videoKbps: kbps(this.videoVentana, ms),
      retrasoMaxMs: Math.round(this.retrasoMax),
      ocupacion: Math.min(1, Math.round((this.ocupadoMs / ms) * 100) / 100),
      esperaP90Ms: esp.length ? Math.round(esp[Math.floor(0.9 * (esp.length - 1))]) : null,
      escriturasPorS: Math.round((this.escriturasVentana * 10000) / ms) / 10,
      bytesPorEscritura: this.escriturasVentana ? Math.round(this.bytesEscriturasVentana / this.escriturasVentana) : 0,
      nativoKbps: this.nativo,
    };
    this.esperasAcuse = [];
    this.escriturasVentana = 0;
    this.bytesEscriturasVentana = 0;
    this.desde = ahora;
    this.acusadoVentana = 0;
    this.ocupadoMs = 0;
    this.entradosVentana = 0;
    this.videoVentana = 0;
    this.retrasoMax = this.retrasoMs;
    return r;
  }
}

/**
 * Presupuesto del vídeo (kbps) con ese resumen: lo que cabe menos la voz, con un 10 % de margen. null: sin límite medido.
 * (VOZ1111J) La voz que se resta es la mayor entre la medida y la que su escalón reserva ahora (`voz-datos/reserva.ts`):
 * la reserva sigue al escalón de la voz, así el vídeo gana lo que libera una voz más ligera y lo devuelve si sube.
 */
export function presupuestoVideo(r: ResumenEnlace, reservaVoz: number | null = reservaVozKbps()): number | null {
  if (r.maxKbps === null) return null;
  const voz = Math.max(r.vozKbps, reservaVoz ?? 0); // VOZ1111J
  return Math.max(0, Math.round((r.maxKbps - voz) * 0.9));
}

/**
 * LLA1111Q: el enlace en pocas letras para el registro, con lo que el control usó de verdad:
 * «enlace=223k+50ms/139 nativo=249k entregado=97k esc=6.7x1.6K espera=140/160ms» — modelo (C + R / ciclo del emisor),
 * lo que mide la app nativa al lado (si discrepan, se ve aquí), lo acusado, escrituras/s × bytes medios, y la espera de
 * la voz (p90 por escritura / máximo).
 */
export function textoEnlace(r: ResumenEnlace): string {
  const m = r.modelo;
  const k = (b: number) => (b >= 1000 ? `${Math.round(b / 100) / 10}K` : `${b}`);
  const modelo = m ? `${Math.round(m.bytesPorMs * 8)}k+${Math.round(m.rMs)}ms${m.cicloMinMs ? `/${m.cicloMinMs}` : ""}` : "?";
  const nativo = typeof r.nativoKbps === "number" ? ` nativo=${Math.round(r.nativoKbps)}k` : "";
  const esc = typeof r.escriturasPorS === "number" && r.escriturasPorS > 0 ? ` esc=${r.escriturasPorS}x${k(r.bytesPorEscritura ?? 0)}` : "";
  const p90 = typeof r.esperaP90Ms === "number" ? `${r.esperaP90Ms}/` : "";
  return `enlace=${modelo}${nativo} entregado=${r.entregadoKbps}k${esc} espera=${p90}${r.retrasoMaxMs}ms`;
}

/* ───────────────────────── Control de la tasa del vídeo ───────────────────────── */

export type EstadoReparto = "activo" | "pausa";

export interface Entrada {
  enlace: ResumenEnlace;
  /** ¿El vídeo se quedó con ganas (fragmentos esperando fichas o fotogramas tirados por ritmo) en la ventana? */
  limitado: boolean;
  /** Fracción de fotogramas perdidos que informa el receptor (null: sin informe reciente). */
  perdidaReceptor: number | null;
  /**
   * LLA1111Q: lo que cuesta DE VERDAD el escalón más bajo (1 fps) con su margen, kb/s (`sueloMedido`). Si pasa de
   * `SUELO_KBPS`, manda: con el códec gastando el doble de lo configurado, 12 kb/s eran 0,8 fps sin pausa (banco `ble-80`).
   */
  sueloKbps?: number;
}

/** LLA1111Q: el suelo con lo que cuesta de verdad 1 fps (más un 25 %: que salga al menos 1 fps, no 0,8). */
export function sueloMedido(coste: CosteEscalon, escalonMasBajo: { kbps: number }): number {
  return Math.max(SUELO_KBPS, Math.round(1.25 * coste.prevision(escalonMasBajo)));
}

export interface Cambio {
  estado: EstadoReparto;
  objetivoKbps: number;
  /** Por qué cambió (para el registro): «retraso-voz», «hay-sitio», «capacidad», «perdida-receptor», «suelo», «sitio-de-nuevo». */
  motivo: string;
}

export class ControlReparto {
  private est: EstadoReparto = "activo";
  private obj: number;
  private bajoSuelo = 0;
  private calma = 0;
  private enPausaDesde = 0;
  private reanudadoEn = -1e12;
  private calmaPedida = CALMA_REANUDAR_S;
  /** Último motivo (para el registro). */
  motivo = "inicio";
  pausas = 0;

  constructor(
    private readonly maxKbps: number,
    inicialKbps = 30,
  ) {
    this.obj = Math.max(SUELO_KBPS, Math.min(maxKbps, inicialKbps));
  }

  get estado(): EstadoReparto {
    return this.est;
  }

  get objetivoKbps(): number {
    return this.est === "pausa" ? 0 : this.obj;
  }

  get calmaPedidaS(): number {
    return this.calmaPedida;
  }

  /** Un paso por segundo. Devuelve el cambio si lo hubo (de estado o de objetivo). */
  paso(ahora: number, e: Entrada): Cambio | null {
    const antesEst = this.est;
    const antesObj = this.objetivoKbps;
    const l = e.enlace;
    const pres = presupuestoVideo(l);
    const techo = pres === null ? this.maxKbps : Math.min(this.maxKbps, pres);
    const alto = retrasoAltoMs(l.modelo);
    const bajo = retrasoBajoMs(l.modelo);
    const suelo = Math.max(SUELO_KBPS, e.sueloKbps ?? 0); // LLA1111Q
    const espera = esperaVozMs(l);
    // Con limitador, un máximo de más de 2,5 ciclos (el atasco de la escalera de la voz) también baja el vídeo.
    const maxAlto = l.modelo?.cicloMinMs ? l.retrasoMaxMs > 2.5 * cicloEfectivoMs(l.modelo) : false;
    if (this.est === "activo") {
      let motivo: string | null = null;
      const enPrueba = ahora - this.reanudadoEn < PRUEBA_S * 1000; // LLA1111Q
      if ((espera > alto || maxAlto) && enPrueba) {
        this.est = "pausa";
        this.pausas++;
        this.enPausaDesde = ahora;
        this.calma = 0;
        this.calmaPedida = Math.min(CALMA_MAXIMA_S, this.calmaPedida * 2);
        this.motivo = "prueba-fallida";
        return { estado: this.est, objetivoKbps: 0, motivo: this.motivo };
      }
      if (espera > alto || maxAlto) {
        this.obj = Math.min(this.obj * 0.6, techo);
        motivo = "retraso-voz";
      } else if (e.perdidaReceptor !== null && e.perdidaReceptor > PERDIDA_RECEPTOR_ALTA) {
        this.obj = Math.min(this.obj * 0.7, techo);
        motivo = "perdida-receptor";
      } else if (this.obj > techo) {
        this.obj = techo;
        motivo = "capacidad";
      } else if (espera < bajo && e.limitado && this.obj < techo && !enPrueba) {
        this.obj = Math.min(techo, this.obj + Math.max(4, this.obj * 0.15));
        motivo = "hay-sitio";
      }
      this.obj = Math.round(Math.max(0, this.obj));
      if (this.obj < suelo) {
        this.bajoSuelo++;
        this.obj = suelo;
        if (this.bajoSuelo >= BAJO_SUELO_PARA_PAUSAR_S) {
          this.est = "pausa";
          this.pausas++;
          this.enPausaDesde = ahora;
          this.calma = 0;
          // Reincidente: se pausó poco después de reanudar → más calma antes de volver a probar.
          this.calmaPedida = ahora - this.reanudadoEn < REINCIDENCIA_S * 1000 ? Math.min(CALMA_MAXIMA_S, this.calmaPedida * 2) : CALMA_REANUDAR_S;
          motivo = "suelo";
        }
      } else {
        this.bajoSuelo = 0;
      }
      if (motivo) this.motivo = motivo;
    } else {
      // En pausa solo va la voz: se reanuda si la voz espera poco y el modelo deja sitio para el doble del suelo.
      const holgura = pres === null || pres >= 2 * suelo;
      if (espera < bajo && !maxAlto && holgura) this.calma++;
      else this.calma = 0;
      if (this.calma >= this.calmaPedida && ahora - this.enPausaDesde >= PAUSA_MINIMA_S * 1000) {
        this.est = "activo";
        // LLA1111Q: vuelve AL SUELO (una prueba, ver `PRUEBA_S`); de ahí sube con lo medido.
        this.obj = Math.min(this.maxKbps, suelo);
        this.bajoSuelo = 0;
        this.reanudadoEn = ahora;
        this.motivo = "sitio-de-nuevo";
      }
    }
    if (this.est !== antesEst || this.objetivoKbps !== antesObj) return { estado: this.est, objetivoKbps: this.objetivoKbps, motivo: this.motivo };
    return null;
  }
}

/* ───────────────────────── Cubeta de fichas ───────────────────────── */

/** Deja pasar bytes a la tasa objetivo; un fragmento sale si hay fichas (puede dejar la cubeta en deuda). */
export class Cubeta {
  private fichas = 0;
  private t = 0;

  recargar(ahora: number, kbps: number): void {
    if (!this.t) this.t = ahora;
    const dt = Math.max(0, ahora - this.t);
    this.t = ahora;
    const tope = Math.max(400, (kbps * CUBETA_MS) / 8);
    this.fichas = Math.min(tope, this.fichas + (kbps * dt) / 8);
  }

  puede(): boolean {
    return this.fichas > 0;
  }

  gastar(bytes: number): void {
    this.fichas -= bytes;
  }

  vaciar(): void {
    this.fichas = 0;
  }
}

/* ───────────────────────── Coste real de cada escalón ───────────────────────── */

/** Cada cuánto, como poco, se sube de escalón (bajar es inmediato). */
export const SUBIR_ESCALON_CADA_MS = 3000;

/**
 * Lo que cuesta de verdad un escalón en el carril: el códec no gasta lo configurado (a 160×120 suele gastar menos; con
 * una cámara movida, más) y el texto (base64 + cabecera) pesa ≈ 4/3. `factor` = kbps de texto que salen del códec /
 * kbps configurados, media móvil con los claves dentro (amortizados). El escalón elegido es el más alto cuyo coste
 * previsto cabe en el objetivo: con poco sitio bajan primero los fps y luego el tamaño (el orden de la escalera).
 */
export class CosteEscalon {
  /** Al empezar se supone el texto ≈ 1,3 veces lo configurado. */
  factor = 1.3;
  private muestras = 0;
  private ultimoCambio = 0;

  /** Una muestra de ≈ 1 s: kbps de texto que soltó el códec con ese perfil. Sin fotogramas no hay muestra. */
  medir(kbpsTexto: number, perfil: { kbps: number }, fotos: number): void {
    if (!(kbpsTexto > 0) || !(fotos > 0) || !(perfil.kbps > 0)) return;
    const f = Math.max(0.3, Math.min(3, kbpsTexto / perfil.kbps));
    const a = this.muestras < 3 ? 0.5 : 0.25;
    this.factor = Math.round((this.factor * (1 - a) + f * a) * 100) / 100;
    this.muestras++;
  }

  /** kbps de texto previstos para ese perfil. */
  prevision(perfil: { kbps: number }): number {
    return perfil.kbps * this.factor;
  }

  /** El escalón para ese objetivo (con histéresis: subir pide un 10 % de holgura y `SUBIR_ESCALON_CADA_MS`). */
  escalon(objetivoKbps: number, escalera: ReadonlyArray<{ kbps: number }>, actual: number, ahora: number): number {
    let i = 0;
    for (let k = 0; k < escalera.length; k++) if (this.prevision(escalera[k]) <= objetivoKbps) i = k;
    if (i > actual) {
      let arriba = actual;
      for (let k = actual + 1; k <= i; k++) if (this.prevision(escalera[k]) <= objetivoKbps * 0.9) arriba = k;
      if (arriba === actual || ahora - this.ultimoCambio < SUBIR_ESCALON_CADA_MS) return actual;
      i = arriba;
    }
    if (i !== actual) this.ultimoCambio = ahora;
    return i;
  }
}
