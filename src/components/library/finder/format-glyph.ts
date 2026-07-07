// format-glyph — paleta de color por FileFormat, espejo de FORMAT_META
// (privado) en file-preview.tsx, para que los iconos del Finder compartan
// exactamente los mismos acentos que la vista previa embebida.

import type { FileFormat } from "@/components/files/file-preview";

export const FORMAT_ICON_COLOR: Record<FileFormat, string> = {
    image: "#38bdf8",
    video: "#f472b6",
    audio: "#a78bfa",
    pdf: "#fb7185",
    markdown: "#34d399",
    code: "#facc15",
    link: "#22d3ee",
    model3d: "#c084fc",
    app: "#fbbf24",
    generic: "#94a3b8",
};
