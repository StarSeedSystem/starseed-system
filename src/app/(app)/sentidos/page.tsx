"use client";

import SensesPanel from "@/components/senses/senses-panel";

export default function SentidosPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">
          Sentidos · Aurora &amp; Astraura
        </h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Elige qué sentidos (micrófono, cámara, pantalla, ubicación, portapapeles,
          archivos, notificaciones) pueden usar Aurora y Astraura. Cada sentido es una
          capacidad real del navegador y sólo se activa con tu permiso explícito.
        </p>
        <SensesPanel />
      </div>
    </main>
  );
}
