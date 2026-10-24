import {open} from 'node:fs/promises';
import {basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DOCUMENT_MAX,PHOTO_MAX,type AttachmentData} from '../../../../packages/shared/src/manual-send';
export async function readSendAttachment(path:string,kind:'photo'|'document'):Promise<AttachmentData>{
 const file=await open(path,'r');try{
  const stat=await file.stat(),limit=kind==='photo'?PHOTO_MAX:DOCUMENT_MAX;if(!stat.isFile()||stat.size<=0||stat.size>limit)throw Error('SEND_FILE_SIZE');
  const bytes=Buffer.alloc(stat.size+1);let offset=0;
  while(offset<bytes.length){const part=await file.read(bytes,offset,bytes.length-offset,null);if(!part.bytesRead)break;offset+=part.bytesRead;}
  if(offset!==stat.size)throw Error('SEND_FILE_CHANGED');const data=bytes.subarray(0,offset);
  if(kind==='photo'&&!/\.(jpe?g|png)$/i.test(path))throw Error('SEND_PHOTO_FORMAT');
  if(kind==='photo'&&!((data[0]===255&&data[1]===216&&data[2]===255)||data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw Error('SEND_PHOTO_FORMAT');
  return {id:randomUUID(),name:basename(path).replace(/[\u0000-\u001f]/g,'_'),kind,size:offset,bytes:data};
 }finally{await file.close();}
}
