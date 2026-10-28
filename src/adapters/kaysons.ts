/** Contract for a future authorized Kaysons backend. No direct database bypass. */
export class KaysonsConnector {
 async shipment(reference:string){
  const base=process.env.KAYSONS_API_URL,token=process.env.KAYSONS_API_TOKEN;
  if(!base||!token)throw new Error('Kaysons is not connected. Current records are synthetic.');
  const url=new URL('shipments/'+encodeURIComponent(reference),base.endsWith('/')?base:base+'/');
  if(url.protocol!=='https:')throw new Error('Kaysons endpoint must use HTTPS');
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`Kaysons lookup failed (${response.status})`);
  return response.json();
 }
}
