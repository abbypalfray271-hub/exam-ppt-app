export function decodeTunnel(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch (e) {
    return encoded;
  }
}
