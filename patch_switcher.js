const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const created = await createProfile\(input\);/, `let created = null;
                try {
                    created = await createProfile(input);
                } catch (e) {
                    toast.error(e.message || "Error al crear el perfil.");
                    return;
                }`);

fs.writeFileSync(file, content);
