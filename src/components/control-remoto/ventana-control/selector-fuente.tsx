import type { FuentePedida } from "./tipos";

export function SelectorFuente({
    pedida,
    real,
    aviso,
    onCambiar,
}: {
    pedida: FuentePedida;
    real: "accesibilidad" | "proyeccion" | null;
    aviso: string | null;
    onCambiar: (f: FuentePedida) => void;
}) {
    const rotuloReal = real === "proyeccion" ? "Pantalla por proyección" : "Pantalla por accesibilidad";

    const alTeclar = (e: React.KeyboardEvent, f: FuentePedida) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            onCambiar("proyeccion");
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            onCambiar("automatica");
        }
    };

    return (
        <div className="space-y-2 p-3">
            <div role="radiogroup" aria-label="Fuente de pantalla" className="flex flex-col gap-1">
                <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[13px] text-white cursor-pointer hover:bg-white/[0.12]">
                    <input
                        type="radio"
                        name="fuente"
                        value="automatica"
                        checked={pedida === "automatica"}
                        onChange={() => onCambiar("automatica")}
                        onKeyDown={(e) => alTeclar(e, "automatica")}
                        className="accent-[#DC143C]"
                    />
                    <span>Automática</span>
                </label>
                <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[13px] text-white cursor-pointer hover:bg-white/[0.12]">
                    <input
                        type="radio"
                        name="fuente"
                        value="proyeccion"
                        checked={pedida === "proyeccion"}
                        onChange={() => onCambiar("proyeccion")}
                        onKeyDown={(e) => alTeclar(e, "proyeccion")}
                        className="accent-[#DC143C]"
                    />
                    <div className="flex flex-col">
                        <span>Fluida (proyección)</span>
                        <span className="text-[10px] text-white/50">Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca</span>
                    </div>
                </label>
            </div>
            {real && <div className="text-[11px] text-white/60">{rotuloReal}</div>}
            {aviso && (
                <div role="status" className="text-[12px] text-amber-400">
                    {aviso}
                </div>
            )}
        </div>
    );
}
