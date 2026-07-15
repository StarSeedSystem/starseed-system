const fs = require('fs');
let code = fs.readFileSync('src/components/aurora/message-action-bar.tsx', 'utf8');

// Add Dialog imports
if (!code.includes('Dialog')) {
  code = code.replace(
    /import \{ Button \} from "@\/components\/ui\/button";/,
    `import { Button } from "@/components/ui/button";\nimport { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";`
  );
}
if (!code.includes('announceLine')) {
  code = code.replace(
    /import type \{ PersonalityProfile \} from "@\/lib\/aurora\/personalities";/,
    `import type { PersonalityProfile } from "@/lib/aurora/personalities";\nimport { announceLine } from "@/ai/astraura/router";`
  );
}

// Add state for modal
code = code.replace(
  /const isAurora = payload.role === "aurora";/,
  `const isAurora = payload.role === "aurora";\n  const [infoOpen, setInfoOpen] = useState(false);`
);

// Replace Info button handler
code = code.replace(
  /onClick=\{\(\) => onViewProcess\(payload.meta\)\}/,
  `onClick={() => { if (onViewProcess) onViewProcess(payload.meta); setInfoOpen(true); }}`
);

// Define modal content
const modalJSX = `
      {/* Modal de Información (Datos del Modelo y Alternativas) */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="bg-black/95 border-white/10 text-white sm:max-w-md backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-light text-blue-300">Información de la Respuesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-300 mt-2">
            {payload.meta ? (
              <>
                <div className="p-3 bg-white/5 rounded-md border border-white/10">
                  <h4 className="font-semibold text-white mb-1">Metadatos de IA</h4>
                  <ul className="list-disc pl-4 space-y-1">
                    {payload.meta.route?.sourceId && <li><strong>Proveedor:</strong> {payload.meta.route.sourceLabel || payload.meta.route.sourceId}</li>}
                    {payload.meta.route?.modelId && <li><strong>Modelo:</strong> {payload.meta.route.modelLabel || payload.meta.route.modelId}</li>}
                    {payload.meta.tokens && <li><strong>Tokens:</strong> {payload.meta.tokens}</li>}
                  </ul>
                </div>
                {payload.meta.route && (
                  <div className="p-3 bg-blue-500/10 rounded-md border border-blue-500/20 text-blue-200">
                    <h4 className="font-semibold text-blue-100 mb-1">Transparencia y Alternativas</h4>
                    <p className="whitespace-pre-wrap">{announceLine(payload.meta.route) || "No hay información adicional de alternativas para esta ruta."}</p>
                    <p className="mt-2 text-xs opacity-70">Puedes cambiar estas opciones en los ajustes de Astraura AI.</p>
                  </div>
                )}
              </>
            ) : (
              <p>No hay datos técnicos disponibles para este mensaje.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
`;

code = code.replace(
  /<\/div>\n  \);\n\}/,
  `\n${modalJSX}\n    </div>\n  );\n}`
);

fs.writeFileSync('src/components/aurora/message-action-bar.tsx', code);
console.log("Patched message-action-bar.tsx");
