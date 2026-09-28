// src/app/(app)/juego/page.tsx
// Juegos en vivo (L4 · 2026-09-28): portada para crear una sala de tres en raya, Conecta 4, ajedrez
// o Dibujo-adivina y volver a tus salas. La partida vive en /juego/<id>.

import type { Metadata } from "next";
import { HubJuegos } from "@/components/vivo/juegos/hub-juegos";

export const metadata: Metadata = {
    title: "Juegos en vivo · StarSeed",
    description: "Tres en raya, Conecta 4, ajedrez y Dibujo-adivina en tiempo real con las personas de tu chat.",
};

export default function JuegoPage() {
    return <HubJuegos />;
}
