import {Api,TelegramClient} from 'telegram';
import {randomUUID} from 'node:crypto';
import {aggregateSample,GROUP_SAMPLE_LIMIT,normalizeGroupTarget,type GroupReport,type SampleMessage} from '../../shared/src/group-analysis';
import {classifyError} from '../../shared/src/protocol';
export async function analyzeGroup(client:TelegramClient,input:string,progress:(stage:string)=>void=()=>{}):Promise<GroupReport>{
 const target=normalizeGroupTarget(input);
 progress('resolving_group');
 const resolved=await client.invoke(new Api.contacts.ResolveUsername({username:target}));
 const peer=resolved.peer;
 const channel=peer instanceof Api.PeerChannel?resolved.chats.find(c=>c instanceof Api.Channel&&c.id.toString()===peer.channelId.toString()):undefined;
 if(!(channel instanceof Api.Channel))throw Error('GROUP_TARGET_REQUIRED');
 const publicUsername=channel.username??channel.usernames?.find(u=>u.active)?.username;
 if(!publicUsername||!channel.accessHash)throw Error('GROUP_PUBLIC_REQUIRED');
 progress('reading_group_info');
 const full=await client.invoke(new Api.channels.GetFullChannel({channel:new Api.InputChannel({channelId:channel.id,accessHash:channel.accessHash})}));
 const info=full.fullChat;
 if(!(info instanceof Api.ChannelFull))throw Error('GROUP_ACCESS_DENIED');
 const warnings:string[]=[];let fetched=0,historyStatus:GroupReport['historyStatus']='available';let messages:SampleMessage[]=[];
 progress('sampling_group_posts');
 try{
  const history=await client.getMessages(channel,{limit:GROUP_SAMPLE_LIMIT});
  fetched=history.length;
  messages=history.filter((m):m is Api.Message=>m instanceof Api.Message).map(m=>({id:m.id,date:m.date,text:m.message??'',views:m.views,forwards:m.forwards,replies:m.replies?.replies,reactions:m.reactions?m.reactions.results.reduce((sum,reaction)=>sum+reaction.count,0):undefined}));
 }catch(error){
  const failure=classifyError(error);if(failure.code==='RATE_LIMIT')throw error;
  historyStatus='unavailable';warnings.push('Không đọc được mẫu bài/tin nhắn với quyền hiện tại. Các thống kê nội dung và tương tác không khả dụng.');
 }
 const metrics=aggregateSample(messages);
 if(fetched>=GROUP_SAMPLE_LIMIT)warnings.push('Mẫu đã chạm giới hạn 100 mục gần nhất; không đại diện toàn bộ lịch sử.');
 if(historyStatus==='available'&&!metrics.sampleCount)warnings.push('Không có bài/tin nhắn thông thường trong mẫu Telegram trả về; không suy ra nhóm không hoạt động.');
 const members=typeof info.participantsCount==='number'?info.participantsCount:typeof channel.participantsCount==='number'?channel.participantsCount:null;
 if(members===null)warnings.push('Telegram không cung cấp số thành viên cho tài khoản hiện tại.');
 return {id:randomUUID(),target,groupId:channel.id.toString(),title:channel.title,username:publicUsername,kind:channel.broadcast?'channel':'group',about:info.about??'',members,analyzedAt:new Date().toISOString(),sampleLimit:GROUP_SAMPLE_LIMIT,fetched,historyStatus,mayBeTruncated:fetched>=GROUP_SAMPLE_LIMIT,...metrics,warnings};
}
