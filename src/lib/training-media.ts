import {db} from '../offline/db';
import {supabase} from './supabase';
import {compressPhoto} from './media';
import type {Row} from './data';

export const maxTrainingBytes=10*1024*1024;
export async function cacheTrainingAsset(asset:Row,userId:string){
 if(!supabase||!navigator.onLine)throw new Error('onlineRequired');
 const signed=await supabase.storage.from('training').createSignedUrl(String(asset.storage_path),300);if(signed.error)throw signed.error;
 const response=await fetch(signed.data.signedUrl,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('downloadFailed');const blob=await response.blob();
 if(blob.size>maxTrainingBytes||blob.size!==Number(asset.byte_size))throw new Error('trainingMediaTooLarge');
 await db.cache.put({key:`training:${userId}:${asset.id}`,value:blob});
}
export async function trainingAssetURL(asset:Row,userId:string){
 const cached=(await db.cache.get(`training:${userId}:${asset.id}`))?.value;
 if(cached instanceof Blob)return {url:URL.createObjectURL(cached),offline:true};
 if(!supabase||!navigator.onLine)return null;
 const signed=await supabase.storage.from('training').createSignedUrl(String(asset.storage_path),300);if(signed.error)throw signed.error;
 return{url:signed.data.signedUrl,offline:false};
}
export async function prepareTrainingMedia(file:File,progress:(fraction:number)=>void,signal:AbortSignal){
 if(signal.aborted)throw new Error('compressionCancelled');
 if(file.type.startsWith('image/')){const image=await compressPhoto(file);if(signal.aborted)throw new Error('compressionCancelled');return image;}
 if(!file.type.startsWith('video/')||file.size>100*1024*1024)throw new Error('trainingMediaTooLarge');
 if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)throw new Error('videoCompressionUnsupported');
 const type=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(mime=>MediaRecorder.isTypeSupported(mime));if(!type)throw new Error('videoCompressionUnsupported');
 const url=URL.createObjectURL(file),video=document.createElement('video');video.src=url;video.playsInline=true;video.preload='auto';
 let recorder:MediaRecorder|undefined;let stream:MediaStream|undefined;let audio:AudioContext|undefined;let frame=0;let abortRecording:(()=>void)|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);video.onloadedmetadata=null;video.onerror=null;if(error)reject(error);else resolve();};const abort=()=>finish(new Error('compressionCancelled'));const timer=setTimeout(()=>finish(new Error('videoFailed')),30000);video.onloadedmetadata=()=>finish();video.onerror=()=>finish(new Error('videoFailed'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  if(signal.aborted)throw new Error('compressionCancelled');
  if(!Number.isFinite(video.duration)||video.duration>180)throw new Error('trainingVideoTooLong');
  const canvas=document.createElement('canvas');const scale=Math.min(1,640/video.videoWidth,480/video.videoHeight);canvas.width=Math.max(2,Math.round(video.videoWidth*scale));canvas.height=Math.max(2,Math.round(video.videoHeight*scale));
  stream=canvas.captureStream(15);audio=new AudioContext();const source=audio.createMediaElementSource(video),destination=audio.createMediaStreamDestination();source.connect(destination);destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));await audio.resume();
  recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:320000,audioBitsPerSecond:32000});const chunks:BlobPart[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const draw=()=>{canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);progress(video.currentTime/video.duration);if(!video.ended)frame=requestAnimationFrame(draw);};
  const stop=()=>{video.pause();if(recorder?.state==='recording')recorder.stop();};video.onended=stop;
  const result=await new Promise<Blob>((resolve,reject)=>{abortRecording=()=>{stop();reject(new Error('compressionCancelled'));};signal.addEventListener('abort',abortRecording,{once:true});recorder!.onstop=()=>signal.aborted?reject(new Error('compressionCancelled')):resolve(new Blob(chunks,{type:recorder!.mimeType.split(';')[0]}));recorder!.onerror=()=>reject(new Error('videoFailed'));recorder!.start(1000);void video.play().then(draw).catch(()=>reject(new Error('videoFailed')));if(signal.aborted)abortRecording();});
  if(result.size===0||result.size>maxTrainingBytes)throw new Error('trainingMediaTooLarge');progress(1);return result;
 }finally{if(abortRecording)signal.removeEventListener('abort',abortRecording);cancelAnimationFrame(frame);video.pause();if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(track=>track.stop());await audio?.close();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
