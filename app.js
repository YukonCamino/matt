const {PLACES,STATION}=CITY;
const NUDGE=CITY.NUDGE||{};
const COLORS={bed:"--bed",wash:"--wash",food:"--food",house:"--house",lib:"--lib",wifi:"--wifi",cafe:"--cafe"};
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const walkUrl=(lat,lon)=>`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
// Places a BART ride (or bus) away get transit directions instead of a walking route.
const dirUrl=p=>`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=${p.via?'transit':'walking'}`;
const dirLabel=p=>p.via?'Directions':'Walk there';

// Walking-directions button on every card that has a location
Object.entries(PLACES).forEach(([k,p])=>{
  const card=document.querySelector(`.card[data-k="${k}"]`);
  if(!card) return;
  const acts=card.querySelector('.actions')||(()=>{
    const d=document.createElement('div'); d.className='actions';
    card.insertBefore(d, card.querySelector('.note')); return d;})();
  const a=document.createElement('a');
  a.className='btn'; a.target='_blank'; a.rel='noopener';
  a.href=dirUrl(p); a.textContent=dirLabel(p);
  acts.appendChild(a);
});

// ── Map ──
const map=L.map('map',{scrollWheelZoom:false}).setView([STATION.lat,STATION.lon],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);



// One layer of pins per tab, so each tab's map only shows what that tab lists.
const layers={help:L.layerGroup(),lib:L.layerGroup(),wifi:L.layerGroup()};
Object.entries(PLACES).forEach(([k,p])=>{
  if(p.pin===false) return; // shares a building (and a pin) with another place
  const off=NUDGE[k]||[0,0];
  const m=L.circleMarker([p.lat+off[0],p.lon+off[1]],{
    radius:9, color:'#fff', weight:2, fillColor:cssVar(COLORS[p.c]), fillOpacity:1
  }).addTo(layers[p.t]);
  const tel=p.tel?`<a class="c" href="tel:${p.tel}">Call</a>`:'';
  m.bindPopup(`<b>${p.n}</b><br>${p.w}<div class="pop-links">${tel}
    <a href="${dirUrl(p)}" target="_blank" rel="noopener">${dirLabel(p)}</a></div>`);
});

// The arrival station — not a service, a landmark to get bearings from. Shown on every tab.
// Its own pane under the service pins, so a nearby place is never hidden behind the star.
map.createPane('station').style.zIndex=350;
L.marker([STATION.lat,STATION.lon],{pane:'station',
  icon:L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],
    html:'<div style="width:26px;height:26px;border-radius:50%;background:#111;'+
         'border:3px solid #fff;box-shadow:0 0 0 1px #111;display:flex;'+
         'align-items:center;justify-content:center;color:#fff;font-size:14px">&#9733;</div>'})
}).addTo(map).bindPopup(`<b>${STATION.n}</b><br>${STATION.w}`);

let activeTab='help';
function showTabOnMap(tab){
  Object.entries(layers).forEach(([t,g])=>{ if(t===tab) g.addTo(map); else map.removeLayer(g); });
  document.querySelectorAll('.legend span[data-tab]').forEach(el=>el.hidden=(el.dataset.tab!==tab));
  if(tab==='help'){
    // Seattle: fitting every Help pin zooms out so far the downtown ones clump, so it frames
    // the core instead. A city can ask for 'fit' when its places are spread across towns.
    if(CITY.HELP_VIEW!=='fit'){ map.setView(CITY.HELP_VIEW[0],CITY.HELP_VIEW[1],{animate:false}); return; }
  }
  {
    // FIT_SKIP: far-off places whose cards already say to take the bus; framing them would
    // shrink everything else into a clump.
    const skip=CITY.FIT_SKIP||[];
    const pts=Object.entries(PLACES).filter(([k,p])=>p.t===tab&&!skip.includes(k)).map(([,p])=>[p.lat,p.lon]);
    pts.push([STATION.lat,STATION.lon]);
    map.fitBounds(pts,{padding:[28,28],maxZoom:16,animate:false});
  }
}
showTabOnMap('help');

// On a phone, one finger scrolls the page; two fingers move the map.
if(L.Browser.mobile){
  map.dragging.disable();
  const el=map.getContainer();
  el.addEventListener('touchstart',e=>{ if(e.touches.length>1) map.dragging.enable(); },{passive:true});
  el.addEventListener('touchend',()=>{ map.dragging.disable(); },{passive:true});
}

// ── Tabs ──
document.querySelectorAll('.tabs button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-selected',x===b));
    document.querySelectorAll('.panel').forEach(p=>p.hidden=(p.id!==b.getAttribute('aria-controls')));
    activeTab={'p-help':'help','p-lib':'lib','p-wifi':'wifi'}[b.getAttribute('aria-controls')];
    showTabOnMap(activeTab);
    renderNear();
    window.scrollTo({top:0,behavior:'instant'});
  });
});

// ── Distances ──
const btn=document.getElementById('near'), list=document.getElementById('nearlist');
function miles(a,b,c,d){const R=3958.8,t=Math.PI/180;
  const x=Math.sin((c-a)*t/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin((d-b)*t/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));}
function walkMins(mi){return Math.round(mi/3*60);} // ~3 mph on foot
// Streets don't run in straight lines; real walking routes average ~30% longer.
const ROUTE=1.3;

function setDist(k,mi,from,text){
  const card=document.querySelector(`.card[data-k="${k}"]`);
  if(!card) return;
  let d=card.querySelector('.dist');
  if(!d){ d=document.createElement('div'); d.className='dist'; card.querySelector('.addr').after(d); }
  const r=mi*ROUTE;
  d.textContent=text||`${r.toFixed(1)} mi from ${from} — about ${walkMins(r)} min walk`;
}
// Default: distance from the station, so the page is useful without sharing location.
// Places reached by BART say which stop and how far from it; others needing transit say so.
function stationText(p){
  if(p.via&&p.via.n){
    const w=walkMins(miles(p.via.lat,p.via.lon,p.lat,p.lon)*ROUTE);
    return `BART to ${p.via.n}, then about ${Math.max(w,2)} min walk`;
  }
  if(p.via==='transit')
    return `About ${Math.round(miles(STATION.lat,STATION.lon,p.lat,p.lon))} mi away — tap Directions for bus or train`;
  return null;
}
Object.entries(PLACES).forEach(([k,p])=>
  setDist(k,miles(STATION.lat,STATION.lon,p.lat,p.lon),CITY.FROM||'the station',stationText(p)));

let here=null;
function renderNear(){
  if(!here) return;
  const sorted=Object.entries(PLACES).filter(([,p])=>p.t===activeTab)
    .map(([k,p])=>({k,p,mi:miles(here[0],here[1],p.lat,p.lon)*ROUTE}))
    .sort((a,b)=>a.mi-b.mi);
  list.innerHTML='<p class="key" style="margin-bottom:8px">Closest to you right now:</p>'+
    sorted.slice(0,5).map(({p,mi})=>
      `<a href="${dirUrl(p)}" target="_blank" rel="noopener">
         <span><span class="t">${p.n}</span><span class="s">${p.w}</span></span>
         <span class="d">${mi.toFixed(1)} mi<br>${walkMins(mi)} min</span></a>`).join('');
}

btn.addEventListener('click',()=>{
  if(!navigator.geolocation){list.innerHTML='<p class="key">This phone will not share its location. Use the map above instead.</p>';return;}
  btn.disabled=true; btn.textContent='Finding you…';
  navigator.geolocation.getCurrentPosition(pos=>{
    const{latitude:la,longitude:lo}=pos.coords;
    L.circleMarker([la,lo],{radius:8,color:'#fff',weight:3,fillColor:'#e11d48',fillOpacity:1})
      .addTo(map).bindPopup('<b>You are here</b>');
    here=[la,lo];
    Object.entries(PLACES).forEach(([k,p])=>setDist(k,miles(la,lo,p.lat,p.lon),'you'));
    renderNear();
    map.setView([la,lo],14);
    btn.textContent='Distances added below ✓';
  },err=>{
    btn.disabled=false; btn.textContent='Show what is closest to me';
    list.innerHTML='<p class="key">Could not get your location. Check location permission for this page, or just use the map above.</p>';
  },{enableHighAccuracy:true,timeout:10000,maximumAge:300000});
});
