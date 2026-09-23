import { mkdir,writeFile,rm } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildComposition } from '../domain/video';
import { run,probe } from './process';
import { srt } from './captions';
export type Composition=ReturnType<typeof buildComposition>&{script:string;burnCaptions:boolean;clipAudio:boolean;narration?:string;music?:string};
export async function renderVideo(composition:Composition,output:string){
 await mkdir(dirname(output),{recursive:true});const work=join(dirname(output),`work-${randomUUID()}`);await mkdir(work);
 try{
 const files:string[]=[];
 for(let i=0;i<composition.video.length;i++){
 const clip=composition.video[i],file=join(work,`${i}.mp4`),info=await probe(clip.path);const overlap=clip.transition==='crossfade'&&i<composition.video.length-1?0.3:0;
 const duration=clip.duration+overlap;const fade=clip.transition==='fade'?`,fade=t=in:st=0:d=0.2,fade=t=out:st=${Math.max(0,duration-0.2)}:d=0.2`:'';
 const args=['-y','-threads','2','-i',clip.path];if(!info.streams.some(s=>s.codec_type==='audio'))args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
 args.push('-map','0:v:0','-map',info.streams.some(s=>s.codec_type==='audio')?'0:a:0':'1:a:0','-vf',`scale=${composition.width}:${composition.height}:force_original_aspect_ratio=increase,crop=${composition.width}:${composition.height},setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=${duration}${fade}`,'-af','aresample=48000,aformat=channel_layouts=stereo,apad','-t',String(duration),'-c:v','libx264','-preset','ultrafast','-crf','23','-threads','2','-c:a','aac',file);await run('ffmpeg',args);files.push(file);
 }
 const args=['-y','-filter_complex_threads','1'];for(const file of files)args.push('-i',file);
 const filter:string[]=[];let v='0:v',end=composition.video[0].duration;
 for(let i=1;i<files.length;i++){
 const next=`v${i}`;if(composition.video[i-1].transition==='crossfade')filter.push(`[${v}][${i}:v]xfade=transition=fade:duration=0.3:offset=${end}[${next}]`);
 else filter.push(`[${v}][${i}:v]concat=n=2:v=1:a=0[${next}]`);v=next;end+=composition.video[i].duration;
 }
 for(let i=0;i<files.length;i++)filter.push(`[${i}:a]atrim=duration=${composition.video[i].duration},asetpts=PTS-STARTPTS[a${i}]`);
 filter.push(`${files.map((_,i)=>`[a${i}]`).join('')}concat=n=${files.length}:v=0:a=1[clipaudio]`);
 let input=files.length,narration=-1,music=-1;if(composition.narration){narration=input++;args.push('-i',composition.narration);}if(composition.music){music=input++;args.push('-stream_loop','-1','-i',composition.music);}
 const audio:string[]=[];filter.push(`[clipaudio]volume=${composition.clipAudio?0.2:0}[original]`);audio.push('[original]');
 if(narration>=0){filter.push(`[${narration}:a]aresample=48000,apad,volume=1[voice]`);audio.push('[voice]');}
 if(music>=0){filter.push(`[${music}:a]aresample=48000,volume=${narration>=0?0.08:0.2}[music]`);audio.push('[music]');}
 filter.push(`${audio.join('')}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.95[mix]`);
 let vf=`[${v}]tpad=stop_mode=clone:stop_duration=${composition.duration},trim=duration=${composition.duration},setpts=PTS-STARTPTS`;
 if(composition.burnCaptions&&composition.script.trim()){
 const subtitle=join(work,'captions.srt');await writeFile(subtitle,srt(composition.script,composition.duration));
 // Paths are application-generated UUIDs; escaping still handles deployment directories.
 const escaped=subtitle.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'","\\'");
 vf+=`,subtitles=filename='${escaped}':force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=55'`;
 }filter.push(vf+'[final]');
 args.push('-filter_complex',filter.join(';'),'-map','[final]','-map','[mix]','-t',String(composition.duration),'-r','30','-c:v','libx264','-preset','fast','-crf','21','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',output);await run('ffmpeg',args,1800000);
 await thumbnail(output,output+'.jpg');return await probe(output);
 }finally{await rm(work,{recursive:true,force:true});}
}
export async function thumbnail(video:string,output:string){await run('ffmpeg',['-y','-threads','1','-i',video,'-frames:v','1','-vf','scale=480:-2','-threads','1',output],30000);}
export async function finalFrame(video:string,output:string){await run('ffmpeg',['-y','-sseof','-0.1','-i',video,'-frames:v','1','-threads','1',output],30000);}
