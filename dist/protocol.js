/* Pure query functions shared by the atlas and its regression tests. */
(function(root){
 const api={
  query(pilot,threshold=101,cv=false){const all=pilot.blocks.features.map(f=>f.properties);const selected=all.filter(r=>Number.isFinite(r.rate)&&r.rate<threshold&&(!cv||(Number.isFinite(r.cv)&&r.cv<=30)));return {selected,excluded:all.filter(r=>!selected.includes(r)).map(r=>({...r,reason:!Number.isFinite(r.rate)?'missing_estimate':r.rate>=threshold?'threshold':'CV_above_30_or_unassessable'}))};},
  region(catalog,name){const members=catalog.states.filter(s=>s.region===name);const households=members.reduce((n,s)=>n+s.benchmark.estimated_households,0),internet=members.reduce((n,s)=>n+s.benchmark.internet_households,0);return {name:'Included '+name+' project states',members:members.map(s=>s.name),households,internet,rate:100*internet/households,uncertainty:null,method:'Sum of published state counts; no mean of percentages'};},
  parent(kind){return {historical:'city',city:'county',county:'state',state:'region',region:'national'}[kind]||'national';},
  csv(rows){const keys=['GEOID','period','households','internet_households','rate','moe90','low90','high90','cv','reason'];return [keys.join(','),...rows.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n');}
 };root.AtlasProtocol=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
