import {db,gc,staff,refresh} from './common.js';
const origin='https://cgrant03.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async req=>{
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 if(!await staff(req))return reply({error:'Staff sign-in required'},403);
 const {action,tenancy_id}=await req.json();
 if(action==='health'){await gc('creditors?limit=1');return reply({connected:true});}
 if(!/^[0-9a-f-]{36}$/i.test(tenancy_id||''))return reply({error:'Invalid tenancy'},400);
 const t=(await db(`tenancies?id=eq.${tenancy_id}&select=id,status`))[0];if(!t)return reply({error:'Tenancy not found'},404);
 let c=(await db(`gocardless_connections?tenancy_id=eq.${tenancy_id}`))[0]||{tenancy_id,billing_status:'not_started'};
 if(action==='refresh')return reply({connection:await refresh(c)});
 if(action!=='setup')return reply({error:'Unknown action'},400);
 if(!['active','pending'].includes(t.status))return reply({error:'Only active tenancies can be set up'},409);
 if(c.billing_request_id)c=await refresh(c);
 if(c.mandate_id)return reply({connection:c,message:'A mandate is already linked. Check its status before arranging payments.'});
 if(!c.billing_request_id){
 // No amount or subscription: this authorises a mandate only; it never collects money.
 let b=await gc('billing_requests','POST',{billing_requests:{mandate_request:{scheme:'bacs'},metadata:{tenancy_id}}},'tenancy-mandate-'+tenancy_id);
 if(b.conflict)b=await gc('billing_requests/'+encodeURIComponent(b.conflict));
 c.billing_request_id=b.billing_requests.id;c.billing_status=b.billing_requests.status;
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 }
 if(['cancelled','fulfilled'].includes(c.billing_status))return reply({error:'This setup request is closed. Review it in GoCardless before creating another.'},409);
 const returnURL=origin+'/Pembrokeshire-self-storage/direct-debit.html';
 const f=await gc('billing_request_flows','POST',{billing_request_flows:{redirect_uri:returnURL,exit_uri:returnURL+'?cancelled=1',links:{billing_request:c.billing_request_id}}});
 c.setup_url=f.billing_request_flows.authorisation_url;c.updated_at=new Date().toISOString();
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 return reply({connection:c,url:c.setup_url});
 }catch(e){return reply({error:e.message||'Connection failed'},502);}
});
