const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('!mainProfile || !mainProfile.handle', '!mainProfile || (!mainProfile.handle && !mainProfile.username)');
content = content.replace('!mainProfile || !mainProfile.handle', '!mainProfile || (!mainProfile.handle && !mainProfile.username)');

fs.writeFileSync(file, content);
console.log("Patched switcher handle checks!");
