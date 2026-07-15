const fs = require('fs');
const file = 'src/components/exocortex/aurora-chat-section.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('ChatHeaderOptions')) {
  // Import ChatHeaderOptions
  code = code.replace(
    /import \{ useAurora \} from "@\/components\/aurora\/aurora-provider";/,
    `import { useAurora } from "@/components/aurora/aurora-provider";\nimport { ChatHeaderOptions } from "@/components/aurora/chat-header-options";`
  );

  // Replace select with ChatHeaderOptions
  const selectRegex = /<div className="axc-label mb-1\.5">Personalidad activa<\/div>[\s\S]*?<\/select>/;
  const replacement = `<div className="axc-label mb-1.5">Opciones del Chat</div>
            <div className="mt-2 -mx-2 px-2 overflow-x-auto">
              <ChatHeaderOptions 
                selectedAgentId={activePersonality.id ?? activePersonality.name}
                setSelectedAgentId={pickPersonality}
                agents={
                  (aurora?.personalities.length
                    ? aurora.personalities
                    : (snap?.personalities?.length ? snap.personalities : [activePersonality])
                  ).map(p => ({ id: p.id ?? p.name, name: p.name }))
                }
              />
            </div>`;
  
  code = code.replace(selectRegex, replacement);
  fs.writeFileSync(file, code);
  console.log("Patched aurora-chat-section.tsx");
} else {
  console.log("Already patched");
}
