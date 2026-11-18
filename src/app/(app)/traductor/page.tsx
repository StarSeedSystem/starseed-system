// src/app/(app)/traductor/page.tsx
// Página de la app Traductor: texto, conversación y paquetes offline. El motor vive en <TraductorApp/>.

import { TraductorApp } from "@/components/traductor/traductor-app";

export const metadata = {
    title: "Traductor · StarSeed",
    description: "Traduce texto, mantén conversaciones y descarga paquetes de idioma para usar sin internet.",
};

export default function TraductorPage() {
    return (
        <main className="flex flex-1 flex-col">
            <TraductorApp />
        </main>
    );
}