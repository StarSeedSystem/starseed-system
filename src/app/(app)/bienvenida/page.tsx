"use client";

/**
 * /bienvenida — permite revisitar la guía de StarSeed con Astraura en cualquier
 * momento. Renderiza el wizard en línea (baúles-style <main>).
 */

import OnboardingWizard from "@/components/onboarding/onboarding-wizard";

export default function BienvenidaPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Bienvenida · Guía de StarSeed con Astraura</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Repasa cómo vincular, conectar, crear, publicar y usar cada área de la red. Crea tu identidad (@handle),
          tu dirección StarSeed y tu recuperación, o empieza con la voz de Aurora.
        </p>
        <OnboardingWizard />
      </div>
    </main>
  );
}
