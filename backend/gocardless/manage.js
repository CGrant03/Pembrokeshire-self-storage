import {UPFRONT_MODE,nextMonth} from './billing.js';
import {db,gc,staff,refresh} from './common.js';
import {version,documentText} from './agreement.js';
import {invitation} from './invitation.js';
const site='https://www.pembrokeshireselfstorage.co.uk';
const allowedOrigins=new Set([site,'https://pembrokeshireselfstorage.co.uk','https://cgrant03.github.io']);
let optionsCache=null,optionsUntil=0;
async function emailSender(){
 // This domain was verified in Resend on 7 November 2026.
 // Sending-only API keys cannot list domains; do not require management permissions to send.
 return Deno.env.get('STORAGE_EMAIL_FROM')||'Pembrokeshire Self Storage <storage@pembrokeshireselfstorage.co.uk>';
}
const baseHeaders={'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={...baseHeaders,Vary:'Origin',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 if(origin&&!allowedOrigins.has(origin))return new Response('Origin not allowed',{status:403});
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method==='GET'){
 if(new URL(req.url).searchParams.has('email_status'))return reply({business_email_ready:!(await emailSender()).includes('@resend.dev'),email_configured:!!Deno.env.get('RESEND_API_KEY')});
 try{if(!optionsCache||Date.now()>optionsUntil){const result=await gc('creditors?limit=2');const schemes=result.creditors?.length===1?result.creditors[0].scheme_identifiers||[]:[];optionsCache={pay_by_bank:schemes.some(s=>s.scheme==='faster_payments'&&s.status==='active'),direct_debit:schemes.some(s=>s.scheme==='bacs'&&s.status==='active')};optionsUntil=Date.now()+60000;}return reply(optionsCache);}catch{return reply({error:'Payment options unavailable'},503);}
 }
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 if(Number(req.headers.get('content-length')||0)>12000)return reply({error:'Request too large'},413);
 const input=await req.json();
 if(['terms','accept_terms','sign_agreement','payment_status'].includes(input.action)){
 if(!/^[a-f0-9-]{36}$/i.test(input.token||''))return reply({error:'Invalid setup link'},404);
 const c=(await db(`gocardless_connections?setup_token=eq.${input.token}`))[0];
 if(input.action==='payment_status'){if(!c?.plan)return reply({error:'Setup not found'},404);return reply({upfront:c.plan.mode===UPFRONT_MODE,first_payment_status:c.first_payment_status||'pending',mandate_status:c.mandate_status||'pending',subscription_status:c.subscription_status||'pending',needs_attention:!!c.billing_error});}
 if(!c?.plan||!c.setup_url||['cancelled','fulfilled'].includes(c.billing_status))return reply({error:'This setup link is closed. Please ask for a new link.'},410);
 if(c.plan.first_date<=new Date().toISOString().slice(0,10))return reply({error:'The proposed first date has passed. Please ask for a new collection date.'},410);
 const agreement=(await db(`storage_agreements?setup_token=eq.${input.token}`))[0];
 if(input.action==='sign_agreement'){
 if(!agreement)return reply({error:'Agreement unavailable; ask us for a new link.'},409);
 if(agreement.signed_at)return reply({agreement});
 const name=String(input.signer_name||'').trim(),address=String(input.signer_address||'').trim();
 if(input.accepted!==true||name.length<2||name.length>150||address.length<5||address.length>500||input.document_hash!==agreement.document_hash)return reply({error:'Read the agreement and enter your full name and address.'},400);
 const tenant=(await db(`tenancies?id=eq.${c.tenancy_id}&select=start_date`))[0];
 if(tenant.start_date<=new Date(Date.now()+14*86400000).toISOString().slice(0,10)&&input.early_start!==true)return reply({error:'Please request the early start or contact us to change your start date.'},400);
 const signed=await db(`storage_agreements?id=eq.${agreement.id}&signed_at=is.null`,'PATCH',{signed_at:new Date().toISOString(),signer_name:name,signer_address:address,early_start:input.early_start===true});
 return reply({agreement:signed[0]||(await db(`storage_agreements?id=eq.${agreement.id}`))[0]});
 }
 if(input.action==='accept_terms'){
 if(agreement&&!agreement.signed_at)return reply({error:'Please sign your storage agreement first.'},409);
 if(input.accepted!==true)return reply({error:'Please confirm the payment terms'},400);
 await db(`gocardless_connections?tenancy_id=eq.${c.tenancy_id}`,'PATCH',{terms_accepted_at:new Date().toISOString()});
 return reply({url:c.setup_url});
 }
 return reply({plan:c.plan,agreement:agreement||null});
 }
 if(!await staff(req))return reply({error:'Staff sign-in required'},403);
 const {action,tenancy_id,plan}=input;
 if(action==='health'){await gc('creditors?limit=1');return reply({connected:true});}
 if(!/^[0-9a-f-]{36}$/i.test(tenancy_id||''))return reply({error:'Invalid tenancy'},400);
 const t=(await db(`tenancies?id=eq.${tenancy_id}&select=id,status,asset_id,customer_id,start_date`))[0];if(!t)return reply({error:'Tenancy not found'},404);
 let c=(await db(`gocardless_connections?tenancy_id=eq.${tenancy_id}`))[0]||{tenancy_id,billing_status:'not_started'};
 if(action==='email_invitation'){
 if(!c.setup_token||!c.setup_url||!c.plan||['cancelled','fulfilled'].includes(c.billing_status)||c.mandate_id)return reply({error:'This setup link is closed. Check the tenant status before sending.'},409);
 if(c.plan.first_date<=new Date().toISOString().slice(0,10))return reply({error:'The collection date has passed. Prepare a new link first.'},409);
 const customer=(await db(`customers?id=eq.${t.customer_id}&select=full_name,email`))[0];
 const asset=(await db(`assets?id=eq.${t.asset_id}&select=name`))[0];
 if(!customer?.email||!asset)return reply({error:'Save a customer email address before sending.'},400);
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key)return reply({error:'Email sending is unavailable. Use your email app below.'},503);
 const email=invitation({name:customer.full_name,container:asset.name,start:t.start_date,plan:c.plan,token:c.setup_token});
 const from=await emailSender();
 // Test aliases belong to the owner's inbox, but Resend's test sender requires the exact address.
 const testRecipient=/^TEST\b/i.test(customer.full_name||'')&&/^midcounty12\+[^@]+@gmail\.com$/i.test(customer.email);
 const recipient=testRecipient?'midcounty12@gmail.com':customer.email;
 if(from.includes('@resend.dev')&&recipient.toLowerCase()!=='midcounty12@gmail.com')return reply({error:'Customer emails need your business email domain verified first. For now, use “Open email app” to send this agreement.',code:'sender_not_ready'},409);
 const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'storage-invitation/'+c.setup_token+'/'+recipient},body:JSON.stringify({from,to:[recipient],reply_to:'midcounty12@gmail.com',...email}),signal:AbortSignal.timeout(10000)});
 const outcome=await sent.json().catch(()=>({}));
 if(!sent.ok)return reply({error:sent.status===403?'The email provider rejected this sender or recipient. Your business email domain needs checking. Use “Open email app” to send this agreement.':'Email was not sent. Use your email app below or try again.'},502);
 return reply({sent:true,to:recipient});
 }
 if(action==='refresh')return reply({connection:await refresh(c)});
 if(action==='cancel_setup'){
 if(!c.billing_request_id)return reply({message:'No setup to cancel.'});
 c=await refresh(c);
 if(c.first_payment_id||c.mandate_id||c.billing_status==='fulfilled')return reply({error:'A mandate exists. Cancel it in GoCardless before replacing this setup.'},409);
 if(c.billing_status!=='cancelled')await gc('billing_requests/'+encodeURIComponent(c.billing_request_id)+'/actions/cancel','POST',{});
 await db(`gocardless_connections?tenancy_id=eq.${tenancy_id}`,'PATCH',{billing_status:'cancelled',setup_url:null,setup_token:null,terms_accepted_at:null,plan:null,first_payment_id:null,first_payment_status:null,subscription_id:null,subscription_status:null,billing_error:null});
 return reply({message:'Pending setup cancelled. Its old link has expired.'});
 }
 if(action!=='setup')return reply({error:'Unknown action'},400);
 if(!['active','pending'].includes(t.status))return reply({error:'Only active tenancies can be set up'},409);
 if(c.billing_request_id)c=await refresh(c);
 if(c.first_payment_id&&c.billing_status==='cancelled')return reply({error:'An upfront payment exists. Review it before creating a replacement.'},409);
 const previousRequest=c.billing_status==='cancelled'?c.billing_request_id:'initial';
 if(c.billing_status==='cancelled')c={tenancy_id,billing_status:'not_started',billing_request_id:null,mandate_id:null,mandate_status:null,customer_id:null,setup_url:null,plan:null,setup_token:null,terms_accepted_at:null};
 if(c.mandate_id)return reply({connection:c,message:'A mandate is already linked. Check its status before arranging payments.'});
 if(!c.billing_request_id){
 const upfront=plan?.mode===UPFRONT_MODE;
 const maxDay=upfront?31:28;
 if(!plan||!Number.isSafeInteger(plan.amount_pence)||plan.amount_pence<1||plan.amount_pence>1000000||!/^\d{4}-\d{2}-\d{2}$/.test(plan.first_date||'')||!Number.isInteger(plan.day)||plan.day<1||plan.day>maxDay||new Date(plan.first_date+'T12:00:00Z').toISOString().slice(0,10)!==plan.first_date||plan.first_date<=new Date(Date.now()+7*86400000).toISOString().slice(0,10))return reply({error:'Enter a valid monthly amount and collection date at least 8 days ahead.'},400);
 if(upfront){
 if(t.start_date<new Date().toISOString().slice(0,10)||plan.first_date!==nextMonth(t.start_date)||plan.day!==Number(t.start_date.slice(-2)))return reply({error:'The first monthly Direct Debit must start one calendar month after storage starts.'},400);
 const asset=(await db(`assets?id=eq.${t.asset_id}&select=asset_type`))[0];
 if(asset?.asset_type!=='container')return reply({error:'Upfront storage payments are only supported for containers.'},400);
 const creditors=(await gc('creditors?limit=2')).creditors;
 if(creditors?.length!==1||!creditors[0].scheme_identifiers?.some(x=>x.scheme==='faster_payments'&&x.status==='active'))return reply({error:'Pay by Bank is not enabled. No payment request was created.'},409);
 }else if(Number(plan.first_date.slice(-2))!==plan.day)return reply({error:'Collection date and day must match.'},400);
 c.plan={amount_pence:plan.amount_pence,first_date:plan.first_date,day:plan.day,currency:'GBP',frequency:'monthly',...(upfront?{mode:UPFRONT_MODE,storage_start:t.start_date,upfront_amount_pence:plan.amount_pence}:{})};
 c.setup_token=crypto.randomUUID();c.terms_accepted_at=null;
 // Terms are fixed for this request; a replacement requires cancelling the old request first.
 // Only the new explicit upfront plan requests payment; legacy links remain mandate-only.
 let b=await gc('billing_requests','POST',{billing_requests:{mandate_request:{scheme:'bacs'},...(upfront?{fallback_enabled:false,payment_request:{amount:plan.amount_pence,currency:'GBP',scheme:'faster_payments',description:'First month — Pembrokeshire Self Storage'}}:{}),metadata:{tenancy_id}}},(upfront?'storage-upfront-v1-':'tenancy-mandate-v2-')+tenancy_id+'-'+plan.first_date+'-'+plan.amount_pence+'-'+previousRequest);
 if(b.conflict)b=await gc('billing_requests/'+encodeURIComponent(b.conflict));
 c.billing_request_id=b.billing_requests.id;c.billing_status=b.billing_requests.status;
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 }
 if(c.plan?.mode===UPFRONT_MODE)await db(`tenancies?id=eq.${tenancy_id}`,'PATCH',{payment_day:c.plan.day});
 if(!c.plan)return reply({error:'This is an old mandate-only link. Cancel the pending setup below, then create a link with payment terms.'},409);
 if(['cancelled','fulfilled'].includes(c.billing_status))return reply({error:'This setup request is closed. Review it in GoCardless before creating another.'},409);
 const asset=(await db(`assets?id=eq.${t.asset_id}&select=asset_type,name,location`))[0];
 if(asset?.asset_type==='container'){
 let agreement=(await db(`storage_agreements?setup_token=eq.${c.setup_token}`))[0];
 if(!agreement){
 if(input.agreement_confirmed!==true)return reply({error:'Check and confirm the container and storage start date before creating the agreement link.'},400);
 const customer=(await db(`customers?id=eq.${t.customer_id}&select=full_name`))[0];
 const document=documentText({customer:customer.full_name,container:asset.name,site:asset.location||'Cartlett Office & Storage Park, Haverfordwest',start_date:t.start_date,plan:c.plan});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(document));
 await db('storage_agreements','POST',{tenancy_id:t.id,setup_token:c.setup_token,version,document,document_hash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});
 }
 }
 const returnURL=site+'/direct-debit.html';
 const f=await gc('billing_request_flows','POST',{billing_request_flows:{redirect_uri:returnURL+'#'+c.setup_token,exit_uri:returnURL+'?cancelled=1#'+c.setup_token,links:{billing_request:c.billing_request_id}}});
 c.setup_url=f.billing_request_flows.authorisation_url;c.updated_at=new Date().toISOString();
 await db('gocardless_connections?on_conflict=tenancy_id','POST',c);
 return reply({connection:c,url:site+'/direct-debit-setup.html#'+c.setup_token});
 }catch(e){return reply({error:e.message||'Connection failed'},502);}
});
