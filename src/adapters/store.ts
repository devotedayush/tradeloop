import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {seed} from '../core/seed';
import {DomainError,type State} from '../core/types';
const collections=['customers','products','orders','shipments','cases','requests','messages','audit','outbox','processed'] as const;
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const locks=new Map<string,Promise<unknown>>();
function rows(s:State){const result=new Map<string,unknown>();for(const key of collections)for(const item of s[key])result.set(`${key}#${item.id}`,item);return result;}
export class Store {
 constructor(private table=process.env.TABLE_NAME,private directory=process.env.DATA_DIR??'.runtime/data'){}
 async load(tenant:string):Promise<State>{
  if(!/^[a-z0-9-]{1,50}$/.test(tenant))throw new DomainError(400,'Invalid business identifier');
  if(!this.table){try{return JSON.parse(await readFile(path.join(this.directory,tenant+'.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return seed(tenant);}}
  const PK=`TENANT#${tenant}`;
  for(let attempt=0;attempt<4;attempt++){
   const before=await db.send(new GetCommand({TableName:this.table,Key:{PK,SK:'META'},ConsistentRead:true}));
   if(!before.Item){const s=seed(tenant);try{await this.commit(undefined,s);return s;}catch(e){if((e as Error).name==='TransactionCanceledException')continue;throw e;}}
   const items:Record<string,unknown>[]=[];let cursor:Record<string,unknown>|undefined;
   do{const page=await db.send(new QueryCommand({TableName:this.table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':PK},ConsistentRead:true,ExclusiveStartKey:cursor}));items.push(...(page.Items??[]));cursor=page.LastEvaluatedKey;}while(cursor);
   const after=await db.send(new GetCommand({TableName:this.table,Key:{PK,SK:'META'},ConsistentRead:true}));if(before.Item.revision!==after.Item?.revision)continue;
   const meta=after.Item!;const state={tenantId:tenant,revision:meta.revision,business:meta.business} as State;
   for(const key of collections)(state as unknown as Record<string,unknown>)[key]=items.filter(x=>String(x.SK).startsWith(key+'#')).map(x=>x.value);
   return state;
  }throw new DomainError(409,'Business data changed repeatedly; retry shortly');
 }
 private async commit(before:State|undefined,after:State){
  if(!this.table){await mkdir(this.directory,{recursive:true});const file=path.join(this.directory,after.tenantId+'.json');const temp=file+'.'+crypto.randomUUID();await writeFile(temp,JSON.stringify(after));await rename(temp,file);return;}
  const PK=`TENANT#${after.tenantId}`;const old=before?rows(before):new Map();const next=rows(after);
  const transact:any[]=[{Put:{TableName:this.table,Item:{PK,SK:'META',revision:after.revision,business:after.business},ConditionExpression:before?'revision = :rev':'attribute_not_exists(PK)',...(before?{ExpressionAttributeValues:{':rev':before.revision}}:{})}}];
  for(const [key,value] of next)if(JSON.stringify(old.get(key))!==JSON.stringify(value))transact.push({Put:{TableName:this.table,Item:{PK,SK:key,value}}});
  for(const key of old.keys())if(!next.has(key))transact.push({Delete:{TableName:this.table,Key:{PK,SK:key}}});
  if(transact.length>100)throw new DomainError(413,'This change exceeds the atomic demo transaction limit');
  await db.send(new TransactWriteCommand({TransactItems:transact}));
 }
 async change<T>(tenant:string,fn:(s:State)=>T):Promise<T>{
  const run=async()=>{for(let i=0;i<4;i++){const before=await this.load(tenant);const after=structuredClone(before);const value=fn(after);after.revision=before.revision+1;try{await this.commit(before,after);return value;}catch(e){if(this.table&&(e as Error).name==='TransactionCanceledException')continue;throw e;}}throw new DomainError(409,'Concurrent update; refresh and retry');};
  if(this.table)return run();
  const previous=locks.get(tenant)??Promise.resolve();const current=previous.catch(()=>{}).then(run);locks.set(tenant,current);try{return await current;}finally{if(locks.get(tenant)===current)locks.delete(tenant);}
 }
}
export const store=new Store();
