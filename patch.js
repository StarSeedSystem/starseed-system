const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { useSearchParams', 'import { toast } from "sonner";\nimport { useSearchParams');

content = content.replace(/const created = await createProfile\(\{[^}]+\}\);/s, `const input = {
                    name,
                    handle: editor.handle || null,
                    kind: editor.kind,
                    bio: editor.bio || null,
                    avatarUrl: editor.avatarUrl || null,
                    coverUrl: editor.coverUrl || null,
                    visibility: editor.visibility,
                };
                console.log("Creando perfil con:", input);
                const created = await createProfile(input);
                if (!created) {
                    toast.error("Error al crear el perfil. Revisa la consola.");
                }`);

fs.writeFileSync(file, content);
