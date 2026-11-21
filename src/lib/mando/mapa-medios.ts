/** MAPA DE MEDIOS · ALMACENAMIENTO GLOBAL (MAG1120C) — módulo puro, sin red ni disco. */
export type EstadoMedio = "listo" | "usable" | "requiere_alex" | "no_disponible";

export interface MedioVivo {
    id: string;
    nombre: string;
    medio: "mac" | "linux" | "nube" | "android";
    estado: EstadoMedio;
    capacidad: number;
    detalle: string;
    discos: { libreGb: number; origen: string }[];
    computo: { cpu: number; ramMb: number; contenedores: boolean };
    enjambre: { agentes: number; tipo: "python" | "nextjs" | "rust" };
    capas: string[];
    avisos: string[];
}

export interface FilaMedio {
    id: string;
    nombre: string;
    estado: "ok" | "alerta" | "bloqueado";
    porque: string;
    detalle: { discoLibres: number; origen: string }[];
    capacidad?: number;
}

const ID_GLOBAL = "almacenamiento-global";
const esEspejo = (origen: string): boolean => /espejo/i.test(origen);
const origenDe = (medio: MedioVivo, origen: string): string => origen.trim() || medio.nombre;
const redondear = (valor: number): number => (Number.isFinite(valor) && valor > 0 ? Math.round(valor * 10) / 10 : 0);

function estadoDeMedio(medio: MedioVivo, avisos: string[]): FilaMedio["estado"] {
    if (medio.estado === "no_disponible") return "bloqueado";
    return medio.estado === "requiere_alex" || avisos.length > 0 ? "alerta" : "ok";
}

interface OrigenAgregado {
    libreGb: number;
    espejo: boolean;
}

function agregarOrigenes(medios: MedioVivo[]): Map<string, OrigenAgregado> {
    const mapa = new Map<string, OrigenAgregado>();
    for (const medio of medios) {
        for (const disco of medio.discos) {
            const origen = origenDe(medio, disco.origen);
            const actual = mapa.get(origen) ?? { libreGb: 0, espejo: esEspejo(origen) };
            actual.libreGb += redondear(disco.libreGb);
            mapa.set(origen, actual);
        }
    }
    return mapa;
}

function capacidadesPorMedio(medios: MedioVivo[]): Map<string, Set<string>> {
    const mapa = new Map<string, Set<string>>();
    for (const medio of medios) {
        const claves = new Set(medio.capas.map((capa) => capa.trim()).filter(Boolean));
        for (const disco of medio.discos) {
            const origen = origenDe(medio, disco.origen);
            if (!esEspejo(origen)) claves.add(origen);
        }
        for (const clave of claves) {
            const nombres = mapa.get(clave) ?? new Set<string>();
            nombres.add(medio.nombre);
            mapa.set(clave, nombres);
        }
    }
    return mapa;
}

/** Avisos 2+1: toda capacidad que solo posee un medio. */
export function avisosDeMediosUnicos(medios: MedioVivo[]): string[] {
    return [...capacidadesPorMedio(medios)]
        .filter(([, nombres]) => nombres.size === 1)
        .map(([capacidad, nombres]) => `nunca medio único: ${[...nombres][0]} solo tiene ${capacidad}`);
}

/** Fila única del mapa global: Mac (local), Maggabox (SSH), A1 (Oracle) y Drive (espejo). */
export function filaAlmacenamiento(medios: MedioVivo[]): FilaMedio {
    const origenes = agregarOrigenes(medios);
    const detalle = [...origenes]
        .map(([origen, datos]) => ({ origen, discoLibres: redondear(datos.libreGb), espejo: datos.espejo }))
        .sort((a, b) => b.discoLibres - a.discoLibres || a.origen.localeCompare(b.origen))
        .map(({ origen, discoLibres }) => ({ origen, discoLibres }));
    const total = redondear([...origenes.values()].filter((d) => !d.espejo).reduce((suma, d) => suma + d.libreGb, 0));
    const espejos = [...origenes.values()].filter((d) => d.espejo).length;
    const avisos = avisosDeMediosUnicos(medios);
    const vacio = medios.length === 0 || (total === 0 && espejos === 0);
    const estado: FilaMedio["estado"] = vacio ? "bloqueado" : avisos.length > 0 ? "alerta" : "ok";
    const partes =
        medios.length === 0
            ? ["Sin medios conectados: no hay almacenamiento que sumar."]
            : total === 0 && espejos === 0
              ? ["Ningún medio declara disco libre: almacenamiento bloqueado."]
              : [`Total ${total} GB libres en ${detalle.length} ${detalle.length === 1 ? "origen" : "orígenes"}${espejos > 0 ? ` (${espejos} espejo)` : ""}.`];
    if (avisos.length > 0) partes.push(`Avisos: ${avisos.join("; ")}.`);
    else if (medios.length > 0) partes.push("Ninguna capacidad depende de un solo medio.");
    return { id: ID_GLOBAL, nombre: "Almacenamiento global", estado, porque: partes.join(" "), detalle, capacidad: total };
}

/** Filas para Genesis: el agregado global primero y luego cada medio vivo. */
export function construirMapaAlmacenamiento(medios: MedioVivo[]): FilaMedio[] {
    const avisosGlobales = avisosDeMediosUnicos(medios);
    const filas = medios.map((medio) => {
        const detalle = medio.discos
            .map((disco) => ({ origen: origenDe(medio, disco.origen), discoLibres: redondear(disco.libreGb) }))
            .sort((a, b) => b.discoLibres - a.discoLibres || a.origen.localeCompare(b.origen));
        const total = redondear(detalle.reduce((suma, disco) => suma + disco.discoLibres, 0));
        const prefijo = `nunca medio único: ${medio.nombre} solo tiene `;
        const avisos = [...medio.avisos, ...avisosGlobales.filter((aviso) => aviso.startsWith(prefijo))];
        const partes = [medio.detalle.trim() || (detalle.length > 0 ? `${total} GB libres en ${detalle.length} ${detalle.length === 1 ? "origen" : "orígenes"}.` : "Sin discos declarados.")];
        if (avisos.length > 0) partes.push(`Avisos: ${avisos.join("; ")}.`);
        return { id: medio.id, nombre: medio.nombre, estado: estadoDeMedio(medio, avisos), porque: partes.join(" "), detalle, capacidad: total > 0 ? total : redondear(medio.capacidad) };
    });
    return [filaAlmacenamiento(medios), ...filas];
}
