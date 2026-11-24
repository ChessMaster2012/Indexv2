/* Study sets: "From my files" source. Students can drop in files in almost any format (PDF, Word, PowerPoint, Excel, photos, audio, text...);
   the server reads them (see fileread.js) and the text feeds the study-set generator. Also lets the notes importer take any file. */
(function(){
'use strict';
var MAX_FILES=5, MAX_BYTES=8*1024*1024, TOTAL=30000, files=[], seq=0;
function $(i){ return document.getElementById(i); }
function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function readB64(f){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]||''); }; r.onerror=function(){ rej(new Error('Could not read that file.')); }; r.readAsDataURL(f); }); }
function extract(f,max){
  return readB64(f).then(function(b64){ return fetch('/api/tutor/extract',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.name,data:b64,max:max||24000})}); })
    .then(function(r){ return r.json().catch(function(){ return {}; }); })
    .then(function(j){ if(j&&j.ok&&j.text) return j; throw new Error((j&&j.error)||'Could not read that file.'); });
}
window.IXUpload={ extract:extract,
  text:function(){ var parts=files.filter(function(f){return f.state==='ready';}).map(function(f){ return '--- '+f.name+' ---\n'+f.text; }); return parts.join('\n\n').slice(0,TOTAL); },
  busy:function(){ return files.some(function(f){return f.state==='reading';}); },
  label:function(){ var r=files.filter(function(f){return f.state==='ready';}); return r.length===1?r[0].name.replace(/\.[^.]+$/,'').slice(0,60):r.length+' files'; } };
function render(){
  var box=$('up-list'); if(!box) return;
  box.innerHTML=files.map(function(f){ return '<div class="up-item '+f.state+'"><span>'+(f.state==='reading'?'<i class="up-spin"></i>':f.state==='error'?'⚠️':'📄')+'</span><b title="'+esc(f.name)+'">'+esc(f.name)+'</b><small>'+(f.state==='reading'?'Reading…':f.state==='error'?esc(f.err):Math.max(1,Math.round(f.text.length/5))+' words')+'</small><button type="button" data-up-rm="'+f.id+'" aria-label="Remove">✕</button></div>'; }).join('');
  var n=files.length, c=$('up-count'); if(c) c.textContent=n?n+' of '+MAX_FILES+' files':'';
}
function add(list){
  Array.prototype.slice.call(list||[]).forEach(function(f){
    if(files.length>=MAX_FILES){ return; }
    if(files.some(function(x){return x.name===f.name&&x.size===f.size;})) return;
    var o={id:++seq,name:f.name,size:f.size,state:'reading',text:'',err:''}; files.push(o);
    if(f.size>MAX_BYTES){ o.state='error'; o.err='Over 8 MB'; return; }
    extract(f,24000).then(function(j){ o.text=j.text; o.state='ready'; }).catch(function(e){ o.state='error'; o.err=e.message; }).then(render);
  }); render();
}
function build(){
  var tog=$('source-toggle'), topicBlock=$('source-topic-block'); if(!tog||!topicBlock||$('source-files-block')) return;
  var b=document.createElement('button'); b.className='toggle-btn'; b.setAttribute('data-source','files'); b.textContent='From my files'; tog.appendChild(b);
  var blk=document.createElement('div'); blk.id='source-files-block'; blk.className='hidden';
  blk.innerHTML='<div class="builder-row"><div class="field"><label>Course</label><select id="builder-subject-files"></select></div></div>'+
   '<div class="field"><label>Upload files <span class="field-optional">(any format: PDF, Word, PowerPoint, Excel, photos of notes, audio, text…)</span></label>'+
   '<div class="up-drop" id="up-drop" tabindex="0" role="button"><b>Drop files here or click to choose</b><small>Up to 5 files, 8 MB each. Photos and scans are read with AI.</small></div>'+
   '<input type="file" id="up-input" multiple hidden><div id="up-list"></div><div class="up-count" id="up-count"></div></div>';
  topicBlock.parentNode.insertBefore(blk,topicBlock.nextSibling);
  var drop=$('up-drop'), inp=$('up-input');
  drop.addEventListener('click',function(){ inp.click(); });
  drop.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); inp.click(); } });
  inp.addEventListener('change',function(){ add(inp.files); inp.value=''; });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.remove('over'); if(ev==='drop') add(e.dataTransfer.files); }); });
  blk.addEventListener('click',function(e){ var r=e.target.closest&&e.target.closest('[data-up-rm]'); if(r){ files=files.filter(function(f){return String(f.id)!==r.getAttribute('data-up-rm');}); render(); } });
  tog.addEventListener('click',function(e){ var t=e.target.closest('.toggle-btn'); if(!t) return; blk.classList.toggle('hidden',t.dataset.source!=='files'); if(t.dataset.source==='files'){ var s=$('builder-subject-files'), n=$('builder-subject-notes'); if(s&&n&&!s.options.length) s.innerHTML=n.innerHTML; } });
}
/* notes importer: accept any file, let the server read the ones the browser cannot */
function patchNotes(){
  var inp=$('note-file-input'); if(!inp||inp.__up) return; inp.__up=1; inp.removeAttribute('accept');
  inp.addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var ext=(f.name.split('.').pop()||'').toLowerCase(); if(['txt','md','markdown','csv','json','html','htm'].indexOf(ext)>=0) return; /* the built-in importer handles these */
    e.stopImmediatePropagation();
    var nm=$('note-file-name'); if(nm) nm.textContent='Reading '+f.name+'…';
    extract(f,24000).then(function(j){
      $('note-title').value=f.name.replace(/\.[^.]+$/,'').slice(0,120); $('note-content').value=j.text.slice(0,120000);
      if(nm) nm.textContent=f.name; try{ setNoteSource('computer'); }catch(x){}
    }).catch(function(er){ if(nm) nm.textContent=''; alert(er.message); });
    inp.value='';
  },true);
}
function boot(){ build(); patchNotes(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
var st=document.createElement('style'); st.textContent='.up-drop{border:2px dashed rgba(160,150,135,.55);border-radius:14px;padding:22px;text-align:center;cursor:pointer;display:grid;gap:4px;margin-top:6px}.up-drop:hover,.up-drop.over,.up-drop:focus{border-color:#ff7a4d;background:rgba(255,122,77,.08);outline:0}.up-drop small{opacity:.7}#up-list{display:grid;gap:8px;margin-top:10px}.up-item{display:grid;grid-template-columns:24px 1fr auto 28px;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;background:rgba(128,128,160,.1)}.up-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.up-item small{opacity:.75;font-size:12px}.up-item.error small{color:#ff8a8a}.up-item button{background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:14px}.up-count{font-size:12px;opacity:.65;margin-top:6px}.up-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#ff7a4d;border-radius:50%;display:inline-block;animation:upsp .8s linear infinite}@keyframes upsp{to{transform:rotate(360deg)}}'; document.head.appendChild(st);
})();
