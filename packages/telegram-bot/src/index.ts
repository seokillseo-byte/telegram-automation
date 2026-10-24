import type {Identity} from '../../shared/src/protocol';
export async function checkBot(token:string,request:typeof fetch=fetch):Promise<Identity>{
 let response:Response;
 try {response=await request(`https://api.telegram.org/bot${token}/getMe`,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('BOT_NETWORK');}
 if(response.status===401||response.status===404)throw Error('BOT_UNAUTHORIZED');
 if(response.status===429)throw Error('BOT_RATE_LIMIT');
 if(!response.ok)throw Error('BOT_API');
 const data=await response.json() as {ok?:boolean;result?:{id:number;is_bot:boolean;first_name:string;username?:string}};
 if(!data.ok||!data.result?.is_bot)throw Error('BOT_API');
 return {id:String(data.result.id),name:data.result.first_name,username:data.result.username,kind:'bot'};
}
