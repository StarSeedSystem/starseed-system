const fs = require('fs');
let code = fs.readFileSync('src/app/layout.tsx', 'utf8');

if (!code.includes('SystemSelectionProvider')) {
  code = code.replace(
    /import \{ AuroraProvider \} from "@\/components\/aurora\/aurora-provider";/,
    `import { AuroraProvider } from "@/components/aurora/aurora-provider";\nimport { SystemSelectionProvider } from "@/components/system-selection-provider";`
  );

  code = code.replace(
    /\{children\}/,
    `<SystemSelectionProvider>{children}</SystemSelectionProvider>`
  );

  fs.writeFileSync('src/app/layout.tsx', code);
  console.log("Patched layout.tsx");
} else {
  console.log("Already patched");
}
