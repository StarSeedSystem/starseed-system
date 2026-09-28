// /inicio — la pantalla de inicio sencilla del perfil (Ola 381 · INI3).
import type { Metadata } from "next";
import { PantallaInicio } from "@/components/inicio/pantalla-inicio";

export const metadata: Metadata = { title: "Inicio" };

export default function InicioPage() {
    return <PantallaInicio />;
}
