"use client";

/*
 * /estudio — Estudio Universal de Diseño.
 * Ruta NUEVA (ver DesignStudio.tsx para el porqué frente a construir sobre
 * `/design-canvas`, que está fuertemente acoplado a `appearance-context` en
 * plena refactorización paralela). Aditiva: no reemplaza ni enlaza fuera
 * `/design-canvas`, que sigue intacto.
 */

import { DesignStudio } from "@/components/estudio/DesignStudio";

export default function EstudioPage() {
    return <DesignStudio />;
}
