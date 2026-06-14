// src/components/showcase/SystemShowcase.tsx
"use client";

import React from "react";
import {
    Users,
    LayoutGrid,
    AppWindow,
    FileText,
    FileVideo,
    FileAudio,
    FileImage,
    Link2,
    Database,
    MousePointerClick,
    BadgeCheck,
    Newspaper,
    UsersRound,
    File as FileIcon,
    ExternalLink,
    ArrowUpRight,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { PostCard } from "@/components/social/PostCard";
import {
    type SystemKey,
    type SampleFile,
    type SampleFileFormat,
    SYSTEM_ACCENT,
    SYSTEM_LABEL,
    profilesBySystem,
    pagesBySystem,
    groupsBySystem,
    appsBySystem,
    filesBySystem,
    postsBySystem,
} from "@/data/sample-entities";

const GOLD = "#E9C46A";

/** Fallback de imagen: oculta el <img> roto y deja el fondo de la tarjeta. */
function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

/** Encabezado de sección con icono + título Fraunces. */
function SectionHeader({
    icon: Icon,
    title,
    subtitle,
    accent,
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    accent: string;
}) {
    return (
        <div className="mb-4 flex items-start gap-3">
            <span
                className="mt-0.5 shrink-0 rounded-lg p-2"
                style={{ background: `${accent}1f`, color: accent }}
            >
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
                <h3
                    className="font-headline text-[clamp(1.1rem,3vw,1.45rem)] font-semibold leading-tight"
                    style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                >
                    {title}
                </h3>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
        </div>
    );
}

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

// ── Tarjeta: Perfil ──
function ProfileCard({ p }: { p: ReturnType<typeof profilesBySystem>[number] }) {
    return (
        <GlassCard variant="hover" className="min-w-0 p-4">
            <div className="flex items-center gap-3 min-w-0">
                <span
                    className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2"
                    style={{ ["--tw-ring-color" as any]: `${p.accent}55` }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={p.avatar}
                        alt={p.name}
                        loading="lazy"
                        onError={onImgError}
                        className="h-full w-full object-cover"
                    />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        {p.verified && (
                            <BadgeCheck
                                className="h-4 w-4 shrink-0"
                                style={{ color: p.accent }}
                            />
                        )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{p.handle}</p>
                </div>
                <Badge
                    variant="outline"
                    className="shrink-0 capitalize text-[10px]"
                    style={{ borderColor: `${p.accent}55`, color: p.accent }}
                >
                    {p.facet}
                </Badge>
            </div>
            <p className="mt-3 text-sm text-foreground/80 line-clamp-3">{p.bio}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {p.credentials.map((c) => (
                    <Badge key={c} variant="secondary" className="text-[10px]">
                        {c}
                    </Badge>
                ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
                {p.stats.map((s) => (
                    <div key={s.label} className="min-w-0">
                        <p className="truncate text-sm font-bold tabular-nums" style={{ color: GOLD }}>
                            {s.value}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>
        </GlassCard>
    );
}

// ── Tarjeta: Página ──
function PageCard({ p }: { p: ReturnType<typeof pagesBySystem>[number] }) {
    return (
        <GlassCard variant="hover" className="min-w-0 flex flex-col">
            <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={p.cover}
                    alt={p.title}
                    loading="lazy"
                    onError={onImgError}
                    className="absolute inset-0 h-full w-full object-cover"
                />
                {p.status && (
                    <Badge
                        className="absolute left-2 top-2 border-0 text-[10px] text-white"
                        style={{ background: `${p.accent}cc` }}
                    >
                        {p.status}
                    </Badge>
                )}
            </div>
            <div className="flex flex-1 flex-col p-4">
                <Badge
                    variant="outline"
                    className="mb-2 w-fit capitalize text-[10px]"
                    style={{ borderColor: `${p.accent}55`, color: p.accent }}
                >
                    {p.kind}
                </Badge>
                <h4 className="font-semibold leading-snug">{p.title}</h4>
                <p className="mt-1 flex-1 text-sm text-muted-foreground line-clamp-3">
                    {p.description}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {p.members.toLocaleString("es-ES")} miembros
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                        {p.tags.slice(0, 2).map((t) => (
                            <span key={t} className="opacity-70">
                                #{t}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

// ── Tarjeta: Grupo ──
function GroupCard({ g }: { g: ReturnType<typeof groupsBySystem>[number] }) {
    return (
        <GlassCard variant="hover" className="min-w-0 flex flex-col">
            <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={g.cover}
                    alt={g.name}
                    loading="lazy"
                    onError={onImgError}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            </div>
            <div className="flex flex-1 flex-col p-4">
                <div className="-mt-9 mb-2 flex items-end gap-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-background bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={g.avatar}
                            alt=""
                            loading="lazy"
                            onError={onImgError}
                            className="h-full w-full object-cover"
                        />
                    </span>
                    <Badge
                        variant="outline"
                        className="mb-1 capitalize text-[10px]"
                        style={{ borderColor: `${g.accent}55`, color: g.accent }}
                    >
                        {g.kind}
                    </Badge>
                </div>
                <h4 className="font-semibold leading-snug">{g.name}</h4>
                <p className="mt-1 flex-1 text-sm text-muted-foreground line-clamp-2">
                    {g.description}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <UsersRound className="h-3.5 w-3.5" />
                        {g.members.toLocaleString("es-ES")}
                    </span>
                    <span className="truncate pl-2 text-right opacity-80">{g.activity}</span>
                </div>
            </div>
        </GlassCard>
    );
}

// ── Tarjeta: App ──
function AppCard({ a }: { a: ReturnType<typeof appsBySystem>[number] }) {
    return (
        <GlassCard variant="hover" className="min-w-0 p-4">
            <div className="flex items-start gap-3">
                <span
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1"
                    style={{ ["--tw-ring-color" as any]: `${a.accent}55`, background: `${a.accent}14` }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={a.icon}
                        alt={a.name}
                        loading="lazy"
                        onError={onImgError}
                        className="h-full w-full object-cover"
                    />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.name}</p>
                    <Badge
                        variant="outline"
                        className="mt-0.5 text-[10px]"
                        style={{ borderColor: `${a.accent}55`, color: a.accent }}
                    >
                        {a.category}
                    </Badge>
                </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{a.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-xs text-muted-foreground">
                    {a.open ? "Disponible" : "Beta"}
                </span>
                <span
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: a.accent }}
                >
                    Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
            </div>
        </GlassCard>
    );
}

// ── Iconografía por formato de archivo ──
const FILE_ICON: Record<SampleFileFormat, React.ElementType> = {
    imagen: FileImage,
    video: FileVideo,
    audio: FileAudio,
    pdf: FileText,
    enlace: Link2,
    app: MousePointerClick,
    dataset: Database,
};

// ── Tarjeta: Archivo ──
function FileCard({ f }: { f: SampleFile }) {
    const Icon = FILE_ICON[f.format] ?? FileIcon;
    const showThumb = f.thumb || f.format === "imagen";
    const thumbSrc = f.thumb || (f.format === "imagen" ? f.url : undefined);
    return (
        <GlassCard variant="hover" className="min-w-0 flex flex-col overflow-hidden">
            {showThumb && thumbSrc && (
                <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={thumbSrc}
                        alt={f.name}
                        loading="lazy"
                        onError={onImgError}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                </div>
            )}
            <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center gap-3 p-4 transition-colors hover:bg-white/5"
            >
                <span
                    className="shrink-0 rounded-lg p-2.5"
                    style={{ background: `${f.accent}1f`, color: f.accent }}
                >
                    <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        <span className="uppercase">{f.format}</span>
                        {f.size ? ` · ${f.size}` : ""}
                        {f.license ? ` · ${f.license}` : ""}
                    </p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
        </GlassCard>
    );
}

/**
 * Showcase reutilizable de un ecosistema (Político / Educativo / Cultural).
 * Renderiza, de forma aditiva, secciones de Perfiles, Páginas, Grupos, Apps,
 * Archivos (todos los formatos) y Publicaciones (reutilizando <PostCard/>).
 * SSR-safe, responsive y sin dependencias nuevas.
 */
export function SystemShowcase({
    system,
    className,
}: {
    system: SystemKey;
    className?: string;
}) {
    const accent = SYSTEM_ACCENT[system];
    const profiles = profilesBySystem(system);
    const pages = pagesBySystem(system);
    const groups = groupsBySystem(system);
    const apps = appsBySystem(system);
    const files = filesBySystem(system);
    const posts = postsBySystem(system);

    return (
        <section className={className} aria-label={`Vitrina del ecosistema ${SYSTEM_LABEL[system]}`}>
            <div className="mb-6 mt-10 flex items-center gap-3">
                <span
                    className="h-8 w-1.5 rounded-full"
                    style={{ background: accent }}
                    aria-hidden
                />
                <div className="min-w-0">
                    <h2
                        className="font-headline text-[clamp(1.4rem,4vw,2rem)] font-bold leading-tight"
                        style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                    >
                        Vitrina del Ecosistema {SYSTEM_LABEL[system]}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Contenido de ejemplo: perfiles, páginas, grupos, apps, archivos y publicaciones.
                    </p>
                </div>
            </div>

            {profiles.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={Users}
                        title="Perfiles"
                        subtitle="Facetas cívicas, artísticas, educadoras y anónimas vinculadas a una cuenta soberana."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {profiles.map((p) => (
                            <ProfileCard key={p.id} p={p} />
                        ))}
                    </div>
                </div>
            )}

            {pages.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={LayoutGrid}
                        title="Páginas"
                        subtitle="Proyectos de ley, cursos, exposiciones, obras y comunidades."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {pages.map((p) => (
                            <PageCard key={p.id} p={p} />
                        ))}
                    </div>
                </div>
            )}

            {groups.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={UsersRound}
                        title="Grupos"
                        subtitle="Asambleas locales, círculos de estudio y colectivos artísticos."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {groups.map((g) => (
                            <GroupCard key={g.id} g={g} />
                        ))}
                    </div>
                </div>
            )}

            {apps.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={AppWindow}
                        title="Apps"
                        subtitle="Herramientas vivas del ecosistema, abiertas y auditables."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {apps.map((a) => (
                            <AppCard key={a.id} a={a} />
                        ))}
                    </div>
                </div>
            )}

            {files.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={FileText}
                        title="Archivos"
                        subtitle="Muestra de cada formato: imagen, vídeo, audio, PDF, enlace, app interactiva y dataset."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {files.map((f) => (
                            <FileCard key={f.id} f={f} />
                        ))}
                    </div>
                </div>
            )}

            {posts.length > 0 && (
                <div className="mb-8">
                    <SectionHeader
                        icon={Newspaper}
                        title="Publicaciones"
                        subtitle="Ejemplos por tipo: texto, imagen, galería, vídeo, audio, PDF y enlace."
                        accent={accent}
                    />
                    <div className={GRID}>
                        {posts.map((post) => (
                            <PostCard key={post.id} post={post} />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

export default SystemShowcase;
