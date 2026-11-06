import {db,gc,staff,refresh} from './common.js';
const origin='https://cgrant03.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async req=>{
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 const input=await req.json();
 if(['terms','accept_terms'].includes(input.action)){
 if(!/^[a-f0-9-]{36}$/i.test(input.token||''))return reply({error:'Invalid setup link'},404);
 const c=(await db(`gocardless_connections?setup_token=eq.${input.token}`))[0];
 if(!c?.plan||!c.setup_url||['cancelled','fulfilled'].includes(c.billing_status))return reply({error:'This setup link is closed. Please ask for a new link.'},410);
 if(c.plan.first_date<=new Date().toISOString().slice(0,10))return reply({error:'The proposed first date has passed. Please ask for a new collection date.'},410);
 if(input.action==='accept_terms'){
 if(input.accepted!==true)return reply({error:'Please confirm the payment terms'},400);
 await db(`gocardless_connections?tenancy_id=eq.${c.tenancy_id}`,'PATCH',{terms_accepted_at:new Date().toISOString()});
 return reply({url:c.setup_url});
 }
 return reply({plan:c.plan});
 }
 if(!await staff(req))return reply({error:'Staff sign-in required'},403);
 const {action,tenancy_id,plan}=input;
 if(action==='health'){await gc('creditors?limit=1');return reply({connected:true});}
 if(!/^[0-9a-f-]{36}$/i.test(tenancy_id||''))return reply({error:'Invalid tenancy'},400);
 const t=(await db(`tenancies?id=eq.${tenancy_id}&select=id,status`))[0];if(!t)return reply({error:'Tenancy not found'},404);
 let c=(await db(`gocardless_connections?tenancy_id=eq.${tenancy_id}`))[0]||{tenancy_id,billing_status:'not_started'};
 if(action==='refresh')return reply({connection:await refresh(c)});
 if(action==='cancel_setup'){
 if(!c.billing_request_id)return reply({message:'No setup to cancel.'});
 c=await refresh(c);
 if(c.mandate_id||c.billing_status==='fulfilled')return reply({error:'A mandate exists. Cancel it in GoCardless before replacing this setup.'},409);
 if(c.billing_status!=='cancelled')await gc('billing_requests/'+encodeURIComponent(c.billing_request_id)+'/actions/cancel','POST',{});
 await db(`gocardless_connections?tenancy_id=eq.${tenancy_id}`,'PATCH',{billing_status:'cancelled',setup_url:null,setup_token:null,terms_accepted_at:null,plan:null});
 return reply({message:'Pending setup cancelled. Its old link has expired.'});
 }
 if(action!=='setup')return reply({error:'Unknown action'},400);
 if(!['active','pending'].includes(t.status))return reply({error:'Only active tenancies can be set up'},409);
 if(c.billing_request_id)c=await refresh(c);
 const previousRequest=c.billing_status==='cancelled'?c.billing_request_id:'initial';
 if(c.billing_status==='cancelled')c={tenancy_id,billing_status:'not_started',billing_request_id:null,mandate_id:null,mandate_status:null,customer_id:null,setup_url:null,plan:null,setup_token:null,terms_accepted_at:null};
 if(c.mandate_id)return reply({connection:c,message:'A mandate is already linked. Check its status before arranging payments.'});
 if(!c.billing_request_id){
 if(!plan||!Number.isSafeInteger(plan.amount_pence)||plan.amount_pence<1||plan.amount_pence>1000000||!/^\d{4}-\d{2}-\d{2}$/.test(plan.first_date||'')||!Number.isInteger(plan.day)||plan.day<1||plan.day>28||new Date(plan.first_date+'T12:00:00Z').toISOString().slice(0,10)!==plan.first_date||plan.first_date<=new Date(Date.now()+7*86400000).toISOString().slice(0,10)||Number(plan.first_date.slice(-2))!==plan.day)return reply({error:'Enter the total monthly amount and a valid first date at least 8 days ahead, on your regular collection day (1–28).'},400);
 c.plan={amount_pence:plan.amount_pence,first_date:plan.first_date,day:plan.day,currency:'GBP',frequency:'monthly'};
 c.setup_token=crypto.randomUUID();c.terms_accepted_at=null;
 // Terms are fixed for this request; a replacement requires cancelling the old request first.
 // No amount or subscription: this authorises a mandate only; it never collects money.
 let b=await gc('billing_requests','POST',{billing_requests:{mandate_request:{scheme:'bacs'},metadata:{tenancy_id}}},'tenancy-mandate-v2-'+tenancy_id+'-'+plan.first_date+'-'+plan.amount_pence+'-'+previousRequest);
 if(b.conflict)b=await gc('billing_requests/'+encodeURIComponent(b.conflict));
 c.billing_request_id=b.billing_requests.id;c.billing_status=b.billing_requests.status;
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 }
 if(!c.plan)return reply({error:'This is an old mandate-only link. Cancel the pending setup below, then create a link with payment terms.'},409);
 if(['cancelled','fulfilled'].includes(c.billing_status))return reply({error:'This setup request is closed. Review it in GoCardless before creating another.'},409);
 const returnURL=origin+'/Pembrokeshire-self-storage/direct-debit.html';
 const f=await gc('billing_request_flows','POST',{billing_request_flows:{redirect_uri:returnURL,exit_uri:returnURL+'?cancelled=1',links:{billing_request:c.billing_request_id}}});
 c.setup_url=f.billing_request_flows.authorisation_url;c.updated_at=new Date().toISOString();
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 return reply({connection:c,url:origin+'/Pembrokeshire-self-storage/direct-debit-setup.html#'+c.setup_token});
 }catch(e){return reply({error:e.message||'Connection failed'},502);}
});
