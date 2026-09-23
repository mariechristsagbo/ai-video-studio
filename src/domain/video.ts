import { z } from "zod";
export const MIN_VIDEO_SECONDS = 4;
export const MAX_VIDEO_SECONDS = 12;
export const generationStatuses = ['DRAFT','PLANNING','STORYBOARD_READY','QUEUED','GENERATING','READY_TO_RENDER','RENDERING','COMPLETED','FAILED'] as const;
export const shotStatuses = ['DRAFT','QUEUED','SUBMITTING','UNCERTAIN','SUBMITTED','GENERATING','COMPLETED','FAILED'] as const;
export function planShotDurations(total: number): number[] {
 if (!Number.isFinite(total) || total < 4 || total > 600) throw new Error('Timeline must be between 4 and 600 seconds');
 const seconds=Math.ceil(total), count=Math.max(1,Math.round(seconds/7.5)), base=Math.floor(seconds/count);
 return Array.from({length:count},(_,i)=>base+(i<seconds%count?1:0));
}
export const shotInput=z.object({visualDescription:z.string().min(1).max(4000),videoPrompt:z.string().min(1).max(8000),duration:z.number().int().min(4).max(12),camera:z.string().max(500).default(''),environment:z.string().max(1000).default(''),transition:z.enum(['cut','fade','crossfade']).default('cut'),mode:z.enum(['text','keyframe','reference']).default('text'),referenceId:z.string().uuid().nullable().default(null),characterId:z.string().uuid().nullable().default(null),continuityFrom:z.string().uuid().nullable().default(null)});
export const sceneInput=z.object({title:z.string().min(1).max(300),narration:z.string().max(10000),shots:z.array(shotInput).min(1).max(80)});
export const storyboardSchema=z.object({scenes:z.array(sceneInput).min(1).max(80)});
export const briefSchema=z.object({title:z.string(),hook:z.string(),premise:z.string(),targetAudience:z.string(),tone:z.string(),visualDirection:z.string(),narrativeArc:z.array(z.string()),keyFacts:z.array(z.string()),ending:z.string(),cta:z.string()});
export const bibleSchema=z.object({cinematography:z.string(),colorPalette:z.string(),worldDescription:z.string(),characterRules:z.array(z.string()),styleRules:z.array(z.string())});
export const createGeneration=z.object({topic:z.string().trim().min(8).max(2000),targetDuration:z.union([z.literal(30),z.literal(60),z.literal(90),z.literal(180),z.literal(300)]),language:z.string().min(2).max(60).default('English'),platform:z.enum(['TikTok','YouTube Shorts','Instagram Reels','YouTube']).default('TikTok'),aspectRatio:z.enum(['9:16','16:9','1:1']).default('9:16'),contentFormat:z.string().min(1).max(100),visualStyle:z.string().min(1).max(100),customInstructions:z.string().max(4000).default('')});
export function progress(status:string,done:number,total:number){if(status==='COMPLETED')return 100;if(status==='RENDERING')return 90;if(status==='PLANNING')return 10;if(!total)return 0;return Math.round(20+65*done/total);}
export function shouldSubmit(status:string){return status==='QUEUED';}
export type Clip={path:string;duration:number;transition:string};
export function buildComposition(clips:Clip[],ratio:string,narrationDuration?:number){
 if(!clips.length||clips.some(c=>!c.path||c.duration<=0))throw new Error('Every shot needs a completed clip');
 let start=0;const video=clips.map(c=>{const item={...c,start};start+=c.duration;return item;});
 const [width,height]=ratio==='16:9'?[1920,1080]:ratio==='1:1'?[1080,1080]:[1080,1920];
 return {duration:narrationDuration??start,width,height,fps:30,video};
}
