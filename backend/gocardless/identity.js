const bucket='tenant-identification';
export const MAX_ID_BYTES=5*1024*1024;
export function publicAgreement(a){if(!a)return null;const {id_document_path,id_document_type,...safe}=a;return {...safe,has_id:!!id_document_path};}
export function identityComplete(a){return !!(a?.signed_at&&a.signer_name&&a.signer_address&&a.signer_phone&&a.id_document_path);}
export function validateIdentity(name,address,phone){
 if(name.trim().split(/\s+/).length<2||name.length>150)throw Error('Enter your full first and last name.');
 if(address.length<10||address.length>500)throw Error('Enter your full address, including postcode.');
 if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>16)throw Error('Enter a valid contact number.');
}
export async function storage(path,method='POST',body,contentType='application/json'){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/storage/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':contentType},body:body===undefined?undefined:contentType==='application/json'?JSON.stringify(body):body});
 if(!response.ok)throw Error('Could not save or retrieve your ID document. Please retry.');
 return response.json();
}
export async function saveId(file,agreementId){
 if(!file||typeof file.arrayBuffer!=='function'||file.size<8||file.size>MAX_ID_BYTES)throw Error('Upload a JPG, PNG or PDF ID document, up to 5 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
 const pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 const type=jpeg?'image/jpeg':png?'image/png':pdf?'application/pdf':null;
 if(!type||file.type!==type)throw Error('Use a valid JPG, PNG or PDF file.');
 const path=agreementId+'/'+crypto.randomUUID()+(jpeg?'.jpg':png?'.png':'.pdf');
 await storage('object/'+bucket+'/'+path,'POST',bytes,type);
 return {id_document_path:path,id_document_type:type,id_uploaded_at:new Date().toISOString()};
}
export async function removeId(path){if(path)await storage('object/'+bucket,'DELETE',{prefixes:[path]});}
export async function staffIdUrl(path){
 if(!path)return null;
 const result=await storage('object/sign/'+bucket+'/'+path,'POST',{expiresIn:60});
 const relative=result.signedURL||result.signedUrl;
 if(!relative?.startsWith('/object/sign/'))throw Error('ID download unavailable.');
 return Deno.env.get('SUPABASE_URL')+'/storage/v1'+relative+'&download=identification';
}
