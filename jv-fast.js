/**
 * JV-FAST.JS - Respuesta rápida (capa de caché en el navegador)
 * JV International · Producción Costura
 *
 * - Catálogos, colores, tarifas y operaciones se muestran al instante desde la última consulta
 *   y se refrescan en segundo plano (la siguiente apertura ya trae lo nuevo).
 * - Cualquier guardado (POST) borra este caché: lo que cambias tú se ve de inmediato.
 * - Solo guarda lecturas de catálogos; nunca producción, cortes, tickets ni dashboard.
 * - Si algo falla, la página funciona como antes (consulta directa al servidor).
 * Incluir en <head>, antes de los demás scripts:  <script src="jv-fast.js"></script>
 */
(function(){
  'use strict';
  const NATIVE=window.fetch&&window.fetch.bind(window);
  if(!NATIVE||window.__jvFast)return;window.__jvFast=true;
  const PREFIX='jvfc1:',FRESH_MS=20*1000,MAX_MS=15*60*1000,CACHEABLE=['catalogs','colors','operations','rates'];
  const isApi=u=>/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(u);
  const keyOf=u=>{try{const x=new URL(u);x.searchParams.delete('pin');x.searchParams.delete('gpin');x.searchParams.delete('_');x.searchParams.sort();return PREFIX+x.toString()}catch(e){return null}};
  const store={get(k){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v.t==='number'&&typeof v.b==='string'?v:null}catch(e){return null}},
    set(k,b){try{localStorage.setItem(k,JSON.stringify({t:Date.now(),b}))}catch(e){}},
    clear(){try{Object.keys(localStorage).filter(k=>k.indexOf(PREFIX)===0).forEach(k=>localStorage.removeItem(k))}catch(e){}}};
  const mkResp=b=>new Response(b,{status:200,headers:{'content-type':'application/json'}});
  const inflight={};
  async function network(url,init,key){
    if(inflight[key])return inflight[key].then(b=>b);
    const p=(async()=>{const r=await NATIVE(url,init);const txt=await r.clone().text();
      try{const j=JSON.parse(txt);if(j&&j.ok===true)store.set(key,txt)}catch(e){}return txt})();
    inflight[key]=p;p.then(()=>{delete inflight[key]},()=>{delete inflight[key]});return p;
  }
  window.fetch=function(input,init){
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'',method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      if(!isApi(url))return NATIVE(input,init);
      if(method==='POST'){store.clear();return NATIVE(input,init)}          // cualquier guardado invalida el caché
      let action='';try{action=(new URL(url).searchParams.get('action')||'').toLowerCase()}catch(e){}
      if(CACHEABLE.indexOf(action)<0)return NATIVE(input,init);
      const key=keyOf(url);if(!key)return NATIVE(input,init);
      const hit=store.get(key),age=hit?Date.now()-hit.t:Infinity;
      if(hit&&age<MAX_MS){
        if(age>=FRESH_MS)network(url,init,key).catch(()=>{});               // refresca en segundo plano
        return Promise.resolve(mkResp(hit.b));
      }
      return network(url,init,key).then(mkResp).catch(err=>{if(hit)return mkResp(hit.b);throw err});
    }catch(e){return NATIVE(input,init)}
  };
})();
