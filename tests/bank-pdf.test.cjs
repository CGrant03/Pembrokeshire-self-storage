const test=require('node:test'),assert=require('node:assert/strict');
const {parsePages}=require('../bank-pdf.js');const csv=require('../bank-csv.js');
const item=(str,x,y,width=40)=>({str,x,y,width});
function fixture(){
 const summary=(label,value,y)=>[item(label,335,y,80),item(value,490,y,50)];
 const header=y=>[item('Date',58,y,18),item('Description',110,y,43),item('Paid In(£)',358,y,36),item('Withdrawn(£)',398,y,53),item('Balance(£)',478,y,41)];
 const page=n=>[item('Account No',238,805,44),item('12345678',238,796,35),item(n+' of 2',334,796,20)];
 const balance=(value,y,od=true)=>[item(value,485,y,34),...(od?[item('OD',523,y,12)]:[])];
 const p1=[...page(1),item('Welcome to your NatWest Statement',150,760,200),...summary('Period Covered','25 SEP 2026 to 23 OCT 2026',740),...summary('Previous Balance','£1,000.00 OD',720),...summary('Paid In','£312.00',700),...summary('Withdrawn','£10.00',680),...summary('New Balance','£698.00 OD',660),...header(600),item('25 SEP 2026',58,580,44),item('BROUGHT FORWARD',110,580,80),...balance('1,000.00',580),item('Automated Credit TEST TENANT',110,560,180),item('RENT',110,550,30),item('156.00',370,550,24),...balance('844.00',550)];
 const p2=[...page(2),...header(740),item('BROUGHT FORWARD',110,720,80),...balance('844.00',720),item('Card Transaction TEST SHOP',110,700,180),item('10.00',431,700,20),...balance('854.00',700),item('01 OCT',58,680,30),item('Automated Credit OTHER TENANT RENT',110,680,220),item('156.00',370,680,24),...balance('698.00',680)];
 return [p1,p2];
}
test('multi-page extraction carries dates and reconciles totals',()=>{const r=parsePages(fixture());assert.equal(r.rows.length,3);assert.equal(r.accountLabel,'NatWest business 5678');assert.deepEqual(r.rows[1],['2026-09-25','Card Transaction TEST SHOP','-10.00','GBP','-854.00']);assert.equal(r.rows[2][0],'2026-10-01');});
test('balance or amount mismatch prevents import',()=>{const p=fixture();p[1].find(i=>i.str==='10.00').str='11.00';assert.throws(()=>parsePages(p),/running balance/);});
test('missing pages and mixed accounts prevent import',()=>{assert.throws(()=>parsePages(fixture().slice(0,1)),/missing, reordered/);const p=fixture();p[1].find(i=>i.str==='12345678').str='11111111';assert.throws(()=>parsePages(p),/mixed-account/);});
test('missing transaction fails page opening or totals checks',()=>{const p=fixture();p[1]=p[1].filter(i=>i.y!==680);assert.throws(()=>parsePages(p),/statement totals/);});
test('scanned and other layouts are rejected',()=>{assert.throws(()=>parsePages([[]]),/not supported/);const p=fixture();p[0].find(i=>i.str.includes('NatWest Statement')).str='Another Bank';assert.throws(()=>parsePages(p),/not supported/);});
test('PDF and equivalent CSV produce the same duplicate keys',async()=>{const p=parsePages(fixture());const map={date:0,reference:1,amount:2,currency:3,sender:-1,id:-1,credit:-1,debit:-1};const a=await csv.records(csv.convert(p,map,p.accountLabel,'dmy').entries);const text=[p.headers,...p.rows].map(r=>r.map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\n');const b=await csv.records(csv.convert(csv.parse(text),map,p.accountLabel,'dmy').entries);assert.deepEqual(a,b);assert.equal(a.length,2);});
module.exports={fixture};
