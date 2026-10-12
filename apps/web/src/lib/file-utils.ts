export function dataUrlToFile(dataUrl: string, filename: string): File {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const base64Data = parts[1] || "";
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}
