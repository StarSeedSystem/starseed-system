const fs = require('fs');
const file = 'src/components/aurora/aurora-widget.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace openExocortexChat(); with setOpen(true); under TAP simple
code = code.replace(
  /\/\/ TAP simple → EMPIEZA A ESCUCHAR Y ABRE EL CHAT[\s\S]*?openExocortexChat\(\);/,
  `// TAP simple → ABRE EL REPRODUCTOR DE CHATS DE AURORA\n    setOpen(true);`
);

fs.writeFileSync(file, code);
console.log("Patched orb tap in aurora-widget.tsx");
