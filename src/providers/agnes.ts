import { z } from 'zod';
export type VideoInput={prompt:string;seconds:number;aspectRatio:string;mode:'text'|'keyframe'|'reference';firstFrame?:string;lastFrame?:string;images?:string[];audios?:string[];videos?:{url:string;start_seconds:number;require_audio:boolean}[]};
export type VideoStatus={id:string;status:'queued'|'in_progress'|'completed'|'failed';url?:string};
export interface VideoProvider {create(input:VideoInput):Promise<VideoStatus>;getStatus(id:string):Promise<VideoStatus>;}
export interface TextProvider {generate(prompt:string):Promise<string>;}
export class ProviderError extends Error {constructor(public code:number,public uncertain=false){super(`Provider request failed (${code})`);}}
const responseSchema=z.object({video_id:z.string().min(1),status:z.enum(['queued','in_progress','completed','failed']),metadata:z.object({url:z.url().optional()}).nullable().optional()});
export class AgnesProvider implements VideoProvider,TextProvider {
 constructor(private fetcher:typeof fetch=fetch){}
 private base(){return process.env.AGNES_BASE_URL||'https://apihub.agnes-ai.com/v1';}
 private async request(url:string,body?:unknown){
 if(!process.env.AGNES_API_KEY)throw new ProviderError(401);
 let response:Response;
 try{response=await this.fetcher(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.AGNES_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw new ProviderError(0,!!body);}
 if(!response.ok)throw new ProviderError(response.status,!!body&&response.status>=500);
 try{return await response.json();}catch{throw new ProviderError(0,!!body);}
 }
 async generate(prompt:string){const result=await this.request(`${this.base()}/chat/completions`,{model:process.env.AGNES_TEXT_MODEL||'agnes-2.5-flash',messages:[{role:'system',content:'Return only the requested JSON. Do not invent facts, statistics or quotations. Clearly distinguish speculation and hypothetical scenarios from facts. Never add captions inside visual frames.'},{role:'user',content:prompt}],max_tokens:16000});return z.object({choices:z.array(z.object({message:z.object({content:z.string()})})).min(1)}).parse(result).choices[0].message.content;}
 async create(input:VideoInput){
 if(!Number.isInteger(input.seconds)||input.seconds<4||input.seconds>12)throw new Error('Unsupported shot duration');
 const body:Record<string,unknown>={model:process.env.AGNES_VIDEO_MODEL||'agnes-video-2.5',prompt:input.prompt,seconds:String(input.seconds),size:'720P',aspect_ratio:input.aspectRatio,mode:input.mode,n:1};
 if(input.mode==='keyframe'){if(!input.firstFrame&&!input.lastFrame)throw new Error('A keyframe image is required');body.first_frame=input.firstFrame;body.last_frame=input.lastFrame;}
 if(input.mode==='reference'){if(!input.images?.length&&!input.audios?.length&&!input.videos?.length)throw new Error('Reference media is required');body.images=input.images;body.audios=input.audios;body.videos=input.videos;}
 const raw=await this.request(`${this.base()}/videos`,body);try{return this.map(raw);}catch{throw new ProviderError(0,true);}
 }
 async getStatus(id:string){const url=new URL('/agnesapi',this.base());url.searchParams.set('video_id',id);url.searchParams.set('model_name',process.env.AGNES_VIDEO_MODEL||'agnes-video-2.5');return this.map(await this.request(url.toString()));}
 private map(raw:unknown):VideoStatus{const r=responseSchema.parse(raw);return {id:r.video_id,status:r.status,url:r.metadata?.url};}
}
export interface NarrationProvider {generate(text:string):Promise<{path:string;duration:number}>;}
// No standalone TTS endpoint is documented in the official index. Uploads are the MVP boundary.
export class UploadedNarrationProvider implements NarrationProvider {async generate():Promise<never>{throw new Error('Upload a continuous narration recording in the editor');}}
export async function structured<T>(provider:TextProvider,prompt:string,schema:z.ZodType<T>):Promise<T>{
 let last='';for(let attempt=0;attempt<3;attempt++){
 const answer=await provider.generate(prompt+(attempt?`\nPrevious output was invalid. Return corrected JSON only. Validation: ${last}`:''));
 try{return schema.parse(JSON.parse(answer.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));}catch(error){last=error instanceof z.ZodError?error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(';'):'Invalid JSON';}
 }throw new Error('Planning output could not be validated');
}
