(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,name,type,value='')=>'<label class="mg-field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(name==='email'?'':'required')+'></label>';
window.loadStorageEnquiries=async function(){
 let box=document.getElementById('enquiryPanel');
 if(!box){box=document.createElement('section');box.id='enquiryPanel';box.className='card';document.getElementById('app').prepend(box);}
 box.innerHTML='<h2>New enquiries → tenant setup</h2><p>Choose the container and dates, then share one link. Your customer signs the agreement and sets up their Direct Debit.</p><p role="status">Loading…</p>';
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
  const action=document.createElement('button');action.type='button';action.className='btn';action.textContent=e.tenancy_id?'Open tenant setup':'Set up & send agreement';card.append(action);
  const close=document.createElement('button');close.type='button';close.className='btn btn2';close.style.margin='8px';close.textContent=e.status==='closed'?'Reopen enquiry':'Close enquiry';card.append(close);
  close.onclick=async()=>{close.disabled=true;const r=await db.from('storage_enquiries').update({status:e.status==='closed'?'new':'closed'}).eq('id',e.id);if(r.error){close.disabled=false;alert(r.error.message);}else window.loadStorageEnquiries();};
  if(e.status==='closed')action.disabled=true;
  (e.status==='closed'?archive:box).append(card);
  action.onclick=()=>{
   if(card.querySelector('form')){card.querySelector('form').hidden=!card.querySelector('form').hidden;return;}
   const form=document.createElement('form');
   const email=e.contact.includes('@')?e.contact:'',phone=e.phone||(email?'':e.contact);
   const total=c?.plan?.amount_pence??(t?Math.round(t.monthly_rent_pence*(1+Number(t.vat_rate||0)/100)):15600);
   form.innerHTML=field('Email (for sending the link)','email','email',email)+field('Phone *','phone','tel',phone)+
   '<label class="mg-field">Container *<select name="asset" required><option value="">Choose physical container</option>'+assets.filter(a=>a.id===t?.asset_id||!tenancies.some(t=>t.asset_id===a.id)).map(a=>'<option value="'+esc(a.id)+'" '+(t?.asset_id===a.id?'selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select></label>'+
   field('Storage start date *','start','date',t?.start_date||e.preferred_date||'')+
   field('Total monthly rent including VAT (£) *','amount','number',(total/100).toFixed(2))+
   field('First collection date *','first','date',c?.plan?.first_date||'')+
   '<p class="mg-help">Collection day must be 1–28, at least 8 days ahead and no earlier than storage starts. Check any prepaid rent. Arrears are separate.</p>'+
   '<button class="btn" type="submit">Prepare agreement & Direct Debit link</button><p role="status" aria-live="polite" data-result></p><div data-share></div>';
   form.elements.amount.min='0.01';form.elements.amount.max='10000';form.elements.amount.step='0.01';
   if(e.tenancy_id){for(const n of ['asset','start','amount'])form.elements[n].disabled=true;}
   if(c?.plan)form.elements.first.disabled=true;
   card.append(form);form.scrollIntoView({behavior:'smooth',block:'nearest'});
   form.onsubmit=async event=>{
    event.preventDefault();const result=form.querySelector('[data-result]'),submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
     const plan={amount_pence:Math.round(Number(form.elements.amount.value)*100),first_date:form.elements.first.value,day:Number(form.elements.first.value.slice(-2))};
     if(!plan.first_date||plan.day<1||plan.day>28||!Number.isInteger(plan.amount_pence)||plan.amount_pence<1)throw new Error('Enter the amount and collection date (day 1–28).');
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
     const text='Hi '+e.full_name+', please review and sign your storage agreement, then set up your Direct Debit using this secure link: '+u.href;
     const input=document.createElement('input');input.value=u.href;input.readOnly=true;input.setAttribute('aria-label','Customer agreement and Direct Debit link');input.style.width='100%';input.onclick=()=>input.select();share.append(input);
     const mail=document.createElement('a');mail.className='btn';mail.textContent='Send by email';mail.href='mailto:'+encodeURIComponent(form.elements.email.value.trim())+'?subject='+encodeURIComponent('Your storage agreement and Direct Debit')+'&body='+encodeURIComponent(text);share.append(mail);
     const send=document.createElement('button');send.type='button';send.className='btn btn2';send.textContent='Share link';send.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Storage agreement',text,url:u.href});else{await navigator.clipboard.writeText(text);result.textContent='Link copied — paste it into your message.';}}catch(err){if(err.name!=='AbortError')result.textContent='Select and copy the link above to send it.';}};share.append(send);
     result.textContent='Link ready. Send by email opens your email app; Share link lets you choose a messaging app. The customer signs first, then enters bank details. Once authorised, schedule the recurring rent in GoCardless.';
     submit.textContent='Reopen existing link';
    }catch(err){result.textContent='Could not finish: '+err.message+'. Any saved tenant record is kept; retrying reuses it.';}finally{submit.disabled=false;}
   };
  };
 }
};
})();