"use client";
import SecurityPanel from "@/components/security/security-panel";
// Escáner de datos sensibles estilo Strix (Adenda 63 §13): memorias,
// personalidades, biblioteca y claves locales — con redacción en origen.
import SecurityScanPanel from "@/components/security/security-scan-panel";

export default function SeguridadPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-emerald-50">Seguridad · DNS · VPN · VPS</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Protocolos y conexiones de seguridad ajustables e inteligentes (DNS, VPN, VPS, cifrado), configurables de forma global por usuario y por ámbito: cerebro, grupo, página, archivo, publicación, mensaje, memoria y cuenta. Open-source primero · Astraura propone valores seguros.</p>
        <div className="mb-6">
          <SecurityScanPanel />
        </div>
        <SecurityPanel />
      </div>
    </main>
  );
}
