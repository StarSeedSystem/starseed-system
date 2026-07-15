const fs = require('fs');
const files = [
  'src/components/aurora/message-action-bar.tsx',
  'src/components/layout/global-selection-menu.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{([^}]*)\bPersonality\b([^}]*)\} from "@\/lib\/aurora\/personalities";/g, 'import {$1$2} from "@/lib/aurora/personalities";\nimport { Personality } from "@/lib/aurora/types";');
  
  // Fix the broken import in global-selection-menu
  content = content.replace(/@\/lib\/auror@\/lib\/aurora\/personalities/g, '@/lib/aurora/personalities');
  
  fs.writeFileSync(file, content, 'utf8');
});
