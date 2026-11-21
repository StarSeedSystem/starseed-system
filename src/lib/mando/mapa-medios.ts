// src/lib/mando/mapa-medios.ts
// -----------------------------------------------------------------------------
// Mapa de almacenamiento global: cuánto espacio libre hay y DÓNDE vive.
//
// POR QUÉ (2026-11-21 · MAG1120). Genesis ya mide discos sueltos, pero nadie
// juntaba Mac, Maggabox, A1 y Drive en una sola verdad. Este módulo es puro:
// recibe los medios ya sondeados (MAG1120A) y decide filas, totales y avisos.
//
// Regla 2+1: una capacidad nunca debe vivir en un solo medio. Si un origen
// solo aparece en un medio, se avisa: «nunca medio único: X solo tiene Y».
// Un origen marcado como espejo no cuenta como capacidad única: es copia.
// -----------------------------------------------------------------------------

export type MedioVivo = {
    id: string;
    nombre: string;
    medio: "mac" | "linux" | "nube" | "android";
    estado: "listo" | "usable" | "requiere_alex" | "no_disponible";
    capacidad: number;
    detalle: string;
    discos: { libreGb: number; origen: string }[];
    computo: { cpu: number; ramMb: number; contenedores: boolean };
    enjambre: { agentes: number; tipo: "python" | "nextjs" | "rust" };
    capas: string[];
    avisos: string[];
};

export type FilaMedio = {
    id: string;
    nombre: string;
    estado: "ok" | "alerta" | "bloqueado";
    porque: string;
    detalle: { discoLibres: number; origen: string }[];
    capacidad?: number;
};

type OrigenUnico = { origen: string; medio: string };

function redondear(n: number): number {
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

function esEspejo(origen: string): boolean {
    return /espejo|mirror/i.test(origen);
}

function discosDe(medio: MedioVivo): { discoLibres: number; origen: string }[] {
    return medio.discos.map((d) => ({ discoLibres: redondear(d.libreGb), origen: d.origen }));
}

function totalDe(detalle: { discoLibres: number }[]): number {
    return redondear(detalle.reduce((suma, d) => suma + d.discoLibres, 0));
}

function origenesUnicos(medios: MedioVivo[]): OrigenUnico[] {
    const porOrigen = new Map<string, string[]>();
    for (const medio of medios) {
        for (const disco of medio.discos) {
            const origen = disco.origen.trim();
            if (!origen || esEspejo(origen)) continue;
            const nombres = porOrigen.get(origen) ?? [];
            if (!nombres.includes(medio.nombre)) nombres.push(medio.nombre);
            porOrigen.set(origen, nombres);
        }
    }
    const unicos: OrigenUnico[] = [];
    for (const [origen, nombres] of porOrigen) {
        if (nombres.length === 1) unicos.push({ origen, medio: nombres[0]! });
    }
    return unicos;
}

function avisoDeUnico(unico: OrigenUnico): string {
    return `nunca medio único: ${unico.medio} solo tiene ${unico.origen}`;
}

export function filaAlmacenamiento(medios: MedioVivo[]): FilaMedio {
    const detalle = medios.flatMap(discosDe);
    const capacidad = totalDe(detalle);
    const avisos = origenesUnicos(medios).map(avisoDeUnico);
    const estado: FilaMedio["estado"] = medios.length === 0 || capacidad <= 0 ? "bloqueado" : avisos.length > 0 ? "alerta" : "ok";
    const porque =
        medios.length === 0
            ? "Sin medios medidos: todavía no hay mapa de almacenamiento."
            : `${capacidad} GB libres en ${detalle.length} orígenes de ${medios.length} medios. ${
                  avisos.length > 0 ? avisos.join("; ") : "Regla 2+1 en verde: ningún origen vive en un solo medio."
              }`;
    return { id: "almacenamiento-global", nombre: "Almacenamiento global", estado, porque, detalle, capacidad };
}

export function construirMapaAlmacenamiento(medios: MedioVivo[]): FilaMedio[] {
    const unicos = origenesUnicos(medios);
    const filas = medios.map((medio) => {
        const detalle = discosDe(medio);
        const capacidad = totalDe(detalle);
        const avisosUnicos = unicos
            .filter((u) => u.medio === medio.nombre && medio.discos.some((d) => d.origen.trim() === u.origen))
            .map(avisoDeUnico);
        const avisos = [...medio.avisos, ...avisosUnicos];
        const estado: FilaMedio["estado"] =
            medio.estado === "no_disponible"
                ? "bloqueado"
                : medio.estado === "requiere_alex" || avisos.length > 0
                  ? "alerta"
                  : "ok";
        const porque = `${medio.detalle.trim() || "Sin detalle de la sonda."}${
            avisos.length > 0 ? ` Avisos: ${avisos.join("; ")}.` : ""
        }`;
        return { id: medio.id, nombre: medio.nombre, estado, porque, detalle, capacidad };
    });
    return [...filas, filaAlmacenamiento(medios)];
}
