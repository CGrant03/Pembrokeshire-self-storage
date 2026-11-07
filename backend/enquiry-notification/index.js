
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

 const website='https://www.pembrokeshireselfstorage.co.uk/';
 const dashboard=website+'dashboard.html';
 const contact=String(p.contact||'').replaceAll('\\n','\n');
 const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=[
 'New storage enquiry',
 '',
 'OPEN DASHBOARD:',
 dashboard,
 '',
 'Name: '+p.full_name,
 'Contact: '+contact,
 'Start date: '+(p.preferred_date||'Not specified'),
 'Message: '+p.requirements,
 '',
 'Open enquiries: '+dashboard,
 'Visit website: '+website
 ].join('\n');
 const html='<div style="font-family:Arial,sans-serif;color:#172b36;max-width:560px;padding:20px">'
 +'<h2>New storage enquiry</h2>'
 +'<p style="margin:20px 0"><a href="'+dashboard+'" style="background:#172b36;color:#ffffff;padding:16px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">Open dashboard</a></p>'
 +'<p style="font-size:15px;line-height:1.5;overflow-wrap:anywhere">Dashboard link:<br><a href="'+dashboard+'">'+dashboard+'</a></p>'
 +'<p style="font-size:14px;color:#526574">Sign in if asked, then open New enquiries.</p>'
 +'<p><strong>Name:</strong> '+escapeHtml(p.full_name)+'</p>'
 +'<p><strong>Contact:</strong><br>'+escapeHtml(contact).replaceAll('\n','<br>')+'</p>'
 +'<p><strong>Start date:</strong> '+escapeHtml(p.preferred_date||'Not specified')+'</p>'
 +'<p><strong>Message:</strong><br>'+escapeHtml(p.requirements).replaceAll('\n','<br>')+'</p>'
 +'<p style="margin:28px 0"><a href="'+dashboard+'" style="background:#172b36;color:#fff;padding:14px 22px;text-decoration:none;border-radius:6px;display:inline-block">Open dashboard</a></p>'
 +'<p><a href="'+website+'">Visit my website</a></p></div>';
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key)throw Error('Email service not configured');
 const sent=await fetch('https://api.resend.com/emails',{
 method:'POST',
 headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'storage-enquiry/'+body.id},
 body:JSON.stringify({from:'Pembrokeshire Self Storage <onboarding@resend.dev>',to:['midcounty12@gmail.com'],subject:'New enquiry — '+String(p.full_name||'Customer').replace(/[\r\n]/g,' ').slice(0,100)+' — '+body.id.slice(0,8),text,html}),
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
