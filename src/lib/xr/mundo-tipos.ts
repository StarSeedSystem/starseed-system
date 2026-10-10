/**
 * StarSeed XR · MUNDOSPEC (tipos y límites). Un mundo virtual es DATO declarativo, igual que `UiSpec`:
 * vocabulario cerrado, sin scripts, sin HTML, sin manejadores con código. La lógica compleja la propone la
 * Protomolécula como candidato aislado (contrato §6); aquí sólo caben las reglas de la lista cerrada.
 * Módulo PURO.
 */
import type { RolSala } from "@/lib/salas/sala";
import type { NivelCalidad, Vec3 } from "./tipos";

export const VERSION_MUNDO = 1;
/** `ninguno` = sin cielo (AR passthrough: el cielo es tu cuarto). Los seis primeros son los de `vivo/espacial/modelo`. */
export const CIELOS_MUNDO = ["nebulosa", "amanecer", "mediodia", "atardecer", "noche", "estudio", "ninguno"] as const;
export type CieloMundo = (typeof CIELOS_MUNDO)[number];
export const FORMAS_PRIMITIVAS = ["caja", "esfera", "cilindro", "cono", "toro", "plano", "capsula"] as const;
export const FORMATOS_BIBLIOTECA = ["glb", "splat", "imagen", "audio", "avatar-vrm"] as const;
export const TERRENOS = ["vacio", "plano", "colinas", "islas", "agua"] as const;
export const EFECTOS_ZONA = ["nada", "punto-reunion", "escenario", "audio-privado", "silencio", "gravedad-cero", "zona-segura"] as const;
export const CUERPOS = ["fijo", "dinamico", "cinematico"] as const;
export const FORMAS_CUERPO = ["caja", "esfera", "capsula", "convexa"] as const;

export type FuenteObjeto =
    | { tipo: "primitiva"; forma: (typeof FORMAS_PRIMITIVAS)[number] }
    | { tipo: "biblioteca"; id: string; formato: (typeof FORMATOS_BIBLIOTECA)[number] }
    | { tipo: "texto"; contenido: string };

export interface CuerpoFisico {
    tipo: (typeof CUERPOS)[number];
    forma: (typeof FORMAS_CUERPO)[number];
    masa: number;
    rebote: number;
    friccion: number;
    agarrable: boolean;
}

export interface ObjetoMundo {
    id: string;
    nombre: string;
    fuente: FuenteObjeto;
    pos: Vec3;
    rot: Vec3;
    esc: Vec3;
    color: string;
    oculto?: boolean;
    cuerpo?: CuerpoFisico;
    /** Triángulos declarados (fichas de la Biblioteca); si falta se estima. */
    triangulos?: number;
    /** 0 = decorativo (se poda primero) … 3 = imprescindible. */
    prioridad: 0 | 1 | 2 | 3;
}

export interface LuzMundo {
    id: string;
    clase: "ambiente" | "direccional" | "puntual" | "foco";
    pos: Vec3;
    color: string;
    intensidad: number;
    alcance: number;
}

export type DestinoPortal =
    | { tipo: "punto"; spawn: string }
    | { tipo: "mundo" | "estacion" | "servidor" | "sala"; id: string };

export interface PortalMundo { id: string; nombre: string; pos: Vec3; rot: Vec3; radio: number; destino: DestinoPortal }
export interface ZonaMundo { id: string; nombre: string; forma: "caja" | "esfera"; pos: Vec3; tam: Vec3; efecto: (typeof EFECTOS_ZONA)[number] }
export interface PizarraMundo { id: string; pos: Vec3; rot: Vec3; ancho: number; alto: number; salaId?: string }
export type FuentePantalla = { tipo: "estacion"; id: string } | { tipo: "llamada" } | { tipo: "https"; url: string } | { tipo: "app"; ruta: string };
export interface PantallaMundo { id: string; pos: Vec3; rot: Vec3; ancho: number; fuente: FuentePantalla; sonido: "espacial" | "mudo" }
export interface SpawnMundo { id: string; pos: Vec3; yaw: number }

export type Disparador =
    | { tipo: "al-entrar" | "al-salir"; zona: string }
    | { tipo: "al-tocar" | "al-agarrar" | "al-soltar" | "al-chocar"; objeto: string }
    | { tipo: "cada"; ms: number }
    | { tipo: "al-llegar-persona" };

export type AccionMundo =
    | { tipo: "mostrar" | "ocultar" | "alternar"; objeto: string }
    | { tipo: "mover" | "girar"; objeto: string; valor: Vec3; ms: number }
    | { tipo: "color"; objeto: string; color: string }
    | { tipo: "fuerza"; objeto: string; vector: Vec3 }
    | { tipo: "sonido"; fuente: string; objeto?: string }
    | { tipo: "teletransportar"; spawn: string }
    | { tipo: "mensaje"; texto: string }
    | { tipo: "cielo"; cielo: CieloMundo }
    | { tipo: "abrir-pizarra"; pizarra: string }
    | { tipo: "abrir-pantalla"; pantalla: string }
    | { tipo: "pedir-a-astraura"; texto: string };

export interface ReglaMundo { id: string; cuando: Disparador; entonces: AccionMundo[]; unaVez?: boolean }

export interface MundoSpec {
    version: 1;
    tipo: "mundo-xr";
    nombre: string;
    descripcion?: string;
    modo: "vr" | "ar" | "ambos";
    entorno: { cielo: CieloMundo; terreno: (typeof TERRENOS)[number]; tamano: number; colorSuelo: string; semilla: number; alturaMax: number };
    fisica: { gravedad: number; suelo: boolean };
    interaccion: { tocar: RolSala; agarrar: RolSala };
    maxJugadores: number;
    spawns: SpawnMundo[];
    luces: LuzMundo[];
    objetos: ObjetoMundo[];
    portales: PortalMundo[];
    zonas: ZonaMundo[];
    pizarras: PizarraMundo[];
    pantallas: PantallaMundo[];
    reglas: ReglaMundo[];
}

export interface LimitesMundo {
    objetos: number; luces: number; cuerpos: number; jugadores: number; portales: number;
    pantallas: number; pizarras: number; zonas: number; triangulos: number;
}
export const LIMITES: Record<NivelCalidad, LimitesMundo> = {
    minima: { objetos: 40, luces: 2, cuerpos: 20, jugadores: 4, portales: 4, pantallas: 1, pizarras: 1, zonas: 8, triangulos: 80_000 },
    baja: { objetos: 100, luces: 3, cuerpos: 60, jugadores: 8, portales: 8, pantallas: 2, pizarras: 2, zonas: 16, triangulos: 200_000 },
    media: { objetos: 200, luces: 5, cuerpos: 150, jugadores: 12, portales: 16, pantallas: 3, pizarras: 4, zonas: 32, triangulos: 500_000 },
    alta: { objetos: 400, luces: 8, cuerpos: 300, jugadores: 24, portales: 32, pantallas: 6, pizarras: 8, zonas: 64, triangulos: 1_000_000 },
    maxima: { objetos: 800, luces: 12, cuerpos: 600, jugadores: 48, portales: 64, pantallas: 10, pizarras: 16, zonas: 128, triangulos: 2_500_000 },
};
export const MAX_REGLAS = 64;
export const MAX_ACCIONES_POR_REGLA = 6;
