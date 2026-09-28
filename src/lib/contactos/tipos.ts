/**
 * Contactos (2026-09-28) — contrato de datos. SUSTITUYE a «seguir» para personas (las páginas,
 * comunidades, E.F. y partidos se siguen siguiendo con `os_follows`, eso no cambia).
 *
 * Dónde vive cada cosa:
 * - La libreta entera (contactos, categorías, listas) es PRIVADA de la cuenta: `entity_state`
 *   con dueño `{kind:"user", id:<uid>}` y clave `CLAVE_CONTACTOS`. Local primero (caché en
 *   localStorage), sin suscripción en vivo a la tabla: el aviso entre dispositivos va por
 *   `live-signal` (tema `TEMA_CONTACTOS`), igual que la Biblioteca.
 * - Las notas de cada persona van en su propio documento (`claveNotas(id)`), cargado solo al
 *   abrir la ficha: la libreta no crece con años de notas.
 * - Lo único que sale de la cuenta es la LISTA PÚBLICA: `os_contactos_publicos` (dueño, contacto,
 *   etiqueta). Ni teléfono, ni correo, ni notas, ni descripción viajan nunca ahí.
 * - Un contacto sin cuenta StarSeed (manual, vCard) NUNCA puede ser público: es un tercero que no
 *   ha consentido aparecer en la red.
 *
 * Sincronía entre dispositivos: cada elemento lleva `actualizado`; al fusionar gana el más
 * reciente por elemento y los borrados son lápidas (`borrado`), nunca desaparición física, para
 * que un dispositivo viejo no resucite lo que otro borró.
 */

export const CLAVE_CONTACTOS = "contactos";
export const claveNotas = (contactoId: string) => `contacto-notas:${contactoId}`;
/** Tema de `live-signal` para avisar a los otros dispositivos de la cuenta de que la libreta cambió. */
export const temaContactos = (uid: string) => `contactos:${uid}`;
/** Tabla de la lista pública. */
export const TABLA_CONTACTOS_PUBLICOS = "os_contactos_publicos";

export type VisibilidadContacto = "publica" | "privada";

export type TipoRelacion =
    | "familia"
    | "pareja"
    | "amistad"
    | "comunidad"
    | "trabajo"
    | "estudio"
    | "mentoria"
    | "vecindad"
    | "salud"
    | "servicio"
    | "otra";

export interface RelacionInfo {
    id: TipoRelacion;
    etiqueta: string;
    /** Color de acento (hex) para chips y la línea de tiempo. */
    color: string;
    /** Nombre del icono de lucide-react. */
    icono: string;
}

export const RELACIONES: RelacionInfo[] = [
    { id: "familia", etiqueta: "Familia", color: "#F59E0B", icono: "Home" },
    { id: "pareja", etiqueta: "Pareja", color: "#F43F5E", icono: "Heart" },
    { id: "amistad", etiqueta: "Amistad", color: "#10B981", icono: "Smile" },
    { id: "comunidad", etiqueta: "Comunidad", color: "#39FF14", icono: "Users" },
    { id: "trabajo", etiqueta: "Trabajo", color: "#007FFF", icono: "Briefcase" },
    { id: "estudio", etiqueta: "Estudio", color: "#8B5CF6", icono: "GraduationCap" },
    { id: "mentoria", etiqueta: "Mentoría", color: "#D4AF37", icono: "Compass" },
    { id: "vecindad", etiqueta: "Vecindad", color: "#14B8A6", icono: "MapPin" },
    { id: "salud", etiqueta: "Salud y cuidados", color: "#EC4899", icono: "Stethoscope" },
    { id: "servicio", etiqueta: "Servicios", color: "#94A3B8", icono: "Wrench" },
    { id: "otra", etiqueta: "Otra", color: "#A78BFA", icono: "Sparkles" },
];

/** Teléfono o correo con su etiqueta («móvil», «casa», «trabajo»…). */
export interface DatoEtiquetado {
    id: string;
    etiqueta: string;
    valor: string;
}

export interface EnlaceContacto {
    id: string;
    titulo: string;
    url: string;
}

/** Instantánea del perfil StarSeed de la persona, para pintar aunque su perfil deje de ser legible. */
export interface PerfilInstantanea {
    nombre: string;
    avatarUrl?: string;
    bio?: string;
    /** Cuándo se tomó la instantánea (ISO). */
    tomada: string;
}

export type OrigenContacto = "starseed" | "manual" | "vcard" | "seguido";

export interface Contacto {
    /** id local estable (uuid). */
    id: string;
    /** Cuenta StarSeed vinculada, si la tiene. */
    userId?: string | null;
    /** @usuario StarSeed (sin @), si lo tiene. */
    username?: string | null;
    perfil?: PerfilInstantanea | null;
    /** Nombre con el que YO lo guardo (por defecto, el de su perfil). */
    nombre: string;
    apodo?: string;
    /** Descripción personal: quién es para mí. */
    descripcion?: string;
    relacion: TipoRelacion;
    /** Matiz libre de la relación («prima», «compañero de huerto»…). */
    relacionDetalle?: string;
    telefonos: DatoEtiquetado[];
    correos: DatoEtiquetado[];
    enlaces: EnlaceContacto[];
    organizacion?: string;
    cargo?: string;
    direccion?: string;
    /** «AAAA-MM-DD» o «--MM-DD» si no se sabe el año. */
    cumpleanos?: string;
    /** ids de `CategoriaContactos`. */
    categorias: string[];
    /** ids de `ListaContactos`. */
    listas: string[];
    favorito: boolean;
    visibilidad: VisibilidadContacto;
    origen: OrigenContacto;
    creado: string;
    actualizado: string;
    /** Lápida (ISO) — borrado, pero se conserva para que la fusión no lo resucite. */
    borrado?: string | null;
}

/** Categoría: etiqueta de color, un contacto puede tener varias. */
export interface CategoriaContactos {
    id: string;
    nombre: string;
    color: string;
    creado: string;
    actualizado: string;
    borrado?: string | null;
}

/** Lista: selección con nombre y orden propio («Invitados del solsticio», «Huerto»). */
export interface ListaContactos {
    id: string;
    nombre: string;
    descripcion?: string;
    color: string;
    creado: string;
    actualizado: string;
    borrado?: string | null;
}

export interface ContactosDoc {
    v: 1;
    contactos: Contacto[];
    categorias: CategoriaContactos[];
    listas: ListaContactos[];
    /** true cuando ya se importaron los «seguidos» de personas de `os_follows`. */
    migradoSeguidos?: boolean;
    actualizado: string;
}

export const DOC_VACIO: ContactosDoc = {
    v: 1,
    contactos: [],
    categorias: [],
    listas: [],
    actualizado: "1970-01-01T00:00:00.000Z",
};

export type TipoNota =
    | "nota"
    | "encuentro"
    | "llamada"
    | "mensaje"
    | "hito"
    | "recordatorio"
    | "regalo"
    | "idea";

export const TIPOS_NOTA: { id: TipoNota; etiqueta: string; icono: string; color: string }[] = [
    { id: "nota", etiqueta: "Nota", icono: "StickyNote", color: "#A78BFA" },
    { id: "encuentro", etiqueta: "Encuentro", icono: "Coffee", color: "#10B981" },
    { id: "llamada", etiqueta: "Llamada", icono: "Phone", color: "#007FFF" },
    { id: "mensaje", etiqueta: "Mensaje", icono: "MessageCircle", color: "#38BDF8" },
    { id: "hito", etiqueta: "Hito", icono: "Flag", color: "#D4AF37" },
    { id: "recordatorio", etiqueta: "Recordatorio", icono: "Bell", color: "#F59E0B" },
    { id: "regalo", etiqueta: "Regalo", icono: "Gift", color: "#F43F5E" },
    { id: "idea", etiqueta: "Idea", icono: "Lightbulb", color: "#39FF14" },
];

/** Nota personal PRIVADA sobre una persona; juntas forman su línea de tiempo. */
export interface NotaContacto {
    id: string;
    /** Fecha del hecho que se anota (ISO, puede ser pasada), no la de escritura. */
    fecha: string;
    tipo: TipoNota;
    texto: string;
    etiquetas: string[];
    creado: string;
    actualizado: string;
    borrado?: string | null;
}

export interface NotasDoc {
    v: 1;
    contactoId: string;
    notas: NotaContacto[];
    actualizado: string;
}

/** Fila pública (lo único que ven los demás). */
export interface ContactoPublico {
    ownerId: string;
    contactoUserId: string;
    etiqueta: string | null;
    orden: number;
    creado: string;
}

/** Filtro/orden de la vista de contactos (puro, lo aplica `filtrarContactos`). */
export interface FiltroContactos {
    texto?: string;
    relacion?: TipoRelacion | null;
    categoria?: string | null;
    lista?: string | null;
    visibilidad?: VisibilidadContacto | null;
    soloFavoritos?: boolean;
    soloStarseed?: boolean;
}

export type OrdenContactos = "nombre" | "reciente" | "relacion" | "creado";
export type AgrupacionContactos = "letra" | "relacion" | "categoria" | "ninguna";

/** Datos para crear/editar (lo que rellena el formulario). */
export type ContactoEntrada = Partial<Omit<Contacto, "id" | "creado" | "actualizado" | "borrado">> & {
    nombre: string;
};

/**
 * API del almacén (la implementa `store.ts` con `useContactos()`); la UI programa contra esto.
 * Todas las escrituras son locales al instante y se suben en segundo plano.
 */
export interface ContactosApi {
    listo: boolean;
    /** Sin sesión no hay libreta (se muestra la invitación a entrar). */
    sinSesion: boolean;
    /** Solo los vivos (sin lápida), en el orden guardado. */
    contactos: Contacto[];
    categorias: CategoriaContactos[];
    listas: ListaContactos[];
    /** Error de sincronía legible, o null. */
    error: string | null;
    porId(id: string): Contacto | undefined;
    porUserId(userId: string): Contacto | undefined;
    crear(entrada: ContactoEntrada): Contacto;
    actualizar(id: string, cambios: Partial<ContactoEntrada>): void;
    eliminar(id: string): void;
    alternarFavorito(id: string): void;
    /** Cambia la visibilidad y reconcilia `os_contactos_publicos`. Devuelve el error si no se pudo. */
    cambiarVisibilidad(id: string, v: VisibilidadContacto): Promise<string | null>;
    crearCategoria(nombre: string, color?: string): CategoriaContactos;
    editarCategoria(id: string, cambios: Partial<Pick<CategoriaContactos, "nombre" | "color">>): void;
    eliminarCategoria(id: string): void;
    crearLista(nombre: string, color?: string, descripcion?: string): ListaContactos;
    editarLista(id: string, cambios: Partial<Pick<ListaContactos, "nombre" | "color" | "descripcion">>): void;
    eliminarLista(id: string): void;
    /** Importa contactos (vCard ya parseada): devuelve cuántos nuevos y cuántos fusionados. */
    importar(entradas: ContactoEntrada[]): { nuevos: number; fusionados: number };
}

export interface NotasApi {
    listo: boolean;
    /** Vivas, de la más reciente a la más antigua por `fecha`. */
    notas: NotaContacto[];
    error: string | null;
    agregar(n: { texto: string; tipo?: TipoNota; fecha?: string; etiquetas?: string[] }): NotaContacto;
    editar(id: string, cambios: Partial<Pick<NotaContacto, "texto" | "tipo" | "fecha" | "etiquetas">>): void;
    eliminar(id: string): void;
}
