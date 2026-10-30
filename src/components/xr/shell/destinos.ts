/*
 * StarSeed XR · NODO HORIZON · listado de destinos (XR1010AO · contrato §3 a/h).
 * Módulo PURO: sin red, sin disco, sin `node:*`. Quién ve/edita y por dónde viaja
 * lo decide SIEMPRE el contrato único de sala (`@/lib/salas/sala`); aquí sólo se
 * agrupa, se etiqueta y se ordena: privados primero, públicos después con
 * «Público». Lo que no se puede ver no aparece ni se consulta.
 */
import type { Alcanzabilidad, RolSala, Sala, TipoSala, TransporteSala } from "@/lib/salas/sala";
import { elegirTransporte, puedeEditar, puedeVer, rolDe } from "@/lib/salas/sala";

export type CategoriaDestino = "mis-mundos" | "estaciones-en-vivo" | "servidores" | "grupos";

/** Lo mínimo que trae una fila real (estación, servidor, grupo, escena…) para el listado. */
export interface DestinoCrudo {
    id: string; nombre: string; visibilidad: Sala["visibilidad"];
    /** Tipo de sala si se conoce; sin él se toma `escena3d` (un mundo XR). */
    tipo?: TipoSala;
    servidorUrl?: string;
    /** miembro → rol; vacío cuando la fila no declara membresía. */
    miembros?: Record<string, RolSala>;
}

/** Un destino del panel Horizon, con lo que la persona puede hacer allí. */
export interface ItemDestino {
    id: string; nombre: string;
    transporte: TransporteSala | "desconocido";
    rol: RolSala | null;
    puedeVer: boolean; puedeEditar: boolean; privado: boolean;
    /** «Público», «Privado» o «De tu grupo». */
    etiqueta: string;
}

export interface GrupoDestinos { categoria: CategoriaDestino; items: ItemDestino[]; }

export interface DatosDestinos {
    mundos: DestinoCrudo[]; estaciones: DestinoCrudo[]; servidores: DestinoCrudo[]; grupos: DestinoCrudo[];
    /** Otras salas compartidas; las de tipo mundo (escena3d/xr) entran en «mis-mundos». */
    salas: DestinoCrudo[];
    /** Caminos disponibles ahora; por defecto internet y malla P2P, sin servidor propio. */
    alcanzabilidad?: Alcanzabilidad;
}

const ETIQUETA = { privada: "Privado", grupo: "De tu grupo", publica: "Público" } as const;
const POR_DEFECTO: Alcanzabilidad = { internet: true, servidorPrivado: false, malla: true };

/** La fila cruda como `Sala` del contrato, para que la matriz de roles siga siendo UNA. */
function aSala(x: DestinoCrudo): Sala {
    return {
        id: x.id, tipo: x.tipo ?? "escena3d", titulo: x.nombre, visibilidad: x.visibilidad,
        transporte: "local", servidorUrl: x.servidorUrl, miembros: x.miembros ?? {}, creadaEn: 0,
    };
}

function itemDe(x: DestinoCrudo, esGrupo: boolean, a: Alcanzabilidad, yo: string): ItemDestino {
    const sala = aSala(x);
    return {
        id: x.id, nombre: x.nombre,
        transporte: esGrupo ? "desconocido" : elegirTransporte(sala, a).transporte,
        rol: rolDe(sala, yo), puedeVer: true, puedeEditar: puedeEditar(sala, yo),
        privado: sala.visibilidad !== "publica", etiqueta: ETIQUETA[sala.visibilidad],
    };
}

export function listarDestinos(d: DatosDestinos, yo: string): GrupoDestinos[] {
    const a = d.alcanzabilidad ?? POR_DEFECTO;
    const listas: { categoria: CategoriaDestino; filas: DestinoCrudo[]; esGrupo: boolean }[] = [
        {
            categoria: "mis-mundos", esGrupo: false,
            filas: [...d.mundos, ...d.salas.filter((s) => !s.tipo || s.tipo === "escena3d" || s.tipo === "xr")],
        },
        { categoria: "estaciones-en-vivo", filas: d.estaciones, esGrupo: false },
        { categoria: "servidores", filas: d.servidores, esGrupo: false },
        { categoria: "grupos", filas: d.grupos, esGrupo: true },
    ];
    return listas.map(({ categoria, filas, esGrupo }) => {
        const visibles: ItemDestino[] = [];
        for (const fila of filas) {
            if (puedeVer(aSala(fila), yo)) visibles.push(itemDe(fila, esGrupo, a, yo));
        }
        const privados = visibles.filter((i) => i.privado);
        const publicos = visibles.filter((i) => !i.privado);
        return { categoria, items: [...privados, ...publicos] };
    });
}

/* ───── Adaptadores puros de las filas de los servicios reales (sin red) ───── */

/** Una estación de `listarEstaciones` (visibilidad «publica|grupo»); si es tuya, dueño. */
export function destinoDeEstacion(e: { id: string; titulo: string | null; visibilidad: string | null; owner_id?: string | null }, yo: string): DestinoCrudo {
    return {
        id: e.id, nombre: e.titulo || "Estación", visibilidad: e.visibilidad === "grupo" ? "grupo" : "publica", tipo: "xr",
        miembros: e.owner_id === yo ? { [yo]: "dueno" } : {},
    };
}

/** Un servidor de `listServers` («public|private|group»); sin rol en uno privado, no se lista. */
export function destinoDeServidor(s: { id: string; name: string; visibility: string | null; isOwner?: boolean; myRole?: string | null }, yo: string): DestinoCrudo {
    const visibilidad: Sala["visibilidad"] = s.visibility === "public" ? "publica" : s.visibility === "group" ? "grupo" : "privada";
    const rol: RolSala | null =
        s.isOwner || s.myRole === "owner" ? "dueno" : s.myRole === "admin" ? "editor" : s.myRole === "member" ? "comentarista" : null;
    return { id: s.id, nombre: s.name || "Servidor", visibilidad, tipo: "escritorio", miembros: rol ? { [yo]: rol } : {} };
}

/** Un grupo de `fetchGroups` (verado público); sin membresía declarada, sin rol. */
export function destinoDeGrupo(g: { id: string; name: string | null }): DestinoCrudo {
    return { id: g.id, nombre: g.name || "Grupo", visibilidad: "publica", tipo: "escena3d", miembros: {} };
}

/** Un mundo propio de `listarMiosXr`: su dueño eres tú; privado hasta que se comparta. */
export function destinoDeMundo(m: { refId: string; titulo: string | null }, yo: string): DestinoCrudo {
    return { id: m.refId, nombre: m.titulo || "Mundo", visibilidad: "privada", tipo: "escena3d", miembros: { [yo]: "dueno" } };
}

/** Una sala compartida de `listarEscenasCompartidas`: la ves; sin dato del rol, observador. */
export function destinoDeSala(s: { id: string; titulo: string | null }, yo: string): DestinoCrudo {
    return { id: s.id, nombre: s.titulo || "Sala", visibilidad: "grupo", tipo: "escena3d", miembros: { [yo]: "observador" } };
}
