// src/app/(app)/galeria/page.tsx
// Página de la Galería: grid por fecha, álbumes, filtros, visor y ajustes.
// El motor vive en <GalleryApp/>.

import { GalleryApp } from "@/components/gallery/gallery-app";

export const metadata = {
    title: "Galería · StarSeed",
    description: "Tus fotos y vídeos organizados por fecha y álbumes, con visor, edición básica e Historias.",
};

export default function GaleriaPage() {
    return (
        <main className="mx-auto w-full max-w-6xl px-1 py-2">
            <h1 className="mb-4 text-2xl font-bold">Galería</h1>
            <GalleryApp />
        </main>
    );
}
