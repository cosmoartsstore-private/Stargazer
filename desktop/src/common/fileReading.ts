// FileReaderのイベントAPIを、画像保存処理から独立したPromise境界へ変換する。
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const rejectRead = () => reject(reader.error ?? new Error('File read failed'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        rejectRead();
      }
    };
    reader.onerror = rejectRead;
    reader.onabort = rejectRead;
    try {
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}
