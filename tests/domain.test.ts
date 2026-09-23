import { describe, it, expect } from 'vitest';
import { planShotDurations, storyboardSchema, progress, shouldSubmit, buildComposition } from '../src/domain/video';
describe('narration-first planning', () => {
 it('balances short shots without a tiny remainder', () => {
  expect(planShotDurations(14)).toEqual([7,7]);
  expect(planShotDurations(20)).toEqual([7,7,6]);
  expect(planShotDurations(30)).toEqual([8,8,7,7]);
  for (const total of [30,60,90,180,300,182.4]) {
   const shots=planShotDurations(total); expect(shots.reduce((a,b)=>a+b,0)).toBe(Math.ceil(total));
   expect(shots.every(s=>s>=4&&s<=12)).toBe(true);
  }
  expect(()=>planShotDurations(0)).toThrow();
 });
 it('rejects malformed storyboards',()=>expect(storyboardSchema.safeParse({scenes:[{title:'bad'}]}).success).toBe(false));
 it('reports factual phase progress',()=>{expect(progress('COMPLETED',2,2)).toBe(100);expect(progress('GENERATING',1,2)).toBe(53);});
 it('never resubmits ambiguous or already submitted work',()=>{for(const state of ['SUBMITTING','UNCERTAIN','SUBMITTED','COMPLETED'])expect(shouldSubmit(state)).toBe(false);expect(shouldSubmit('QUEUED')).toBe(true);});
 it('builds a narration-aligned composition',()=>{const c=buildComposition([{path:'a',duration:7,transition:'cut'},{path:'b',duration:7,transition:'cut'}], '9:16', 13.4);expect(c.duration).toBe(13.4);expect(c.width).toBe(1080);expect(c.video[1].start).toBe(7);});
});
