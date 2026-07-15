const fs = require('fs');
const path = 'src/app/(app)/agent/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Añadir importaciones necesarias
if (!content.includes('import { astrauraChat }')) {
  content = content.replace(
    'import { chat, chatSmart } from "@/ai/client/chat";',
    'import { chat, chatSmart } from "@/ai/client/chat";\nimport { astrauraChat } from "@/ai/astraura/router";\nimport { parseDirectives } from "@/lib/aurora/actions";'
  );
}

// 2. Cambiar kind: 'astraura' a kind: 'aurora'
// content = content.replace(/kind: 'astraura'/g, "kind: 'aurora'");
// Wait, I already did this! Let's check if it's there.
// I will just make sure.

// 3. Modificar handleSend
const oldHandleSendBlock = `      await chatSmart({
        messages: history,
        temperature: activeAgent.temperature,
        passphrase,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          acc += delta;
          setStreamText(acc);
        },
      });`;

const newHandleSendBlock = `      await astrauraChat({
        messages: history,
        temperature: activeAgent.temperature,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          // Filtrar directivas [[...]] del stream para no ensuciar la UI
          const match = delta.match(/\\[\\[(.*?)\\]\\]/);
          if (!match) {
            setStreamText(prev => prev + delta);
          }
          acc += delta;
        },
      });

      // Procesar directivas agénticas al finalizar
      const directives = parseDirectives(acc);
      if (directives.length > 0 && aurora) {
        await aurora.runDirectives(acc);
      }`;

content = content.replace(oldHandleSendBlock, newHandleSendBlock);

fs.writeFileSync(path, content, 'utf8');
