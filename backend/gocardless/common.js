import {syncMonthly,UPFRONT_MODE} from './billing.js';
const SB=Deno.env.get('SUPABASE_URL');
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
export async function db(path,method='GET',body){
 const r=await fetch(`${SB}/rest/v1/${path}`,{method,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw new Error('Database update failed'); return r.status===204?null:await r.json();
}
export async function staff(req){
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return false;
 const r=await fetch(`${SB}/auth/v1/user`,{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY'),Authorization:auth}});
 if(!r.ok)return false;const u=await r.json();
 return (await db(`staff_users?user_id=eq.${encodeURIComponent(u.id)}&select=user_id`)).length>0;
}
export async function gc(path,method='GET',body,key){
 const token=Deno.env.get('GOCARDLESS_ACCESS_TOKEN');if(!token)throw new Error('GoCardless key is missing');
 const r=await fetch(`https://api.gocardless.com/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'GoCardless-Version':'2015-07-06','Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok){if(r.status===409&&data.error?.links?.conflicting_resource_id)return {conflict:data.error.links.conflicting_resource_id};throw new Error(`GoCardless request failed (${r.status}): ${data.error?.message||'please check account settings'}`);}
 return data;
}
export async function refresh(c){
 let mandate=null;
 if(c.billing_request_id){const b=(await gc(`billing_requests/${encodeURIComponent(c.billing_request_id)}`)).billing_requests;
 c={...c,billing_status:b.status,mandate_id:b.links?.mandate_request_mandate||b.mandate_request?.links?.mandate||c.mandate_id,customer_id:b.links?.customer||c.customer_id,first_payment_id:b.payment_request?.links?.payment||c.first_payment_id};}
 if(c.mandate_id){const m=(await gc(`mandates/${encodeURIComponent(c.mandate_id)}`)).mandates;c.mandate_status=m.status;mandate=m;
 let after='';let pages=0;
 do{const p=await gc(`payments?mandate=${encodeURIComponent(c.mandate_id)}&limit=500${after?'&after='+encodeURIComponent(after):''}`);
 for(const x of p.payments||[])await db('gocardless_payment_status?on_conflict=payment_id','POST',{payment_id:x.id,tenancy_id:c.tenancy_id,amount_pence:x.amount,currency:x.currency,status:x.status,charge_date:x.charge_date,updated_at:new Date().toISOString()});
 after=p.meta?.cursors?.after||'';if(++pages>20&&after)throw new Error('Payment history is too large; contact support');}while(after);
 }
 if(c.plan?.mode===UPFRONT_MODE&&c.first_payment_id){
 const p=(await gc('payments/'+encodeURIComponent(c.first_payment_id))).payments;
 c.first_payment_status=(p.amount===c.plan.amount_pence&&p.currency==='GBP')?p.status:'amount_mismatch';
 await db('gocardless_payment_status?on_conflict=payment_id','POST',{payment_id:p.id,tenancy_id:c.tenancy_id,amount_pence:p.amount,currency:p.currency,status:p.status,charge_date:p.charge_date,updated_at:new Date().toISOString()});
 }
 c.updated_at=new Date().toISOString();
 const patch={billing_status:c.billing_status,mandate_id:c.mandate_id,mandate_status:c.mandate_status,customer_id:c.customer_id,updated_at:c.updated_at};
 if(c.first_payment_id)patch.first_payment_id=c.first_payment_id;
 if(c.first_payment_status)patch.first_payment_status=c.first_payment_status;
 await db(`gocardless_connections?tenancy_id=eq.${c.tenancy_id}`,'PATCH',patch);
 return await syncMonthly(c,{db,gc},mandate);
}
export async function validSignature(raw,hex,secret){
 if(!secret||!/^[a-f0-9]{64}$/i.test(hex||''))return false;
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',k,Uint8Array.from(hex.match(/../g),h=>parseInt(h,16)),new TextEncoder().encode(raw));
}
