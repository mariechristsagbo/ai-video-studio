import Redis from 'ioredis';
let redis:Redis|undefined;
export function getRedis(){if(!redis){redis=new Redis(process.env.REDIS_URL||'redis://localhost:6379',{maxRetriesPerRequest:1,connectTimeout:3000,commandTimeout:4000,retryStrategy:()=>null});redis.on('error',()=>{});}return redis;}
