import { spawn } from 'node:child_process';
export async function run(binary:string,args:string[],timeout=600000){return new Promise<string>((resolve,reject)=>{
 const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`${binary} timed out`));},timeout);
 child.stdout.on('data',b=>{out+=b.toString();if(out.length>2000000)child.kill('SIGKILL');});child.stderr.on('data',b=>{error=(error+b.toString()).slice(-4000);});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out);else reject(new Error(`${binary} failed: ${error}`));});
 });}
export async function probe(path:string){const result=JSON.parse(await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',path],15000)) as {format:{duration?:string};streams:{codec_type:string;codec_name:string;width?:number;height?:number}[]};return {duration:Number(result.format.duration||0),streams:result.streams};}
