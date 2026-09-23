import { eq,and,isNull } from 'drizzle-orm';
import { db } from '../db';
import { renders,assets,generations } from '../db/schema';
import { renderVideo,type Composition } from '../render/render';
import { mediaKey,safePath } from '../storage/local';
import type { Job,Generation } from '../generations/repository';
export async function render(job:Job,g:Generation){
 const renderId=(job.payload as {renderId:string}).renderId;const row=await db.query.renders.findFirst({where:and(eq(renders.id,renderId),eq(renders.generationId,g.id))});if(!row||row.status==='COMPLETED')return;
 await db.update(renders).set({status:'PROCESSING'}).where(eq(renders.id,row.id));const key=mediaKey(g.userId,g.id,'mp4');const result=await renderVideo(row.composition as Composition,safePath(key));
 await db.transaction(async tx=>{const [current]=await tx.select().from(generations).where(and(eq(generations.id,g.id),isNull(generations.deletedAt))).for('update');if(!current)return;
 const [asset]=await tx.insert(assets).values({userId:g.userId,generationId:g.id,kind:'render',path:key,mime:'video/mp4',duration:result.duration}).returning();const [thumb]=await tx.insert(assets).values({userId:g.userId,generationId:g.id,kind:'thumbnail',path:key+'.jpg',mime:'image/jpeg'}).returning();await tx.update(renders).set({status:'COMPLETED',assetId:asset.id,thumbnailId:thumb.id,updatedAt:new Date()}).where(eq(renders.id,row.id));
 if(current.revision===job.version)await tx.update(generations).set({status:'COMPLETED',finalRenderId:row.id,error:null,updatedAt:new Date()}).where(eq(generations.id,g.id));
 });
}
