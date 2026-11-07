import {identityComplete} from './identity.js';
import {logoAttachment} from './logo.js';
import {date} from './dates.js';
export function accessEligible(c,a,t){return c.plan?.mode==='upfront_monthly_v1'&&!!c.first_payment_id&&['confirmed','paid_out'].includes(c.first_payment_status)&&!!c.terms_accepted_at&&identityComplete(a)&&a.setup_token===c.setup_token&&['active','pending'].includes(t?.status);}
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function deliverAccess(c,{db,send=fetch}){
 if(c.plan?.mode!=='upfront_monthly_v1'||!['confirmed','paid_out'].includes(c.first_payment_status))return null;
 const a=(await db(`storage_agreements?setup_token=eq.${c.setup_token}`))[0];
 const t=(await db(`tenancies?id=eq.${c.tenancy_id}&select=status,asset_id,customer_id,start_date`))[0];
 if(!accessEligible(c,a,t))return null;
 const config=(await db(`storage_access_codes?asset_id=eq.${t.asset_id}`))[0];
 if(!config?.enabled)return null;
 const previous=(await db(`storage_access_deliveries?agreement_id=eq.${a.id}`))[0];
 if(previous?.sent_at&&!previous.resend_request_id)return {sent:true};
 const customer=(await db(`customers?id=eq.${t.customer_id}&select=email`))[0];
 if(!customer?.email)return null;
 const asset=(await db(`assets?id=eq.${t.asset_id}&select=name`))[0];
 const container=asset?.name?.match(/^Container\s+\d+/i)?.[0]||'Your container';
 // The request body remains identical for retries of the same agreement.
 const text=`Hi ${a.signer_name},\n\nYour first payment is confirmed and your signed agreement and ID are saved.\n\n${container}\nStorage starts: ${date(t.start_date)}\nGate code: ${config.gate_code}\nContainer lock-box code: ${config.lockbox_code}\n\nYard address: Pembrokeshire Self Storage, Cartlett Office & Storage Park, Haverfordwest, Pembrokeshire, SA61 2LH\nGoogle Maps directions: https://www.google.com/maps/dir/?api=1&destination=Pembrokeshire%20Self%20Storage%2C%20Cartlett%20Office%20%26%20Storage%20Park%2C%20Haverfordwest%2C%20Pembrokeshire%2C%20SA61%202LH\n\nUse these details from your storage start date. Please keep the codes private, close the gate and scramble the lock-box numbers after use.\n\nYour agreement and payment status: https://www.pembrokeshireselfstorage.co.uk/direct-debit.html#${c.setup_token}\n\nQuestions? Call 01437 723694 or reply to this email.\n\nMiles\nPembrokeshire Self Storage`;
 const payload={from:Deno.env.get('STORAGE_EMAIL_FROM')||'Pembrokeshire Self Storage <storage@pembrokeshireselfstorage.co.uk>',to:[customer.email],reply_to:'midcounty12@gmail.com',subject:'Your storage access details | Pembrokeshire Self Storage',text,html:`<div style="font:16px/1.6 Arial;color:#102c3c;max-width:600px;margin:auto"><img src="cid:storage-logo" width="210" alt="Pembrokeshire Self Storage"><h1>Your storage is ready</h1><div style="white-space:pre-line">${esc(text)}</div><p style="line-height:1.6"><strong>Find the yard</strong><br>Pembrokeshire Self Storage<br>Cartlett Office &amp; Storage Park<br>Haverfordwest, Pembrokeshire<br>SA61 2LH</p><p><a href="https://www.google.com/maps/dir/?api=1&amp;destination=Pembrokeshire%20Self%20Storage%2C%20Cartlett%20Office%20%26%20Storage%20Park%2C%20Haverfordwest%2C%20Pembrokeshire%2C%20SA61%202LH" style="display:inline-block;background:#e9bb58;color:#062942;padding:14px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Get directions on Google Maps</a></p></div>`,attachments:[logoAttachment]};
 const key=Deno.env.get('RESEND_API_KEY');if(!key)throw Error('Access email sending is unavailable.');
 const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'storage-access/'+a.id+(previous?.resend_request_id?'/resend/'+previous.resend_request_id:'')},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Access email was not sent; refresh payment status to retry.');
 const result=await r.json();
 await db('storage_access_deliveries?on_conflict=agreement_id','POST',{agreement_id:a.id,tenancy_id:c.tenancy_id,sent_at:new Date().toISOString(),provider_id:result.id,resend_request_id:null,delivery_history:previous?.resend_request_id?[...(previous.delivery_history||[]),{sent_at:previous.sent_at,provider_id:previous.provider_id}]:previous?.delivery_history||[]});
 return {sent:true};
}
