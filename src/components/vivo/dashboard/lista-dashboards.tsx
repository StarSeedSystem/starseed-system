"use client";
/** Portada de `/dashboard-compartido`: mis dashboards, los que me compartieron y crear uno nuevo. */
import { LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { crearVivoDashboard, INFO_VIVO_DASHBOARD, listarDashboardsLocales, rutaDashboard, type DashboardLocal } from "@/lib/vivo/dashboard";
import { ListaEspacios } from "../tabla/lista-espacios";

export function ListaDashboards() {
    // Los tableros personales están en este dispositivo: se leen ya montado (no hay nada en el servidor).
    const [locales, setLocales] = useState<DashboardLocal[]>([]);
    useEffect(() => setLocales(listarDashboardsLocales()), []);
    const origen = locales.find((l) => l.widgets > 0) ?? null;

    return (
        <ListaEspacios
            tipo="dashboard"
            titulo={INFO_VIVO_DASHBOARD.etiqueta}
            descripcion="Un tablero con los mismos widgets de tu dashboard, que se organiza entre varias personas en vivo. Se comparte el acomodo y la configuración; los datos de cada widget siguen siendo de cada persona."
            Icono={LayoutDashboard}
            color={INFO_VIVO_DASHBOARD.color}
            rutaDe={rutaDashboard}
            crear={(titulo, desdeMio) => crearVivoDashboard(titulo, { desdeLocal: desdeMio && origen ? origen.id : null })}
            etiquetaCrear="Crear un dashboard compartido"
            ayudaVacio="Aún no tienes ningún dashboard compartido. Ponle un nombre arriba y crea el primero, o abre el enlace de uno que te hayan compartido."
            opcionCrear={
                origen
                    ? {
                          etiqueta: `Empezar con el acomodo de «${origen.nombre}»`,
                          ayuda: "Copia qué widgets hay, dónde están y su estilo. No copia tus datos ni nada que tenga código.",
                          porDefecto: false,
                      }
                    : undefined
            }
        />
    );
}
