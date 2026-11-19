/* Shows a full-screen notice when the server says this account is suspended. */
(function(){
'use strict';
var shown=false;
function show(reason){
  if(shown) return; shown=true;
  var d=document.createElement('div');
  d.setAttribute('role','alertdialog');
  d.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#120e0a;color:#f5efe3;display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit';
  var safe=String(reason||'').replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});
  d.innerHTML='<div style="max-width:460px;text-align:center"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#f08a4b;font-weight:700">Account suspended</div>'+
    '<h1 style="font-size:30px;margin:10px 0 12px;font-family:var(--font-display,serif)">This account can no longer use Index.</h1>'+
    '<p style="opacity:.8;line-height:1.6;margin:0 0 6px">'+(safe?'Reason: '+safe+'.':'It broke the Index rules.')+'</p>'+
    '<p style="opacity:.65;line-height:1.6;margin:0 0 22px;font-size:14px">If you think this is a mistake, contact the Index owner from the Contact page.</p>'+
    '<button id="ban-out" style="padding:11px 22px;border-radius:10px;border:0;background:#f08a4b;color:#1a1008;font-weight:700;font-size:15px;cursor:pointer">Sign out</button></div>';
  document.body.appendChild(d);
  document.getElementById('ban-out').onclick=function(){
    fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).catch(function(){}).then(function(){ try{localStorage.clear();}catch(e){} location.reload(); });
  };
}
var realFetch=window.fetch;
window.fetch=function(){
  return realFetch.apply(this,arguments).then(function(r){
    if(r&&r.status===403){ r.clone().json().then(function(j){ if(j&&j.banned) show(j.reason||''); }).catch(function(){}); }
    return r;
  });
};
})();
