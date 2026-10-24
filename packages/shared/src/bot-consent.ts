export const BOT_TOPICS=[{id:'product',label:'Cập nhật sản phẩm',description:'Cập nhật và giới thiệu sản phẩm.'},{id:'guides',label:'Hướng dẫn sử dụng',description:'Hướng dẫn sử dụng sản phẩm.'}] as const;
export type BotTopic=typeof BOT_TOPICS[number]['id'];
export type BotConsentEvent={at:string;userId:string;topic:BotTopic|'*';event:'opt_in'|'opt_out';source:'bot:confirm_callback'|'bot:/stop'|'bot:stop_button';purpose:'bot_topic_updates';updateId:number};
export type BotConsentInput={type:'choose';userId:string;topic:BotTopic;callbackId:string;updateId:number}|{type:'confirm'|'cancel';userId:string;nonce:string;messageId:number;callbackId:string;updateId:number}|{type:'stop';userId:string;source:'bot:/stop'|'bot:stop_button';callbackId?:string;updateId:number};
export const BOT_SUBSCRIBE_CHOICES=[...BOT_TOPICS.map(t=>({id:'sub:topic:'+t.id+':v2',label:'Đăng ký: '+t.label})),{id:'sub:stop:v2',label:'Hủy nhận tin (/stop)'}];
export const BOT_CONFIRM_TTL=5*60*1000;
