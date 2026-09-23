import { z } from 'zod';
import { and,eq,sql,isNull } from 'drizzle-orm';
import { requireUser } from '@/auth/session';
import { db,pool } from '@/db';
import { generations,characters,assets,shots } from '@/db/schema';
import { create,editGeneration,queueShots,queueRender,removeGeneration,replan } from '@/generations/service';
import { listing,detail,ownedGeneration } from '@/generations/repository';
import { errorResponse,checkOrigin,jsonBody } from '@/lib/http';
import { saveUpload,MAX_UPLOAD } from '@/storage/uploads';
import { run } from '@/render/process';
import { getRedis } from '@/queues/redis';
export const runtime='nodejs';
const id=z.string().uuid();
const characterSchema=z.object({name:z.string().min(1).max(100),description:z.string().min(1).max(3000),visualPrompt:z.string().min(1).max(3000),referenceId:z.string().uuid().nullable().default(null)});
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context){try{
 const user=await requireUser(),{path}=await context.params,url=new URL(request.url);
 if(path[0]==='generations'){
 if(path[1])return Response.json(await detail(id.parse(path[1]),user.id));
 const page=z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get('page')||1);return Response.json(await listing(user.id,page,(url.searchParams.get('search')||'').slice(0,200),(url.searchParams.get('status')||'').slice(0,30),url.searchParams.get('sort')==='oldest'));
 }
 if(path[0]==='overview'){const counts=await db.select({status:generations.status,count:sql<number>`count(*)::int`}).from(generations).where(and(eq(generations.userId,user.id),isNull(generations.deletedAt))).groupBy(generations.status);return Response.json({counts,...await listing(user.id)});}
 if(path[0]==='characters')return Response.json(await db.select().from(characters).where(eq(characters.userId,user.id)).orderBy(characters.createdAt).limit(100));
 if(path[0]==='settings'){
 const [database,redis,ffmpeg]=await Promise.allSettled([pool.query('SELECT 1'),getRedis().ping(),run('ffmpeg',['-version'],5000)]);
 return Response.json({database:database.status==='fulfilled',redis:redis.status==='fulfilled',ffmpeg:ffmpeg.status==='fulfilled',agnes:!!process.env.AGNES_API_KEY,resend:!!process.env.RESEND_API_KEY&&!!process.env.RESEND_FROM_EMAIL,model:process.env.AGNES_VIDEO_MODEL||'agnes-video-2.5',concurrency:Number(process.env.VIDEO_GENERATION_CONCURRENCY||3),storage:'Persistent local storage'});
 }
 return Response.json({error:'Not found'},{status:404});
 }catch(error){return errorResponse(error);}}
export async function POST(request:Request,context:Context){try{
 checkOrigin(request);const user=await requireUser(),{path}=await context.params;
 // Redis limits are fail-closed for costly operations, with a short connection deadline.
 if(path[0]==='generations'&&(!path[2]||['generate','render','replan'].includes(path[2]))){const client=getRedis();const key=`rate:${user.id}:${Math.floor(Date.now()/60000)}`;const count=await client.incr(key);if(count===1)await client.expire(key,70);if(count>20)return Response.json({error:'Too many requests. Try again in a minute.'},{status:429});}
 if(path[0]==='generations'){
 if(!path[1])return Response.json(await create(user.id,await jsonBody(request)),{status:201});const generationId=id.parse(path[1]);await ownedGeneration(generationId,user.id);
 if(path[2]==='edit'){await editGeneration(generationId,user.id,await jsonBody(request));return Response.json({ok:true});}
 if(path[2]==='generate'){const data=z.object({shotId:id.optional(),acknowledgeUncertain:z.boolean().default(false)}).parse(await jsonBody(request));return Response.json(await queueShots(generationId,user.id,data.shotId,data.acknowledgeUncertain));}
 if(path[2]==='render'){await queueRender(generationId,user.id);return Response.json({ok:true});}
 if(path[2]==='replan'){await replan(generationId,user.id);return Response.json({ok:true});}
 if(path[2]==='delete'){await removeGeneration(generationId,user.id);return Response.json({ok:true});}
 if(path[2]==='upload'){
 if(Number(request.headers.get('content-length')||0)>MAX_UPLOAD+10000)throw new Error('Upload too large');const form=await request.formData();const kind=z.enum(['reference','narration','music']).parse(form.get('kind'));const file=form.get('file');if(!(file instanceof File))throw new Error('Missing file');
 const asset=await saveUpload(user.id,generationId,kind,file);
 if(kind!=='reference')await db.transaction(async tx=>{const [g]=await tx.select().from(generations).where(and(eq(generations.id,generationId),isNull(generations.deletedAt))).for('update');if(!g||['PLANNING','RENDERING'].includes(g.status))throw new Error('BUSY');await tx.update(generations).set({...kind==='narration'?{narrationId:asset.id,timelineDuration:asset.duration}:{musicId:asset.id},revision:g.revision+1,updatedAt:new Date()}).where(eq(generations.id,generationId));});return Response.json({id:asset.id,kind:asset.kind,duration:asset.duration});
 }
 }
 if(path[0]==='characters'){
 if(path[1]==='upload'){if(Number(request.headers.get('content-length')||0)>MAX_UPLOAD+10000)throw new Error('Upload too large');const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('Missing file');const asset=await saveUpload(user.id,null,'reference',file);return Response.json({id:asset.id});}
 const data=characterSchema.parse(await jsonBody(request));if(data.referenceId){const [asset]=await db.select().from(assets).where(and(eq(assets.id,data.referenceId),eq(assets.userId,user.id),eq(assets.kind,'reference')));if(!asset)throw new Error('Invalid reference');}
 if(path[1]){const characterId=id.parse(path[1]);const [c]=await db.select().from(characters).where(and(eq(characters.id,characterId),eq(characters.userId,user.id)));if(!c)throw new Error('NOT_FOUND');if(path[2]==='delete'){await db.update(shots).set({characterId:null}).where(eq(shots.characterId,c.id));await db.delete(characters).where(eq(characters.id,c.id));}else await db.update(characters).set({...data,updatedAt:new Date()}).where(eq(characters.id,c.id));return Response.json({ok:true});}
 const [c]=await db.insert(characters).values({...data,userId:user.id}).returning();return Response.json(c);
 }
 return Response.json({error:'Not found'},{status:404});
 }catch(error){return errorResponse(error);}}
