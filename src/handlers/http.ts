import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {z,ZodError} from 'zod';
import {store} from '../adapters/store';
import {interpret} from '../adapters/interpreter';
import {saveEvidence,evidenceUrl,localEvidence} from '../adapters/evidence';
import {receive,queueFollowup,caseAction,approveRequest,attach,audit} from '../core/engine';
import {DomainError,id,type Actor} from '../core/types';
export type Input={method:string;path:string;headers:Record<string,string|undefined>;body?:string};
export type Output={statusCode:number;headers:Record<string,string>;body:string;isBase64Encoded?:boolean};
const json=(data:unknown,statusCode=200):Output=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(data)});
const verifier=process.env.USER_POOL_ID?CognitoJwtVerifier.create({userPoolId:process.env.USER_POOL_ID,tokenUse:'id',clientId:process.env.USER_POOL_CLIENT_ID!}):undefined;
async function identity(req:Input):Promise<Actor>{
 if(!verifier){if(process.env.AWS_LAMBDA_FUNCTION_NAME)throw new DomainError(503,'Cloud authentication is not configured');return {id:'local-reviewer',tenantId:'demofoods',role:'admin'};}
 const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw new DomainError(401,'Sign in to your staff workspace');
 try{const claims=await verifier.verify(token);const group=claims['cognito:groups']?.find(x=>/^tl:[a-z0-9-]+:(admin|sales|logistics)$/.test(x));if(!group)throw new Error('No workspace membership');const [,tenantId,role]=group.split(':');return {id:claims.sub,tenantId,role:role as Actor['role']};}catch{throw new DomainError(401,'Your staff session is invalid or has expired');}
}
const messageSchema=z.object({customerId:z.string().max(50),text:z.string().trim().min(1).max(2000),messageId:z.string().max(150).optional()});
export async function dispatch(req:Input):Promise<Output>{
 try{
  const route=req.path;
  if(route==='/api/config')return json({name:'TradeLoop',synthetic:true,region:process.env.AWS_REGION??'us-east-1',poolId:process.env.USER_POOL_ID??null,clientId:process.env.USER_POOL_CLIENT_ID??null,interpreter:process.env.BEDROCK_MODEL_ID?'bedrock':'rules',model:process.env.BEDROCK_MODEL_ID??null,whatsapp:!!process.env.WHATSAPP_PHONE_ID,storage:process.env.TABLE_NAME?'dynamodb':'local',kaysons:false,version:'0.1.0'});
  if(!route.startsWith('/api/')){
   const file=route==='/'?'index.html':route.slice(1);
   if(file.includes('..')||!/^[-a-zA-Z0-9_./]+$/.test(file))return json({error:'Not found'},404);
   try{const bytes=await readFile(path.resolve(process.env.STATIC_DIR??'dist',file));const mime=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';return {statusCode:200,headers:{'content-type':mime,'x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cognito-idp.${process.env.AWS_REGION??'us-east-1'}.amazonaws.com; img-src 'self' data: blob: https://*.amazonaws.com; frame-src 'self' blob: https://*.amazonaws.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`},body:bytes.toString('base64'),isBase64Encoded:true};}catch{return json({error:'Not found'},404);}
  }
  const actor=await identity(req);const tenant=actor.tenantId;const data=req.body?JSON.parse(req.body):{};
  if(req.method==='GET'&&route==='/api/state'){const s=await store.load(tenant);return json({...s,actor});}
  if(req.method==='POST'&&route==='/api/messages'){
   const input=messageSchema.parse(data);const s=await store.load(tenant);if(!s.customers.some(c=>c.id===input.customerId))throw new DomainError(404,'Customer not found');
   const mid=input.messageId??id('sim');if(s.processed.some(p=>p.id===mid))return json({duplicate:true});
   const parsed=await interpret(input.text,s,input.customerId);
   return json(await store.change(tenant,state=>receive(state,{...input,messageId:mid,channel:'simulator',...parsed})));
  }
  const follow=route.match(/^\/api\/followups\/([^/]+)$/);if(req.method==='POST'&&follow)return json({text:await store.change(tenant,s=>queueFollowup(s,actor,follow[1]))});
  if(req.method==='POST'&&route==='/api/cases/action'){const input=z.object({caseId:z.string(),version:z.number().int(),action:z.enum(['propose','approve','resolve']),note:z.string().trim().min(1).max(1000)}).parse(data);await store.change(tenant,s=>caseAction(s,actor,input));return json({ok:true});}
  if(req.method==='POST'&&route==='/api/requests/approve'){const input=z.object({requestId:z.string(),version:z.number().int()}).parse(data);await store.change(tenant,s=>approveRequest(s,actor,input.requestId,input.version));return json({ok:true});}
  if(req.method==='POST'&&route==='/api/evidence'){
   const input=z.object({caseId:z.string(),version:z.number().int(),name:z.string().min(1).max(150),mime:z.string(),base64:z.string().max(5700000)}).parse(data);
   if(!['admin','logistics'].includes(actor.role))throw new DomainError(403,'Logistics reviewer required');
   const s=await store.load(tenant);if(!s.cases.some(c=>c.id===input.caseId&&c.version===input.version))throw new DomainError(409,'Case changed; refresh before uploading');
   const e=await saveEvidence(tenant,input.name,input.mime,Buffer.from(input.base64,'base64'));await store.change(tenant,state=>attach(state,actor,input.caseId,e,input.version));return json(e);
  }
  const doc=route.match(/^\/api\/evidence\/([^/]+)$/);if(req.method==='GET'&&doc){const s=await store.load(tenant);const e=s.cases.flatMap(c=>c.evidence).find(x=>x.id===doc[1]);if(!e)throw new DomainError(404,'Evidence not found');if(process.env.EVIDENCE_BUCKET)return json({url:await evidenceUrl(e)});return {statusCode:200,headers:{'content-type':e.mime,'content-disposition':'inline','cache-control':'no-store'},body:(await localEvidence(e)).toString('base64'),isBase64Encoded:true};}
  if(req.method==='POST'&&route==='/api/reset'){if(actor.role!=='admin')throw new DomainError(403,'Admin required');const {seed}=await import('../core/seed');await store.change(tenant,s=>{if(!s.business.synthetic)throw new DomainError(403,'Only synthetic workspaces can reset');const revision=s.revision;Object.assign(s,seed(tenant),{revision});audit(s,actor.id,'demo.reset','Synthetic workspace reset');});return json({ok:true});}
  if(req.method==='GET'&&route==='/api/export'){const s=await store.load(tenant);return json({business:s.business,synthetic:true,exportedAt:new Date().toISOString(),audit:s.audit,cases:s.cases,requests:s.requests});}
  return json({error:'Route not found'},404);
 }catch(e){if(e instanceof DomainError)return json({error:e.message},e.status);if(e instanceof ZodError)return json({error:'Invalid request',fields:e.issues.map(x=>({path:x.path,message:x.message}))},400);if(e instanceof SyntaxError)return json({error:'Invalid JSON'},400);console.error('request.failed',{name:(e as Error).name,message:(e as Error).message});return json({error:'The operation could not complete. Your existing records are preserved. Try again or ask staff to review.'},503);}
}
export async function handler(event:any):Promise<Output>{return dispatch({method:event.requestContext?.http?.method??event.httpMethod,path:event.rawPath??event.path,headers:event.headers??{},body:event.isBase64Encoded?Buffer.from(event.body??'','base64').toString():event.body});}
