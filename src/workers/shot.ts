import { eq,and,isNull } from 'drizzle-orm';
import { db } from '../db';
import { assets,shots,jobs,generations,characters } from '../db/schema';
import { storage,mediaKey,safePath,signedAssetUrl,downloadPublic } from '../storage/local';
import { thumbnail,finalFrame } from '../render/render';
import { probe } from '../render/process';
import { ProviderError,type VideoProvider,type VideoInput } from '../providers/agnes';
import { refreshGeneration,type Generation,type Job } from '../generations/repository';
export async function generateShot(job:Job,g:Generation,provider:VideoProvider){
 const shot=await db.query.shots.findFirst({where:and(eq(shots.id,job.shotId!),eq(shots.generationId,g.id))});if(!shot||shot.version!==job.version||shot.status==='COMPLETED')return;
 if(job.providerId){
 if(job.polls>=180||Date.now()-new Date(job.startedAt||job.createdAt).getTime()>2*3600000)throw new Error('Video polling deadline reached');
 const status=await provider.getStatus(job.providerId);
 if(status.status==='failed')throw new Error('Provider reported failed video');
 if(status.status!=='completed'){
 await db.update(jobs).set({status:'SUBMITTED',polls:job.polls+1,runAfter:new Date(Date.now()+Math.min(30000,3000+job.polls*500))}).where(eq(jobs.id,job.id));return;
 }
 if(!status.url)throw new Error('Completed video has no download URL');
 const bytes=await downloadPublic(status.url),key=mediaKey(g.userId,g.id,'mp4');await storage.put(key,bytes);
 const info=await probe(safePath(key));if(!info.streams.some(s=>s.codec_type==='video')||info.duration<1)throw new Error('Provider returned invalid video');
 const thumbKey=mediaKey(g.userId,g.id,'jpg');await thumbnail(safePath(key),safePath(thumbKey));
 await db.transaction(async tx=>{const [current]=await tx.select().from(generations).where(and(eq(generations.id,g.id),isNull(generations.deletedAt))).for('update');if(!current)return;
 const [clip]=await tx.insert(assets).values({userId:g.userId,generationId:g.id,kind:'clip',path:key,mime:'video/mp4',duration:info.duration,metadata:{shotId:shot.id,version:job.version}}).returning();const [thumb]=await tx.insert(assets).values({userId:g.userId,generationId:g.id,kind:'thumbnail',path:thumbKey,mime:'image/jpeg'}).returning();
 await tx.update(shots).set({status:'COMPLETED',clipId:clip.id,thumbnailId:thumb.id,lastError:null,updatedAt:new Date()}).where(and(eq(shots.id,shot.id),eq(shots.version,job.version)));
 });await refreshGeneration(g.id);return;
 }
 if(shot.status==='SUBMITTING'||shot.status==='UNCERTAIN'){await uncertain(job,shot.id);return;}
 const input:VideoInput={prompt:`${shot.videoPrompt}\nCamera: ${shot.camera}. Environment: ${shot.environment}. Visual bible: ${JSON.stringify(g.visualBible)}. No text overlays or captions.`,seconds:shot.duration,aspectRatio:g.aspectRatio,mode:shot.mode as VideoInput['mode']};
 let reference=shot.referenceId;
 if(shot.characterId){const character=await db.query.characters.findFirst({where:and(eq(characters.id,shot.characterId),eq(characters.userId,g.userId))});if(character){input.prompt+=`\nCharacter: ${character.description}. ${character.visualPrompt}`;reference??=character.referenceId;}}
 if(shot.continuityFrom){const previous=await db.query.shots.findFirst({where:and(eq(shots.id,shot.continuityFrom),eq(shots.generationId,g.id))});if(!previous?.clipId){await db.update(jobs).set({status:'QUEUED',runAfter:new Date(Date.now()+15000)}).where(eq(jobs.id,job.id));return;}
 const clip=await db.query.assets.findFirst({where:and(eq(assets.id,previous.clipId),eq(assets.userId,g.userId))});if(!clip)throw new Error('Continuity clip is unavailable');
 const frame=mediaKey(g.userId,g.id,'jpg');await finalFrame(safePath(clip.path),safePath(frame));const [asset]=await db.insert(assets).values({userId:g.userId,generationId:g.id,path:frame,kind:'reference',mime:'image/jpeg'}).returning();reference=asset.id;input.mode='keyframe';}
 if(reference){const asset=await db.query.assets.findFirst({where:and(eq(assets.id,reference),eq(assets.userId,g.userId))});if(!asset)throw new Error('Reference is unavailable');if(input.mode==='keyframe')input.firstFrame=signedAssetUrl(asset.id);if(input.mode==='reference')input.images=[signedAssetUrl(asset.id)];}
 if(input.mode!=='text'&&!input.firstFrame&&!input.images?.length)throw new Error('Choose a reference image before generating');
 // Commit an intent before crossing the costly, non-idempotent external boundary.
 const [claimed]=await db.update(shots).set({status:'SUBMITTING'}).where(and(eq(shots.id,shot.id),eq(shots.version,job.version),eq(shots.status,'QUEUED'))).returning();if(!claimed)return;
 try{const status=await provider.create(input);await db.transaction(async tx=>{await tx.update(jobs).set({providerId:status.id,status:'SUBMITTED',runAfter:new Date(Date.now()+3000)}).where(eq(jobs.id,job.id));await tx.update(shots).set({status:'SUBMITTED'}).where(and(eq(shots.id,shot.id),eq(shots.version,job.version)));});}
 catch(error){if(!(error instanceof ProviderError)||error.uncertain){await uncertain(job,shot.id);return;}await db.update(shots).set({status:'QUEUED'}).where(eq(shots.id,shot.id));throw error;}
}
export async function uncertain(job:Job,shotId:string){await db.update(jobs).set({status:'UNCERTAIN',error:'Submission outcome unknown; verify provider account before explicitly retrying.'}).where(eq(jobs.id,job.id));await db.update(shots).set({status:'UNCERTAIN',lastError:'Submission outcome unknown. A manual retry may incur another charge.'}).where(and(eq(shots.id,shotId),eq(shots.version,job.version)));await refreshGeneration(job.generationId);}
