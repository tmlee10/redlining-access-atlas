'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString('en-US');
const pct=n=>n==null?'No estimate':Number(n).toFixed(1)+'%';
const colors=['#B3D7F2','#8FBCE9','#6799CF','#4C79AE','#33577E'];
const color=p=>p==null?'#e7e7e7':colors[p<60?0:p<70?1:p<80?2:p<90?3:4];
const SOUTH=new Set('AL AR DE FL GA KY LA MD MS NC OK SC TN TX VA WV'.split(' '));
const WEST=new Set('AK AZ CA CO HI ID MT NV NM OR UT WA WY'.split(' '));
let catalog,states,projection,path,ctx,canvas,zoom,W,H,transform=d3.zoomIdentity;
let current=null,data=null,selected=null,view=null,requestId=0,cache=new Map(),stateShapes=[],bgShapes=[],histShapes=[];
let drawPending=false;
let overview=null,overviewBlocks=[],overviewHistorical=[],censusLinks={},selectedHistorical=null;
let protocolPilot=null,pilotQuery=null;
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let roads=null,roadShapes=[],roadsLoading=false;
function status(s){$('status').textContent=s;}
function collection(features){return {type:'FeatureCollection',features};}
function shapes(fc){return fc.features.map(f=>({f,p:new Path2D(path(f)),b:path.bounds(f)}));}
function queueDraw(){if(!drawPending){drawPending=true;requestAnimationFrame(()=>{drawPending=false;draw();});}}
function rebuildPaths(){stateShapes=shapes(states);bgShapes=data?shapes(data.blocks):[];histShapes=data?shapes(data.historical):[];roadShapes=roads?shapes(roads):[];if(overview&&!overviewBlocks.length){overviewBlocks=shapes(overview.blocks);overviewHistorical=shapes(overview.historical);}}
async function loadRoads(){if(!current||!data||roads||roadsLoading||transform.k<25)return;roadsLoading=true;const id=current.id,token=requestId;
  try{const loaded=JSON.parse(await readGzip('data/'+current.slug+'-roads.json.gz'));if(token!==requestId||current?.id!==id)return;roads=loaded;roadShapes=shapes(roads);queueDraw();}catch(e){if(token===requestId)status('Access data loaded; street context could not be loaded.');}finally{if(token===requestId)roadsLoading=false;}
}
function onScreen(s){const a=transform.apply(s.b[0]),b=transform.apply(s.b[1]);return b[0]>=0&&a[0]<=W&&b[1]>=0&&a[1]<=H;}
function draw(){
  const ratio=window.devicePixelRatio||1;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
  ctx.save();ctx.translate(transform.x,transform.y);ctx.scale(transform.k,transform.k);
  stateShapes.forEach(s=>{ctx.fillStyle='#dedfdc';ctx.fill(s.p);ctx.strokeStyle='#fff';ctx.lineWidth=.7/transform.k;ctx.stroke(s.p);});
  drawOverviewLayers();
  if(data){
    bgShapes.filter(onScreen).forEach(s=>{const excluded=pilotQuery&&!pilotQuery.selected.some(r=>r.GEOID===s.f.properties.GEOID);ctx.fillStyle=excluded?'#fafafa':color(s.f.properties.internet_pct);ctx.globalAlpha=excluded?1:.65;ctx.fill(s.p);ctx.globalAlpha=1;if(transform.k>5){ctx.strokeStyle=excluded?'#a4acb0':'#ffffff90';ctx.lineWidth=.5/transform.k;ctx.stroke(s.p);}});
    if(transform.k>25){ctx.strokeStyle='#ffffffe0';ctx.lineWidth=.65/transform.k;roadShapes.filter(s=>onScreen(s)&&(transform.k>100||['S1100','S1200'].includes(s.f.properties.MTFCC))).forEach(s=>ctx.stroke(s.p));}
    histShapes.filter(onScreen).forEach(s=>{const g=s.f.properties.grade;if(!(g==='D'?$('gradeD').checked:g==='Other'?$('gradeOther').checked:$('gradeABC').checked))return;ctx.strokeStyle=g==='D'?'#B32232':g==='Other'?'#6b5c7e':'#4b7350';ctx.lineWidth=(transform.k>8?1.8:1.1)/transform.k;ctx.setLineDash(g==='D'?[]:[4/transform.k,3/transform.k]);ctx.stroke(s.p);});ctx.setLineDash([]);
    if(view?.kind==='pleasant'){ctx.strokeStyle='#151d24';ctx.lineWidth=1.6/transform.k;ctx.setLineDash([2/transform.k,3/transform.k]);ctx.stroke(new Path2D(path(data.extras.pleasant_hill_view)));ctx.setLineDash([]);}
    if(selectedHistorical!==null){const f=data.historical.features[selectedHistorical];ctx.strokeStyle='#fff';ctx.lineWidth=5/transform.k;ctx.stroke(new Path2D(path(f)));ctx.strokeStyle='#B32232';ctx.lineWidth=3/transform.k;ctx.stroke(new Path2D(path(f)));}
    if(view?.official){ctx.strokeStyle='#333';ctx.lineWidth=2/transform.k;ctx.setLineDash([6/transform.k,3/transform.k]);ctx.stroke(new Path2D(path(view.fc)));ctx.setLineDash([]);}
    if(selected){const s=bgShapes.find(x=>x.f.properties.GEOID===selected);if(s){ctx.strokeStyle='#f5bc42';ctx.lineWidth=3/transform.k;ctx.stroke(s.p);}}
  }
  ctx.restore();
  ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  if(transform.k>40){
    const labels=[],names=new Set();
    function label(text,xy,ink){const width=ctx.measureText(text).width+14,box=[xy[0]-width/2,xy[1]-10,xy[0]+width/2,xy[1]+10];if(xy[0]<40||xy[0]>W-40||xy[1]<20||xy[1]>H-20||labels.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))return;labels.push(box);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(text,xy[0],xy[1]);ctx.fillStyle=ink;ctx.fillText(text,xy[0],xy[1]);}
    histShapes.filter(onScreen).forEach(s=>{const g=s.f.properties.grade;if(transform.k>100&&g==='D'&&$('gradeD').checked)label('HOLC '+s.f.properties.label,transform.apply(path.centroid(s.f)),'#a8212b');});
    roadShapes.filter(onScreen).sort((a,b)=>a.f.properties.MTFCC.localeCompare(b.f.properties.MTFCC)).forEach(s=>{const name=s.f.properties.FULLNAME;if(!name||names.has(name)||labels.length>65||transform.k<100&&!['S1100','S1200'].includes(s.f.properties.MTFCC))return;names.add(name);label(name,transform.apply(path.centroid(s.f)),'#405663');});
  }
  if(transform.k<4){stateShapes.forEach(s=>{const p=path.centroid(s.f),xy=transform.apply(p);if(xy[0]<15||xy[0]>W-15||xy[1]<12||xy[1]>H-12)return;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(s.f.properties.STUSPS,xy[0],xy[1]);ctx.fillStyle='#263e48';ctx.fillText(s.f.properties.STUSPS,xy[0],xy[1]);});}
  if(current && transform.k>=4){current.cities.forEach(c=>{const xy=transform.apply(path.centroid(c.boundary));if(xy[0]<30||xy[0]>W-30||xy[1]<15||xy[1]>H-15)return;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(c.name,xy[0],xy[1]);ctx.fillStyle='#263e48';ctx.fillText(c.name,xy[0],xy[1]);});}
}
function fit(fc,animate=true){const [[x0,y0],[x1,y1]]=path.bounds(fc);const k=Math.min(10000,.86/Math.max((x1-x0)/W,(y1-y0)/H));const t=d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2);const s=d3.select(canvas);(animate?s.transition().duration(550):s).call(zoom.transform,t);}
function clearSelection(){selected=null;selectedHistorical=null;pilotQuery=null;$('pilotQuery').hidden=true;$('areas').value='';$('historical').value='';}
function setTitle(title,crumb){$('viewTitle').textContent=title;$('breadcrumb').textContent=crumb;document.title=title+' | Access Atlas';}
function showOverview(region='United States'){
  history.replaceState(null,'',location.pathname+location.search);
  requestId++;current=null;data=null;roads=null;roadShapes=[];roadsLoading=false;clearSelection();bgShapes=[];histShapes=[];$('states').value='';$('cities').disabled=true;$('cities').replaceChildren(new Option('Choose a state first',''));$('areaLabel').hidden=true;$('historicalLabel').hidden=true;$('download').hidden=true;$('coverageLegend').hidden=true;$('accessLegend').hidden=false;$('up').disabled=true;
  view={kind:'overview',name:region,fc:region==='United States'?states:collection(states.features.filter(f=>(region==='South'?SOUTH:WEST).has(f.properties.STUSPS)))};
  setTitle(region+' · redlining & reported internet access',region.toUpperCase()+' · CONNECTED MAP');$('detailTitle').textContent=region+' results';const included=catalog.states.filter(s=>region==='United States'||s.region===region);$('detail').innerHTML='<p><strong>'+included.length+' study states</strong> with Census access shading and historical outlines.</p><p>Red dots mark Grade D locations at this scale. Zoom in or select a state to see boundaries, streets and Census statistics.</p><p>US benchmark: <strong>'+pct(catalog.national.internet_pct)+'</strong>.</p><small>Gray states are not yet included. The US benchmark is not a result for the redlined areas.</small>';
  $('mapNote').textContent='Red dots: Grade D locations at broad scales. Outlines appear as you zoom in. Gray: not yet included. Alaska/Hawaii are insets.';status('Access shading and historical areas are visible across the study states. Select a state or red marker for detail.');fit(view.fc);queueDraw();
}
async function readGzip(url){const response=await fetch(url);if(!response.ok)throw new Error('Download failed ('+response.status+')');if(!('DecompressionStream' in window))throw new Error('Please use a current Chrome, Edge, Firefox or Safari browser.');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes[0]!==31||bytes[1]!==139)return new TextDecoder().decode(bytes);return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
async function chooseState(id){
  const token=++requestId;clearSelection();data=null;roads=null;roadShapes=[];roadsLoading=false;bgShapes=[];histShapes=[];current=catalog.states.find(s=>s.id===id)||null;
  const state=states.features.find(f=>f.properties.STATEFP===id);if(!state)return;history.replaceState(null,'','#state='+id);
  $('states').value=id;$('historicalLabel').hidden=true;$('up').disabled=false;$('up').textContent='↑ '+(current?.region||'United States');$('areaLabel').hidden=true;$('download').hidden=true;$('cities').disabled=true;$('cities').replaceChildren(new Option('Choose a city / view',''));view={kind:'state',name:state.properties.NAME,fc:state};fit(state);setTitle(state.properties.NAME,current?'STATE · HOUSEHOLDS REPORTING INTERNET ACCESS':'STATE · NOT YET INCLUDED');
  $('detailTitle').textContent=state.properties.NAME;$('coverageLegend').hidden=!!current;$('accessLegend').hidden=!current;$('mapNote').textContent='Statistics describe full Census block groups. Historical outlines do not redefine the estimates.';
  if(!current){$('detail').innerHTML='<p><strong>Not yet included.</strong> No access estimates are displayed for this state. This does not establish whether historical redlining occurred here.</p>';status(state.properties.NAME+' is geographic context only.');queueDraw();return;}
  const entry=current;$('detail').innerHTML='<p>Loading '+entry.blocks.toLocaleString()+' Census areas…</p>';status('Loading detailed boundaries for '+entry.name+'…');queueDraw();
  try{
    if(!cache.has(id))cache.set(id,readGzip('data/'+entry.slug+'.json.gz').then(JSON.parse).catch(e=>{cache.delete(id);throw e;}));
    const loaded=await cache.get(id);if(token!==requestId)return;data=loaded;rebuildPaths();
    entry.cities.forEach((c,i)=>$('cities').add(new Option(c.name+' · '+c.gradeD+' Grade D areas','city:'+i)));
    if(data.extras.pleasant_hill_view){$('cities').add(new Option('Macon-Bibb County','macon'));$('cities').add(new Option('Pleasant Hill · reference view','pleasant'));}
    populateHistorical();$('historicalLabel').hidden=false;$('cities').disabled=false;$('areas').replaceChildren(new Option('Select a Census block group',''));
    const options=document.createDocumentFragment();data.blocks.features.forEach(f=>options.appendChild(new Option(f.properties.GEOID+' · '+pct(f.properties.internet_pct),f.properties.GEOID)));$('areas').appendChild(options);$('areaLabel').hidden=false;$('download').hidden=false;showStateStats();status(entry.name+' loaded: '+fmt(entry.blocks)+' Census areas · '+fmt(entry.historicalAreas)+' historical archive areas.');queueDraw();
    // Keep up to three states cached. A large national download is never required.
    while(cache.size>3){const first=cache.keys().next().value;if(first===id)break;cache.delete(first);}
  }catch(e){if(token!==requestId)return;$('detail').textContent='Could not load this state. Select it again to retry. '+e.message;status('State download failed. No estimates have been substituted.');}
}
function showStateStats(){
  if(!current)return;const b=current.benchmark;$('detailTitle').textContent=current.name+' benchmark';$('detail').innerHTML='<div class="big-rate">'+pct(b.internet_pct)+'</div><p class="metric-sub">Households reporting internet access</p><div class="stat-grid"><span>95% interval</span><strong>'+pct(b.ci95_low)+'–'+pct(b.ci95_high)+'</strong><span>Estimated households</span><strong>'+fmt(b.estimated_households)+'</strong><span>Block groups with estimates</span><strong>'+fmt(current.estimates)+'</strong><span>Zero-household block groups</span><strong>'+fmt(current.noEstimate)+'</strong><span>Standard Grade D areas</span><strong>'+fmt(current.gradeD)+'</strong></div><small>This is the published state-level household estimate, not an average of neighborhood percentages. Select a Census area for its own statistics.</small>';
}
function chooseCity(value){if(!data)return;clearSelection();$('cities').value=value;showStateStats();
  if(value==='pleasant'){view={kind:'pleasant',name:'Pleasant Hill · reference view',fc:data.extras.pleasant_hill_view};}
  else if(value==='macon'){view={kind:'city',name:'Macon-Bibb County',fc:data.extras.macon_boundary};}
  else if(value.startsWith('city:')){const c=current.cities[Number(value.split(':')[1])];const grades=data.historical.features.filter(f=>f.properties.city===c.name).map(f=>f.properties.grade);if(!grades.includes('D')){if(grades.includes('Other'))$('gradeOther').checked=true;if(grades.some(g=>'ABC'.includes(g)))$('gradeABC').checked=true;}view={kind:'city',name:c.name+' · historical map extent',fc:c.boundary};}
  else{history.replaceState(null,'','#state='+current.id);view={kind:'state',name:current.name,fc:states.features.find(s=>s.properties.STATEFP===current.id)};}
  populateHistorical(value.startsWith('city:')?current.cities[Number(value.split(':')[1])].name:['pleasant','macon'].includes(value)?'Macon':null);$('up').disabled=false;$('up').textContent=view.kind==='state'?'↑ '+current.region:'↑ '+current.name;
  if(view.kind!=='state'){$('detailTitle').textContent=view.name;$('detail').innerHTML='<p>Select a historical area below to see the Census block groups that overlap it and their access statistics.</p><p>Red outlines show historical Grade D boundaries. Blue shading describes whole Census block groups.</p><small>State benchmark: '+pct(current.benchmark.internet_pct)+'; this is not the local area rate.</small>';}
  setTitle(view.name,current.name.toUpperCase()+' · '+(view.kind==='state'?'STATE':'LOCAL VIEW'));fit(view.fc);status('View: '+view.name+'. Select a Census block group for statistics; the view itself is not a separate estimate.');queueDraw();
}
function selectBlock(id,zoomTo=false){if(!data)return;const f=data.blocks.features.find(f=>f.properties.GEOID===id);if(!f)return;selected=id;$('areas').value=id;const p=f.properties;
  setTitle('Census block group '+id,current.name.toUpperCase()+' · SELECTED CENSUS AREA');$('detailTitle').textContent='Block group '+id;
  $('detail').innerHTML='<div class="big-rate">'+pct(p.internet_pct)+'</div><p class="metric-sub">Households reporting internet access</p><div class="stat-grid"><span>95% interval</span><strong>'+(p.internet_pct==null?'Not applicable':pct(p.ci95_low)+'–'+pct(p.ci95_high))+'</strong><span>Estimated households</span><strong>'+fmt(p.estimated_households)+'</strong><span>Reporting internet</span><strong>'+fmt(p.internet_households)+'</strong><span>Reporting no internet</span><strong>'+fmt(p.no_internet_households)+'</strong><span>State benchmark</span><strong>'+pct(current.benchmark.internet_pct)+'</strong><span>US benchmark</span><strong>'+pct(catalog.national.internet_pct)+'</strong></div><small>'+(p.precision_flag?p.precision_flag+'. ':'')+'These figures describe the entire yellow-outlined Census block group, not just its historically redlined portion.</small><p><small>Uncertainty: '+p.uncertainty_method+'.</small></p>';
  $('up').disabled=false;$('up').textContent=selectedHistorical!==null?'↑ Historical area':'↑ '+view.name;
  status('Selected '+id+' · '+pct(p.internet_pct)+' · ACS 2020–2024.');if(zoomTo)fit(f);queueDraw();
}
function hit(list,xy){const p=transform.invert(xy);return list.find(s=>p[0]>=s.b[0][0]&&p[0]<=s.b[1][0]&&p[1]>=s.b[0][1]&&p[1]<=s.b[1][1]&&ctx.isPointInPath(s.p,p[0],p[1]));}
function resize(){const rect=canvas.parentElement.getBoundingClientRect();W=rect.width;H=rect.height;const ratio=window.devicePixelRatio||1;canvas.width=W*ratio;canvas.height=H*ratio;projection=d3.geoAlbersUsa().fitExtent([[35,35],[W-35,H-40]],states);path=d3.geoPath(projection);overviewBlocks=[];overviewHistorical=[];rebuildPaths();fit(selected?data.blocks.features.find(f=>f.properties.GEOID===selected):view?.fc||states,false);}

function visibleGrade(g){return g==='D'?$('gradeD').checked:g==='Other'?$('gradeOther').checked:$('gradeABC').checked;}
function drawOverviewLayers(){
  if(!overview)return;
  ctx.globalAlpha=.65;overviewBlocks.filter(s=>(!data||s.f.properties.state!==current?.id)&&onScreen(s)).forEach(s=>{ctx.fillStyle=color(s.f.properties.internet_pct);ctx.fill(s.p);});ctx.globalAlpha=1;
  overviewHistorical.filter(s=>(!data||s.f.properties.state!==current?.id)&&onScreen(s)&&visibleGrade(s.f.properties.grade)).forEach(s=>{
    const g=s.f.properties.grade;ctx.strokeStyle=g==='D'?'#B32232':g==='Other'?'#6b5c7e':'#4b7350';ctx.lineWidth=1.3/transform.k;ctx.setLineDash(g==='D'?[]:[4/transform.k,3/transform.k]);ctx.stroke(s.p);
    if(transform.k<8&&g==='D'){const xy=path.centroid(s.f);ctx.fillStyle='#B32232';ctx.beginPath();ctx.arc(xy[0],xy[1],2/transform.k,0,Math.PI*2);ctx.fill();}
  });ctx.setLineDash([]);
}
function mapHit(xy){
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  const local=histShapes.filter(s=>visibleGrade(s.f.properties.grade));
  const h=hit(local,xy);if(h){ctx.restore();const index=data.historical.features.indexOf(h.f);return {kind:'historical',state:current.id,index,label:h.f.properties.city+' · '+h.f.properties.label+' · Grade '+h.f.properties.grade};}
  const regional=overviewHistorical.filter(s=>(!data||s.f.properties.state!==current?.id)&&visibleGrade(s.f.properties.grade));
  let rh=hit(regional,xy);
  if(!rh&&transform.k<8)rh=regional.find(s=>{const p=transform.apply(path.centroid(s.f));return Math.hypot(p[0]-xy[0],p[1]-xy[1])<6;});
  if(rh){ctx.restore();const p=rh.f.properties;return {kind:'historical',state:p.state,index:p.index,label:p.city+' · '+p.label+' · Grade '+p.grade};}
  const bg=hit(bgShapes,xy),st=bg?null:hit(stateShapes,xy);ctx.restore();
  return bg?{kind:'block',id:bg.f.properties.GEOID,label:'Census '+bg.f.properties.GEOID+' · '+pct(bg.f.properties.internet_pct)}:st?{kind:'state',id:st.f.properties.STATEFP,label:st.f.properties.NAME+' · '+(catalog.states.some(c=>c.id===st.f.properties.STATEFP)?'Open detailed results':'Not yet included')}:null;
}
function populateHistorical(city=null){
  $('historical').replaceChildren(new Option('Choose a historical area',''));
  data.historical.features.map((f,index)=>({f,index})).filter(x=>!city||x.f.properties.city===city).sort((a,b)=>(a.f.properties.grade==='D'?0:1)-(b.f.properties.grade==='D'?0:1)||a.f.properties.city.localeCompare(b.f.properties.city)||a.f.properties.label.localeCompare(b.f.properties.label,undefined,{numeric:true})).forEach(({f,index})=>{
    const p=f.properties;$('historical').add(new Option(p.city+' · '+p.label+' · '+(p.grade==='Other'?'Other archive category':'Grade '+p.grade),String(index)));
  });
}
function chooseHistorical(index){
  if(!data||!Number.isInteger(index)||!data.historical.features[index])return;
  clearSelection();selectedHistorical=index;const f=data.historical.features[index],p=f.properties;
  const ci=current.cities.findIndex(c=>c.name===p.city);$('cities').value=ci>=0?'city:'+ci:'';populateHistorical(p.city);$('historical').value=String(index);
  $(p.grade==='D'?'gradeD':p.grade==='Other'?'gradeOther':'gradeABC').checked=true;
  view={kind:'historical',name:p.city+' · '+p.label,fc:f,city:p.city};
  setTitle(view.name,current.region.toUpperCase()+' › '+current.name.toUpperCase()+' › '+p.city.toUpperCase()+' › HISTORICAL AREA');
  $('detailTitle').textContent=view.name+' · '+(p.grade==='Other'?'Other archive category':'Grade '+p.grade);
  const ids=new Set(censusLinks[current.id]?.[index]||[]),linked=data.blocks.features.filter(f=>ids.has(f.properties.GEOID));
  $('detail').innerHTML='<p><strong>'+linked.length+' overlapping Census block groups</strong></p><p>Each percentage below covers the <strong>entire Census block group</strong>, including portions outside this historical boundary. No rate specific to the redlined portion is calculated.</p><div class="area-table"><table><thead><tr><th>Census block group</th><th>Internet</th><th>95% interval</th><th>Households</th></tr></thead><tbody>'+linked.map(f=>{const b=f.properties;return '<tr><td><button class="text-button" data-block="'+b.GEOID+'">'+b.GEOID+'</button></td><td>'+pct(b.internet_pct)+'</td><td>'+(b.internet_pct==null?'—':pct(b.ci95_low)+'–'+pct(b.ci95_high))+'</td><td>'+fmt(b.estimated_households)+'</td></tr>';}).join('')+'</tbody></table></div>'+(linked.length?'':'<p>No positive-area overlap was found in this snapshot. No estimate is substituted.</p>')+'<p><small>ACS '+catalog.period+'. Click a Census ID to see its complete boundary and statistics. Links use positive-area overlap of the source map geometries.</small></p>';
  $('detail').querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>selectBlock(b.dataset.block,true));
  $('up').disabled=false;$('up').textContent='↑ '+p.city;
  status(view.name+' selected. '+linked.length+' Census areas provide the displayed statistics.');fit(f);loadRoads();queueDraw();
  history.replaceState(null,'','#state='+current.id+'&area='+index);
}
function goUp(){
  if(!current){showOverview();return;}
  if(selected){if(selectedHistorical!==null)chooseHistorical(selectedHistorical);else chooseCity($('cities').value);return;}
  if(view?.kind==='historical'){const ci=current.cities.findIndex(c=>c.name===view.city);chooseCity(ci>=0?'city:'+ci:'');return;}
  if(view?.kind==='city'||view?.kind==='pleasant'){chooseCity('');return;}
  showOverview(current.region);
}
function buildStateResults(){
  const host=$('stateResults');host.innerHTML=catalog.states.map(s=>'<article class="state-card"><p class="eyebrow">'+s.region+'</p><h3>'+s.name+'</h3><p><strong>'+fmt(s.gradeD)+'</strong> Grade D areas · '+fmt(s.historicalAreas)+' total archive areas</p><p>'+fmt(s.blocks)+' Census block groups</p><p>State benchmark: <strong>'+pct(s.benchmark.internet_pct)+'</strong></p><button data-state="'+s.id+'">Open '+s.name+' results →</button></article>').join('');
  host.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{history.replaceState(null,'','#state='+b.dataset.state);chooseState(b.dataset.state);$('viewTitle').scrollIntoView({behavior:'smooth',block:'start'});});
}

async function init(){
  [catalog,states,overview,censusLinks,protocolPilot]=await Promise.all([fetch('data/catalog.json').then(r=>r.json()),fetch('data/states.json').then(r=>r.json()),readGzip('data/connected-overview.json.gz').then(JSON.parse),readGzip('data/historical-census-links.json.gz').then(JSON.parse),fetch('data/pleasant-hill-protocol.json').then(r=>{if(!r.ok)throw new Error('Protocol data unavailable');return r.json();})]);
  $('totalBlocks').textContent=fmt(catalog.totals.blocks);canvas=$('map');ctx=canvas.getContext('2d');
  zoom=d3.zoom().scaleExtent([.7,10000]).on('zoom',e=>{transform=e.transform;queueDraw();loadRoads();});d3.select(canvas).call(zoom).on('dblclick.zoom',null);
  $('states').replaceChildren(new Option('Choose a state',''));states.features.slice().sort((a,b)=>a.properties.NAME.localeCompare(b.properties.NAME)).forEach(f=>{const c=catalog.states.find(c=>c.id===f.properties.STATEFP);$('states').add(new Option(f.properties.NAME+(c?'':' · Not yet included'),f.properties.STATEFP));});
  $('states').addEventListener('change',e=>e.target.value?chooseState(e.target.value):showOverview());$('cities').addEventListener('change',e=>chooseCity(e.target.value));$('areas').addEventListener('change',e=>{if(e.target.value)selectBlock(e.target.value,true);else resetView();});
  ['gradeD','gradeABC','gradeOther'].forEach(id=>$(id).addEventListener('change',queueDraw));$('national').onclick=()=>showOverview();$('south').onclick=()=>showOverview('South');$('west').onclick=()=>showOverview('West');$('reset').onclick=resetView;
  $('zoomIn').onclick=()=>d3.select(canvas).transition().call(zoom.scaleBy,1.7);$('zoomOut').onclick=()=>d3.select(canvas).transition().call(zoom.scaleBy,1/1.7);
  $('historical').addEventListener('change',e=>{if(e.target.value!=='')chooseHistorical(Number(e.target.value));});$('up').onclick=goUp;buildStateResults();
  canvas.addEventListener('click',async e=>{const xy=d3.pointer(e,canvas);const target=mapHit(xy);if(!target)return;
    if(target.kind==='historical'){if(target.state!==current?.id)await chooseState(target.state);if(current?.id===target.state&&data)chooseHistorical(target.index);}
    else if(target.kind==='block')selectBlock(target.id);
    else chooseState(target.id);
  });
  canvas.addEventListener('mousemove',e=>{const xy=d3.pointer(e,canvas),target=mapHit(xy),tip=$('tip');if(!target){tip.hidden=true;return;}tip.textContent=target.label;tip.style.left=Math.min(xy[0]+12,W-240)+'px';tip.style.top=Math.max(6,xy[1]-34)+'px';tip.hidden=false;});canvas.addEventListener('mouseleave',()=>$('tip').hidden=true);
  $('download').onclick=async()=>{if(!current)return;const entry=current,token=requestId,button=$('download');button.disabled=true;button.textContent='Preparing CSV…';status('Preparing '+entry.name+' statistics download…');try{const text=await readGzip('data/'+entry.slug+'.csv.gz');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=entry.slug+'-block-group-statistics.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);if(token===requestId)status(entry.name+' CSV prepared. Check your browser downloads.');}catch(e){if(token===requestId)status('Statistics download failed: '+e.message);}finally{button.disabled=false;button.textContent="Original state CSV · 95% intervals ↓";}};
  $('startPilot').onclick=()=>navigatePilot('historical');$('pilotTrail').querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>navigatePilot(b.dataset.level));$('pilotThreshold').onchange=$('pilotCV').onchange=()=>{selected=null;renderPilotQuery();setTitle(protocolPilot.name,'SOUTH PROJECT STATES › GEORGIA › BIBB COUNTY › MACON-BIBB CITY › D13');queueDraw();};$('pilotExport').onclick=()=>exportPilot(false);$('pilotExcluded').onclick=()=>exportPilot(true);
  const initial=new URLSearchParams(location.hash.slice(1));window.addEventListener('resize',resize);resize();showOverview();if(initial.has('state')){await chooseState(initial.get('state'));if(data&&initial.has('area'))chooseHistorical(Number(initial.get('area')));else if(data&&current?.id==='13'&&['city','county'].includes(initial.get('level')))showPilotGeography(initial.get('level'));}
}

function resetView(){if(selectedHistorical!==null)chooseHistorical(selectedHistorical);else if(view?.official)showPilotGeography(view.kind);else if(data)chooseCity($('cities').value);else if(view)fit(view.fc);}
function pilotIndex(){return data?.historical.features.findIndex(f=>String(f.properties.area_id)==='4063')??-1;}
function inPilot(){return current?.id==='13'&&view?.kind==='historical'&&data?.historical.features[selectedHistorical]?.properties.area_id==4063;}
function summaryHTML(s){return '<div class="big-rate">'+pct(s.rate)+'</div><p>Households reporting internet access · ACS '+s.period+'</p><div class="stat-grid"><span>90% interval</span><strong>'+pct(s.low90)+'–'+pct(s.high90)+'</strong><span>90% margin</span><strong>±'+s.moe90.toFixed(1)+' pp</strong><span>Estimated households</span><strong>'+fmt(s.households)+'</strong><span>Reporting internet</span><strong>'+fmt(s.internet_households)+'</strong><span>Source geography</span><strong>'+s.id+'</strong></div><p><small>Published counts for this exact '+s.kind+' geography; no average of neighborhood percentages. '+s.method+'.</small></p>';}
function showPilotGeography(kind){if(current?.id!=='13'||!data)return;clearSelection();const s=protocolPilot.summaries[kind];view={kind,name:s.name,fc:protocolPilot.geographies[kind],official:true};$('cities').value=kind==='city'?'macon':'';populateHistorical('Macon');$('detailTitle').textContent=s.name;$('detail').innerHTML=summaryHTML(s)+'<p><small>City and county are separate Census records. Their estimates happen to match in this release; they are never added together. Black dashed line: selected geography. Blue shading remains Census block-group detail, not the '+kind+' summary.</small></p>';$('mapNote').textContent='Census block-group detail; the summary panel uses the named official '+kind+' geography.';setTitle(s.name,'SOUTH PROJECT STATES › GEORGIA › '+(kind==='city'?'BIBB COUNTY › CITY':'BIBB COUNTY'));$('up').disabled=false;$('up').textContent=kind==='city'?'↑ Bibb County':'↑ Georgia';history.replaceState(null,'','#state=13&level='+kind);fit(view.fc);status(s.name+' · published '+kind+' estimate '+pct(s.rate)+'.');syncPilotTrail();queueDraw();}
async function navigatePilot(level){if(level==='region'){showOverview('South');return;}if(current?.id!=='13'||!data)await chooseState('13');if(current?.id!=='13'||!data)return;if(level==='historical')chooseHistorical(pilotIndex());else if(level==='state'){chooseCity('');}else showPilotGeography(level);}
function syncPilotTrail(){const host=$('pilotTrail');host.hidden=current?.id!=='13'&&view?.name!=='South';host.querySelectorAll('[data-level]').forEach(b=>{if(b.dataset.level===(view?.name==='South'?'region':view?.kind))b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
function renderPilotQuery(){if(!inPilot())return;const threshold=Number($('pilotThreshold').value),cv=$('pilotCV').checked;pilotQuery=AtlasProtocol.query(protocolPilot,threshold,cv);$('pilotQuery').hidden=false;$('areas').value='';$('detailTitle').textContent=protocolPilot.name;$('detail').innerHTML='<p><strong>'+pilotQuery.selected.length+' of 6 linked Census groups selected</strong></p><p>Whole Census estimates cross D13. No percentage is calculated solely within the historical boundary.</p><div class="area-table"><table><thead><tr><th>Census GEOID</th><th>Access</th><th>90% margin</th></tr></thead><tbody>'+pilotQuery.selected.map(r=>'<tr><td><button class="text-button" data-block="'+r.GEOID+'">'+r.GEOID+'</button></td><td>'+pct(r.rate)+'</td><td>±'+r.moe90.toFixed(1)+' pp</td></tr>').join('')+'</tbody></table></div><p><small>Protocol v1.0 · ACS 2020–2024 · overlap >1 m² · unrounded point-estimate filter. '+pilotQuery.excluded.length+' excluded by this query; unfilled outlines remain as context. Other nonlinked groups are also unfilled.</small></p><p><small>56.9% remains 132 of 232 estimated households, with a 90% margin of ±28.7 pp. Historical georeferencing uncertainty is not quantified.</small></p>';$('detail').querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>selectBlock(b.dataset.block,true));$('pilotRun').textContent='PH_D13_v1_'+(threshold===101?'all':'lt'+threshold)+(cv?'_CV30':'')+' · '+pilotQuery.selected.length+' results';status('Pleasant Hill query: '+pilotQuery.selected.length+' selected, '+pilotQuery.excluded.length+' excluded. Map and CSV use the same IDs.');}
function exportPilot(excluded){if(!pilotQuery)return;const rows=excluded?pilotQuery.excluded:pilotQuery.selected;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([AtlasProtocol.csv(rows)],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=$('pilotRun').textContent.split(' · ')[0]+(excluded?'_excluded':'_results')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
// Extend the existing navigation without replacing other states' snapshots.
const baseChooseState=chooseState;chooseState=async function(id){await baseChooseState(id);if(current?.id==='13'&&data&&protocolPilot){protocolPilot.blocks.features.forEach(f=>{const i=data.blocks.features.findIndex(x=>x.properties.GEOID===f.properties.GEOID);if(i>=0){data.blocks.features[i].geometry=f.geometry;data.blocks.features[i].properties.protocol90=f.properties;}});const i=pilotIndex();if(i>=0)data.historical.features[i].geometry=protocolPilot.historical.geometry;rebuildPaths();$('cities').options[$('cities').options.length-1].text='Pleasant Hill · historical D13';queueDraw();}syncPilotTrail();};
const baseChooseCity=chooseCity;chooseCity=function(value){if(current?.id==='13'&&data){if(value==='pleasant'){chooseHistorical(pilotIndex());return;}if(value==='macon'||value.startsWith('city:')&&current.cities[Number(value.split(':')[1])]?.name==='Macon'){showPilotGeography('city');return;}}baseChooseCity(value);syncPilotTrail();};
const baseHistorical=chooseHistorical;chooseHistorical=function(index){baseHistorical(index);if(inPilot()){setTitle(protocolPilot.name,'SOUTH PROJECT STATES › GEORGIA › BIBB COUNTY › MACON-BIBB CITY › D13');renderPilotQuery();$('up').textContent='↑ Macon-Bibb city';$('mapNote').textContent='1937 D13 boundary in red; selected full Census estimates use 65% blue shading. Unfilled areas are outside the query.';}syncPilotTrail();};
const baseStateStats=showStateStats;showStateStats=function(){if(current?.id==='13'&&protocolPilot){$('detailTitle').textContent='Georgia statewide benchmark';$('detail').innerHTML=summaryHTML(protocolPilot.summaries.state);return;}baseStateStats();};
const baseBlock=selectBlock;selectBlock=function(id,zoomTo=false){baseBlock(id,zoomTo);const r=current?.id==='13'?protocolPilot?.blocks.features.find(f=>f.properties.GEOID===id)?.properties:null;if(r){$('detail').innerHTML=summaryHTML({...r,kind:'Census block group'})+'<p><small>Whole Census block group crossing D13. CV '+r.cv.toFixed(1)+'%. '+(pilotQuery?(pilotQuery.selected.some(x=>x.GEOID===id)?'Included in the current query.':'Excluded from the current query.'):'')+' Query export includes all matching groups, not only this selection.</small></p>';}};
const baseOverview=showOverview;showOverview=function(region='United States'){baseOverview(region);syncPilotTrail();if(region!=='United States'){$('up').disabled=false;$('up').textContent='↑ United States';const s=AtlasProtocol.region(catalog,region);$('detailTitle').textContent=s.name;$('detail').innerHTML='<div class="big-rate">'+pct(s.rate)+'</div><p>Households reporting internet access across the '+s.members.length+' included project states.</p><p>'+fmt(s.internet)+' of '+fmt(s.households)+' estimated households.</p><small>Custom coverage: '+s.members.join(', ')+'. Sum of published state counts, not an average of percentages. This is not the full Census '+region+' region. Aggregate uncertainty has not been calculated. Blue shading remains block-group detail.</small>';setTitle(s.name,region.toUpperCase()+' · INCLUDED PROJECT STATES');}};
const baseUp=goUp;goUp=function(){if(current?.id==='13'){if(selected&&view?.official){showPilotGeography(view.kind);return;}if(!selected){if(view?.kind==='historical'&&view.city==='Macon'){showPilotGeography('city');return;}if(view?.kind==='city'&&view.official){showPilotGeography('county');return;}if(view?.kind==='county'){chooseCity('');return;}}}baseUp();};
init().catch(e=>{status('Map unavailable: '+e.message);$('detail').textContent='Please reload. No estimates are shown while the data is unavailable.';});
