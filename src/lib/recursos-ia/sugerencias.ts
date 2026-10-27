/**
 * Sugerencias por capacidad y topología (SOP `architecture/recursos-ia-neurona.md` §2-3).
 *
 * PURO y determinista: el mismo inventario da el mismo plan (todo desempate va por id, nunca por
 * el orden en que llegaron los datos ni por `localeCompare`, que depende del ICU del entorno).
 */
import { bonoBits, duracionEs, espacioNecesarioGb, numeroEs, potenciaB, tamanoEs, verificar } from "./compatibilidad";
import { NOTA_BITNET, cuantizacionesPara } from "./cuantizacion-hf";
import type { DispositivoHF } from "./cuantizacion-hf";
import type {
    Alcance,
    Alternativa,
    Bits,
    Capacidad,
    Compatibilidad,
    ConfigTopologia,
    InventarioRecursos,
    MedioAlmacen,
    NeuronaRecursos,
    NivelCompat,
    PlanRecursos,
    Pregunta,
    Procesador,
    RequisitosModelo,
    Sugerencia,
    Via,
} from "./tipos";
import { NOMBRE_CAPACIDAD, NOMBRE_TOPOLOGIA, ORDEN_NIVEL, VIA_REFERENCIA } from "./tipos";

export interface OpcionesPlan {
    capacidades: Capacidad[];
    alcance: Alcance;
    /** La que eligió la persona; si falta, `topologiaSugerida`. */
    topologia?: ConfigTopologia;
    tamanosConfirmados?: Record<string, number>;
    /** Por defecto true. */
    preferir158?: boolean;
    /**
     * (Añadido aquí: el contrato no lo trae.) Modelos que ya están —en un almacén o sirviendo en
     * un procesador, p. ej. BitNet en 127.0.0.1:8790—: no piden confirmar descarga. Sin esto, cada
     * sugerencia pide confirmación (regla: toda descarga se confirma con tamaño y destino).
     */
    instalados?: { modeloId: string; almacenId?: string; procesadorId?: string }[];
}

/** Vías por defecto: antena solo si no hay otra, y nunca para pesos. */
export const VIAS_POR_DEFECTO: readonly Via[] = ["local", "malla-local", "red-starseed"];

/** Por debajo de esto el disco interno «escasea» para modelos (GB libres). */
const DISCO_ESCASO_GB = 20;
/** Un externo «grande» para modelos (GB libres). */
const EXTERNO_GRANDE_GB = 50;
/** Una neurona es «claramente más capaz» si su fuerza es al menos esto × la siguiente. */
const DOMINIO = 1.4;
/** Un modelo «pesado» no se carga desde la Biblioteca o la nube en `cada-neurona`. */
const PESADO_GB = 4;
const MAX_ALTERNATIVAS = 3;

const NOMBRE_NIVEL: Record<NivelCompat, string> = {
    optimo: "óptimo",
    bueno: "bueno",
    justo: "justo",
    preguntar: "por confirmar",
    "no-cabe": "no cabe",
    incompatible: "incompatible",
};

function cmp(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function porId<T extends { id: string }>(xs: T[]): T[] {
    const vistos = new Set<string>();
    const fuera: T[] = [];
    for (const x of xs) {
        if (vistos.has(x.id)) continue;
        vistos.add(x.id);
        fuera.push(x);
    }
    return fuera.sort((a, b) => cmp(a.id, b.id));
}

function neurona(inv: InventarioRecursos, id?: string): NeuronaRecursos | undefined {
    return id ? inv.neuronas.find((n) => n.id === id) : undefined;
}

/** Del acelerador del procesador al dispositivo de la tabla de cuantización de transformers. */
export function dispositivoHfDe(p: Procesador): DispositivoHF {
    const a = p.aceleradores;
    if (a.includes("cuda")) return "cuda";
    if (a.includes("rocm")) return "rocm";
    if (a.includes("metal") || a.includes("metal4")) return "metal";
    return "cpu";
}

/** Lo de una neurona apagada sigue en la lista (se ve), pero como no disponible. */
function procesadoresDe(n: NeuronaRecursos): Procesador[] {
    return n.procesadores.map((p) => (n.online ? p : { ...p, disponible: false }));
}

function almacenesDe(n: NeuronaRecursos): MedioAlmacen[] {
    return n.almacenes.map((a) => (n.online ? a : { ...a, disponible: false }));
}

function todosLosAlmacenes(inv: InventarioRecursos): MedioAlmacen[] {
    return [...inv.neuronas.flatMap(almacenesDe), ...inv.almacenesSueltos];
}

/* ───────────────────────────── topología sugerida ───────────────────────────── */

/** Memoria útil para modelos: una GPU dedicada vale doble por su VRAM; el navegador, la mitad. */
function fuerzaProcesador(p: Procesador): number {
    if (!p.disponible || p.via === "antena") return 0;
    const ram = p.ramGb ?? 0;
    if (p.tipo === "gpu") return p.memoriaUnificada ? ram : (p.vramGb ?? 0) * 2 + ram * 0.25;
    if (p.tipo === "webgpu" || p.tipo === "npu") return ram * 0.5;
    return ram;
}

function tieneGpuDedicada(n: NeuronaRecursos): boolean {
    return n.procesadores.some((p) => p.tipo === "gpu" && !p.memoriaUnificada && (p.vramGb ?? 0) > 0);
}

function discoLibreDe(n: NeuronaRecursos): number {
    let max = 0;
    for (const a of n.almacenes) {
        if ((a.tipo === "neurona-local" || a.tipo === "disco-externo") && a.disponible) max = Math.max(max, a.libreGb ?? 0);
    }
    return max;
}

/** Vías por defecto más las que hacen falta para llegar (internet solo si no hay otra; antena nunca aquí). */
function viasPara(necesarias: Via[]): Via[] {
    const vias: Via[] = [...VIAS_POR_DEFECTO];
    const alcanzable = necesarias.some((v) => vias.includes(v));
    if (!alcanzable && necesarias.includes("internet")) vias.push("internet");
    if (!alcanzable && !necesarias.includes("internet") && necesarias.includes("antena")) vias.push("antena");
    return vias;
}

/** Un disco o servidor externo grande y rápido junto a un disco interno que escasea. */
function externoSugerido(inv: InventarioRecursos, alcance: Alcance): MedioAlmacen | undefined {
    const esta = inv.estaNeuronaId;
    const elegibles: { a: MedioAlmacen; enEsta: boolean }[] = [];
    for (const a of todosLosAlmacenes(inv)) {
        if (a.tipo !== "disco-externo" && a.tipo !== "servidor-externo") continue;
        if (!a.disponible || !a.persistente || a.via === "antena") continue;
        if (alcance.visibilidad === "privada" && !a.privado) continue;
        const duena = neurona(inv, a.neuronaId ?? esta);
        if (!duena || !duena.online) continue;
        const internoLibre = duena.almacenes.find((x) => x.tipo === "neurona-local")?.libreGb;
        if (typeof internoLibre !== "number" || internoLibre >= DISCO_ESCASO_GB) continue;
        const libre = a.libreGb ?? 0;
        if (libre < EXTERNO_GRANDE_GB || libre < 2 * internoLibre) continue;
        const rapido =
            a.tipo === "disco-externo"
                ? (a.lecturaMBs ?? (a.tipoDisco === "nvme" || a.tipoDisco === "ssd" ? 500 : 0)) >= 400
                : (a.lecturaMBs ?? 0) >= 100 && (a.via === "local" || a.via === "malla-local");
        if (rapido) elegibles.push({ a, enEsta: (a.neuronaId ?? esta) === esta });
    }
    elegibles.sort((x, y) => Number(y.enEsta) - Number(x.enEsta) || (y.a.libreGb ?? 0) - (x.a.libreGb ?? 0) || cmp(x.a.id, y.a.id));
    return elegibles[0]?.a;
}

export function topologiaSugerida(inv: InventarioRecursos, alcance: Alcance): ConfigTopologia {
    // 1. Grupo o comunidad con servidores compartidos.
    if (alcance.tipo === "grupo" || alcance.tipo === "comunidad") {
        const servidores = inv.procesadoresSueltos.filter((p) => p.disponible && p.via !== "antena");
        if (servidores.length) {
            return { topologia: "comunal", vias: viasPara(servidores.map((s) => s.via)), alcance };
        }
    }

    const capaces = inv.neuronas
        .filter((n) => n.online && !(n.vias.length > 0 && n.vias.every((v) => v === "antena")))
        .map((n) => ({ n, fuerza: Math.max(0, ...n.procesadores.map(fuerzaProcesador)), disco: discoLibreDe(n) }))
        .filter((x) => x.fuerza > 0)
        .sort((a, b) => b.fuerza - a.fuerza || cmp(a.n.id, b.n.id));

    if (capaces.length >= 2) {
        const [top, segunda] = capaces;
        // 2. Fuerzas distintas: la que mejor calcula anda corta de disco y otra lo tiene de sobra.
        const porDisco = [...capaces].sort((a, b) => b.disco - a.disco || cmp(a.n.id, b.n.id))[0];
        if (porDisco.n.id !== top.n.id && top.disco < DISCO_ESCASO_GB && porDisco.disco >= 2 * Math.max(top.disco, 1)) {
            return { topologia: "fragmentada", vias: viasPara(capaces.flatMap((c) => c.n.vias)), alcance };
        }
        // 3. Una claramente más capaz: sirve la IA de todas.
        if (top.fuerza >= DOMINIO * segunda.fuerza) {
            return {
                topologia: "servidor-propio",
                servidorNeuronaId: top.n.id,
                vias: viasPara(top.n.vias.length ? top.n.vias : top.n.procesadores.map((p) => p.via)),
                alcance,
            };
        }
    }

    // 4. Poco disco interno y un almacén externo grande y rápido.
    const externo = externoSugerido(inv, alcance);
    if (externo) return { topologia: "almacen-externo", almacenExternoId: externo.id, vias: [...VIAS_POR_DEFECTO], alcance };

    // 5. Varias parecidas pero una con GPU dedicada: cada capacidad donde mejor va.
    if (capaces.length >= 2 && capaces.some((c) => tieneGpuDedicada(c.n)) && !capaces.every((c) => tieneGpuDedicada(c.n))) {
        return { topologia: "fragmentada", vias: viasPara(capaces.flatMap((c) => c.n.vias)), alcance };
    }

    // 6. Una sola neurona capaz, o todas parecidas.
    return { topologia: "cada-neurona", vias: [...VIAS_POR_DEFECTO], alcance };
}

/* ───────────────────────────── candidatos ───────────────────────────── */

/** Procesadores y almacenes que la topología permite usar desde esta neurona. */
export function candidatos(
    inv: InventarioRecursos,
    topologia: ConfigTopologia,
): { procesadores: Procesador[]; almacenes: MedioAlmacen[] } {
    const vias = new Set<Via>(topologia.vias.length ? topologia.vias : VIAS_POR_DEFECTO);
    const esta = neurona(inv, inv.estaNeuronaId) ?? inv.neuronas.find((n) => n.esEsta);
    let procesadores: Procesador[] = [];
    let almacenes: MedioAlmacen[] = [];

    switch (topologia.topologia) {
        case "cada-neurona":
            // Lo de esta neurona + lo de la cuenta (Biblioteca, cerebros) para lo que no es pesado.
            procesadores = esta ? procesadoresDe(esta) : [];
            almacenes = [...(esta ? almacenesDe(esta) : []), ...inv.almacenesSueltos];
            break;
        case "servidor-propio": {
            const servidor = neurona(inv, topologia.servidorNeuronaId) ?? esta;
            procesadores = servidor ? procesadoresDe(servidor) : [];
            almacenes = [...(servidor ? almacenesDe(servidor) : []), ...inv.almacenesSueltos];
            break;
        }
        case "almacen-externo": {
            const externo = todosLosAlmacenes(inv).find((a) => a.id === topologia.almacenExternoId);
            if (!externo) break;
            const duena = neurona(inv, externo.neuronaId);
            // Procesa la neurona donde está conectado; la actual también, para pesos que viajan por la vía.
            procesadores = [...(duena ? procesadoresDe(duena) : []), ...(esta && esta !== duena ? procesadoresDe(esta) : [])];
            almacenes = [externo];
            break;
        }
        case "fragmentada":
            procesadores = [...inv.neuronas.flatMap(procesadoresDe), ...inv.procesadoresSueltos];
            almacenes = todosLosAlmacenes(inv);
            break;
        case "comunal":
            procesadores = [...inv.procesadoresSueltos];
            almacenes = [...inv.almacenesSueltos];
            break;
    }

    procesadores = porId(procesadores.filter((p) => vias.has(p.via)));
    const neuronasQueProcesan = new Set(procesadores.map((p) => p.neuronaId));
    // Un almacén en la misma neurona que procesa se lee en local aunque desde aquí se llegue por otra vía.
    // Por antena nunca viajan pesos: solo vale si está junto al procesador.
    almacenes = porId(
        almacenes.filter((a) => {
            const junto = !!a.neuronaId && neuronasQueProcesan.has(a.neuronaId);
            if (a.via === "antena") return junto;
            return junto || vias.has(a.via);
        }),
    );
    return { procesadores, almacenes };
}

/* ───────────────────────────── plan ───────────────────────────── */

interface Opcion {
    m: RequisitosModelo;
    p: Procesador;
    a: MedioAlmacen;
    compat: Compatibilidad;
}

function rangoBits(bits: Bits): number {
    return bits === 1.58 ? 0 : bits === 1 ? 1 : 2;
}

/**
 * Tramo de potencia (×1,6 por tramo): 1,7-2,4 B → 1, 4 B → 2, 7-8 B → 4, 27 B → 7. Por tramos y no
 * por umbral relativo para que el orden sea transitivo (un umbral «≥ 1,5×» no lo es).
 */
function tramoPotencia(m: RequisitosModelo): number {
    return Math.floor(Math.log(Math.max(1, potenciaB(m))) / Math.log(1.6));
}

/** Para razonar, «lo más potente que cabe con holgura» (SOP §3): solo en óptimo/bueno. */
function pesaPotencia(cap: Capacidad, o: Opcion): boolean {
    return cap === "razon" && (o.compat.nivel === "optimo" || o.compat.nivel === "bueno");
}

/**
 * Nivel › 1.58 primero › (razón: más potente) › puntuación › ids. Sin preferir 1.58, la puntuación
 * pierde su bono de bits y no hay tramo de bits.
 */
/**
 * (integración, medido en la Mac de Alex) «óptimo» y «bueno» son el MISMO tramo para ordenar: si no,
 * Bonsai 1-bit 1.7B (respaldo, «óptimo» por holgura) le ganaba a Ternary Bonsai (1.58, recomendado,
 * «bueno»), y Alex pidió priorizar el 1.58. Dentro del tramo: 1.58 › estado del catálogo › resto.
 */
function tramoNivel(n: Compatibilidad["nivel"]): number {
    return n === "optimo" || n === "bueno" ? 0 : ORDEN_NIVEL[n];
}

const ORDEN_ESTADO: Record<RequisitosModelo["estado"], number> = { recomendado: 0, respaldo: 1, "en-pruebas": 2, experimental: 3 };

function comparador(preferir158: boolean, cap: Capacidad) {
    const puntos = (o: Opcion) => (preferir158 ? o.compat.puntuacion : o.compat.puntuacion - bonoBits(o.m.bits));
    return (x: Opcion, y: Opcion) =>
        tramoNivel(x.compat.nivel) - tramoNivel(y.compat.nivel) ||
        (preferir158 ? rangoBits(x.m.bits) - rangoBits(y.m.bits) : 0) ||
        ORDEN_ESTADO[x.m.estado] - ORDEN_ESTADO[y.m.estado] ||
        ORDEN_NIVEL[x.compat.nivel] - ORDEN_NIVEL[y.compat.nivel] ||
        (pesaPotencia(cap, x) ? tramoPotencia(y.m) - tramoPotencia(x.m) : 0) ||
        puntos(y) - puntos(x) ||
        cmp(x.m.id, y.m.id) ||
        cmp(x.p.id, y.p.id) ||
        cmp(x.a.id, y.a.id);
}

/** Regla de la topología que `candidatos` no puede aplicar sin conocer el modelo. */
function permitida(topologia: ConfigTopologia, m: RequisitosModelo, a: MedioAlmacen, confirmado?: number): boolean {
    if (topologia.topologia === "cada-neurona" && !a.neuronaId) {
        const gb = espacioNecesarioGb(m, confirmado);
        return gb === null || gb <= PESADO_GB;
    }
    return true;
}

function alternativasDe(viables: Opcion[], mejor: Opcion): Alternativa[] {
    const fuera: Opcion[] = [];
    const modelos = new Set<string>([mejor.m.id]);
    // Primero otros modelos (uno por modelo: su mejor opción); luego el mismo en otro procesador.
    for (const o of viables) {
        if (fuera.length >= MAX_ALTERNATIVAS) break;
        if (modelos.has(o.m.id)) continue;
        modelos.add(o.m.id);
        fuera.push(o);
    }
    const procesadores = new Set<string>([mejor.p.id]);
    for (const o of viables) {
        if (fuera.length >= MAX_ALTERNATIVAS) break;
        if (o.m.id !== mejor.m.id || procesadores.has(o.p.id)) continue;
        procesadores.add(o.p.id);
        fuera.push(o);
    }
    return fuera.map((o) => ({ modeloId: o.m.id, procesadorId: o.p.id, almacenId: o.a.id, via: o.p.via, compat: o.compat }));
}

function porQueDe(cap: Capacidad, o: Opcion, viables: Opcion[], preferir158: boolean, confirmado: number | undefined, instalado: boolean): string[] {
    const { m, p, a, compat } = o;
    const f: string[] = [];
    if (m.bits === 1.58) {
        f.push("1.58-bit: el doble de rápido y la mitad de memoria");
        f.push(NOTA_BITNET);
    }
    else if (m.bits === 1) f.push("1-bit: lo más ligero que hay");
    if (instalado) f.push("ya está instalado: no hay que descargar nada");
    if (typeof p.ramGb === "number") {
        const h = p.ramGb - m.ramMinGb;
        f.push(h >= 1 ? `cabe en la memoria con ${numeroEs(h)} GB de holgura` : `justo de memoria: ${numeroEs(p.ramGb)} GB para ${numeroEs(m.ramMinGb)} pedidos`);
    }
    const necesario = espacioNecesarioGb(m, confirmado);
    if (necesario === null) f.push("falta saber cuánto ocupa: te lo pregunto antes de descargar");
    else if (typeof a.libreGb === "number") f.push(`cabe con ${numeroEs(a.libreGb - necesario)} GB de holgura en «${a.etiqueta}»`);
    f.push(p.via === "local" ? "procesa en esta neurona: sin red de por medio" : `procesa en ${p.nombre} por ${VIA_REFERENCIA[p.via].nombre.toLowerCase()}`);
    if (typeof compat.tokSEstimado === "number") f.push(`unos ${numeroEs(compat.tokSEstimado)} tok/s (estimado)`);
    if (typeof compat.cargaSegundos === "number" && compat.cargaSegundos >= 10) f.push(`carga en unos ${duracionEs(compat.cargaSegundos)}`);
    const herramientas = compat.motivos.filter((x) => x.clave === "herramientas");
    if (herramientas.length) f.push(`antes hay que instalar herramientas (${herramientas.length})`);
    const otra = viables.find((x) => x.m.id !== m.id);
    if (otra) {
        if (ORDEN_NIVEL[otra.compat.nivel] > ORDEN_NIVEL[compat.nivel]) f.push(`${otra.m.nombre} queda en «${NOMBRE_NIVEL[otra.compat.nivel]}»`);
        else if (preferir158 && m.bits === 1.58 && otra.m.bits !== 1.58) f.push(`al mismo nivel que ${otra.m.nombre}, gana por ser 1.58-bit`);
        else if (pesaPotencia(cap, o) && tramoPotencia(m) > tramoPotencia(otra.m)) {
            f.push(`para razonar, el más potente que cabe con holgura: ${numeroEs(potenciaB(m))} B frente a ${numeroEs(potenciaB(otra.m))} B de ${otra.m.nombre}`);
        }
    }
    return f;
}

/** El motivo más claro de por qué nada sirve: el de la opción menos mala, con su arreglo. */
function motivoMasClaro(cap: Capacidad, opciones: Opcion[]): string {
    const o = opciones[0];
    if (!o) return `Ninguna combinación de procesador y almacén permitida sirve para «${NOMBRE_CAPACIDAD[cap]}».`;
    const motivo = o.compat.motivos.find((x) => x.bloquea) ?? o.compat.motivos[0];
    if (!motivo) return `${o.m.nombre} no corre aquí.`;
    return `${o.m.nombre}: ${motivo.texto}${motivo.arreglo ? ` ${motivo.arreglo}` : ""}`;
}

function preguntaTamano(m: RequisitosModelo): Pregunta {
    // Orientativas, por parámetros (bpp calibrados de llmfit: Q4_K_M 0,58 · Q8_0 1,05): la
    // persona elige o escribe el tamaño real; nada se reserva hasta que contesta.
    const opciones = m.parametrosB > 0
        ? [
              { valor: String(Math.round(m.parametrosB * 0.58 * 10) / 10), texto: `≈ ${numeroEs(m.parametrosB * 0.58)} GB (4-bit)` },
              { valor: String(Math.round(m.parametrosB * 1.05 * 10) / 10), texto: `≈ ${numeroEs(m.parametrosB * 1.05)} GB (8-bit)` },
          ]
        : undefined;
    return {
        id: `tamano:${m.id}`,
        tipo: "tamano-modelo",
        modeloId: m.id,
        texto: `¿Cuánto ocupa ${m.nombre}? Depende de la variante que elijas; dímelo antes de reservarle sitio.`,
        opciones,
    };
}

function preguntaDescarga(o: Opcion, confirmado?: number): Pregunta {
    const necesario = espacioNecesarioGb(o.m, confirmado) ?? 0;
    const queda = typeof o.a.libreGb === "number" ? ` Quedarán ${numeroEs(o.a.libreGb - necesario)} GB libres.` : "";
    return {
        id: `descarga:${o.m.id}:${o.a.id}`,
        tipo: "confirmar-descarga",
        modeloId: o.m.id,
        texto: `¿Descargo ${o.m.nombre} (${tamanoEs(necesario)}) en «${o.a.etiqueta}»?${queda}`,
        opciones: [
            { valor: "si", texto: "Sí, descárgalo" },
            { valor: "no", texto: "Ahora no" },
        ],
    };
}

function enumerar(partes: string[]): string {
    if (partes.length <= 1) return partes[0] ?? "";
    return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

export function sugerirPlan(inv: InventarioRecursos, catalogo: RequisitosModelo[], opciones: OpcionesPlan): PlanRecursos {
    const topologia = opciones.topologia ?? topologiaSugerida(inv, opciones.alcance);
    const preferir158 = opciones.preferir158 !== false;
    const privado = opciones.alcance.visibilidad === "privada";
    const confirmados = opciones.tamanosConfirmados ?? {};
    const { procesadores, almacenes } = candidatos(inv, topologia);
    const propias = new Set(inv.neuronas.map((n) => n.id));
    const modelos = [...catalogo].sort((a, b) => cmp(a.id, b.id));
    const estaInstalado = (m: RequisitosModelo, p: Procesador, a: MedioAlmacen) =>
        (opciones.instalados ?? []).some(
            (i) => i.modeloId === m.id && (!i.almacenId || i.almacenId === a.id) && (!i.procesadorId || i.procesadorId === p.id),
        );

    const sugerencias: Sugerencia[] = [];
    const sinOpcion: PlanRecursos["sinOpcion"] = [];
    const preguntas: Pregunta[] = [];
    const idsPregunta = new Set<string>();
    const preguntar = (q: Pregunta) => {
        if (idsPregunta.has(q.id)) return;
        idsPregunta.add(q.id);
        preguntas.push(q);
    };
    const capacidades = [...new Set(opciones.capacidades)];

    for (const cap of capacidades) {
        const fino = topologia.porCapacidad?.[cap];
        const deCap = modelos.filter((m) => m.capacidades.includes(cap) && (!fino?.modeloId || m.id === fino.modeloId));
        if (!deCap.length) {
            sinOpcion.push({ capacidad: cap, motivo: `No hay ningún modelo de «${NOMBRE_CAPACIDAD[cap]}» en el catálogo.` });
            continue;
        }
        const procs = fino?.procesaEn ? procesadores.filter((p) => p.id === fino.procesaEn) : procesadores;
        const alms = fino?.almacenEn ? almacenes.filter((a) => a.id === fino.almacenEn) : almacenes;
        if (!procs.length || !alms.length) {
            const falta = !procs.length ? "ningún procesador" : "ningún almacén";
            sinOpcion.push({
                capacidad: cap,
                motivo: `Con «${NOMBRE_TOPOLOGIA[topologia.topologia]}» no hay ${falta} al que llegar por las vías elegidas. Revisa la topología o conecta otra neurona.`,
            });
            continue;
        }

        const todas: Opcion[] = [];
        for (const m of deCap) {
            for (const p of procs) {
                for (const a of alms) {
                    if (!permitida(topologia, m, a, confirmados[m.id])) continue;
                    const compat = verificar(m, p, a, {
                        tamanoConfirmadoGb: confirmados[m.id],
                        privado,
                        propio: propias.has(p.neuronaId) || p.propio === true,
                        capacidad: cap,
                        instalado: estaInstalado(m, p, a),
                    });
                    todas.push({ m, p, a, compat });
                }
            }
        }
        todas.sort(comparador(preferir158, cap));
        const viables = todas.filter((o) => ORDEN_NIVEL[o.compat.nivel] <= ORDEN_NIVEL.preguntar);
        if (!viables.length) {
            sinOpcion.push({ capacidad: cap, motivo: motivoMasClaro(cap, todas) });
            continue;
        }

        const mejor = viables[0];
        const alternativas = alternativasDe(viables, mejor);
        const ya = estaInstalado(mejor.m, mejor.p, mejor.a);
        const dispositivo = dispositivoHfDe(mejor.p);
        sugerencias.push({
            capacidad: cap,
            modelo: mejor.m,
            procesador: mejor.p,
            almacen: mejor.a,
            via: mejor.p.via,
            compat: mejor.compat,
            porQue: porQueDe(cap, mejor, viables, preferir158, confirmados[mejor.m.id], ya),
            alternativas,
            dispositivoHf: dispositivo,
            cuantizaciones: cuantizacionesPara(dispositivo),
        });

        // Preguntas: el tamaño de lo que se enseña (elegida y alternativas) y la descarga de la elegida.
        const mostrados = [mejor, ...viables.filter((o) => alternativas.some((x) => x.modeloId === o.m.id && x.procesadorId === o.p.id && x.almacenId === o.a.id))];
        for (const o of mostrados) if (o.compat.nivel === "preguntar") preguntar(preguntaTamano(o.m));
        if (mejor.compat.nivel !== "preguntar" && !ya) preguntar(preguntaDescarga(mejor, confirmados[mejor.m.id]));
    }

    const n158 = sugerencias.filter((s) => s.modelo.bits === 1.58).length;
    const partes = [
        `${sugerencias.length} de ${capacidades.length} ${capacidades.length === 1 ? "capacidad" : "capacidades"} con modelo${n158 ? ` (${n158} en 1.58-bit)` : ""}`,
    ];
    if (sinOpcion.length) partes.push(`${sinOpcion.length} sin opción`);
    if (preguntas.length) partes.push(`${preguntas.length} ${preguntas.length === 1 ? "pregunta pendiente" : "preguntas pendientes"}`);
    const resumen = `${NOMBRE_TOPOLOGIA[topologia.topologia]}: ${enumerar(partes)}.`;

    return { topologia, sugerencias, sinOpcion, preguntas, resumen };
}
