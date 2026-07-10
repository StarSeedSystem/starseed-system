const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/lib/profiles/profiles.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/if \(error \|\| !data\) return null;/s, `if (error) {
            if (error.code === '23505') {
                throw new Error('El handle ya está en uso. Por favor, elige otro.');
            }
            return null;
        }
        if (!data) return null;`);

fs.writeFileSync(file, content);
