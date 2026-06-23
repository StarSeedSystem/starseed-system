"use client";

// src/app/(app)/insignias/page.tsx
// Módulo 7 — Insignias y Logros. Catálogo completo de insignias del ecosistema,
// agrupado por área, mostrando las obtenidas por el usuario frente a las
// bloqueadas, con su criterio/descripción. SSR-safe (toda la carga ocurre en el
// cliente tras getUser, dentro de BadgesPanel).

import BadgesPanel from "@/components/badges/badges-panel";

export default function InsigniasPage() {
    return (
        <div className="container mx-auto max-w-6xl px-4 py-6">
            <BadgesPanel />
        </div>
    );
}
