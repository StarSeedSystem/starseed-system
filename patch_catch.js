const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/lib/profiles/profiles.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/    } catch {\n        return null;\n    }\n}/, `    } catch (e) {\n        throw e;\n    }\n}`);

fs.writeFileSync(file, content);
