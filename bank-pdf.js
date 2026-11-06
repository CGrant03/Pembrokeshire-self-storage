(function(root){
'use strict';
const fail=message=>{throw new Error(message+' Nothing has been saved.');};
const months={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
function lines(items){
 const out=[];
 for(const item of items.filter(i=>i.str.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){
  let row=out[out.length-1];if(!row||Math.abs(row.y-item.y)>1.2){row={y:item.y,items:[]};out.push(row);}row.items.push(item);
 }
 return out.map(row=>({...row,items:row.items.sort((a,b)=>a.x-b.x),text:row.items.sort((a,b)=>a.x-b.x).map(i=>i.str.trim()).join(' ')}));
}
function money(text){
 const m=String(text).trim().match(/^£?([\d,]+\.\d{2})(?:\s*(OD))?$/);
 if(!m||!/^\d{1,3}(?:,\d{3})*\.\d{2}$|^\d+\.\d{2}$/.test(m[1]))fail('An amount in this PDF could not be read reliably.');
 const n=Math.round(Number(m[1].replace(/,/g,''))*100);if(!Number.isSafeInteger(n)||n>2147483647)fail('The PDF contains an unsupported amount.');return m[2]?-n:n;
}
function date(text,year){
 const m=text.trim().match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{4}))?$/);
 if(!m||!months[m[2]])fail('A date in the PDF could not be read.');
 const y=Number(m[3]||year),mo=months[m[2]],d=Number(m[1]);const dt=new Date(Date.UTC(y,mo-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)fail('The PDF contains an invalid date.');return dt.toISOString().slice(0,10);
}
function parsePages(pages){
 if(!pages.length||pages.length>40)fail('Choose a statement with between 1 and 40 pages.');
 const all=pages.map(lines),first=all[0];
 if(!first.some(l=>/NatWest Statement/.test(l.text)))fail('This PDF format is not supported yet. Use an original NatWest account statement or a bank CSV export.');
 function summary(label){const row=first.find(l=>l.items.some(i=>i.str.trim()===label));if(!row)fail('The PDF statement summary is incomplete.');const marker=row.items.find(i=>i.str.trim()===label);return row.items.filter(i=>i.x>marker.x+marker.width).map(i=>i.str.trim()).join(' ');}
 const period=summary('Period Covered').match(/(\d{1,2} [A-Z]{3} \d{4}) to (\d{1,2} [A-Z]{3} \d{4})/);
 if(!period)fail('The statement period could not be read.');
 const start=date(period[1]),end=date(period[2]);
 const opening=money(summary('Previous Balance')),closing=money(summary('New Balance')),paid=money(summary('Paid In')),withdrawn=money(summary('Withdrawn'));
 const accountHeader=pages[0].find(i=>i.str.trim()==='Account No');
 const account=accountHeader&&pages[0].find(i=>/^\d{8}$/.test(i.str.trim())&&Math.abs(i.x-accountHeader.x)<3&&i.y<accountHeader.y&&i.y>accountHeader.y-20)?.str.trim();
 if(!account)fail('The statement account could not be identified.');
 let previous=opening,current=null,pending=[],incoming=0,outgoing=0,tablePages=0;const rows=[];
 for(let p=0;p<all.length;p++){
  const ls=all[p];const pageNumber=ls.find(l=>l.items.some(i=>new RegExp('^'+(p+1)+' of '+pages.length+'$').test(i.str.trim())));
  if(!pageNumber||!pageNumber.items.some(i=>i.str.trim()===account))fail('The PDF has missing, reordered or mixed-account pages.');
  const hi=ls.findIndex(l=>l.items.some(i=>i.str.trim()==='Description')&&l.items.some(i=>/^Paid In\(£\)$/.test(i.str.trim())));
  if(hi<0)continue;tablePages++;
  const header=ls[hi];const pos=label=>header.items.find(i=>i.str.trim()===label);
  const desc=pos('Description'),credit=pos('Paid In(£)'),debit=pos('Withdrawn(£)'),balance=pos('Balance(£)');
  if(!desc||!credit||!debit||!balance)fail('The transaction columns could not be identified.');
  let brought=false;
  for(const line of ls.slice(hi+1)){
   if(/^(National Westminster Bank Plc\.|RETSTMT)/.test(line.text))break;
   const dateText=line.items.filter(i=>i.x<desc.x-3).map(i=>i.str.trim()).join(' ');
   if(dateText){
    const mm=dateText.match(/^\d{1,2} ([A-Z]{3})/);let year=Number(start.slice(0,4));
    if(mm&&months[mm[1]]<Number(start.slice(5,7)))year++;
    const next=date(dateText,year);if(next<start||next>end||(current&&next<current))fail('The transaction dates are outside the statement period or out of order.');current=next;
   }
   const description=line.items.filter(i=>i.x>=desc.x-3&&i.x<credit.x-30).map(i=>i.str.trim()).join(' ');
   const numeric=line.items.filter(i=>/^[\d,]+\.\d{2}$/.test(i.str.trim())&&i.x>=credit.x-30);
   const at=col=>numeric.filter(i=>Math.abs(i.x+i.width-(col.x+col.width))<3);
   const ci=at(credit),di=at(debit),bi=at(balance);
   if(numeric.length!==ci.length+di.length+bi.length||ci.length>1||di.length>1||bi.length>1)fail('A transaction amount is ambiguous.');
   if(description==='BROUGHT FORWARD'){
    if(pending.length||ci.length||di.length||bi.length!==1)fail('The page opening balance is incomplete.');
    const b=money(bi[0].str+(line.items.some(i=>i.str.trim()==='OD'&&i.x>balance.x)?' OD':''));
    if(b!==previous)fail('The page opening balance does not match.');brought=true;continue;
   }
   if(!brought)fail('A statement page is missing its opening balance.');
   if(description)pending.push(description);
   if(!numeric.length)continue;
   if(bi.length!==1||ci.length+di.length!==1||!current||!pending.length)fail('A transaction row is incomplete.');
   const signed=ci.length?money(ci[0].str):-money(di[0].str);
   const b=money(bi[0].str+(line.items.some(i=>i.str.trim()==='OD'&&i.x>balance.x)?' OD':''));
   if(previous+signed!==b)fail('The transaction amounts do not match the running balance.');
   rows.push([current,pending.join(' '),(signed/100).toFixed(2),'GBP',(b/100).toFixed(2)]);
   if(signed>0)incoming+=signed;else outgoing-=signed;
   previous=b;pending=[];
  }
  if(pending.length)fail('A transaction description is missing its amount.');
 }
 if(!tablePages||!rows.length||incoming!==paid||outgoing!==withdrawn||previous!==closing||opening+paid-withdrawn!==closing)fail('The extracted transactions do not match the statement totals. Please use a CSV export.');
 return {headers:['Date','Description','Amount','Currency','Balance'],rows,accountLabel:'NatWest business '+account.slice(-4),summary:'NatWest statement: '+rows.length+' transactions, '+start+' to '+end+'. Totals and running balances checked.'};
}
async function read(file,progress=()=>{}){
 let loading;
 try{
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.worker.min.mjs';
  loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  const pdf=await loading.promise;if(pdf.numPages>40)fail('Please use a statement of no more than 40 pages.');
  const pages=[];
  for(let n=1;n<=pdf.numPages;n++){
   progress('Reading PDF page '+n+' of '+pdf.numPages+'…');
   const page=await pdf.getPage(n);const text=await page.getTextContent();
   pages.push(text.items.filter(i=>typeof i.str==='string').map(i=>({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width})));page.cleanup();
  }
  return parsePages(pages);
 }catch(e){
  if(e.name==='PasswordException')throw Error('This PDF is password protected. Export an unlocked statement or use CSV. Nothing has been saved.');
  if(e.name==='InvalidPDFException')throw Error('This file is not a readable PDF. Please download the original statement again.');
  throw e;
 }finally{if(loading)await loading.destroy();}
}
root.BankPDF={parsePages,read};if(typeof module!=='undefined')module.exports=root.BankPDF;
})(typeof window==='undefined'?globalThis:window);
