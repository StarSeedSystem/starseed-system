export type IdCanalDireccion = "principal" | "general" | "audiovisual";

export const NOMBRES_CANALES_POR_DEFECTO: Record<IdCanalDireccion, string> = {
    principal: "Principal",
    general: "General",
    audiovisual: "Audiovisual y diseño",
};

export interface EntradaNombreCanal {
    nombre?: unknown;
}

export type RegistroNombresCanales = Partial<Record<IdCanalDireccion, EntradaNombreCanal>>;

function plegar(texto: string): string {
    return texto.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

export function nombreDeCanal(
    canal: IdCanalDireccion,
    registro?: RegistroNombresCanales | null,
): string {
    const crudo = registro?.[canal]?.nombre;
    const nombre = typeof crudo === "string" ? crudo.replace(/\s+/g, " ").trim() : "";
    return nombre || NOMBRES_CANALES_POR_DEFECTO[canal];
}

export function esNombreCanonico(
    canal: IdCanalDireccion,
    nombre: string | null | undefined,
    registro?: RegistroNombresCanales | null,
): boolean {
    return plegar(nombre ?? "") === plegar(nombreDeCanal(canal, registro));
}
