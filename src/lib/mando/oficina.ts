/**
 * oficina.ts — Modelo PURO de la Oficina 3D del Puente de Mando (Ola 272 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pedido de Alex: «la versión de los agentes en sus entornos virtuales 3D como
 * en el OS pero en el Puente de Mando, para que se desarrollen también y
 * evolucionen sus sistemas y después desarrollemos las versiones
 * predeterminadas».
 *
 * Los trabajadores de esta oficina son los SERES REALES de la orquestación:
 * los modelos escritores y revisores del enjambre, los cinco agentes de
 * aprendizaje 1.58, las personalidades, los procesos de fondo y el núcleo
 * BitNet. Cada uno tiene ADN determinista (`derivarAdn`), sala por función,
 * actividad viva (latidos/ramas/rama 1.58) y un GENOMA persistido que evoluciona:
 * experiencia y nivel por commits integrados, ejecuciones y turnos.
 *
 * Módulo puro: sin disco, sin red, sin reloj oculto (`ahora` entra por
 * parámetro). Todo lo que toca el sistema de archivos vive en
 * `oficina-servidor.ts`. Sin `any`.
 */

import type {
    EstadoOficina,
    OcupanteOficina,
    SalaOficina,
    SerListado,
} from "@/lib/astraura/genesis-types";
import type { RasgosAdn } from "@/lib/astraura/genesis-dna";
import { derivarAdn } from "@/lib/astraura/genesis-dna";
import type { LatidoTarea } from "@/lib/mando/tipos";
import type { RamaTarea } from "@/lib/mando/ramificacion";
import type { Rama158 } from "@/lib/mando/agentes-158";

/** Familias de seres que pueblan la oficina del Mando. */
export type TipoSer = "escritor" | "revisor" | "agente158" | "personalidad" | "proceso" | "bitnet";

/**
 * Genoma persistido de un ser del Mando: lo que el ser HA VIVIDO y no se pierde
 * al apagar la máquina. A diferencia del ADN (determinista, derivable siempre),
 * el genoma es historia: experiencia, nivel y rasgos ganados.
 */
export interface GenomaSer {
    id: string;
    tipo: TipoSer;
    nombre: string;
    rol: string;
    xp: number;
    nivel: number;
    generacion: number;
    /** ISO de la primera vez que el ser apareció en la oficina. */
    primeraVez: string;
    /** ISO de la última vez que se vio activo o se recalculó. */
    ultimaVez: string;
    /** Rasgos ganados al subir de nivel (lista fija por tipo). */
    rasgos: string[];
    color?: string;
}

/** Versión exportable de un ser: la semilla de las futuras versiones predeterminadas. */
export interface SerPredeterminado {
    id: string;
    nombre: string;
    rol: string;
    tipo: TipoSer;
    arquetipo: string;
    generacion: number;
    experiencia: number;
    adn: RasgosAdn;
    rasgos: string[];
    exportadoEn: string;
}

/** Fuentes de datos vivas del Mando (ya normalizadas por los lectores). */
export interface FuentesOficina {
    latidos: LatidoTarea[];
    ramas?: RamaTarea[];
    progreso: Record<string, unknown>;
    rama158: Rama158 | null;
    /** Ids de modelos del catálogo vivo, por si se quiere acotar/nombrar. */
    modelosCatalogo?: string[];
}

/** Resultado completo del cálculo: lo que la oficina pinta y lo que se persiste. */
export interface OficinaCalculada {
    seres: SerListado[];
    ocupantes: OcupanteOficina[];
    salas: SalaOficina[];
    genomas: GenomaSer[];
}

/**
 * Las salas del Mando, una por función. La actividad se rellena en
 * `seresDelMando` a partir de los ocupantes reales: una sala sin nadie
 * trabajando se ve quieta, nunca animada de mentira.
 */
export const SALAS_MANDO: SalaOficina[] = [
    { id: "enjambre", nombre: "Sala del enjambre", procesoTipoId: "enjambre", actividad: 0, color: "#39FF14" },
    { id: "revision", nombre: "Revisión", procesoTipoId: null, actividad: 0, color: "#FFBF00" },
    { id: "aprendizaje", nombre: "Aprendizaje 1.58", procesoTipoId: null, actividad: 0, color: "#007FFF" },
    { id: "personalidades", nombre: "Personalidades", procesoTipoId: null, actividad: 0, color: "#A855F7" },
    { id: "fondo", nombre: "Procesos de fondo", procesoTipoId: null, actividad: 0, color: "#10B981" },
    { id: "nucleo", nombre: "Núcleo BitNet", procesoTipoId: null, actividad: 0, color: "#DC143C" },
    { id: "espera", nombre: "Sala de espera", procesoTipoId: null, actividad: 0, color: "#94A3B8" },
];

/** Paleta fija por tipo de ser: alimenta `colorPersonalidad` del ADN. */
export const COLOR_POR_TIPO: Record<TipoSer, string> = {
    escritor: "#39FF14",
    revisor: "#FFBF00",
    agente158: "#007FFF",
    personalidad: "#A855F7",
    proceso: "#10B981",
    bitnet: "#DC143C",
};

/**
 * Rasgos que un ser gana al subir de nivel, en orden. La lista es fija y corta:
 * un rasgo ganado es un hecho de la historia del ser, no decoración aleatoria.
 */
export const RASGOS_POR_TIPO: Record<TipoSer, string[]> = {
    escritor: ["constante", "preciso", "veloz", "arquitecto", "incansable", "elegante"],
    revisor: ["atento", "riguroso", "constructivo", "implacable", "sereno"],
    agente158: ["curioso", "disciplinado", "observador", "paciente", "meticuloso"],
    personalidad: ["expresiva", "empática", "coherente", "creativa"],
    proceso: ["constante", "silencioso", "fiable"],
    bitnet: ["estable", "frugal", "lúcido"],
};

/** Nivel = raíz cuadrada de la experiencia: subir cuesta cada vez más. */
export function nivelDe(xp: number): number {
    return Math.floor(Math.sqrt(Math.max(0, xp)));
}

/**
 * Nombre legible de un modelo («nim/moonshotai/kimi-k3» → «Kimi K3»):
 * última pieza de la ruta, sin «:free», con guiones como espacios y en
 * Title Case. El id completo queda en el tooltip/ADN, no en la etiqueta.
 */
export function nombreModelo(id: string): string {
    const ultima = id.split("/").pop() ?? id;
    return ultima
        .replace(/:free$/, "")
        .split(/[-_.]+/)
        .filter((t) => t.length > 0)
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(" ");
}

/** Id «interno» sin el prefijo de familia que usan los seres compuestos. */
function idInterno(tipo: TipoSer, id: string): string {
    const prefijos: Partial<Record<TipoSer, string>> = {
        agente158: "agente158:",
        personalidad: "personalidad:",
        proceso: "proceso:",
        bitnet: "bitnet:",
    };
    const p = prefijos[tipo];
    return p && id.startsWith(p) ? id.slice(p.length) : id;
}

/** Objeto tolerante (nunca `any`) para leer entradas de `progreso.json`. */
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Ids de tareas integradas hechas con un modelo (progreso ∪ ramas), sin duplicar. */
function commitsDelModelo(modelo: string, fuentes: FuentesOficina): Set<string> {
    const ids = new Set<string>();
    for (const [tarea, bruto] of Object.entries(fuentes.progreso)) {
        const p = objeto(bruto);
        if (p.estado === "commit" && typeof p.modelo === "string" && p.modelo === modelo) ids.add(tarea);
    }
    for (const rama of fuentes.ramas ?? []) {
        if (rama.estado === "commit" && rama.modelo && rama.modelo === modelo) ids.add(rama.id);
    }
    return ids;
}

/**
 * Experiencia de un ser según lo que ha hecho DE VERDAD (no lo que declaró):
 *  · escritor:       10 × commits integrados con ese modelo + 1 × tarea en curso.
 *  · revisor:        3 × revisiones hechas.
 *  · agente158:      5 × ejecuciones − 2 × errores (mínimo 0).
 *  · personalidad:   turnos del corpus de aprendizaje.
 *  · proceso:        1 por hora activo (aproximado desde `ultimo`; el backend no
 *                    expone cuándo arrancó y conviene no inventarlo).
 */
export function experienciaDe(tipo: TipoSer, id: string, fuentes: FuentesOficina, ahora = Date.now()): number {
    const interno = idInterno(tipo, id);
    switch (tipo) {
        case "escritor": {
            const commits = commitsDelModelo(id, fuentes).size;
            const enCurso = fuentes.latidos.filter((l) => l.modelo === id).length;
            return 10 * commits + enCurso;
        }
        case "revisor": {
            const revisiones = (fuentes.ramas ?? []).filter((r) => r.revision && r.revision.revisor === id).length;
            return 3 * revisiones;
        }
        case "agente158": {
            const a = fuentes.rama158?.agentes.find((x) => x.id === interno);
            if (!a) return 0;
            return Math.max(0, 5 * a.ejecuciones - 2 * a.errores);
        }
        case "personalidad": {
            const p = fuentes.rama158?.personalidades.find((x) => x.id === interno);
            return p ? p.turnos : 0;
        }
        case "proceso": {
            const proc = fuentes.rama158?.procesos.find((x) => x.id === interno);
            if (!proc || proc.activo !== true) return 0;
            const ultimoMs = proc.ultimo ? Date.parse(proc.ultimo) : NaN;
            const horas = Number.isFinite(ultimoMs) ? Math.max(0, Math.round((ahora - ultimoMs) / 3600000)) : 0;
            return 1 + horas;
        }
        case "bitnet": {
            const b = fuentes.rama158?.bitnet;
            if (!b) return 0;
            // Vivo y despierto vale más que vivo dormido; apagado no suma.
            if (!b.vivo) return 0;
            return b.dormido ? 1 : 5;
        }
    }
}

/**
 * Funde el genoma guardado con el recién calculado. Reglas pétreas:
 *  · la experiencia y el nivel NUNCA bajan (un ser no desaprende);
 *  · `primeraVez` se conserva (es su nacimiento);
 *  · al subir de nivel se añaden rasgos de la lista fija de su tipo.
 */
export function fusionarGenoma(previo: GenomaSer | null, calculado: GenomaSer, ahoraIso = new Date().toISOString()): GenomaSer {
    if (!previo) {
        const rasgos = RASGOS_POR_TIPO[calculado.tipo].slice(0, calculado.nivel);
        return { ...calculado, rasgos: Array.from(new Set([...calculado.rasgos, ...rasgos])), ultimaVez: ahoraIso };
    }
    const xp = Math.max(previo.xp, calculado.xp);
    const nivel = Math.max(previo.nivel, nivelDe(xp));
    const ganados = RASGOS_POR_TIPO[calculado.tipo].slice(0, nivel);
    return {
        ...calculado,
        xp,
        nivel,
        generacion: Math.max(previo.generacion, calculado.generacion),
        primeraVez: previo.primeraVez || calculado.primeraVez,
        ultimaVez: ahoraIso,
        rasgos: Array.from(new Set([...previo.rasgos, ...ganados])),
    };
}

/** La semilla exportable: un ser tal y como quedaría en una «versión predeterminada». */
export function predeterminadoDe(genoma: GenomaSer, adn: RasgosAdn, exportadoEn = new Date().toISOString()): SerPredeterminado {
    return {
        id: genoma.id,
        nombre: genoma.nombre,
        rol: genoma.rol,
        tipo: genoma.tipo,
        arquetipo: genoma.tipo,
        generacion: genoma.generacion,
        experiencia: genoma.xp,
        adn,
        rasgos: genoma.rasgos,
        exportadoEn,
    };
}

/** Ser intermedio antes de convertirlo en SerListado + OcupanteOficina + GenomaSer. */
interface SerVivo {
    id: string;
    tipo: TipoSer;
    nombre: string;
    rol: string;
    estado: SerListado["estado"];
    salaId: string;
    actividad: OcupanteOficina["actividad"];
    detalle?: string;
    /** ms epoch de cuándo empezó la actividad actual (latido con minutos). */
    desde: number;
}

/** Fase del enjambre → sala y actividad del modelo que la está corriendo. */
function ocupanteDeLatido(l: LatidoTarea): Pick<SerVivo, "salaId" | "actividad" | "detalle"> {
    const detalleCorto = `${l.tarea} · ${l.minutos} min`;
    if (l.fase === "escribiendo") return { salaId: "enjambre", actividad: "trabajando", detalle: detalleCorto };
    if (l.fase === "revision") return { salaId: "revision", actividad: "hablando", detalle: `Revisando ${l.tarea}` };
    if (l.fase.includes("esper")) return { salaId: "espera", actividad: "pensando", detalle: `${l.tarea} · ${l.fase.replace(/-/g, " ")}` };
    return { salaId: "enjambre", actividad: "trabajando", detalle: `${l.fase} · ${l.tarea}` };
}

/**
 * Reúne a todos los seres del Mando y los sienta en su sala.
 *
 * Un modelo es «revisor» solo si revisa y nunca ha escrito (commits ni
 * latidos de escritura); en cualquier otro caso es escritor, aunque ahora
 * mismo esté revisando. Los latidos vivos mandan sobre las ramas para decidir
 * dónde está sentado cada uno AHORA.
 */
export function seresDelMando(fuentes: FuentesOficina, ahora = Date.now()): OficinaCalculada {
    const ramas = fuentes.ramas ?? [];
    const vivos: SerVivo[] = [];
    const porId = new Map<string, SerVivo>();
    const poner = (ser: SerVivo): void => {
        // Un ser ya sentado por un latido vivo no lo mueve una fuente más vieja.
        if (porId.has(ser.id)) return;
        porId.set(ser.id, ser);
        vivos.push(ser);
    };

    // 1) Modelos con latido vivo: dónde están y qué hacen ahora mismo.
    for (const l of fuentes.latidos) {
        if (!l.modelo) continue;
        const esRevisor = l.fase === "revision" && commitsDelModelo(l.modelo, fuentes).size === 0;
        const donde = ocupanteDeLatido(l);
        poner({
            id: l.modelo,
            tipo: esRevisor ? "revisor" : "escritor",
            nombre: nombreModelo(l.modelo),
            rol: esRevisor ? "revisor" : "escritor",
            estado: "activo",
            desde: ahora - l.minutos * 60000,
            ...donde,
        });
    }

    // 2) Ramas esperando el visto bueno: su modelo piensa en la sala de espera.
    for (const r of ramas) {
        if (!r.aprobacion) continue;
        const modelo = r.aprobacion.modelo || r.modelo;
        if (!modelo) continue;
        poner({
            id: modelo,
            tipo: "escritor",
            nombre: nombreModelo(modelo),
            rol: "escritor",
            estado: "activo",
            salaId: "espera",
            actividad: "pensando",
            detalle: `${r.id} · esperando visto bueno`,
            desde: ahora,
        });
    }

    // 3) Modelos conocidos sin actividad: escritores con commits y revisores
    //    con revisiones. Duermen en su sala, visibles pero quietos.
    const modelosVistos = new Set<string>();
    for (const bruto of Object.values(fuentes.progreso)) {
        const p = objeto(bruto);
        if (p.estado === "commit" && typeof p.modelo === "string" && p.modelo) modelosVistos.add(p.modelo);
    }
    const revisoresVistos = new Set<string>();
    for (const r of ramas) {
        if (r.revision?.revisor) revisoresVistos.add(r.revision.revisor);
        if (r.estado === "commit" && r.modelo) modelosVistos.add(r.modelo);
    }
    for (const modelo of modelosVistos) {
        poner({
            id: modelo,
            tipo: "escritor",
            nombre: nombreModelo(modelo),
            rol: "escritor",
            estado: "durmiendo",
            salaId: "enjambre",
            actividad: "inactivo",
            desde: ahora,
        });
    }
    for (const revisor of revisoresVistos) {
        poner({
            id: revisor,
            tipo: modelosVistos.has(revisor) ? "escritor" : "revisor",
            nombre: nombreModelo(revisor),
            rol: modelosVistos.has(revisor) ? "escritor" : "revisor",
            estado: "durmiendo",
            salaId: modelosVistos.has(revisor) ? "enjambre" : "revision",
            actividad: "inactivo",
            desde: ahora,
        });
    }

    // 4) Los cinco agentes de aprendizaje 1.58 (Curador, Entrenador, …).
    for (const a of fuentes.rama158?.agentes ?? []) {
        const ultimoFinMs = a.ultimoFin ? Date.parse(a.ultimoFin) : NaN;
        const intervaloMs = (a.intervaloS ?? 0) * 1000;
        // «Ejecución reciente»: dentro de un intervalo de su cadencia. Sin
        // intervalo conocido no se presume actividad: la oficina no inventa.
        const reciente = Number.isFinite(ultimoFinMs) && intervaloMs > 0 && ahora - ultimoFinMs < intervaloMs;
        poner({
            id: `agente158:${a.id}`,
            tipo: "agente158",
            nombre: a.nombre,
            rol: a.rol || "agente de aprendizaje",
            estado: a.activo ? "activo" : "durmiendo",
            salaId: "aprendizaje",
            actividad: a.activo && reciente ? "trabajando" : "inactivo",
            detalle: a.ultimoResultado ?? undefined,
            desde: Number.isFinite(ultimoFinMs) ? ultimoFinMs : ahora,
        });
    }

    // 5) Personalidades (activas hablan; el resto descansa en su sala).
    for (const p of fuentes.rama158?.personalidades ?? []) {
        poner({
            id: `personalidad:${p.id}`,
            tipo: "personalidad",
            nombre: p.nombre,
            rol: "personalidad",
            estado: p.activa ? "activo" : "durmiendo",
            salaId: "personalidades",
            actividad: p.activa ? "hablando" : "inactivo",
            detalle: p.activa && p.turnos > 0 ? `${p.turnos} turnos de corpus` : undefined,
            desde: ahora,
        });
    }

    // 6) Procesos de fondo del backend 1.58.
    for (const proc of fuentes.rama158?.procesos ?? []) {
        const activo = proc.activo === true;
        poner({
            id: `proceso:${proc.id}`,
            tipo: "proceso",
            nombre: proc.nombre,
            rol: "proceso de fondo",
            estado: activo ? "activo" : "durmiendo",
            salaId: "fondo",
            actividad: activo ? "trabajando" : "inactivo",
            detalle: proc.detalle ?? undefined,
            desde: proc.ultimo && Number.isFinite(Date.parse(proc.ultimo)) ? Date.parse(proc.ultimo) : ahora,
        });
    }

    // 7) El núcleo BitNet: el corazón ternario de la neurona.
    const bitnet = fuentes.rama158?.bitnet;
    if (bitnet) {
        poner({
            id: "bitnet:nucleo",
            tipo: "bitnet",
            nombre: "BitNet 1.58",
            rol: "núcleo cognitivo",
            estado: bitnet.vivo && !bitnet.dormido ? "activo" : "durmiendo",
            salaId: "nucleo",
            actividad: bitnet.vivo && !bitnet.dormido ? "trabajando" : "inactivo",
            detalle: bitnet.puerto ? `puerto ${bitnet.puerto}` : undefined,
            desde: ahora,
        });
    }

    // ── Materialización: SerListado (con ADN), OcupanteOficina y GenomaSer ──
    const ahoraIso = new Date(ahora).toISOString();
    const seres: SerListado[] = [];
    const ocupantes: OcupanteOficina[] = [];
    const genomas: GenomaSer[] = [];
    for (const ser of vivos) {
        const xp = experienciaDe(ser.tipo, ser.id, fuentes, ahora);
        const nivel = nivelDe(xp);
        const color = COLOR_POR_TIPO[ser.tipo];
        const adn = derivarAdn({
            id: ser.id,
            nombre: ser.nombre,
            colorPersonalidad: color,
            arquetipo: ser.tipo,
            generacion: 0,
            experiencia: xp,
        });
        seres.push({
            id: ser.id,
            nombre: ser.nombre,
            rol: ser.rol,
            estado: ser.estado,
            color,
            adn,
            generacion: 0,
            comunidades: ["mando"],
            experiencia: xp,
        });
        ocupantes.push({
            serId: ser.id,
            salaId: ser.salaId,
            actividad: ser.actividad,
            detalle: ser.detalle ?? null,
            desde: ser.desde,
        });
        genomas.push({
            id: ser.id,
            tipo: ser.tipo,
            nombre: ser.nombre,
            rol: ser.rol,
            xp,
            nivel,
            generacion: 0,
            primeraVez: ahoraIso,
            ultimaVez: ahoraIso,
            rasgos: [],
            color,
        });
    }

    // Actividad de cada sala = ocupantes activos / total (1 si está vacía:
    // una sala vacía tiene actividad 0, no una división por cero).
    const salas = SALAS_MANDO.map((sala) => {
        const enSala = ocupantes.filter((o) => o.salaId === sala.id);
        const activos = enSala.filter((o) => o.actividad !== "inactivo").length;
        return { ...sala, actividad: activos / Math.max(1, enSala.length) };
    });

    return { seres, ocupantes, salas, genomas };
}

/**
 * Estado de oficina listo para `<OficinaSeres>`: salas y ocupantes calculados
 * con datos reales (`datosReales: true` — nunca animamos actividad inventada).
 */
export function estadoOficinaDe(calculada: OficinaCalculada, ahora = Date.now()): EstadoOficina {
    return {
        salas: calculada.salas,
        ocupantes: calculada.ocupantes,
        actualizadoEn: ahora,
        datosReales: true,
    };
}





