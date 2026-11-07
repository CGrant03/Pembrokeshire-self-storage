export function ordinal(n){n=Number(n);const v=n%100;return n+(v>=11&&v<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));}
export function date(value){const d=new Date(value+'T12:00:00Z');return ordinal(d.getUTCDate())+' '+d.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});}
