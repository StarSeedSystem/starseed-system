"use client";

/**
 * /servicios — "Servicios y Fuentes".
 *
 * Superficie central del modelo tri-fuente: lista los dominios funcionales de
 * StarSeed OS (IA, almacenamiento, sentidos, memoria, correo, mapas…) y, para
 * cada uno, expone <TriSourceConfig> para que el usuario elija y module sus
 * fuentes (Servidor propio · Servidor StarSeed · Servidor externo). Todo se
 * sincroniza por usuario vía `service_routes` (Supabase + Realtime).
 */

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TriSourceConfig } from "@/components/services/tri-source-config";
import { OssServicesPanel } from "@/components/services/oss-services-panel";
import {
  Sparkles,
  Database,
  Eye,
  Brain,
  Mail,
  MapPin,
  Network,
  Boxes,
  Layers,
  Plug,
  ArrowUpRight,
} from "lucide-react";

interface DomainDef {
  domain: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  endpointPlaceholder?: string;
  paramHints?: { key: string; label: string; placeholder?: string }[];
}

const DOMAINS: DomainDef[] = [
  {
    domain: "ai",
    label: "IA & Modelos",
    icon: Sparkles,
    title: "Fuentes de IA",
    description:
      "Qué motor responde a tu Exocórtex: tu modelo local, el de StarSeed o una API externa.",
    endpointPlaceholder: "https://mi-llm.local/v1",
    paramHints: [
      { key: "model", label: "Modelo", placeholder: "p.ej. llama3.1 / gpt-4o" },
      { key: "temperature", label: "Temperatura", placeholder: "0.7" },
    ],
  },
  {
    domain: "storage",
    label: "Almacenamiento",
    icon: Database,
    title: "Fuentes de almacenamiento",
    description:
      "Dónde viven tus datos y memorias: tu servidor, StarSeed o un proveedor externo (S3, WebDAV…).",
    endpointPlaceholder: "https://mi-almacen.ejemplo",
    paramHints: [
      { key: "bucket", label: "Bucket / folder", placeholder: "starseed-data" },
      { key: "region", label: "Región", placeholder: "us-east-1" },
    ],
  },
  {
    domain: "senses",
    label: "Sentidos",
    icon: Eye,
    title: "Fuentes de sentidos",
    description:
      "De dónde proceden las señales (voz, visión, ubicación): dispositivo propio, StarSeed o un servicio externo.",
    endpointPlaceholder: "https://mi-gateway-sentidos.ejemplo",
  },
  {
    domain: "memory",
    label: "Memoria",
    icon: Brain,
    title: "Fuentes de memoria",
    description:
      "El sustrato de tu memoria de largo plazo y vectores: base propia, StarSeed o un store externo (Qdrant…).",
    endpointPlaceholder: "https://mi-vector-db.ejemplo",
    paramHints: [
      { key: "collection", label: "Colección", placeholder: "memorias" },
    ],
  },
  {
    domain: "mail",
    label: "Correo",
    icon: Mail,
    title: "Fuentes de correo",
    description:
      "Quién envía y recibe tu correo: tu propio SMTP/IMAP, StarSeed Mail o un proveedor externo.",
    endpointPlaceholder: "smtp://mi-servidor:587",
    paramHints: [
      { key: "from", label: "Remitente", placeholder: "yo@midominio.org" },
    ],
  },
  {
    domain: "maps",
    label: "Mapas",
    icon: MapPin,
    title: "Fuentes de mapas",
    description:
      "El proveedor de tiles y geocodificación: tu instancia, StarSeed o un externo (OSM, Mapbox…).",
    endpointPlaceholder: "https://tiles.miservidor.ejemplo/{z}/{x}/{y}.png",
  },
];

type ViewMode = "fuentes" | "oss";

export default function ServiciosPage() {
  const [active, setActive] = useState<string>(DOMAINS[0].domain);
  const [view, setView] = useState<ViewMode>("fuentes");
  const current = DOMAINS.find((d) => d.domain === active) ?? DOMAINS[0];

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabecera */}
        <div className="mb-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <Network className="h-7 w-7 text-primary" />
            Servicios y Fuentes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Para cada función de StarSeed OS eliges su(s) fuente(s) —{" "}
            <strong>Servidor propio</strong>, <strong>Servidor StarSeed</strong>{" "}
            y <strong>Servidor externo</strong> — las tres a la vez si quieres,
            interconectadas y moduladas (prioridad, balanceo, fusión o failover).
            Todo se sincroniza de forma inteligente por usuario.
          </p>
          <Link
            href="/integraciones"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-1.5 text-xs text-primary transition hover:bg-primary/[0.12]"
          >
            <Plug className="h-3.5 w-3.5" />
            Integraciones y conectores (n8n · AppFlowy · Penpot · Cal.com)
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/nvidia"
            className="mt-3 ml-2 inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-400/[0.12]"
          >
            <Plug className="h-3.5 w-3.5" />
            NVIDIA NIM · Modelos y Skills (clave gratis)
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Selector de vista: modelo tri-fuente ↔ registro de servicios OSS */}
        <div className="mb-6 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setView("fuentes")}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
              view === "fuentes"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Fuentes (tri-fuente)
          </button>
          <button
            onClick={() => setView("oss")}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
              view === "oss"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Boxes className="h-3.5 w-3.5" />
            Servicios open-source
          </button>
        </div>

        {view === "oss" ? (
          <OssServicesPanel scope="user" />
        ) : (
          <TriSourceSection
            active={active}
            setActive={setActive}
            current={current}
          />
        )}
      </div>
    </main>
  );
}

function TriSourceSection({
  active,
  setActive,
  current,
}: {
  active: string;
  setActive: (d: string) => void;
  current: DomainDef;
}) {
  return (
    <>
        {/* Selector de dominio */}
        <div className="mb-6 flex flex-wrap gap-2">
          {DOMAINS.map((d) => {
            const Icon = d.icon;
            const on = d.domain === active;
            return (
              <button
                key={d.domain}
                onClick={() => setActive(d.domain)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                  on
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {d.label}
                {on && (
                  <Badge
                    variant="outline"
                    className="ml-1 border-primary/30 px-1 text-[8px] text-primary"
                  >
                    {d.domain}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Config de la fuente del dominio activo */}
        <TriSourceConfig
          key={current.domain}
          domain={current.domain}
          title={current.title}
          description={current.description}
          endpointPlaceholder={current.endpointPlaceholder}
          paramHints={current.paramHints}
        />

        {/* Nota de extensibilidad */}
        <div className="mt-8 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Este patrón tri-fuente es universal: cualquier funcionalidad futura
            puede adoptar <code className="text-primary">&lt;TriSourceConfig domain="…" /&gt;</code>{" "}
            y heredar la misma elección de fuentes, modulación y sincronización en
            tiempo real.
          </span>
        </div>
    </>
  );
}
