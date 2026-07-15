const fs = require('fs');
const path = 'src/components/files/universal-file-picker.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `export interface AttachFilePickerButtonProps {`;
const insertStr = `
    /** Opciones de recorte de imagen antes de la subida (ej. para avatares/portadas). */
    cropOptions?: { aspectRatio?: number; circularCrop?: boolean };`;

if (content.includes(targetStr) && !content.includes('cropOptions?: { aspectRatio')) {
    content = content.replace(targetStr, targetStr + insertStr);
}

// And pass it to UniversalFilePicker inside AttachFilePickerButton
content = content.replace(
    '<UniversalFilePicker',
    '<UniversalFilePicker cropOptions={props.cropOptions}'
);

fs.writeFileSync(path, content, 'utf8');
