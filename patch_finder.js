const fs = require('fs');
const path = 'src/components/library/finder/finder-context-menu.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacement = `                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(() => {
                    try {
                        window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
                        window.dispatchEvent(new CustomEvent("aurora:suggest", { detail: { context: "finder-item", itemId: target.id, itemKind: target.kind } }));
                    } catch { /* noop */ }
                })}>
                    <MessageSquare className="h-3.5 w-3.5 text-blue-300" /> Copiar al chat
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-xs cursor-pointer">
                        <Volume2 className="h-3.5 w-3.5 text-white/80" /> Leer en voz alta
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent className="bg-black/90 border-white/10 backdrop-blur-xl z-[9999]">
                            <DropdownMenuItem className="text-xs text-white cursor-pointer" onClick={wrap(() => speak?.(\`Seleccionaste el \${target.kind} con ID \${target.id}\`, aurora?.activePersonality))}>
                                {aurora?.activePersonality?.name || "Predeterminada"} (Actual)
                            </DropdownMenuItem>
                            {personalities.map((p) => (
                                <DropdownMenuItem key={p.id} className="text-xs text-white cursor-pointer" onClick={wrap(() => speak?.(\`Seleccionaste el \${target.kind} con ID \${target.id}\`, p))}>
                                    {p.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>`;

code = code.replace(
  /<DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick=\{wrap\(\(\) => \{\n\s*try \{\n\s*window\.dispatchEvent\(new CustomEvent\("starseed:open-aurora-exocortex"\)\);\n\s*window\.dispatchEvent\(new CustomEvent\("aurora:suggest", \{ detail: \{ context: "finder-item", itemId: target\.id, itemKind: target\.kind \} \}\)\);\n\s*\} catch \{ \/\* noop \*\/ \}\n\s*\}\)\}>\n\s*<Sparkles className="h-3\.5 w-3\.5" \/> Preguntar a Aurora\n\s*<\/DropdownMenuItem>/,
  replacement
);

fs.writeFileSync(path, code);
