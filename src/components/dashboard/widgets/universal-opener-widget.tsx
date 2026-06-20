'use client';

// ════════════════════════════════════════════════════════════════
// UniversalOpenerWidget — "Visor Universal"
// Abre cualquier archivo/contenido: por URL, archivo local del usuario,
// ejemplos reales (imagen/GIF/vídeo/audio/PDF/3D/HTML/markdown/código) o
// entidades de tu Biblioteca. Usa el motor useContentOpener.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md §4
// ════════════════════════════════════════════════════════════════

import React, { useMemo, useRef, useState } from "react";
import { FolderOpen, Upload, ArrowRight, Image as ImageIcon, Film, Music, FileText, FileCode2, Box, Code2, Globe } from "lucide-react";
import { WidgetShell } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import { useContentOpener } from "../apps/content/content-opener";
import { fromUrl, fromFile, fromLibraryItem, type ContentResource } from "../apps/content/content-types";
import type { DashboardWidget } from "../dashboard-types";

const SAMPLE_HTML = `<!doctype html><html><body style="font-family:system-ui;background:#0d130e;color:#e9c46a;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>HTML en vivo</h1><p style="color:#9db4a0">Renderizado en un iframe aislado dentro del OS.</p></div></body></html>`;
const SAMPLE_MD = `# Documento Markdown\n\nEl **Abridor Universal** renderiza markdown con estilo del tema.\n\n- Listas\n- \`código en línea\`\n- [enlaces](https://starseed-os.vercel.app)\n\n> Una entidad del Lienzo Universal.\n\n| Vector | Valor |\n|---|---|\n| Energía | Alta |\n| Enfoque | Muy alto |`;
const SAMPLE_CODE = `// Safe-Blend: ejemplo\nexport function blend(a: number, b: number) {\n  const total = a + b;\n  if (total > 100) throw new Error("sobreestimulación");\n  return total;\n}`;

interface Sample { res: ContentResource; icon: typeof ImageIcon; label: string; accent: string }

const SAMPLES: Sample[] = [
    { icon: ImageIcon, label: "Imagen", accent: "#39FF14", res: { id: "s-img", kind: "image", title: "Imagen de ejemplo", url: "https://placehold.co/1200x800/0d130e/e9c46a.png?text=StarSeed", origin: "sample" } },
    { icon: ImageIcon, label: "GIF", accent: "#22D3EE", res: { id: "s-gif", kind: "gif", title: "Tierra rotando (GIF)", url: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif", origin: "sample" } },
    { icon: Film, label: "Vídeo", accent: "#FB923C", res: { id: "s-vid", kind: "video", title: "Big Buck Bunny", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", origin: "sample" } },
    { icon: Music, label: "Audio", accent: "#F472B6", res: { id: "s-aud", kind: "audio", title: "Pista de ejemplo", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", accent: "#F472B6", origin: "sample" } },
    { icon: FileText, label: "PDF", accent: "#EF4444", res: { id: "s-pdf", kind: "pdf", title: "Documento PDF", url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf", origin: "sample" } },
    { icon: Box, label: "3D", accent: "#A855F7", res: { id: "s-3d", kind: "model3d", title: "Modelo 3D (GLB)", url: "https://modelviewer.dev/shared-assets/models/Astronaut.glb", origin: "sample" } },
    { icon: Globe, label: "HTML", accent: "#38BDF8", res: { id: "s-html", kind: "html", title: "Página HTML", text: SAMPLE_HTML, origin: "sample" } },
    { icon: FileText, label: "Markdown", accent: "#D4AF37", res: { id: "s-md", kind: "markdown", title: "Documento.md", text: SAMPLE_MD, origin: "sample" } },
    { icon: Code2, label: "Código", accent: "#6366F1", res: { id: "s-code", kind: "code", title: "blend.ts", text: SAMPLE_CODE, language: "ts", origin: "sample" } },
];

export function UniversalOpenerWidget({ widget }: { widget: DashboardWidget }) {
    void widget;
    const { open, openMany, windowEl } = useContentOpener();
    const { data } = useWidgetData("education.library", { refreshMs: 0 });
    const [url, setUrl] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const libraryItems = useMemo(() => {
        const lib: any = data;
        const items = [...(lib?.featured ?? []), ...(lib?.continueLearning ?? [])];
        return items.slice(0, 6);
    }, [data]);

    const openUrl = () => {
        const u = url.trim();
        if (!u) return;
        open(fromUrl(u));
        setUrl("");
    };

    const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length) openMany(Array.from(files).map(fromFile));
        e.target.value = "";
    };

    return (
        <WidgetShell title="Visor Universal" subtitle="Abre cualquier archivo" icon={FolderOpen} accent="#39FF14">
            <div className="flex flex-col gap-3 pt-1">
                {/* Abrir por URL / subir archivo */}
                <div className="flex items-center gap-2">
                    <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") openUrl(); }}
                        placeholder="Pega una URL (imagen, vídeo, PDF, GLB, HTML…)"
                        className="flex-1 min-w-0 rounded-xl border border-border/50 bg-white/5 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                    <button type="button" onClick={openUrl} title="Abrir URL" aria-label="Abrir URL"
                        className="grid place-items-center size-9 rounded-xl bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors cursor-pointer shrink-0">
                        <ArrowRight className="size-4" />
                    </button>
                    <button type="button" onClick={() => fileRef.current?.click()} title="Subir archivo" aria-label="Subir archivo del dispositivo"
                        className="grid place-items-center size-9 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer shrink-0">
                        <Upload className="size-4" />
                    </button>
                    <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
                </div>

                {/* Ejemplos reales */}
                <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/50">Ejemplos</div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px,1fr))" }}>
                        {SAMPLES.map((s) => {
                            const Ic = s.icon;
                            return (
                                <button key={s.res.id} type="button" onClick={() => open(s.res)} title={s.res.title}
                                    className="group flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] p-2 hover:border-primary/30 hover:-translate-y-0.5 transition-all cursor-pointer">
                                    <span className="grid place-items-center size-9 rounded-lg text-white shadow"
                                        style={{ background: `linear-gradient(135deg, ${s.accent}, color-mix(in srgb, ${s.accent} 40%, transparent))` }}>
                                        <Ic className="size-4" />
                                    </span>
                                    <span className="text-[10px] font-semibold text-muted-foreground/90">{s.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* De tu Biblioteca (Lienzo Universal) */}
                {libraryItems.length > 0 && (
                    <div>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/50">De tu Biblioteca</div>
                        <div className="flex flex-col gap-1.5">
                            {libraryItems.map((it: any, i: number) => (
                                <button key={it.id ?? i} type="button" onClick={() => open(fromLibraryItem(it))}
                                    className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5 text-left hover:border-primary/30 transition-colors cursor-pointer">
                                    <FileCode2 className="size-3.5 shrink-0 text-muted-foreground/60" />
                                    <span className="text-[11px] font-semibold truncate flex-1">{it.title}</span>
                                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 shrink-0">{it.kind}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {windowEl}
        </WidgetShell>
    );
}
