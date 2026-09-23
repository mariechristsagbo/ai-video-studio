import { fileTypeFromBuffer } from 'file-type';
import { storage,mediaKey,safePath } from './local';
import { probe } from '../render/process';
import { db } from '../db';
import { assets } from '../db/schema';
export const MAX_UPLOAD=50*1024*1024;
export async function saveUpload(userId:string,generationId:string|null,kind:string,file:File){
 if(file.size>MAX_UPLOAD||file.size<1)throw new Error('Upload must be between 1 byte and 50 MB');
 const bytes=Buffer.from(await file.arrayBuffer()), type=await fileTypeFromBuffer(bytes);
 const allowed=kind==='reference'?['image/png','image/jpeg','image/webp']:['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/ogg','video/mp4'];
 if(!type||!allowed.includes(type.mime)||(file.type&&file.type!==type.mime&&!(file.type==='audio/wav'&&type.mime==='audio/x-wav')))throw new Error('Unsupported or mismatched media type');
 const key=mediaKey(userId,generationId,type.ext);await storage.put(key,bytes);
 try{const info=await probe(safePath(key));if(kind==='reference'){const video=info.streams.find(s=>s.codec_type==='video');if(!video||!video.width||!video.height||video.width*video.height>40000000)throw new Error('Invalid image');}else if(!info.streams.some(s=>s.codec_type==='audio')||!Number.isFinite(info.duration)||info.duration<4||info.duration>600)throw new Error('Audio must be between 4 and 600 seconds');
 const [asset]=await db.insert(assets).values({userId,generationId,kind,path:key,mime:type.mime,duration:info.duration||null}).returning();return asset;
 }catch(error){await storage.remove(key);throw error;}
}
