export type Role = 'admin'|'sales'|'logistics';
export type Actor = {id:string;role:Role;tenantId:string};
export type Customer = {id:string;name:string;city:string;contact:string;owner:string;lastOrderAt:string;nextFollowupAt:string;consent:boolean;paused:boolean;reason?:string;lastInboundAt?:string};
export type Product = {id:string;name:string;pack:string;unit:string;priceMinor:number;currency:string};
export type Order = {id:string;customerId:string;date:string;invoice:string;items:{productId:string;quantity:number}[]};
export type Shipment = {id:string;customerId:string;orderId:string;receiver:string;lr:string;expected:number;unit:string;status:string;updatedAt:string;transporter:string;source:'synthetic'|'imported'|'kaysons';podStatus:'missing'|'pending'|'accepted'|'correction';version:number};
export type Evidence = {id:string;name:string;key:string;mime:string;sha256:string;size:number;extractedText?:string;extraction:'pending'|'extracted'|'manual';kind:'attachment'|'sample';createdAt:string};
export type ServiceCase = {id:string;customerId:string;shipmentId?:string;type:string;origin:'simulator'|'whatsapp';claim:string;owner:string;status:'awaiting_details'|'awaiting_evidence'|'review'|'action_pending'|'resolved';expected?:number;reported?:number;version:number;evidence:Evidence[];proposal?:string;approvedBy?:string;resolution?:string;createdAt:string;updatedAt:string};
export type Request = {id:string;customerId:string;items:{productId:string;quantity:number}[];status:'draft'|'customer_confirmed'|'approved'|'declined';version:number;createdAt:string;approvedBy?:string};
export type Message = {id:string;customerId:string;direction:'inbound'|'outbound';text:string;at:string;channel:'simulator'|'whatsapp';engine?:'rules'|'bedrock';evidenceId?:string};
export type Audit = {id:string;at:string;actor:string;action:string;customerId?:string;recordId?:string;detail:string};
export type Outbound = {id:string;customerId:string;text:string;status:'pending'|'sending'|'sent'|'failed'|'uncertain'|'suppressed';kind:'service'|'followup';createdAt:string;providerId?:string;error?:string;template?:string};
export type State = {tenantId:string;revision:number;business:{name:string;synthetic:boolean;timezone:string};customers:Customer[];products:Product[];orders:Order[];shipments:Shipment[];cases:ServiceCase[];requests:Request[];messages:Message[];audit:Audit[];outbox:Outbound[];processed:{id:string;at:string}[]};
export type Intent = {kind:'complaint'|'reorder'|'confirm'|'status'|'defer'|'optout'|'price'|'other';quantity?:number;reported?:number;shipmentId?:string;days?:number};
export class DomainError extends Error {constructor(public status:number,message:string){super(message);}}
export const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
