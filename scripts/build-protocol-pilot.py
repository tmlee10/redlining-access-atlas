"""Build frozen Pleasant Hill inputs; requires the retained Georgia package.
Usage: python scripts/build-protocol-pilot.py /path/to/ph_recovery
Dependencies: pyproj, pyshp, shapely. Runtime site has no Python dependency.
"""
import csv,gzip,hashlib,json,math,sys
from pathlib import Path
import shapefile
from pyproj import Transformer
from shapely.geometry import shape,mapping
from shapely.ops import transform
root=Path(__file__).resolve().parents[1];src=Path(sys.argv[1]);raw=src/'raw/Georgia_Connected/data/raw';out=root/'dist/data';audit=root/'analysis/protocol-v1';audit.mkdir(exist_ok=True)
rows={r['GEO_ID']:r for r in csv.DictReader(open(raw/'Benchmarks.dat'),delimiter='|')}
def observation(id,name,kind):
 r=rows[id];t,n,mt,mn=[int(r[k]) for k in ['B28002_E001','B28002_E013','B28002_M001','B28002_M013']]
 assert t>0 and 0<=n<=t and t-n==int(r['B28002_E002'])+int(r['B28002_E012'])
 q=n/t;d=mn*mn-q*q*mt*mt;m=100*math.sqrt(d if d>=0 else mn*mn+q*q*mt*mt)/t;rate=100*(t-n)/t
 return dict(id=id,name=name,kind=kind,households=t,internet_households=t-n,no_internet=n,rate=rate,moe90=m,low90=max(0,rate-m),high90=min(100,rate+m),total_moe90=mt,no_internet_moe90=mn,fallback=d<0,period='2020-2024',source='US Census Bureau ACS B28002',method='Published counts; 90% subset approximation')
summaries={k:observation(*v) for k,v in {'city':('1600000US1349008','Macon-Bibb County city geography','city'),'county':('0500000US13021','Bibb County','county'),'state':('0400000US13','Georgia','state')}.items()}
data=json.load(open(src/'Pleasant_Hill_Verification/map_data.json'));ll=Transformer.from_crs(5070,4326,always_xy=True).transform
features=[]
for f in data['blocks']:
 o=observation('1500000US'+f['properties']['GEOID'],f['properties']['GEOID'],'block group');o['GEOID']=f['properties']['GEOID'];o['cv']=100*(o['moe90']/1.645)/o['rate'];features.append(dict(type='Feature',properties=o,geometry=mapping(transform(ll,shape(f['geometry'])))))
shp=src/'raw/Georgia_Connected/arcgis/data/county_boundaries';prj=Transformer.from_crs(shp.with_suffix('.prj').read_text(),4326,always_xy=True).transform
county=next(s for s in shapefile.Reader(str(shp)).iterShapeRecords() if s.record.as_dict()['COUNTYFP']=='021');county=dict(type='Feature',properties={'GEOID':'13021','name':'Bibb County','vintage':2024},geometry=mapping(transform(prj,shape(county.shape.__geo_interface__))))
georgia=json.load(gzip.open(out/'georgia.json.gz'));city=georgia['extras']['macon_boundary'];historical=next(f for f in json.load(open(raw/'Georgia_HOLC.geojson'))['features'] if f['properties']['area_id']==4063)
links=list(csv.DictReader(open(src/'Pleasant_Hill_Verification/area_links.csv')))
pilot=dict(protocol='1.0',build='2026-10-14',site_id='MI_4063',name='Pleasant Hill historical area D13',holc_year=1937,period='2020-2024',metric='hh_reported_internet_access_pct_v1',historical=historical,blocks={'type':'FeatureCollection','features':features},summaries=summaries,geographies={'city':city,'county':county},links=links,source_url='https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b28002.dat',source_sha256=hashlib.sha256((raw/'Benchmarks.dat').read_bytes()).hexdigest(),limitations=['Whole Census block groups cross D13; no D13-only household rate.','Historical georeferencing uncertainty is not quantified.'])
pilot['provenance']={
 'counts_file':'Georgia_Connected/data/raw/Benchmarks.dat',
 'counts_hash_scope':'Retained selected-geography count file, not the complete national source download',
 'historical_file':'Georgia_Connected/data/raw/Georgia_HOLC.geojson',
 'historical_sha256':hashlib.sha256((raw/'Georgia_HOLC.geojson').read_bytes()).hexdigest(),
 'pilot_geometry_file':'Pleasant_Hill_Verification/map_data.json',
 'pilot_geometry_sha256':hashlib.sha256((src/'Pleasant_Hill_Verification/map_data.json').read_bytes()).hexdigest(),
 'pilot_geometry_input_crs':'EPSG:5070',
 'city_geometry_file':'dist/data/georgia.json.gz extras.macon_boundary (retained Macon input layer)',
 'county_geometry_file':'Georgia_Connected/arcgis/data/county_boundaries.shp, COUNTYFP=021',
 'county_shapefile_sha256':hashlib.sha256(shp.with_suffix('.shp').read_bytes()).hexdigest(),
 'display_crs':'EPSG:4326'
}
(out/'pleasant-hill-protocol.json').write_text(json.dumps(pilot,separators=(',',':')))
selected=[rows[k] for k in [*map(lambda f:'1500000US'+f['properties']['GEOID'],features),'1600000US1349008','0500000US13021','0400000US13']]
with open(audit/'B28002_pilot_source.csv','w') as fp:
 w=csv.DictWriter(fp,fieldnames=list(selected[0]));w.writeheader();w.writerows(selected)
(audit/'source-record.json').write_text(json.dumps({k:pilot[k] for k in ['build','period','metric','source_url','source_sha256','provenance','limitations']},indent=2))
print({k:(v['id'],v['rate']) for k,v in summaries.items()})
