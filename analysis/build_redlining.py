"""Build web derivatives of reviewed state packages; preserve full-area statistics.
Run with GIS dependencies and ORIGINAL state package roots in --sources.
"""
import argparse, gzip, hashlib, json, shutil
from pathlib import Path
import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping
from shapely.geometry.polygon import orient
from shapely import make_valid

NAMES = 'Alabama Arkansas Florida Georgia Kentucky Louisiana North_Carolina Oklahoma South_Carolina Tennessee Texas Virginia West_Virginia Arizona California Colorado Oregon Utah Washington'.split()
OUT = Path(__file__).resolve().parents[1] / 'dist/data'
FIELDS = ['GEOID','estimated_households','internet_households','no_internet_households','internet_pct','ci95_low','ci95_high','uncertainty_method','precision_flag','pleasant_hill_label']

def safe(v):
    if isinstance(v,dict): return {k:safe(x) for k,x in v.items()}
    if isinstance(v,(list,tuple)): return [safe(x) for x in v]
    if isinstance(v,float): return None if pd.isna(v) else round(v,6)
    return v

def write(path,obj):
    b=json.dumps(safe(obj),separators=(',',':'),allow_nan=False).encode()
    if path.suffix=='.gz': b=gzip.compress(b,compresslevel=9,mtime=0)
    path.write_bytes(b)

def fc(df,fields,tolerance=10):
    df=df.to_crs(5070).copy()
    df.geometry=df.geometry.simplify(tolerance,preserve_topology=True)
    df=df.to_crs(4326)
    # D3's spherical polygons use clockwise exterior rings.
    def clockwise(geom):
        if geom.geom_type=='Polygon': return orient(geom,sign=-1)
        if geom.geom_type=='MultiPolygon':
            from shapely.geometry import MultiPolygon
            return MultiPolygon([orient(p,sign=-1) for p in geom.geoms])
        return geom
    return {'type':'FeatureCollection','features':[{'type':'Feature','properties':{k:r[k] for k in fields},'geometry':mapping(clockwise(r.geometry))} for _,r in df.iterrows()]}

def main():
    p=argparse.ArgumentParser();p.add_argument('--sources',nargs='+',required=True);p.add_argument('--states',required=True);args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    catalog=[]; audit=[]
    for name in NAMES:
        found=[f for root in args.sources for f in Path(root).rglob(name+'_Connected.gpkg')]
        assert found, name
        f=found[0];root=f.parent.parent
        bg=gpd.read_file(f,layer='access_block_groups');h=gpd.read_file(f,layer='historical_holc')
        assert bg.GEOID.is_unique and bg.GEOID.str.len().eq(12).all()
        assert (bg.internet_households+bg.no_internet_households==bg.estimated_households).all()
        valid=bg.estimated_households>0
        assert ((bg.loc[valid,'internet_pct']-100*bg.loc[valid,'internet_households']/bg.loc[valid,'estimated_households']).abs()<1e-8).all()
        assert bg.loc[~valid,'internet_pct'].isna().all()
        if 'archive_grade' not in h: h['archive_grade']=h.grade
        eligible=h.archive_grade.isin(list('ABCD')) & h.city_survey.eq(1) & h.residential.eq(1)
        h['grade']=h.archive_grade.where(eligible,'Other')
        h.geometry=h.geometry.apply(make_valid)
        slug=name.lower().replace('_','-');statefp=str(bg.STATEFP.iloc[0]).zfill(2)
        bench=pd.read_csv(root/(name+'_Benchmarks.csv'));state=bench.loc[bench.name.eq(name.replace('_',' '))].iloc[0].to_dict()
        national=bench.loc[bench.name.eq('United States')].iloc[0].to_dict()
        assert abs(national['internet_pct']-93.494211943873)<1e-8
        cities=[]
        for city,part in h.groupby('city'):
            cities.append({'name':city,'boundary':fc(gpd.GeoDataFrame(geometry=[part.geometry.union_all()],crs=h.crs),[],10),'areas':len(part),'gradeD':int(part.grade.eq('D').sum())})
        extras={}
        if name=='Georgia':
            extras={key:fc(gpd.read_file(f,layer=key),[],0) for key in ['pleasant_hill_view','macon_boundary']}
        write(OUT/(slug+'.json.gz'),{'blocks':fc(bg,FIELDS,10),'historical':fc(h,['area_id','city','label','grade','archive_grade'],2),'extras':extras})
        roads=gpd.read_file(f,layer='streets_context')
        roads['FULLNAME']=roads.FULLNAME.fillna('')
        write(OUT/(slug+'-roads.json.gz'),fc(roads,['FULLNAME','MTFCC'],3))
        manifest=root/'data/input_manifest.json'
        if manifest.exists(): shutil.copyfile(manifest,OUT/(slug+'-sources.json'))
        csv=OUT/(slug+'.csv.gz');csv.write_bytes(gzip.compress(bg[FIELDS].to_csv(index=False).encode(),mtime=0))
        catalog.append({'name':name.replace('_',' '),'id':statefp,'slug':slug,'region':'South' if NAMES.index(name)<13 else 'West','blocks':len(bg),'estimates':int(valid.sum()),'noEstimate':int((~valid).sum()),'historicalAreas':len(h),'gradeD':int(h.grade.eq('D').sum()),'otherHistorical':int(h.grade.eq('Other').sum()),'benchmark':state,'cities':cities,'bytes':(OUT/(slug+'.json.gz')).stat().st_size})
        audit.append({'state':name,'source_geopackage_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'source_blocks':len(bg),'web_blocks':len(bg),'zero_household_areas':int((~valid).sum()),'geometry_valid':bool(bg.is_valid.all()),'household_identity_passed':True,'rate_recalculation_passed':True,'historical_grade_rule':'archive A-D AND city_survey=1 AND residential=1','source_households':int(bg.estimated_households.sum()),'source_access_households':int(bg.internet_households.sum())})
        print(name,len(bg),catalog[-1]['bytes'],flush=True)
    states=gpd.read_file(args.states);states=states[states.STATEFP.astype(int).le(56)&~states.STATEFP.eq('11')]
    assert len(states)==50 and states.STUSPS.isin(['AK','HI']).sum()==2
    write(OUT/'states.json',fc(states,['STATEFP','STUSPS','NAME'],500))
    write(OUT/'catalog.json',{'build':'2026-09-26','period':'2020–2024','national':national,'states':catalog,'totals':{'states':19,'blocks':sum(x['blocks'] for x in catalog),'historicalAreas':sum(x['historicalAreas'] for x in catalog)}})
    write(OUT/'review.json',{'status':'Data checks passed; browser and native GIS runtime checks not performed for this combined site','background_states':50,'included_states':19,'states':audit,'display_geometry':'Block groups simplified by 10 m; historical outlines 2 m; overview states 500 m. Original statistical geography and values retained.'})

if __name__=='__main__':main()
