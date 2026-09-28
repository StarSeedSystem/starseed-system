/**
 * Mensajes enriquecidos, apps en vivo y llamadas (2026-09-28) — contrato.
 *
 * Un mensaje BÁSICO sigue siendo lo de siempre: `body` (texto) + `attachments` (audio, foto,
 * cualquier archivo). Lo enriquecido va en la columna `os_dm_messages.formato` (jsonb, null =
 * básico) y SIEMPRE lleva también un `body` de texto plano equivalente (búsqueda, avisos,
 * clientes viejos, lectores de pantalla).
 *
 * Seguridad (núcleo intocable, CLAUDE.md «editable sí, ejecutable no»): el formato es un DATO
 * declarativo con vocabulario cerrado. No hay HTML crudo, ni scripts, ni manejadores. Las
 * «ventanas de sitios web» son iframes con `sandbox`; los «programas» son apps del OS (rutas del
 * catálogo) o especificaciones `UiSpec`; nunca código de otra persona ejecutándose en tu neurona.
 */
import type { DmAttachment } from "@/lib/messages/dm";

// ───────────────────────────── Estilo de un mensaje ─────────────────────────────

export type FuenteMensaje = "inter" | "outfit" | "titular" | "roboto" | "mono" | "serif" | "manuscrita" | "redonda";

/** Familia CSS de cada fuente (las variables de next/font están en <html>). */
export const FUENTES_MENSAJE: { id: FuenteMensaje; nombre: string; css: string }[] = [
    { id: "inter", nombre: "Inter", css: "var(--font-inter), system-ui, sans-serif" },
    { id: "outfit", nombre: "Outfit", css: "var(--font-outfit), system-ui, sans-serif" },
    { id: "titular", nombre: "Titular", css: "var(--font-headline), var(--font-outfit), sans-serif" },
    { id: "roboto", nombre: "Roboto", css: "var(--font-roboto), system-ui, sans-serif" },
    { id: "mono", nombre: "Código", css: "var(--font-code), ui-monospace, monospace" },
    { id: "serif", nombre: "Serif", css: "Georgia, 'Times New Roman', serif" },
    { id: "manuscrita", nombre: "Manuscrita", css: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" },
    { id: "redonda", nombre: "Redonda", css: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif" },
];

export type AnimacionTexto =
    | "ninguna"
    | "aparecer"   // letra a letra, una vez
    | "maquina"    // máquina de escribir, una vez
    | "ola"        // las letras ondulan
    | "brillo"     // destello que recorre el texto
    | "latido"
    | "arcoiris"
    | "neon"
    | "flotar"
    | "temblor";

export type AnimacionFondo = "ninguna" | "aurora" | "estrellas" | "gradiente" | "pulso" | "particulas";

export interface EstiloMensaje {
    fuente?: FuenteMensaje;
    /** px, 11–64. */
    tamano?: number;
    /** Color del texto (hex). */
    color?: string;
    /** Color del marco de la burbuja (hex) y su grosor en px (0–6). */
    colorMarco?: string;
    grosorMarco?: number;
    /** Fondo de la burbuja: color hex o id de `FONDOS_BURBUJA`. */
    fondo?: string;
    animacionTexto?: AnimacionTexto;
    animacionFondo?: AnimacionFondo;
    alineacion?: "izquierda" | "centro" | "derecha";
    negrita?: boolean;
    cursiva?: boolean;
}

export const FONDOS_BURBUJA: { id: string; nombre: string; css: string }[] = [
    { id: "violeta", nombre: "Violeta", css: "linear-gradient(135deg,#7C5CFF,#5B3FD9)" },
    { id: "zenith", nombre: "Zenith", css: "linear-gradient(135deg,#007FFF,#0050B3)" },
    { id: "horizonte", nombre: "Horizonte", css: "linear-gradient(135deg,#10B981,#047857)" },
    { id: "logica", nombre: "Lógica", css: "linear-gradient(135deg,#FFBF00,#B8860B)" },
    { id: "ancla", nombre: "Ancla", css: "linear-gradient(135deg,#DC143C,#8B0A26)" },
    { id: "cristal", nombre: "Cristal", css: "linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.04))" },
    { id: "cosmos", nombre: "Cosmos", css: "radial-gradient(120% 120% at 0% 0%,#2a1650,#0b0d1a 70%)" },
    { id: "atardecer", nombre: "Atardecer", css: "linear-gradient(135deg,#F43F5E,#F59E0B)" },
];

// ───────────────────────── Documento rico (tipo Word) ─────────────────────────

export type MarcaTexto = "negrita" | "cursiva" | "subrayado" | "tachado" | "codigo";

export interface TramoTexto {
    texto: string;
    marcas?: MarcaTexto[];
    color?: string;
    resaltado?: string;
    /** Solo http(s), mailto: o ruta interna que empiece por «/». */
    enlace?: string;
    fuente?: FuenteMensaje;
    tamano?: number;
}

export type AlineacionBloque = "izquierda" | "centro" | "derecha" | "justificado";

export type BloqueDoc =
    | { tipo: "parrafo"; tramos: TramoTexto[]; alineacion?: AlineacionBloque }
    | { tipo: "titulo"; nivel: 1 | 2 | 3; tramos: TramoTexto[]; alineacion?: AlineacionBloque }
    | { tipo: "lista"; ordenada: boolean; items: TramoTexto[][] }
    | { tipo: "tareas"; items: { hecha: boolean; tramos: TramoTexto[] }[] }
    | { tipo: "cita"; tramos: TramoTexto[] }
    | { tipo: "codigo"; texto: string; lenguaje?: string }
    | { tipo: "separador" };

export interface DocRico {
    bloques: BloqueDoc[];
}

// ─────────────────────────── Lienzo de mensaje ───────────────────────────

export type TipoElementoLienzo =
    | "texto"   // DocRico con estilo
    | "imagen"  // foto, png con transparencia
    | "gif"
    | "video"
    | "audio"
    | "web"     // ventana de sitio web (iframe con sandbox)
    | "app"     // app del OS por ruta del catálogo, en ventana
    | "vivo"    // app en vivo compartida (ver AdjuntoVivo)
    | "archivo"
    | "forma";

export interface ElementoLienzo {
    id: string;
    tipo: TipoElementoLienzo;
    /** Posición y tamaño en unidades del lienzo (ver `LienzoMensaje.ancho/alto`). */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Grados. */
    rot?: number;
    z: number;
    opacidad?: number;
    /** Radio de esquinas en px. */
    radio?: number;
    bloqueado?: boolean;
    texto?: DocRico;
    estilo?: EstiloMensaje;
    url?: string;
    nombre?: string;
    mime?: string;
    /** Para «app»: ruta interna («/pizarra/…»); para «vivo»: el adjunto vivo completo. */
    ruta?: string;
    vivo?: AdjuntoVivo;
    forma?: { tipo: "rect" | "circulo" | "estrella" | "linea"; color: string; relleno?: boolean };
    /** Reproducción de vídeo/audio/gif. */
    autoplay?: boolean;
    bucle?: boolean;
    silenciado?: boolean;
}

export interface LienzoMensaje {
    ancho: number;
    alto: number;
    fondo?: string;
    animacionFondo?: AnimacionFondo;
    elementos: ElementoLienzo[];
}

export interface FormatoMensaje {
    v: 1;
    /** Estilo de todo el mensaje (tipografía, tamaño, color, marco, animaciones, fondo). */
    estilo?: EstiloMensaje;
    /** Texto con formato tipo Word. */
    doc?: DocRico;
    /** Composición libre: varios formatos con tamaño y posición. */
    lienzo?: LienzoMensaje;
}

/** Límites (los valida `validarFormato` en `formato.ts`). */
export const LIMITES_FORMATO = {
    bytes: 150_000,
    elementosLienzo: 40,
    bloquesDoc: 200,
    tamanoMin: 11,
    tamanoMax: 64,
    lienzoMax: 4000,
} as const;

// ─────────────────────── Apps en vivo, llamadas y sesiones ───────────────────────

export type TipoVivo =
    | "sala"
    | "pizarra"
    | "documento"
    | "presentacion"
    | "tabla"
    | "navegador"
    | "juego"
    | "programa"
    | "escritorio"
    | "dashboard"
    | "escena3d"
    | "xr";

export type TipoLlamada = "audio" | "video" | "sala-vr" | "sala-ar";

/** Quién puede entrar: los del chat, invitados concretos, o cualquiera con el enlace público. */
export type ModoAcceso = "chat" | "invitados" | "publico";
export type PermisoVivo = "ver" | "comentar" | "editar";

export interface AccesoVivo {
    modo: ModoAcceso;
    permiso: PermisoVivo;
}

/** Fila de `os_sesiones_vivas` (una app en vivo o una llamada). */
export interface SesionViva {
    id: string;
    /** `vivo:<TipoVivo>` o `llamada:<TipoLlamada>`. */
    tipo: string;
    hiloId: string | null;
    creador: string;
    titulo: string | null;
    refId: string | null;
    ruta: string | null;
    modo: ModoAcceso;
    permiso: PermisoVivo;
    invitados: string[];
    /** Solo lo ve el creador; forma parte del enlace público. */
    tokenPublico: string | null;
    estado: "activa" | "terminada";
    creada: string;
    caduca: string | null;
}

/** Adjunto de un mensaje que abre una app en vivo (`DmAttachment` con kind "vivo"). */
export interface AdjuntoVivo extends DmAttachment {
    kind: "vivo";
    tipoVivo: TipoVivo;
    sesionId: string;
    /** Ruta in-app que abre la app sincronizada. */
    route: string;
    name: string;
    permiso: PermisoVivo;
}

/** Adjunto de un mensaje que es una llamada (`DmAttachment` con kind "llamada"). */
export interface AdjuntoLlamada extends DmAttachment {
    kind: "llamada";
    tipoLlamada: TipoLlamada;
    sesionId: string;
    route: string;
    name: string;
}

/**
 * API de sesiones (la implementa `src/lib/mensajeria/sesiones-vivas.ts`).
 * Enlaces: privado `/vivo/<id>` (requiere sesión y ser del chat o invitado) · público
 * `/vivo/<id>?t=<token>` (cualquiera; entra por la RPC `unirse_sesion_publica`). Las llamadas usan
 * `/llamada/<id>` con las mismas reglas.
 */
export interface SesionesVivasApi {
    crearSesion(input: {
        tipo: string;
        hiloId?: string | null;
        titulo?: string | null;
        refId?: string | null;
        ruta?: string | null;
        acceso?: Partial<AccesoVivo>;
        invitados?: string[];
    }): Promise<{ sesion: SesionViva | null; error: string | null }>;
    obtenerSesion(id: string, token?: string | null): Promise<{ sesion: SesionViva | null; error: string | null }>;
    invitar(id: string, userIds: string[]): Promise<string | null>;
    /** Crea (o rota) el token del enlace público; devuelve la URL absoluta. */
    crearEnlacePublico(id: string, permiso?: PermisoVivo): Promise<{ url: string | null; error: string | null }>;
    revocarEnlacePublico(id: string): Promise<string | null>;
    terminarSesion(id: string): Promise<string | null>;
    enlacePrivado(sesion: Pick<SesionViva, "id" | "tipo">): string;
}
