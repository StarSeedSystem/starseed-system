const fs = require('fs');
const path = '/Users/alex/Documents/starseed-os-main/src/components/profiles/account-profiles-switcher.tsx';
let code = fs.readFileSync(path, 'utf8');

// The mainProfile is not defined. We need to add it!
if (!code.includes('const { profile: mainProfile } = useAccount();')) {
    code = code.replace(
        'export function AccountProfilesSwitcher({ compact = false }: { compact?: boolean }) {\n    const { profile, profiles, loading, setActive } = useActiveProfile();',
        'export function AccountProfilesSwitcher({ compact = false }: { compact?: boolean }) {\n    const { profile: mainProfile } = useAccount();\n    const { profile, profiles, loading, setActive } = useActiveProfile();'
    );
}

fs.writeFileSync(path, code);
