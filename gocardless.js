(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let panel,busy=false;
async function call(action,tenancy_id){const {data,error}=await db.functions.invoke('gocardless-manage',{body:{action,tenancy_id}});if(error){let detail;try{detail=await error.context.json()}catch{}throw new Error(detail?.error||error.message);}if(data?.error)throw new Error(data.error);return data;}
async function load(){
 if(busy)return;busy=true;
 try{
 const results=await Promise.all([db.from('tenancies').select('*'),db.from('assets').select('id,name'),db.from('customers').select('id,full_name'),db.from('gocardless_connections').select('*'),db.from('gocardless_payment_status').select('*').order('charge_date',{ascending:false}).limit(100)]);
 for(const r of results)if(r.error)throw r.error;
 const [ts,assets,customers,cs,ps]=results.map(r=>r.data);
 panel.querySelector('[data-rows]').innerHTML=ts.filter(t=>['active','pending'].includes(t.status)).map(t=>{
 const c=cs.find(c=>c.tenancy_id===t.id);const label=(assets.find(a=>a.id===t.asset_id)?.name||'Asset')+' — '+(customers.find(x=>x.id===t.customer_id)?.full_name||'Tenant');
 return '<div style="padding:14px 0;border-top:1px solid #ddd"><b>'+esc(label)+'</b><p>'+esc(c?.mandate_status?'Mandate: '+c.mandate_status.replaceAll('_',' '):c?'Setup: '+c.billing_status.replaceAll('_',' '):'Direct Debit not set up')+'</p><button class="btn btn2" data-gc="setup" data-id="'+esc(t.id)+'">'+(c?.mandate_id?'Check mandate':'Get setup link')+'</button> <button class="btn btn2" data-gc="refresh" data-id="'+esc(t.id)+'">Refresh status</button><div data-link="'+esc(t.id)+'" style="margin-top:10px;overflow-wrap:anywhere"></div></div>';
 }).join('')||'<p>No active tenancies.</p>';
 panel.querySelector('[data-payments]').innerHTML=ps.length?'<h3>GoCardless payment status</h3><p>Status comes from GoCardless. Pending payments are not receipts; paid out means sent to your bank, not independently verified there.</p>'+ps.map(p=>'<p>'+esc(p.charge_date)+' · £'+(p.amount_pence/100).toFixed(2)+' '+esc(p.currency)+' · '+esc(p.status.replaceAll('_',' '))+' · '+esc(customers.find(x=>x.id===ts.find(t=>t.id===p.tenancy_id)?.customer_id)?.full_name||'Tenant')+'</p>').join(''):'<p>No GoCardless payments linked yet.</p>';
 }catch(e){message(e.message)}finally{busy=false;}
}
function message(s){panel.querySelector('[data-message]').textContent=s;}
function init(){
 if(!document.getElementById('managerPanel')||document.getElementById('gcPanel'))return;
 panel=document.createElement('section');panel.id='gcPanel';panel.className='card';
 panel.innerHTML='<h2>Direct Debits</h2><p>Create a secure GoCardless setup link for each tenant. Share the link with that tenant only. Setup authorises a mandate; it does not start rent collection. Arrange the amount and first collection date separately in GoCardless after checking any prepaid rent.</p><button class="btn btn2" data-gc="health">Check connection</button> <button class="btn btn2" data-gc="reload">Reload statuses</button><p role="status" data-message></p><div data-rows></div><div data-payments></div>';
 document.getElementById('managerPanel').before(panel);load();
 panel.addEventListener('click',async e=>{
 const b=e.target.closest('button[data-gc]');if(!b)return;const action=b.dataset.gc,id=b.dataset.id;b.disabled=true;message('Working…');
 try{if(action==='reload'){await load();message('Saved statuses loaded. Use Refresh status beside a tenant to check GoCardless now.');return;}
 const r=await call(action,id);await load();
 if(r.url){const u=new URL(r.url);if(u.protocol!=='https:'||u.hostname!=='pay.gocardless.com')throw new Error('Unexpected setup address');
 const box=panel.querySelector('[data-link="'+id+'"]');const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open secure setup link';box.append(a);const input=document.createElement('input');input.readOnly=true;input.value=u.href;input.setAttribute('aria-label','Tenant setup link');input.style.cssText='width:100%;margin-top:8px;padding:8px';box.append(input);input.addEventListener('click',()=>input.select());message('Setup link ready. Copy it to share with this tenant. No payment has been scheduled.');}
 else message(action==='health'?'GoCardless live API connection verified. No payments have been created.':r.message||'Status updated from GoCardless.');
 }catch(err){message(err.message)}finally{b.disabled=false;}
 });
}
new MutationObserver(init).observe(document.body,{childList:true,subtree:true});init();
})();
