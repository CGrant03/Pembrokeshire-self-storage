(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nextMonth=value=>{const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(+d))return '';const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+2,0)).getUTCDate();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,Math.min(d.getUTCDate(),last),12)).toISOString().slice(0,10);};
const field=(label,name,type,value='')=>'<label class="mg-field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(name==='email'?'':'required')+'></label>';
window.loadStorageEnquiries=async function(){
 let box=document.getElementById('enquiryPanel');
 if(!box){box=document.createElement('section');box.id='enquiryPanel';box.className='card';document.getElementById('app').prepend(box);}
 box.innerHTML='<h2>New enquiries → tenant setup</h2><p>Choose the container and dates, then share one link. Your customer signs, pays the first month and sets up monthly Direct Debit using one link.</p><p role="status">Loading…</p>';
 const rs=await Promise.all([db.from('storage_enquiries').select('*').order('created_at',{ascending:false}).limit(200),db.from('assets').select('*').eq('asset_type','container'),db.from('tenancies').select('*').in('status',['active','pending']),db.from('gocardless_connections').select('*'),db.from('storage_agreements').select('tenancy_id,signed_at')]);
 if(rs.some(r=>r.error)){box.lastElementChild.textContent='Could not load enquiries. Refresh records to retry.';return;}
 box.lastElementChild.remove();
 const [enquiries,assets,tenancies,connections,agreements]=rs.map(r=>r.data||[]);
 assets.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
 const archive=document.createElement('details');archive.innerHTML='<summary>Closed enquiries</summary>';box.append(archive);
 if(!enquiries.some(e=>e.status!=='closed'))box.insertAdjacentHTML('beforeend','<p>No open enquiries. New website enquiries appear here automatically.</p>');
 for(const e of enquiries){
  const t=tenancies.find(t=>t.id===e.tenancy_id),c=connections.find(c=>c.tenancy_id===e.tenancy_id),agreement=agreements.find(a=>a.tenancy_id===e.tenancy_id);
  const card=document.createElement('article');card.className='mg-edit';
  card.innerHTML='<h3>'+esc(e.full_name)+'</h3><p>'+esc(e.contact)+(e.phone&&e.contact!==e.phone?' · '+esc(e.phone):'')+'</p><p>'+esc(e.requirements)+'</p><p>'+esc(e.tenancy_id?(agreement?.signed_at?'Agreement signed':'Awaiting agreement')+' · '+(c?.mandate_status?'Direct Debit: '+c.mandate_status:'Bank setup pending'):'New enquiry')+'</p>';
  if(c?.plan?.mode==='upfront_monthly_v1'){
   const paid=['confirmed','paid_out'].includes(c.first_payment_status);
   const state=document.createElement('p');state.textContent=(paid?'First month payment confirmed':'First month: '+(c.first_payment_status||'awaiting payment'))+' · Monthly Direct Debit: '+(c.subscription_status||'waiting for payment and bank setup');card.append(state);
   if(c.billing_error){const warning=document.createElement('p');warning.textContent=c.billing_error;warning.style.color='#a52828';card.append(warning);}
   const ready=document.createElement('p');ready.textContent=paid&&agreement?.signed_at&&c.subscription_status==='active'?'Payment confirmed, agreement signed and monthly billing scheduled. You can confirm access with the customer.':'Do not release access until the first payment and agreement are confirmed.';card.append(ready);
   const refresh=document.createElement('button');refresh.type='button';refresh.className='btn btn2';refresh.textContent='Refresh payment status';refresh.onclick=async()=>{refresh.disabled=true;const r=await db.functions.invoke('gocardless-manage',{body:{action:'refresh',tenancy_id:e.tenancy_id}});if(r.error){refresh.disabled=false;state.textContent='Could not refresh payment status. Please retry.';}else window.loadStorageEnquiries();};card.append(refresh);
  }
  const actions=document.createElement('div');actions.className='enquiry-actions';card.append(actions);
  const action=document.createElement('button');action.type='button';action.className='btn';action.textContent=e.tenancy_id?'Open tenant setup':'Set up & send agreement';actions.append(action);
  const close=document.createElement('button');close.type='button';close.className='btn btn2';close.textContent=e.status==='closed'?'Reopen enquiry':'Close enquiry';actions.append(close);
  close.onclick=async()=>{close.disabled=true;const r=await db.from('storage_enquiries').update({status:e.status==='closed'?'new':'closed'}).eq('id',e.id);if(r.error){close.disabled=false;alert(r.error.message);}else window.loadStorageEnquiries();};
  if(e.status==='closed')action.disabled=true;
  (e.status==='closed'?archive:box).append(card);
  action.onclick=()=>{
   if(card.querySelector('form')){card.querySelector('form').hidden=!card.querySelector('form').hidden;return;}
   const form=document.createElement('form');
   const email=e.contact.includes('@')?e.contact:'',phone=e.phone||(email?'':e.contact);
   const upfront=!c?.plan||c.plan.mode==='upfront_monthly_v1';
   const total=c?.plan?.amount_pence??(t?Math.round(t.monthly_rent_pence*(1+Number(t.vat_rate||0)/100)):15600);
   form.innerHTML=field('Email (for sending the link)','email','email',email)+field('Phone *','phone','tel',phone)+
   '<label class="mg-field">Container *<select name="asset" required><option value="">Choose physical container</option>'+assets.filter(a=>a.id===t?.asset_id||!tenancies.some(t=>t.asset_id===a.id)).map(a=>'<option value="'+esc(a.id)+'" '+(t?.asset_id===a.id?'selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select></label>'+
   field('Storage start date *','start','date',t?.start_date||e.preferred_date||'')+
   field('Total monthly rent including VAT (£) *','amount','number',(total/100).toFixed(2))+
   field(upfront?'First monthly Direct Debit (month two)':'First collection date *','first','date',c?.plan?.first_date||nextMonth(t?.start_date||e.preferred_date||''))+
   '<p class="mg-help">'+(upfront?'The first month is paid upfront. Monthly Direct Debit starts one calendar month after storage begins. No duplicate charge for the first month.':'Existing setup: check the collection date and any prepaid rent. Arrears are separate.')+'</p>'+
   '<button class="btn" type="submit">Prepare agreement & Direct Debit link</button><p role="status" aria-live="polite" data-result></p><div data-share></div>';
   form.elements.amount.min='0.01';form.elements.amount.max='10000';form.elements.amount.step='0.01';
   if(e.tenancy_id){for(const n of ['asset','start','amount'])form.elements[n].disabled=true;}
   if(c?.plan||upfront)form.elements.first.disabled=true;
   if(upfront&&!c?.plan){form.elements.start.min=new Date().toISOString().slice(0,10);form.elements.start.addEventListener('change',()=>form.elements.first.value=nextMonth(form.elements.start.value));}
   card.append(form);form.scrollIntoView({behavior:'smooth',block:'nearest'});
   form.onsubmit=async event=>{
    event.preventDefault();const result=form.querySelector('[data-result]'),submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
     const plan={amount_pence:Math.round(Number(form.elements.amount.value)*100),first_date:form.elements.first.value,day:Number((upfront?form.elements.start.value:form.elements.first.value).slice(-2)),...(upfront?{mode:'upfront_monthly_v1'}:{})};
     if(!plan.first_date||plan.day<1||plan.day>(upfront?31:28)||!Number.isInteger(plan.amount_pence)||plan.amount_pence<1)throw new Error('Enter the amount and collection date.');
     result.textContent='Preparing tenant record…';
     if(!e.tenancy_id){
      const r=await db.rpc('prepare_storage_enquiry',{p_enquiry:e.id,p_asset:form.elements.asset.value,p_start:form.elements.start.value,p_total:plan.amount_pence,p_first:plan.first_date,p_email:form.elements.email.value.trim(),p_phone:form.elements.phone.value.trim()});
      if(r.error)throw r.error;e.tenancy_id=r.data;
      for(const n of ['asset','start','amount'])form.elements[n].disabled=true;
     }
     result.textContent='Preparing agreement and bank setup…';
     const r=await db.functions.invoke('gocardless-manage',{body:{action:'setup',tenancy_id:e.tenancy_id,plan,agreement_confirmed:true}});
     if(r.error){let detail;try{detail=await r.error.context.json()}catch{}throw new Error(detail?.error||r.error.message);}
     if(r.data?.error)throw new Error(r.data.error);
     if(!r.data?.url){result.textContent=r.data?.message||'Bank setup already exists. Check Direct Debits below.';return;}
     const u=new URL(r.data.url);if(u.origin!=='https://www.pembrokeshireselfstorage.co.uk'||u.pathname!=='/direct-debit-setup.html')throw new Error('Unexpected setup address');
     const share=form.querySelector('[data-share]');share.replaceChildren();
     const emailStatus=await fetch('https://vxurmlmmrlclfydiobgm.supabase.co/functions/v1/gocardless-manage?email_status=1').then(r=>r.ok?r.json():null).catch(()=>null);
     const ownerTest=/^TEST\b/i.test(e.full_name)&&/^midcounty12(?:\+[^@]+)?@gmail\.com$/i.test(form.elements.email.value.trim());
     const emailUnavailable=emailStatus&&(!emailStatus.email_configured||(!emailStatus.business_email_ready&&!ownerTest));
     const text=['PEMBROKESHIRE SELF STORAGE','','Hi '+e.full_name+',','','Thank you for choosing Pembrokeshire Self Storage. Your storage agreement is ready to review.','','Container: '+(assets.find(a=>a.id===form.elements.asset.value)?.name||''),'Storage starts: '+form.elements.start.value,'Monthly rent: £'+Number(form.elements.amount.value).toFixed(2)+' including VAT',...(upfront?['First month payable now: £'+Number(form.elements.amount.value).toFixed(2)+' including VAT','Monthly Direct Debit starts: '+plan.first_date]:['Proposed first collection: '+plan.first_date]),'','Review your agreement and set up Direct Debit:',u.href,'',upfront?'The link opens our website. Sign your agreement, then pay the first month and set up your Direct Debit securely with GoCardless. Monthly rent starts from the date above. We will confirm access after payment.':'The link opens our website. You will sign your agreement, then enter your bank details securely with GoCardless. Setting up the mandate does not take a payment; your collection schedule will be confirmed separately.','','Any questions? Call 01437 723694 or reply to this email.','','Thanks,','Miles','Pembrokeshire Self Storage','https://www.pembrokeshireselfstorage.co.uk','Cartlett Office & Storage Park, Haverfordwest','Miles John Williams Limited trading as Pembrokeshire Self Storage'].join('\n');
     const input=document.createElement('input');input.value=u.href;input.readOnly=true;input.setAttribute('aria-label','Customer agreement and Direct Debit link');input.style.width='100%';input.onclick=()=>input.select();share.append(input);
     const branded=document.createElement('button');branded.type='button';branded.className='btn';branded.textContent='Send agreement email';branded.onclick=async()=>{branded.disabled=true;result.textContent='Sending agreement email…';try{const response=await db.functions.invoke('gocardless-manage',{body:{action:'email_invitation',tenancy_id:e.tenancy_id}});if(response.error){let detail;try{detail=await response.error.context.json();}catch{}throw new Error(detail?.error||'Email was not sent. Please try your email app below.');}if(!response.data?.sent)throw new Error(response.data?.error||'Email was not sent.');result.textContent='Agreement email sent to '+response.data.to+'.';branded.textContent='Email sent';}catch(err){result.textContent=err.message;branded.disabled=false;}};if(!emailUnavailable)share.append(branded);
     const mail=document.createElement('a');mail.className='btn btn2';mail.textContent='Open email app';mail.href='mailto:'+encodeURIComponent(form.elements.email.value.trim())+'?subject='+encodeURIComponent('Your storage agreement | Pembrokeshire Self Storage')+'&body='+encodeURIComponent(text);share.append(mail);
     const send=document.createElement('button');send.type='button';send.className='btn btn2';send.textContent='Share link';send.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Storage agreement',text,url:u.href});else{await navigator.clipboard.writeText(text);result.textContent='Link copied — paste it into your message.';}}catch(err){if(err.name!=='AbortError')result.textContent='Select and copy the link above to send it.';}};share.append(send);
     result.textContent=emailUnavailable?'Your link is ready. Automatic customer emails need your business email domain verified. Use Open email app to send it now.':'Your agreement link is ready. Send it by email or share the link below.';
     submit.textContent='Reopen existing link';
    }catch(err){result.textContent='Could not finish: '+err.message+'. Any saved tenant record is kept; retrying reuses it.';}finally{submit.disabled=false;}
   };
  };
 }
};
})();