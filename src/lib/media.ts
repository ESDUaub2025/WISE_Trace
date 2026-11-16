export async function compressPhoto(file: File, targetBytes = 300 * 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob: Blob | null = null;
  for (let quality = 0.85; quality >= 0.25; quality -= 0.1) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= targetBytes) break;
  }
  while (blob && blob.size > targetBytes && canvas.width > 320) {
    const smaller = document.createElement('canvas');
    smaller.width = Math.round(canvas.width * 0.75);
    smaller.height = Math.round(canvas.height * 0.75);
    smaller.getContext('2d')!.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas.width = smaller.width;
    canvas.height = smaller.height;
    canvas.getContext('2d')!.drawImage(smaller, 0, 0);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.65));
  }
  if (!blob || blob.size > targetBytes) throw new Error('photo_failed');
  return blob;
}
