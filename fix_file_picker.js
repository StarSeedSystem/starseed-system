const fs = require('fs');
const path = 'src/components/files/universal-file-picker.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix uploadActualFiles dependency array
content = content.replace('[uploadActualFiles, cropOptions]', '[folder, onUploaded]');

// 2. Add handleFiles
const insertIndex = content.indexOf('const handleCropComplete = useCallback');
const handleFilesStr = `
    const handleFiles = useCallback(async (files: FileList | File[] | null) => {
        if (!files) return;
        const list = Array.from(files);
        if (list.length === 0) return;

        if (cropOptions && list.length === 1 && list[0].type.startsWith("image/")) {
            setPendingFileForCrop(list[0]);
            setCropImageSrc(URL.createObjectURL(list[0]));
            return;
        }
        
        uploadActualFiles(list);
    }, [cropOptions, uploadActualFiles]);

    `;

if (!content.includes('const handleFiles =')) {
  content = content.slice(0, insertIndex) + handleFilesStr + content.slice(insertIndex);
}

fs.writeFileSync(path, content, 'utf8');
