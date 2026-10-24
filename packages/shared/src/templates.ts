export const TEMPLATE_VARIABLES=['ten','san_pham','cong_ty','lien_ket'] as const;
export type TemplateVariable=typeof TEMPLATE_VARIABLES[number];
export type MessageTemplate={id:string;name:string;body:string;updatedAt:string};
export type TemplateDraft={id?:string;name:string;body:string};
export const TEMPLATE_LIMIT=200;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function templateId(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw Error('INPUT_INVALID');return value;}
export function templateVariables(body:string):TemplateVariable[]{
 const found=[...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)];
 const remainder=body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,'');
 if(remainder.includes('{{')||remainder.includes('}}')||found.some(match=>!TEMPLATE_VARIABLES.includes(match[1] as TemplateVariable)))throw Error('TEMPLATE_VARIABLE_INVALID');
 return [...new Set(found.map(match=>match[1] as TemplateVariable))];
}
export function parseTemplate(value:unknown):TemplateDraft{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(key=>!['id','name','body'].includes(key))||typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>100||typeof v.body!=='string'||!v.body.trim()||v.body.length>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.body)||/[\u0000-\u001f]/.test(v.name))throw Error('INPUT_INVALID');
 templateVariables(v.body);return {id:v.id===undefined?undefined:templateId(v.id),name:v.name.trim(),body:v.body};
}
export function previewTemplate(body:string,values:Partial<Record<TemplateVariable,string>>):{text:string;missing:TemplateVariable[]}{
 const variables=templateVariables(body);const missing=variables.filter(key=>!values[key]?.trim());
 // A replacement callback preserves literal dollar signs and does not recursively expand values.
 return {text:body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(original,key:TemplateVariable)=>values[key]?.trim()?values[key]:original),missing};
}
