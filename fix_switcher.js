const fs = require('fs');
const path = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('useAccount')) {
    code = code.replace(
        'import { useActiveProfile } from "@/lib/profiles/use-active-profile";',
        'import { useActiveProfile } from "@/lib/profiles/use-active-profile";\nimport { useAccount, isProfileComplete } from "@/context/account-context";'
    );
}

// Add the hook inside the component
if (!code.includes('const { profile: mainProfile } = useAccount();')) {
    code = code.replace(
        'export function AccountProfilesSwitcher() {',
        'export function AccountProfilesSwitcher() {\n    const { profile: mainProfile } = useAccount();'
    );
}

// Change the condition in saveEditor
const oldCondition = 'if (profiles.length === 0) {';
const newCondition = 'if (profiles.length === 0 || !mainProfile || !mainProfile.handle) {';
code = code.replace(oldCondition, newCondition);

fs.writeFileSync(path, code);
