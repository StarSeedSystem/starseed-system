const fs = require('fs');
const path = 'src/components/exocortex/aurora-chat-view.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacement = `        <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
          <History className="h-6 w-6 text-white/20 mb-2" />
          <div className="text-xs leading-relaxed text-white/50 max-w-sm">
            Aquí verás tu conversación con {auroraName}. Háblale desde el orbe, usa la
            barra de arriba o escríbele abajo: tiene control total del OS y sigue activa
            en segundo plano.
          </div>
          
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-w-md">
            {[
              "Explorar mis Habilidades",
              "Ver mis Conexiones",
              "Analizar mi entorno de trabajo",
              "Sugerir una nueva publicación",
            ].map((option, idx) => (
              <button
                key={idx}
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("starseed:inject-chat", {
                      detail: { text: option }
                    })
                  );
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                {option}
              </button>
            ))}
          </div>
        </div>`;

code = code.replace(
  /<div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">[\s\S]*?<\/div>[\s\S]*?<\/div>/,
  replacement
);

fs.writeFileSync(path, code);
