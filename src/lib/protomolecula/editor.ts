/**
 * Placeholder for opening an image in the Protomolécula editor.
 */
export const abrirEnProtomolecula = {
  /**
   * Opens the image in the Protomolécula editor.
   * @param url The URL of the image to open.
   * @returns A promise that resolves when the image is opened.
   */
  abrirProtomoleculaEditor: (url: string): Promise<void> => {
    // For now, we just return a resolved promise.
    // In the future, this should open the Protomolécula editor with the image.
    return Promise.resolve();
  }
};