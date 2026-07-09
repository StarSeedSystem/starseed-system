const fs = require('fs');
const path = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let code = fs.readFileSync(path, 'utf8');

// Change the condition in saveEditor (at line ~157)
const oldCondition = 'if (profiles.length === 0) {';
const newCondition = 'if (profiles.length === 0 || !mainProfile || !mainProfile.handle) {';
code = code.replace(oldCondition, newCondition);

fs.writeFileSync(path, code);
