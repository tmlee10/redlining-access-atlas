'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString('en-US');
const pct=n=>n==null?'No estimate':Number(n).toFixed(1)+'%';
const colors=['#b1d6f2','#8dbbe8','#6798cc','#4c76ad','#32547c'];
const color=p=>p==null?'#e7e7e7':colors[p<60?0:p<70?1:p<80?2:p<90?3:4];
const SOUTH=new Set('AL AR DE FL GA KY LA MD MS NC OK SC TN TX VA WV'.split(' '));
const WEST=new Set('AK AZ CA CO HI ID MT NV NM OR UT WA WY'.split(' '));
let catalog,states,projection,path,ctx,canvas,zoom,W,H,transform=d3.zoomIdentity;
let current=null,data=null,selected=null,view=null,requestId=0,cache=new Map(),stateShapes=[],bgShapes=[],histShapes=[];
let drawPending=false;
let roads=null,roadShapes=[],roadsLoading=false;
function status(s){$('status').textContent=s;}
function collection(features){return {type:'FeatureCollection',features};}
function shapes(fc){return fc.features.map(f=>({f,p:new Path2D(path(f)),b:path.bounds(f)}));}
function queueDraw(){if(!drawPending){drawPending=true;requestAnimationFrame(()=>{drawPending=false;draw();});}}
function rebuildPaths(){stateShapes=shapes(states);bgShapes=data?shapes(data.blocks):[];histShapes=data?shapes(data.historical):[];roadShapes=roads?shapes(roads):[];}
async function loadRoads(){if(!current||!data||roads||roadsLoading||transform.k<25)return;roadsLoading=true;const id=current.id,token=requestId;
  try{const loaded=JSON.parse(await readGzip('data/'+current.slug+'-roads.json.gz'));if(token!==requestId||current?.id!==id)return;roads=loaded;roadShapes=shapes(roads);queueDraw();}catch(e){if(token===requestId)status('Access data loaded; street context could not be loaded.');}finally{if(token===requestId)roadsLoading=false;}
}
function onScreen(s){const a=transform.apply(s.b[0]),b=transform.apply(s.b[1]);return b[0]>=0&&a[0]<=W&&b[1]>=0&&a[1]<=H;}
function draw(){
  const ratio=window.devicePixelRatio||1;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
  ctx.save();ctx.translate(transform.x,transform.y);ctx.scale(transform.k,transform.k);
  stateShapes.forEach(s=>{ctx.fillStyle=current?'#ede9df':catalog.states.some(c=>c.id===s.f.properties.STATEFP)?'#407b82':'#dedfdc';ctx.fill(s.p);ctx.strokeStyle='#fff';ctx.lineWidth=.7/transform.k;ctx.stroke(s.p);});
  if(data){
    bgShapes.filter(onScreen).forEach(s=>{ctx.fillStyle=color(s.f.properties.internet_pct);ctx.fill(s.p);if(transform.k>5){ctx.strokeStyle='#ffffff70';ctx.lineWidth=.35/transform.k;ctx.stroke(s.p);}});
    if(transform.k>25){ctx.strokeStyle='#ffffffe0';ctx.lineWidth=.65/transform.k;roadShapes.filter(s=>onScreen(s)&&(transform.k>100||['S1100','S1200'].includes(s.f.properties.MTFCC))).forEach(s=>ctx.stroke(s.p));}
    histShapes.filter(onScreen).forEach(s=>{const g=s.f.properties.grade;if(!(g==='D'?$('gradeD').checked:g==='Other'?$('gradeOther').checked:$('gradeABC').checked))return;ctx.strokeStyle=g==='D'?'#c02736':g==='Other'?'#6b5c7e':'#4b7350';ctx.lineWidth=(transform.k>8?1.8:1.1)/transform.k;ctx.setLineDash(g==='D'?[]:[4/transform.k,3/transform.k]);ctx.stroke(s.p);});ctx.setLineDash([]);
    if(view?.kind==='pleasant'){ctx.strokeStyle='#151d24';ctx.lineWidth=1.6/transform.k;ctx.setLineDash([2/transform.k,3/transform.k]);ctx.stroke(new Path2D(path(data.extras.pleasant_hill_view)));ctx.setLineDash([]);}
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
  if(transform.k<4){stateShapes.forEach(s=>{const p=path.centroid(s.f),xy=transform.apply(p);if(xy[0]<15||xy[0]>W-15||xy[1]<12||xy[1]>H-12)return;ctx.fillStyle=!current&&catalog.states.some(c=>c.id===s.f.properties.STATEFP)?'#fff':'#64716d';ctx.fillText(s.f.properties.STUSPS,xy[0],xy[1]);});}
  if(current && transform.k>=4){current.cities.forEach(c=>{const xy=transform.apply(path.centroid(c.boundary));if(xy[0]<30||xy[0]>W-30||xy[1]<15||xy[1]>H-15)return;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(c.name,xy[0],xy[1]);ctx.fillStyle='#263e48';ctx.fillText(c.name,xy[0],xy[1]);});}
}
function fit(fc,animate=true){const [[x0,y0],[x1,y1]]=path.bounds(fc);const k=Math.min(10000,.86/Math.max((x1-x0)/W,(y1-y0)/H));const t=d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2);const s=d3.select(canvas);(animate?s.transition().duration(550):s).call(zoom.transform,t);}
function clearSelection(){selected=null;$('areas').value='';}
function setTitle(title,crumb){$('viewTitle').textContent=title;$('breadcrumb').textContent=crumb;document.title=title+' | Access Atlas';}
function showOverview(region='United States'){
  requestId++;current=null;data=null;roads=null;roadShapes=[];roadsLoading=false;clearSelection();bgShapes=[];histShapes=[];$('states').value='';$('cities').disabled=true;$('cities').replaceChildren(new Option('Choose a state first',''));$('areaLabel').hidden=true;$('download').hidden=true;$('coverageLegend').hidden=false;$('accessLegend').hidden=true;
  view={kind:'overview',name:region,fc:region==='United States'?states:collection(states.features.filter(f=>(region==='South'?SOUTH:WEST).has(f.properties.STUSPS)))};
  setTitle(region==='United States'?'South & West study coverage':region+' · study coverage',region.toUpperCase()+' · COVERAGE');$('detailTitle').textContent='Choose a state';$('detail').innerHTML='<p>19 states have detailed data. The other 31 states are shown for geographic context and marked <strong>Not yet included</strong>.</p><p>US benchmark: <strong>'+pct(catalog.national.internet_pct)+'</strong> of households reporting internet access.</p><small>The national benchmark is separate from this study’s 19-state map coverage.</small>';
  $('mapNote').textContent='Alaska and Hawaii are shown as insets, not in their geographic positions.';status('Select a colored state to explore its Census areas and historical outlines.');fit(view.fc);queueDraw();
}
async function readGzip(url){const response=await fetch(url);if(!response.ok)throw new Error('Download failed ('+response.status+')');if(!('DecompressionStream' in window))throw new Error('Please use a current Chrome, Edge, Firefox or Safari browser.');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes[0]!==31||bytes[1]!==139)return new TextDecoder().decode(bytes);return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
async function chooseState(id){
  const token=++requestId;clearSelection();data=null;roads=null;roadShapes=[];roadsLoading=false;bgShapes=[];histShapes=[];current=catalog.states.find(s=>s.id===id)||null;
  const state=states.features.find(f=>f.properties.STATEFP===id);if(!state)return;
  $('states').value=id;$('areaLabel').hidden=true;$('download').hidden=true;$('cities').disabled=true;$('cities').replaceChildren(new Option('Choose a city / view',''));view={kind:'state',name:state.properties.NAME,fc:state};fit(state);setTitle(state.properties.NAME,current?'STATE · HOUSEHOLDS REPORTING INTERNET ACCESS':'STATE · NOT YET INCLUDED');
  $('detailTitle').textContent=state.properties.NAME;$('coverageLegend').hidden=!!current;$('accessLegend').hidden=!current;$('mapNote').textContent='Statistics describe full Census block groups. Historical outlines do not redefine the estimates.';
  if(!current){$('detail').innerHTML='<p><strong>Not yet included.</strong> No access estimates are displayed for this state. This does not establish whether historical redlining occurred here.</p>';status(state.properties.NAME+' is geographic context only.');queueDraw();return;}
  const entry=current;$('detail').innerHTML='<p>Loading '+entry.blocks.toLocaleString()+' Census areas…</p>';status('Loading '+entry.name+' ('+(entry.bytes/1e6).toFixed(1)+' MB). Other states are not downloaded.');queueDraw();
  try{
    if(!cache.has(id))cache.set(id,readGzip('data/'+entry.slug+'.json.gz').then(JSON.parse).catch(e=>{cache.delete(id);throw e;}));
    const loaded=await cache.get(id);if(token!==requestId)return;data=loaded;rebuildPaths();
    entry.cities.forEach((c,i)=>$('cities').add(new Option(c.name+' · '+c.gradeD+' Grade D areas','city:'+i)));
    if(data.extras.pleasant_hill_view){$('cities').add(new Option('Macon-Bibb County','macon'));$('cities').add(new Option('Pleasant Hill · reference view','pleasant'));}
    $('cities').disabled=false;$('areas').replaceChildren(new Option('Select a Census block group',''));
    const options=document.createDocumentFragment();data.blocks.features.forEach(f=>options.appendChild(new Option(f.properties.GEOID+' · '+pct(f.properties.internet_pct),f.properties.GEOID)));$('areas').appendChild(options);$('areaLabel').hidden=false;$('download').hidden=false;showStateStats();status(entry.name+' loaded: '+fmt(entry.blocks)+' Census areas · '+fmt(entry.historicalAreas)+' historical archive areas.');queueDraw();
    // Keep up to three states cached. A large national download is never required.
    while(cache.size>3){const first=cache.keys().next().value;if(first===id)break;cache.delete(first);}
  }catch(e){if(token!==requestId)return;$('detail').textContent='Could not load this state. Select it again to retry. '+e.message;status('State download failed. No estimates have been substituted.');}
}
function showStateStats(){
  if(!current)return;const b=current.benchmark;$('detailTitle').textContent=current.name+' benchmark';$('detail').innerHTML='<div class="big-rate">'+pct(b.internet_pct)+'</div><p class="metric-sub">Households reporting internet access</p><div class="stat-grid"><span>95% interval</span><strong>'+pct(b.ci95_low)+'–'+pct(b.ci95_high)+'</strong><span>Estimated households</span><strong>'+fmt(b.estimated_households)+'</strong><span>Block groups with estimates</span><strong>'+fmt(current.estimates)+'</strong><span>Zero-household block groups</span><strong>'+fmt(current.noEstimate)+'</strong><span>Standard Grade D areas</span><strong>'+fmt(current.gradeD)+'</strong></div><small>This is the published state-level household estimate, not an average of neighborhood percentages. Select a Census area for its own statistics.</small>';
}
function chooseCity(value){if(!data)return;clearSelection();showStateStats();
  if(value==='pleasant'){view={kind:'pleasant',name:'Pleasant Hill · reference view',fc:data.extras.pleasant_hill_view};}
  else if(value==='macon'){view={kind:'city',name:'Macon-Bibb County',fc:data.extras.macon_boundary};}
  else if(value.startsWith('city:')){const c=current.cities[Number(value.split(':')[1])];const grades=data.historical.features.filter(f=>f.properties.city===c.name).map(f=>f.properties.grade);if(!grades.includes('D')){if(grades.includes('Other'))$('gradeOther').checked=true;if(grades.some(g=>'ABC'.includes(g)))$('gradeABC').checked=true;}view={kind:'city',name:c.name+' · historical map extent',fc:c.boundary};}
  else{view={kind:'state',name:current.name,fc:states.features.find(s=>s.properties.STATEFP===current.id)};}
  setTitle(view.name,current.name.toUpperCase()+' · '+(view.kind==='state'?'STATE':'LOCAL VIEW'));fit(view.fc);status('View: '+view.name+'. Select a Census block group for statistics; the view itself is not a separate estimate.');queueDraw();
}
function selectBlock(id,zoomTo=false){if(!data)return;const f=data.blocks.features.find(f=>f.properties.GEOID===id);if(!f)return;selected=id;$('areas').value=id;const p=f.properties;
  setTitle('Census block group '+id,current.name.toUpperCase()+' · SELECTED CENSUS AREA');$('detailTitle').textContent='Block group '+id;
  $('detail').innerHTML='<div class="big-rate">'+pct(p.internet_pct)+'</div><p class="metric-sub">Households reporting internet access</p><div class="stat-grid"><span>95% interval</span><strong>'+(p.internet_pct==null?'Not applicable':pct(p.ci95_low)+'–'+pct(p.ci95_high))+'</strong><span>Estimated households</span><strong>'+fmt(p.estimated_households)+'</strong><span>Reporting internet</span><strong>'+fmt(p.internet_households)+'</strong><span>Reporting no internet</span><strong>'+fmt(p.no_internet_households)+'</strong><span>State benchmark</span><strong>'+pct(current.benchmark.internet_pct)+'</strong><span>US benchmark</span><strong>'+pct(catalog.national.internet_pct)+'</strong></div><small>'+(p.precision_flag?p.precision_flag+'. ':'')+'These figures describe the entire yellow-outlined Census block group, not just its historically redlined portion.</small><p><small>Uncertainty: '+p.uncertainty_method+'.</small></p>';
  status('Selected '+id+' · '+pct(p.internet_pct)+' · ACS 2020–2024.');if(zoomTo)fit(f);queueDraw();
}
function hit(list,xy){const p=transform.invert(xy);return list.find(s=>p[0]>=s.b[0][0]&&p[0]<=s.b[1][0]&&p[1]>=s.b[0][1]&&p[1]<=s.b[1][1]&&ctx.isPointInPath(s.p,p[0],p[1]));}
function resize(){const rect=canvas.parentElement.getBoundingClientRect();W=rect.width;H=rect.height;const ratio=window.devicePixelRatio||1;canvas.width=W*ratio;canvas.height=H*ratio;projection=d3.geoAlbersUsa().fitExtent([[35,35],[W-35,H-40]],states);path=d3.geoPath(projection);rebuildPaths();fit(selected?data.blocks.features.find(f=>f.properties.GEOID===selected):view?.fc||states,false);}
async function init(){
  [catalog,states]=await Promise.all(['data/catalog.json','data/states.json'].map(u=>fetch(u).then(r=>{if(!r.ok)throw Error('Overview unavailable');return r.json();})));
  $('totalBlocks').textContent=fmt(catalog.totals.blocks);canvas=$('map');ctx=canvas.getContext('2d');
  zoom=d3.zoom().scaleExtent([.7,10000]).on('zoom',e=>{transform=e.transform;queueDraw();loadRoads();});d3.select(canvas).call(zoom).on('dblclick.zoom',null);
  $('states').replaceChildren(new Option('Choose a state',''));states.features.slice().sort((a,b)=>a.properties.NAME.localeCompare(b.properties.NAME)).forEach(f=>{const c=catalog.states.find(c=>c.id===f.properties.STATEFP);$('states').add(new Option(f.properties.NAME+(c?'':' · Not yet included'),f.properties.STATEFP));});
  $('states').addEventListener('change',e=>e.target.value?chooseState(e.target.value):showOverview());$('cities').addEventListener('change',e=>chooseCity(e.target.value));$('areas').addEventListener('change',e=>{if(e.target.value)selectBlock(e.target.value,true);else chooseCity($('cities').value);});
  ['gradeD','gradeABC','gradeOther'].forEach(id=>$(id).addEventListener('change',queueDraw));$('national').onclick=()=>showOverview();$('south').onclick=()=>showOverview('South');$('west').onclick=()=>showOverview('West');$('reset').onclick=()=>{if(data)chooseCity($('cities').value);else if(view)fit(view.fc);};
  $('zoomIn').onclick=()=>d3.select(canvas).transition().call(zoom.scaleBy,1.7);$('zoomOut').onclick=()=>d3.select(canvas).transition().call(zoom.scaleBy,1/1.7);
  canvas.addEventListener('click',e=>{const xy=d3.pointer(e,canvas);ctx.save();ctx.setTransform(1,0,0,1,0,0);const bg=hit(bgShapes,xy);const st=bg?null:hit(stateShapes,xy);ctx.restore();if(bg)selectBlock(bg.f.properties.GEOID);else if(st)chooseState(st.f.properties.STATEFP);});
  canvas.addEventListener('mousemove',e=>{const xy=d3.pointer(e,canvas);ctx.save();ctx.setTransform(1,0,0,1,0,0);const bg=hit(bgShapes,xy),st=bg?null:hit(stateShapes,xy);ctx.restore();const tip=$('tip');if(!bg&&!st){tip.hidden=true;return;}tip.textContent=bg?'Census '+bg.f.properties.GEOID+' · '+pct(bg.f.properties.internet_pct):st.f.properties.NAME+' · '+(catalog.states.some(c=>c.id===st.f.properties.STATEFP)?'Data included':'Not yet included');tip.style.left=Math.min(xy[0]+12,W-240)+'px';tip.style.top=Math.max(6,xy[1]-34)+'px';tip.hidden=false;});canvas.addEventListener('mouseleave',()=>$('tip').hidden=true);
  $('download').onclick=async()=>{if(!current)return;const entry=current,token=requestId,button=$('download');button.disabled=true;button.textContent='Preparing CSV…';status('Preparing '+entry.name+' statistics download…');try{const text=await readGzip('data/'+entry.slug+'.csv.gz');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=entry.slug+'-block-group-statistics.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);if(token===requestId)status(entry.name+' CSV prepared. Check your browser downloads.');}catch(e){if(token===requestId)status('Statistics download failed: '+e.message);}finally{button.disabled=false;button.textContent="Download this state's statistics ↓";}};
  window.addEventListener('resize',resize);resize();showOverview();
}
init().catch(e=>{status('Map unavailable: '+e.message);$('detail').textContent='Please reload. No estimates are shown while the data is unavailable.';});
