import {date,ordinal} from './dates.js';
import {logoAttachment} from './logo.js';
import {validArrears} from './billing.js';
const site='https://www.pembrokeshireselfstorage.co.uk';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arrearsInvitation({name,container,plan,token}){
 if(!validArrears(plan)||!/^[a-f0-9-]{36}$/i.test(token))throw Error('Invalid arrears payment plan');
 const money=p=>'£'+(p/100).toFixed(2);
 const until=new Date(plan.arrears_until+'T12:00:00Z');until.setUTCDate(until.getUTCDate()-1);
 const period=date(plan.arrears_from)+' to '+date(until.toISOString().slice(0,10));
 const url=site+'/direct-debit-setup.html#'+token;
 const subject='Your storage balance and monthly Direct Debit | Pembrokeshire Self Storage';
 const lines=['Hi '+name+',','Please use the secure link below to clear the outstanding rent for your existing container and set up future monthly payments.','Container: '+container.replace(/\s+[—–].*$/,''),'Outstanding rent payable now: '+money(plan.upfront_amount_pence)+' including VAT','Covers: '+period,'Monthly Direct Debit: '+money(plan.amount_pence)+' including VAT, starting '+date(plan.first_date)+', then on the '+ordinal(plan.day)+' of each month.','The outstanding balance is a separate one-off payment; it will not be added to your monthly rent.','You will pay the balance using Pay by Bank and authorise the Direct Debit in the same GoCardless checkout. Please complete both steps. Monthly rent will be scheduled once payment and bank authorisation are confirmed.','If a collection falls on a weekend or bank holiday, it moves to the next working day. If setup is completed too late for the stated date, we will agree a revised date.','You already have your container and access details, so no new codes are needed.','Any questions or if the balance looks wrong, call 01437 723694 or reply before paying.','Thanks,','Miles','Pembrokeshire Self Storage'];
 const address='Pembrokeshire Self Storage, Cartlett Office & Storage Park, Haverfordwest, Pembrokeshire, SA61 2LH';
 const maps='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);
 const text=lines.slice(0,7).join('\n\n')+'\n\nPay outstanding rent and set up Direct Debit:\n'+url+'\n\n'+lines.slice(7).join('\n\n')+'\n\nYard address: '+address+'\nGoogle Maps: '+maps+'\n'+site;
 const html='<!doctype html><html><body style="margin:0;background:#f3f5f7;font:16px/1.6 Arial,sans-serif;color:#102c3c"><main style="max-width:600px;margin:24px auto;padding:28px;background:white"><a href="'+site+'"><img src="cid:storage-logo" width="210" alt="Pembrokeshire Self Storage"></a><h1 style="font-size:26px">Your storage balance and monthly payments</h1>'+lines.slice(0,7).map(x=>'<p>'+esc(x)+'</p>').join('')+'<p><a href="'+esc(url)+'" style="display:inline-block;padding:16px;background:#e9bb58;color:#062942;font-weight:bold;text-decoration:none;border-radius:6px">Pay balance &amp; set up Direct Debit</a></p>'+lines.slice(7).map(x=>'<p>'+esc(x)+'</p>').join('')+'<hr><p><strong>Find the yard</strong><br>'+esc(address)+'</p><p><a href="'+esc(maps)+'">Get directions on Google Maps</a></p><a href="'+site+'">www.pembrokeshireselfstorage.co.uk</a></main></body></html>';
 return {subject,text,html,attachments:[logoAttachment]};
}
