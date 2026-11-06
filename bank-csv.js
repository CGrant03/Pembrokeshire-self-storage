(function(root){
'use strict';
function parse(text){
 text=String(text).replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/)[0];
 const delimiter=[';', '\t', ','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=ch;continue;}
  if(ch==='"'){if(field||closed)throw Error('Unexpected quote in CSV. Export the file again.');quoted=true;}
  else if(ch===delimiter){row.push(field.trim());field='';closed=false;}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';closed=false;}
  else {if(closed&&!/\s/.test(ch))throw Error('Unexpected text after a quoted CSV field.');field+=ch;}
 }
 if(quoted)throw Error('An unfinished quoted field was found. Export the file again.');
 row.push(field.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2)throw Error('Choose a CSV with a header row and transactions.');
 const headers=rows.shift();
 if(headers.length<2)throw Error('No CSV columns found. Use a comma, semicolon or tab separated export.');
 if(rows.length>2000)throw Error('Please export up to 2,000 transactions at a time.');
 return {headers,rows};
}
function date(value,order){
 let m=String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/),y,mo,d;
 if(m){[,y,mo,d]=m;}else{m=String(value).trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(!m)throw Error('Use dates such as 06/11/2026 or 2026-11-06.');y=m[3];mo=order==='mdy'?m[1]:m[2];d=order==='mdy'?m[2]:m[1];}
 const dt=new Date(Date.UTC(+y,+mo-1,+d));
 if(+y<1900||dt.getUTCFullYear()!==+y||dt.getUTCMonth()!==+mo-1||dt.getUTCDate()!==+d)throw Error('Invalid transaction date.');
 return dt.toISOString().slice(0,10);
}
function pence(value){
 let s=String(value).trim();if(!s)return 0;
 s=s.replace(/^£\s*/, '');
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))throw Error('Invalid amount. Use pounds and pence, for example 1,250.00.');
 const n=Math.round(Number(s.replace(/,/g,''))*100);
 if(!Number.isSafeInteger(n)||Math.abs(n)>2147483647)throw Error('Amount is too large.');return n;
}
function convert(parsed,map,account,order){
 if(!account.trim())throw Error('Enter an account label, for example NatWest business 1234.');
 if(map.date<0||map.reference<0||(map.amount<0&&map.credit<0))throw Error('Choose date, description/reference, and either amount or money-in columns.');
 if(map.amount>=0&&(map.credit>=0||map.debit>=0))throw Error('Choose either a signed amount column OR money-in / money-out columns, not both.');
 const selected=Object.values(map).filter(i=>i>=0);if(new Set(selected).size!==selected.length)throw Error('Each selected column must have a different purpose.');
 const entries=[],errors=[];let skipped=0;
 const occurrences=new Map();
 parsed.rows.forEach((r,i)=>{try{
  if(r.length!==parsed.headers.length)throw Error('Column count differs from the header.');
  const day=date(r[map.date],order);
  if(map.currency>=0&&r[map.currency].toUpperCase()!=='GBP')throw Error('Only GBP transactions can be imported.');
  let amount;
  if(map.amount>=0){if(!r[map.amount])throw Error('Amount is empty.');amount=pence(r[map.amount]);}
  else{const credit=pence(r[map.credit]),debit=map.debit>=0?pence(r[map.debit]):0;if(credit<0||debit<0||(credit&&debit))throw Error('Money-in and money-out must be non-negative, with only one filled per row.');amount=credit-debit;}
  if(amount<=0){skipped++;return;}
  const reference=r[map.reference].trim();if(!reference)throw Error('Description/reference is empty.');
  const sender=map.sender>=0?r[map.sender].trim():'';
  const bankId=map.id>=0?r[map.id].trim():'';
  if(map.id>=0&&!bankId)throw Error('Transaction ID is empty.');
  const accountKey=account.trim().toLowerCase().replace(/\s+/g,' ');
  const base=JSON.stringify([accountKey,day,amount,reference,sender]);
  const occurrence=(occurrences.get(base)||0)+1;occurrences.set(base,occurrence);
  entries.push({key:bankId?JSON.stringify([accountKey,'id',bankId]):base+':'+occurrence,booked_at:day+'T12:00:00Z',amount_pence:amount,currency:'GBP',reference,counterparty_name:sender||null,bank_account_ref:account.trim(),provider:'csv'});
 }catch(e){errors.push('Row '+(i+2)+': '+e.message);}});
 return {entries,errors,skipped};
}
async function records(entries){return Promise.all(entries.map(async e=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.key));const {key,...rest}=e;return {...rest,provider_transaction_id:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};}));}
root.BankCSV={parse,date,pence,convert,records};
if(typeof module!=='undefined')module.exports=root.BankCSV;
})(typeof window==='undefined'?globalThis:window);
