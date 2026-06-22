"use client";

import MyActivity from "@/components/decisions/my-activity";

export default function MiActividadPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-emerald-50">Mi actividad democrática</h1>
        <p className="mb-6 mt-1 text-sm text-white/50">
          Tu huella en la Ontocracia de StarSeed: las propuestas que has creado, los votos que has emitido y los
          resultados que te afectan. Notifica por Telegram a los participantes y mantén el pulso de tus decisiones.
        </p>
        <MyActivity />
      </div>
    </main>
  );
}
