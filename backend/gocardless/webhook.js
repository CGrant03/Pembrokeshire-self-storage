import {db,refresh,validSignature} from './common.js';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const raw=await req.text();
 if(raw.length>1000000)return new Response('Too large',{status:413});
 if(!await validSignature(raw,req.headers.get('Webhook-Signature'),Deno.env.get('GOCARDLESS_WEBHOOK_SECRET')))return new Response('Invalid signature',{status:401});
 try{
 const payload=JSON.parse(raw);if(!Array.isArray(payload.events))return new Response('Invalid events',{status:400});
 for(const event of payload.events){
 // Fetch canonical current state, so redelivery and older events cannot roll status backwards.
 let cs=[];
 if(event.links?.billing_request)cs=await db(`gocardless_connections?billing_request_id=eq.${encodeURIComponent(event.links.billing_request)}`);
 else if(event.links?.subscription)cs=await db(`gocardless_connections?subscription_id=eq.${encodeURIComponent(event.links.subscription)}`);
 else if(event.links?.mandate)cs=await db(`gocardless_connections?mandate_id=eq.${encodeURIComponent(event.links.mandate)}`);
 else if(event.links?.payment){
 const {gc}=await import('./common.js');const p=(await gc('payments/'+encodeURIComponent(event.links.payment))).payments;
 cs=await db(`gocardless_connections?first_payment_id=eq.${encodeURIComponent(p.id)}`);
 if(!cs.length&&p.links?.mandate)cs=await db(`gocardless_connections?mandate_id=eq.${encodeURIComponent(p.links.mandate)}`);
 }
 for(const c of cs)await refresh(c);
 }
 return new Response(null,{status:204});
 }catch{return new Response('Processing failed; retry delivery',{status:500});}
});
