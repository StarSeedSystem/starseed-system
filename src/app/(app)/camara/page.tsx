// src/app/(app)/camara/page.tsx
// Página de la app Cámara: captura real de foto/vídeo con controles auto y
// manuales, guardado en la biblioteca personal. El motor vive en <CameraApp/>.

import { CameraApp } from "@/components/camera/camera-app";

export const metadata = {
    title: "Cámara · StarSeed",
    description: "Captura fotos y vídeos reales desde tu cámara y guárdalos en tu biblioteca personal.",
};

export default function CamaraPage() {
    return (
        <main className="flex flex-1 flex-col">
            <CameraApp />
        </main>
    );
}
