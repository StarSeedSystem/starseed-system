const fs = require('fs');
const path = 'src/components/desktop/desktop-context-menu.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacement = `            <div className="relative group">
                <MenuItem icon={Volume2} label="Leer en voz alta" onClick={() => run(() => speak?.(\`Icono seleccionado: \${icon.name}\`))} />
                {/* Ocultamos las personalidades extra en desktop por simplicidad o permitimos click */}
            </div>
            <MenuItem icon={MessageSquare} label="Copiar al chat" onClick={() => run(() => {
                try {
                    window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
                    window.dispatchEvent(new CustomEvent("aurora:suggest", { detail: { context: "desktop-icon", iconName: icon.name, iconId: icon.id } }));
                } catch { /* noop */ }
            })} />`;

code = code.replace(
  /            <MenuItem icon=\{Volume2\} label="Leer en voz alta" onClick=\{\(\) => run\(\(\) => speak\?\.?\(`Icono seleccionado: \$\{icon\.name\}`\)\)\} \/>\n\s*<MenuItem icon=\{Sparkles\} label="Copiar al chat de Aurora"[\s\S]*?\}\)} \/>/,
  replacement
);

fs.writeFileSync(path, code);
