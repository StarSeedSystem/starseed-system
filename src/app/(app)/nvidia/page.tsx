"use client";

/**
 * /nvidia — "NVIDIA NIM · Modelos y Skills".
 *
 * Página dedicada que monta <NvidiaNimPanel /> para conectar la API-catalog de
 * NVIDIA NIM (compatible con OpenAI) con una clave gratis del Developer Program,
 * explorar el catálogo de modelos (LLM, visión, imagen, código, embeddings, voz)
 * y las skills/blueprints agénticos, con guías inteligentes.
 *
 * Se enlaza desde /servicios (vista "Servicios open-source") y desde la
 * Librería (los servicios NVIDIA se proyectan como items categorizados). Aquí
 * el usuario configura su clave y elige modelos NVIDIA por función.
 */

import Link from "next/link";
import { Cpu, ArrowLeft, Network } from "lucide-react";
import { NvidiaNimPanel } from "@/components/services/nvidia-nim-panel";

export default function NvidiaPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabecera */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex items-center gap-3 text-2xl font-bold">
              <Cpu className="h-7 w-7 text-[#76b900]" />
              NVIDIA NIM
            </h1>
            <Link
              href="/servicios"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Servicios y Fuentes
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Modelos y skills de IA de NVIDIA como fuente de tu Exocórtex —{" "}
            compatibles con OpenAI, con clave <strong>gratis</strong> del
            Developer Program. Elige qué modelo NVIDIA usa cada función (texto,
            imagen, código, voz).
          </p>
          <Link
            href="/library"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-1.5 text-xs text-primary transition hover:bg-primary/[0.12]"
          >
            <Network className="h-3.5 w-3.5" />
            Ver también en la Librería (Servicios · IA · Imagen · Voz)
          </Link>
        </div>

        <NvidiaNimPanel scope="user" />
      </div>
    </main>
  );
}
