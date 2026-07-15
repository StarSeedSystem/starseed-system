const fs = require('fs');
const path = 'src/components/aurora/aurora-provider.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix AuroraSupervisedEngine interface
content = content.replace(
  'speak: (text: string) => void;',
  'speak: (text: string, forcePersonality?: any) => void;'
);

// Fix provider implementation
content = content.replace(
  'speak: (text: string) => engineRef.current?.speak(text),',
  'speak: (text: string, forcePersonality?: any) => engineRef.current?.speak(text, forcePersonality),'
);

fs.writeFileSync(path, content, 'utf8');
