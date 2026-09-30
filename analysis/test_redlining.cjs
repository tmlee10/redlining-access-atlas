// Simulated DOM + native Canvas: not a live-browser certification.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),zlib=require('zlib');
const base=path.join(__dirname,'../dist');
const d3=require(path.join(base,'vendor/d3.min.js'));
const {createCanvas,Path2D}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const cv=createCanvas(1100,680),context=cv.getContext('2d');
class El{constructor(id){this.id=id;this.value='';this.children=[];this.checked=id==='gradeD';this.style={};this.listeners={};}replaceChildren(...v){this.children=v;}add(v){this.children.push(v);}appendChild(v){if(v.fragment)this.children.push(...v.children);else this.children.push(v);}addEventListener(n,f){this.listeners[n]=f;}querySelectorAll(){return [];}getBoundingClientRect(){return {width:1100,height:680};}}
const els=new Map();const el=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id);};
let frames=[];const pngdir=path.join(__dirname,'../../combined_review');fs.mkdirSync(pngdir,{recursive:true});
const c=vm.createContext({d3,Path2D,console,Option:function(text,value){this.text=text;this.value=value;},window:{devicePixelRatio:1},document:{getElementById:el,createDocumentFragment:()=>Object.assign(new El('fragment'),{fragment:true})},requestAnimationFrame:f=>frames.push(f),setTimeout,Map,Set,URL,Blob,history:{replaceState(){}},location:{pathname:'/',search:''}});
const run=s=>vm.runInContext(s,c);const app=fs.readFileSync(path.join(base,'app.js'),'utf8').replace(/init\(\)\.catch[\s\S]*$/,'');vm.runInContext(app,c);
c.catalogInput=JSON.parse(fs.readFileSync(path.join(base,'data/catalog.json')));c.statesInput=JSON.parse(fs.readFileSync(path.join(base,'data/states.json')));c.realContext=context;c.overviewInput=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(base,'data/connected-overview.json.gz'))));c.linksInput=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(base,'data/historical-census-links.json.gz'))));
run('catalog=catalogInput;states=statesInput;overview=overviewInput;censusLinks=linksInput;ctx=realContext;W=1100;H=680;projection=d3.geoAlbersUsa().fitExtent([[35,35],[W-35,H-40]],states);path=d3.geoPath(projection);');
// Keep the production fit calculation; replace only its DOM transition delivery.
const fitSource=app.match(/function fit\(fc,animate=true\)\{([^]*?)\}\nfunction clearSelection/)[1];
run('fit=function(fc){'+fitSource.replace(/const s=d3.select\(canvas\);[^]*$/,'transform=t;queueDraw();')+'};');
run('rebuildPaths();showOverview();');
function flush(){while(frames.length){let list=frames;frames=[];list.forEach(f=>f());}}
function snapshot(name){flush();fs.writeFileSync(path.join(pngdir,name+'.png'),cv.toBuffer('image/png'));}
function read(name){return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(base,'data/'+name+'.json.gz'))));}
function install(slug){c.loaded=read(slug);c.roadsInput=read(slug+'-roads');run(`current=catalog.states.find(s=>s.slug===${JSON.stringify(slug)});data=loaded;roads=roadsInput;rebuildPaths();view={kind:'state',name:current.name,fc:states.features.find(s=>s.properties.STATEFP===current.id)};fit(view.fc);`);}
assert.equal(run('states.features.length'),50);assert.equal(run('catalog.states.length'),19);assert.equal(run('catalog.totals.blocks'),124362);
assert(run("states.features.some(f=>f.properties.STUSPS==='AK') && states.features.some(f=>f.properties.STUSPS==='HI')"));
assert(run('stateShapes.every(s=>s.b.flat().every(Number.isFinite))'));snapshot('01-national');assert.equal(run('overviewBlocks.length'),124362);assert.equal(run('overviewHistorical.length'),3514);run('showOverview("South")');snapshot('01-south');assert.equal(el('accessLegend').hidden,false);run('showOverview("West")');assert.equal(run('overviewHistorical.length'),3514);snapshot('01-west');
install('georgia');run('chooseCity("pleasant")');snapshot('02-pleasant-hill');
assert(el('viewTitle').textContent.includes('Pleasant Hill'));
const historicalIndex=run('data.historical.features.findIndex(f=>f.properties.city==="Macon" && f.properties.label==="D13")');assert(historicalIndex>=0);run('chooseHistorical('+historicalIndex+')');snapshot('02-macon-d13');assert(el('detail').innerHTML.includes('entire Census block group'));assert(el('detail').innerHTML.includes('56.9%'));assert(run('selectedHistorical!==null'));run('goUp()');assert.equal(run('view.kind'),'city');run('goUp()');assert.equal(run('view.kind'),'state');run('goUp()');assert.equal(run('view.name'),'South');assert.equal(run('overviewBlocks.length'),124362);install('georgia');
const id=run('data.blocks.features.find(f=>f.properties.pleasant_hill_label==="Z2").properties.GEOID');
run(`selectBlock('${id}',true)`);flush();assert(el('viewTitle').textContent.includes(id));assert.equal(el('areas').value,id);assert(el('detail').innerHTML.includes('56.9%'));
assert(run(`selected==='${id}'`));snapshot('03-selected-area');
// True native Canvas point-in-path, after production projection and zoom inversion.
context.setTransform(1,0,0,1,0,0);
assert(run(`(()=>{const s=bgShapes.find(s=>s.f.properties.GEOID==='${id}');const p=transform.apply(path.centroid(s.f));return hit(bgShapes,p)?.f.properties.GEOID==='${id}';})()`));
run('chooseCity("city:0")');assert.equal(run('selected'),null);assert.equal(el('areas').value,'');assert(!el('viewTitle').textContent.includes(id));
const nullId=run('data.blocks.features.find(f=>f.properties.internet_pct==null).properties.GEOID');run(`selectBlock('${nullId}')`);assert(el('detail').innerHTML.includes('No estimate'));assert(!el('detail').innerHTML.includes('NaN'));
install('california');run('fit(view.fc)');snapshot('04-california');
const start=performance.now();run('draw()');const drawMs=performance.now()-start;
run('showOverview()');assert.equal(run('selected'),null);assert.equal(run('data'),null);assert(el('detail').innerHTML.includes('not yet included'));
// A state switch must win over an earlier delayed network response.
let resolveOld;const old=new Promise(r=>resolveOld=r);c.testFetch=async url=>url.includes('georgia')?old:JSON.stringify(read('alabama'));
run('readGzip=testFetch;');
(async()=>{const prior=run('chooseState("13")');await run('chooseState("01")');resolveOld(JSON.stringify(read('georgia')));await prior;assert.equal(run('current.id'),'01');assert.equal(run('data.blocks.features[0].properties.GEOID.slice(0,2)'),'01');
 await run('chooseState("36")');assert.equal(run('data'),null);assert(el('detail').innerHTML.includes('Not yet included'));assert.equal(el('viewTitle').textContent,'New York');
 const result={passed:true,scope:'Simulated DOM + native Canvas projection/rendering/hit testing; not live-browser verification',checks:['Region views retain all 124362 access polygons and 3514 historical areas','Historical D13 shows linked Census rows including 56.9%','Area to city to state to South navigation','50 states including Alaska and Hawaii','19 included states','124362 Census areas','Pleasant Hill Z2 preserved at 56.9%','Selection synchronizes title/dropdown/outline/statistics','View switches clear stale selections','Real Canvas hit test','Zero-household areas show no estimate','Race-safe state loading','Unincluded state shows no data'],california_single_draw_ms:Math.round(drawMs)};
 fs.writeFileSync(path.join(base,'data/connected-interaction-review.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
