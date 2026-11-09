// src/app/(app)/llamadas/page.tsx
// Llamadas (LLA1108G): empezar una llamada de voz, vídeo o pantalla y el historial con «Volver a llamar».
import type { Metadata } from "next";

import { PaginaLlamadas } from "@/components/llamadas/pagina-llamadas";

export const metadata: Metadata = {
    title: "Llamadas · StarSeed",
    description: "Llama por voz, vídeo o pantalla y revisa el historial: medio usado, duración y grabaciones.",
};

export default function LlamadasPage() {
    return <PaginaLlamadas />;
}
