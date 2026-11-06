
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const body=await req.json().catch(()=>null);
 if(!body||!uuid.test(body.id||'')||!uuid.test(body.token||''))return new Response('Unauthorized',{status:401});
 const base=Deno.env.get('SUPABASE_URL')+'/rest/v1/';
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 try {
 const query='enquiry_email_queue?enquiry_id=eq.'+body.id+'&token=eq.'+body.token;
 const response=await fetch(base+query+'&select=*',{headers});
 if(!response.ok)throw Error('Queue unavailable');
 const [job]=await response.json();
 if(!job)return new Response('Unauthorized',{status:401});
 if(job.sent_at)return Response.json({sent:true});
 if(Date.now()-Date.parse(job.created_at)>23*3600000)return new Response('Expired',{status:410});
 const p=job.payload;
 const text=[
 'New storage enquiry',
 '',
 'Name: '+p.full_name,
 'Contact: '+p.contact,
 'Preferred start date: '+(p.preferred_date||'Not specified'),
 '',
 'Storage requirements:',
 p.requirements,
 '',
 'Received: '+p.created_at,
 '',
 'View and manage this enquiry in your private dashboard:',
 'https://www.pembrokeshireselfstorage.co.uk/dashboard.html',
 '',
 'This enquiry is saved in New enquiries. No reservation or payment has been made.'
 ].join('\n');
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key)throw Error('Email service not configured');
 const sent=await fetch('https://api.resend.com/emails',{
 method:'POST',
 headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'storage-enquiry/'+body.id},
 body:JSON.stringify({from:'Pembrokeshire Self Storage <onboarding@resend.dev>',to:['midcounty12@gmail.com'],subject:'New storage enquiry — Pembrokeshire Self Storage',text}),
 signal:AbortSignal.timeout(10000)
 });
 const result=await sent.json().catch(()=>({}));
 if(!sent.ok){
 await fetch(base+query,{method:'PATCH',headers,body:JSON.stringify({last_error:'Email provider HTTP '+sent.status+': '+String(result.message||'Failed').slice(0,400)})});
 return new Response('Email delivery failed',{status:502});
 }
 const saved=await fetch(base+query,{method:'PATCH',headers,body:JSON.stringify({sent_at:new Date().toISOString(),provider_id:result.id,last_error:null})});
 if(!saved.ok)throw Error('Delivery status could not be saved');
 return Response.json({sent:true});
 }catch(_err){return new Response('Notification temporarily unavailable',{status:503});}
});
