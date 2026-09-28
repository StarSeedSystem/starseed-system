// src/app/(app)/documentos/page.tsx
// «Mis documentos y presentaciones» (L2 · 2026-09-28): los tuyos y los que te compartieron, con
// botones para crear uno nuevo. Toda la lógica vive en <MisDocumentos/>.

import type { Metadata } from "next";
import { MisDocumentos } from "@/components/vivo/documento/mis-documentos";

export const metadata: Metadata = {
    title: "Documentos y presentaciones · StarSeed",
    description: "Tus documentos y presentaciones compartidos: escríbelos y preséntalos con otras personas a la vez.",
};

export default function DocumentosPage() {
    return <MisDocumentos />;
}
