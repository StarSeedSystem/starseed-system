import { createHash } from "node:crypto";

import {
    type Confianza as ConfianzaImport,
    enmascarar,
    reconocer,
} from "@/lib/mando/claves-forma";

export { enmascarar };

export type Confianza = ConfianzaImport;

export type Reconocida = {
    proveedor: string;
    variable: string;
    confianza: Confianza;
    huella: string;
};

export function huellaDe(clave: string): string {
    const hash = createHash("sha256").update(clave).digest("hex");
    return hash.slice(0, 12);
}

export function reconocidaConHuella(clave: string): Reconocida {
    const forma = reconocer(clave);
    return {
        ...forma,
        huella: huellaDe(clave),
    };
}