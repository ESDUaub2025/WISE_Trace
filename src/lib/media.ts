export async function compressPhoto(file: File, targetBytes = 300*1024): Promise<Blob> {
 const bitmap = await createImageBitmap(file); const canvas=document.createElement('canvas');
 const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)); canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let blob: Blob|null=null;
 for (let quality=.85; quality>=.25; quality-=.1) { blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality)); if(blob && blob.size<=targetBytes) break; }
 if(!blob) throw new Error('photo_failed'); return blob;
}
