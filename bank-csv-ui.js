(function(){
'use strict';
const el=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let parsed=null,ready=null,busy=false;
const fields={date:'Date',reference:'Description / reference',amount:'Signed amount (+ in, − out)',credit:'Money in',debit:'Money out',sender:'Sender (optional)',id:'Bank transaction ID (optional)',currency:'Currency (optional)'};
const aliases={date:['date','transaction date','booking date'],reference:['description','reference','transaction description','details','payment reference'],amount:['amount','transaction amount'],credit:['paid in','money in','credit','credits','credit amount'],debit:['paid out','money out','debit','debits','debit amount'],sender:['sender','counterparty','payer'],id:['transaction id','transaction identifier'],currency:['currency']};
function message(s){el('csvMessage').textContent=s;}
function invalidate(){ready=null;el('csvSave').disabled=true;el('csvPreview').innerHTML='';}
window.initBankCSV=function(){
 if(el('csvPanel'))return;
 const card=document.createElement('section');card.id='csvPanel';card.className='card';
 card.innerHTML='<h2>Import bank CSV</h2><p>Export transactions as CSV from your bank, then upload the file here. Only incoming GBP payments are saved. Review and match them to tenants below.</p>'+
 '<p class="mg-help">Use the same account label and column choices for repeat imports. Bank transaction IDs give the most reliable duplicate checks. Without IDs, matching dates, amounts and descriptions are compared; review overlapping exports and future bank feeds before matching.</p>'+
 '<div class="mg-cols"><div class="mg-field"><label for="csvAccount">Bank account label</label><input id="csvAccount" maxlength="100" placeholder="e.g. NatWest business 1234"></div>'+
 '<div class="mg-field"><label for="csvFile">Bank CSV file (up to 2 MB / 2,000 rows)</label><input id="csvFile" type="file" accept=".csv,text/csv,text/tab-separated-values"></div></div>'+
 '<div id="csvControls" hidden><div class="mg-field"><label for="csvDateOrder">Date format</label><select id="csvDateOrder"><option value="dmy">Day / month / year (UK)</option><option value="mdy">Month / day / year</option></select></div><p class="mg-help">Check the column choices. Use either a signed amount or money-in / money-out. ISO dates (YYYY-MM-DD) work with either setting. If no currency column exists, confirm the export is in GBP.</p><div id="csvMapping" class="mg-cols"></div><p><label><input id="csvGBP" type="checkbox"> I confirm this is a GBP account export.</label></p><div class="mg-actions"><button id="csvCheck" class="btn btn2" type="button">Preview import</button><button id="csvSave" class="btn" type="button" disabled>Save incoming payments for review</button></div></div>'+
 '<p id="csvMessage" role="status" aria-live="polite"></p><div id="csvPreview" class="mg-tablewrap"></div>';
 el('managerPanel').before(card);
 card.addEventListener('change',e=>{if(e.target.id!=='csvFile')invalidate();});
 el('csvAccount').addEventListener('input',invalidate);
 el('csvFile').addEventListener('change',async()=>{
  invalidate();parsed=null;el('csvControls').hidden=true;message('');
  const file=el('csvFile').files[0];if(!file)return;
  try{
   if(file.size>2*1024*1024)throw Error('Choose a file smaller than 2 MB.');
   parsed=BankCSV.parse(await file.text());
   const normal=parsed.headers.map(h=>h.toLowerCase().trim());
   el('csvMapping').innerHTML=Object.entries(fields).map(([key,label])=>{
    const guess=normal.findIndex(h=>aliases[key].includes(h));
    return '<div class="mg-field"><label for="csv-'+key+'">'+label+'</label><select id="csv-'+key+'"><option value="-1">Not used</option>'+parsed.headers.map((h,i)=>'<option value="'+i+'" '+(i===guess?'selected':'')+'>'+escape(h||'Column '+(i+1))+'</option>').join('')+'</select></div>';
   }).join('');
   el('csvControls').hidden=false;message(parsed.rows.length+' rows loaded locally. Check columns, then preview. Nothing has been saved.');
  }catch(e){message(e.message);}
 });
 el('csvCheck').addEventListener('click',async()=>{
  invalidate();
  try{
   if(!parsed)throw Error('Choose a CSV first.');if(!el('csvGBP').checked)throw Error('Confirm that this is a GBP account export.');
   const map=Object.fromEntries(Object.keys(fields).map(k=>[k,Number(el('csv-'+k).value)]));
   const result=BankCSV.convert(parsed,map,el('csvAccount').value,el('csvDateOrder').value);
   if(result.errors.length)throw Error(result.errors.length+' row(s) need attention. Nothing saved. '+result.errors.slice(0,5).join(' '));
   if(!result.entries.length)throw Error('No incoming payments found. Check the amount columns.');
   ready=result.entries;
   const total=result.entries.reduce((n,r)=>n+r.amount_pence,0)/100;
   message(result.entries.length+' incoming payments, £'+total.toFixed(2)+' total. '+result.skipped+' outgoing/zero rows excluded. Preview below (first 50). Existing identical CSV imports will be skipped when saved.');
   el('csvPreview').innerHTML='<table class="mg-table"><thead><tr><th>Date</th><th>Reference</th><th>Amount</th></tr></thead><tbody>'+ready.slice(0,50).map(r=>'<tr><td>'+r.booked_at.slice(0,10)+'</td><td>'+escape(r.reference)+'</td><td>£'+(r.amount_pence/100).toFixed(2)+'</td></tr>').join('')+'</tbody></table>';
   el('csvSave').disabled=false;
  }catch(e){message(e.message);}
 });
 el('csvSave').addEventListener('click',async()=>{
  if(busy||!ready)return;
  busy=true;const snapshot=ready;const controls=Array.from(card.querySelectorAll('input,select,button'));controls.forEach(c=>c.disabled=true);
  message('Saving incoming payments…');
  try{
   const rows=await BankCSV.records(snapshot);
   const {count,error}=await db.from('bank_transactions').upsert(rows,{onConflict:'provider,provider_transaction_id',ignoreDuplicates:true,count:'exact'});
   if(error)throw error;
   invalidate();
   message(count+' new incoming payments saved; '+(rows.length-count)+' duplicates skipped. Match each payment to its tenancy in Bank transaction review below. Paid-through dates have not changed.');
   await window.rentalManagerLoad();
  }catch(e){message('Could not confirm the import: '+e.message+'. You can retry; identical CSV records are not inserted twice.');}
  finally{busy=false;controls.forEach(c=>c.disabled=false);el('csvSave').disabled=!ready;}
 });
};
})();
