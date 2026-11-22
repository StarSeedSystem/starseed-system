/**
 * UNI1115M · costura a: LA tabla de los comandos de Tauri del aparato controlado, con los nombres de argumento
 * EXACTOS que la web manda y que Rust espera (contrato §12). Tauri 2 pasa los argumentos en camelCase salvo que el
 * comando diga `rename_all = "snake_case"`: por eso `lado_max` lo dice y los demás son de una sola palabra.
 * Dos pruebas la vigilan: `nativo-comandos.test.ts` (web y firmas de Rust) y `control_entrada_logica::tests` (Rust).
 * Este archivo es la fuente: Rust lo lee con `include_str!`, así que cada línea es `nombre: ["arg", …],`.
 */
export const COMANDOS_NATIVOS: Readonly<Record<string, readonly string[]>> = {
    control_capacidades: [],
    control_abrir_ajuste: ["cual"],
    control_pantalla_iniciar: ["sesion", "lado_max", "calidad", "fuente"],
    control_pantalla_cuadro: ["sesion", "desde"],
    control_pantalla_parar: ["sesion"],
    control_estado_aparato: [],
    control_entrada: ["sesion", "sobre"],
    control_entrada_aceptar: ["spki", "cuenta", "nombre"],
    control_entrada_aceptados: [],
    control_entrada_quitar: ["huella"],
};

/** RST1116A: ¿el comando admite `fuente`? La tabla es la única fuente de verdad de las claves permitidas. */
export function admiteFuente(nombre: string): boolean {
    return COMANDOS_NATIVOS[nombre]?.includes("fuente") === true;
}
