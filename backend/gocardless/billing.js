export const UPFRONT_MODE='upfront_monthly_v1';
export const ARREARS_MODE='arrears_monthly_v1';
export const automaticPlan=p=>[UPFRONT_MODE,ARREARS_MODE].includes(p?.mode);
export const initialAmount=p=>p?.mode===ARREARS_MODE?p.upfront_amount_pence:p?.amount_pence;
export function validArrears(p){
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(+new Date(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 return p?.mode===ARREARS_MODE&&Number.isSafeInteger(p.upfront_amount_pence)&&p.upfront_amount_pence>0&&p.upfront_amount_pence<=1000000&&validDate(p.arrears_from)&&validDate(p.arrears_until)&&p.arrears_from<p.arrears_until&&p.arrears_until===p.first_date&&p.day===Number(p.first_date.slice(-2))&&p.day>=1&&p.day<=28;
}
export function nextMonth(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Choose a valid storage start date.');
 const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw Error('Choose a valid storage start date.');
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+2,0)).getUTCDate();
 return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,Math.min(d.getUTCDate(),last),12)).toISOString().slice(0,10);
}
export async function syncMonthly(c,{db,gc},mandate){
 if(!automaticPlan(c.plan))return c; // Old authorisations never opt into charging.
 const patch=async values=>{await db(`gocardless_connections?tenancy_id=eq.${c.tenancy_id}`,'PATCH',values);Object.assign(c,values);};
 if(c.subscription_id){const s=(await gc('subscriptions/'+encodeURIComponent(c.subscription_id))).subscriptions;await patch({subscription_status:s.status});return c;}
 if(!['confirmed','paid_out'].includes(c.first_payment_status)||c.mandate_status!=='active'||!c.terms_accepted_at)return c;
 const t=(await db(`tenancies?id=eq.${c.tenancy_id}&select=status,start_date`))[0];
 const a=c.plan.mode===UPFRONT_MODE?(await db(`storage_agreements?setup_token=eq.${c.setup_token}&select=signed_at`))[0]:null;
 if(!t||!['active','pending'].includes(t.status)||(c.plan.mode===UPFRONT_MODE&&!a?.signed_at))return c;
 if((c.plan.mode===ARREARS_MODE?!validArrears(c.plan):c.plan.first_date!==nextMonth(t.start_date))||!Number.isSafeInteger(c.plan.amount_pence)||c.plan.amount_pence<1){await patch({billing_error:'Payment plan needs review; no monthly collection scheduled.'});return c;}
 if(c.plan.first_date<=new Date().toISOString().slice(0,10)||(mandate?.next_possible_charge_date&&c.plan.first_date<mandate.next_possible_charge_date)){
 await patch({billing_error:'Setup completed too late for the agreed monthly date. Agree a revised date; no automatic catch-up charge was created.'});return c;
 }
 try{
 const existing=(await gc('subscriptions?mandate='+encodeURIComponent(c.mandate_id)+'&limit=100')).subscriptions||[];
 const own=existing.find(s=>s.metadata?.billing_request_id===c.billing_request_id);
 if(own){if(own.amount!==c.plan.amount_pence||own.currency!=='GBP')throw Error('Existing subscription amount mismatch');await patch({subscription_id:own.id,subscription_status:own.status,billing_error:null});return c;}
 if(existing.some(s=>!['cancelled','finished'].includes(s.status))){await patch({billing_error:'This mandate already has a subscription. Review it before scheduling another.'});return c;}
 let result=await gc('subscriptions','POST',{subscriptions:{amount:c.plan.amount_pence,currency:'GBP',name:'Pembrokeshire Self Storage — monthly rent',interval_unit:'monthly',interval:1,day_of_month:c.plan.day,start_date:c.plan.first_date,links:{mandate:c.mandate_id},metadata:{tenancy_id:c.tenancy_id,billing_request_id:c.billing_request_id}}},'storage-monthly-v1-'+c.billing_request_id);
 if(result.conflict)result=await gc('subscriptions/'+encodeURIComponent(result.conflict));
 const s=result.subscriptions;
 if(!s?.id||s.links?.mandate!==c.mandate_id||s.amount!==c.plan.amount_pence||s.currency!=='GBP')throw Error('Monthly subscription details could not be verified.');
 await patch({subscription_id:s.id,subscription_status:s.status,billing_error:null});
 }catch(err){await patch({billing_error:'Monthly scheduling needs attention. Refresh status to retry safely.'});throw err;}
 return c;
}
