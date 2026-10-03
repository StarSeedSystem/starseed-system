import { describe, expect, it } from "vitest";

import { orquestadoresDeCola, parsearOrquestadores } from "@/lib/mando/procesos-orquestador";

// Salida real de `ps -axo pid=,args=` en la Mac (rutas acortadas donde no importan).
const PS_MAC = [
    "  700 /Users/alex/.hermes/hermes-agent/apps/desktop/release/mac-arm64/Hermes.app/Contents/MacOS/Hermes",
    " 4211 /opt/homebrew/bin/python3 -u /Users/alex/.local/bin/starseed-enjambre.py starseed_memory_root/olas/cola-412-widgets.json --workers 3",
    " 4302 /opt/homebrew/Cellar/python@3.14/3.14.7/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python /Users/alex/.local/bin/starseed-enjambre.py starseed_memory_root/olas/cola-suenos-2026-09-29.json --workers 2",
    " 4410 /Users/alex/.opencode/bin/opencode run --model xkiro/qwen3-coder-plus Lee starseed-enjambre.py y la cola-412-widgets.json antes de tocar nada",
    " 4520 vim scripts/enjambre/starseed-enjambre.py",
    "",
].join("\n");

describe("procesos del orquestador (ps en vez de pgrep -af)", () => {
    it("encuentra los orquestadores y su cola, también con el python del framework de macOS", () => {
        const vivos = parsearOrquestadores(PS_MAC);
        expect(vivos.map((p) => [p.pid, p.cola])).toEqual([
            [4211, "cola-412-widgets.json"],
            [4302, "cola-suenos-2026-09-29.json"],
        ]);
    });

    it("un prompt o un editor que nombran el script no son orquestadores", () => {
        const pids = parsearOrquestadores(PS_MAC).map((p) => p.pid);
        expect(pids).not.toContain(4410);
        expect(pids).not.toContain(4520);
    });

    it("filtra por el nombre exacto de la cola", () => {
        const vivos = parsearOrquestadores(PS_MAC);
        expect(orquestadoresDeCola(vivos, "412-widgets").map((p) => p.pid)).toEqual([4211]);
        expect(orquestadoresDeCola(vivos, "412")).toEqual([]);
    });

    it("la salida de pgrep de macOS (solo PIDs) no se confunde con orquestadores", () => {
        expect(parsearOrquestadores("4211\n4302\n")).toEqual([]);
        expect(parsearOrquestadores("")).toEqual([]);
    });
});
