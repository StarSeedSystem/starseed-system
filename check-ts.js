const ts = require('typescript');
const fs = require('fs');

const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, '.', undefined, 'tsconfig.json');

const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const diag = ts.getPreEmitDiagnostics(program);

diag.forEach(d => {
  if (d.file) {
    const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start);
    console.log(`${d.file.fileName}:${line + 1}:${character + 1} - ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  } else {
    console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }
});

console.log(`\nTotal errors: ${diag.length}`);