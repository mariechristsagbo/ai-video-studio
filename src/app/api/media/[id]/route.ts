import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { db } from '@/db';
import { assets,generations } from '@/db/schema';
import { currentUser } from '@/auth/session';
import { safePath,verifyAsset } from '@/storage/local';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const id=z.string().uuid().parse((await params).id),asset=await db.query.assets.findFirst({where:eq(assets.id,id)});if(!asset)return new Response(null,{status:404});
 if(asset.generationId){const g=await db.query.generations.findFirst({where:eq(generations.id,asset.generationId)});if(!g||g.deletedAt)return new Response(null,{status:404});}
 const url=new URL(request.url);const signed=asset.kind==='reference'&&verifyAsset(id,Number(url.searchParams.get('expires')),url.searchParams.get('signature')||'');
 if(!signed){const user=await currentUser();if(!user||user.id!==asset.userId)return new Response(null,{status:404});}
 const path=safePath(asset.path),{size}=await stat(path);let start=0,end=size-1,status=200;const range=request.headers.get('range');
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});if(!match[1])start=Math.max(0,size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;}
 const headers:Record<string,string>={'Content-Type':asset.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;if(url.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename="studio-${id}.${asset.mime==='video/mp4'?'mp4':asset.mime==='image/jpeg'?'jpg':'media'}"`;
 return new Response(Readable.toWeb(createReadStream(path,{start,end})) as ReadableStream,{status,headers});
 }catch{return new Response(null,{status:404});}}
