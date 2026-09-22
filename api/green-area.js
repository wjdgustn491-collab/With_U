'use strict';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 지원합니다.'});
  const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)
    return res.status(400).json({error:'유효한 위도·경도가 필요합니다.'});
  const dLat=0.005,dLon=0.005/Math.cos(lat*Math.PI/180);
  const bbox=[lon-dLon,lat-dLat,lon+dLon,lat+dLat].map(n=>n.toFixed(7)).join(',');
  try{
    const upstream=await fetch('https://api.openstreetmap.org/api/0.6/map?bbox='+bbox,{
      headers:{'User-Agent':'WITH-U-green-area/1.0'},signal:AbortSignal.timeout(27000),redirect:'error'});
    if(!upstream.ok)throw Error('upstream '+upstream.status);
    const xml=await upstream.text();
    if(xml.length>20000000||!xml.startsWith('<?xml'))throw Error('invalid response');
    const nodes=new Map();
    for(const match of xml.matchAll(/<node\s+[^>]*id="(\d+)"[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*\/?>(?:<\/node>)?/g))
      nodes.set(match[1],{lat:Number(match[2]),lon:Number(match[3])});
    const elements=[];
    for(const match of xml.matchAll(/<way\s+[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)){
      const body=match[2],tags={};
      for(const tag of body.matchAll(/<tag\s+k="([^"]+)"\s+v="([^"]*)"\s*\/>/g))tags[tag[1]]=tag[2];
      const green=/^(forest|grass|meadow|village_green|orchard)$/.test(tags.landuse||'')||/^(wood|grassland|scrub)$/.test(tags.natural||'')||/^(park|garden|nature_reserve)$/.test(tags.leisure||'');
      if(!green)continue;
      const geometry=[...body.matchAll(/<nd\s+ref="(\d+)"\s*\/>/g)].map(nd=>nodes.get(nd[1])).filter(Boolean);
      if(geometry.length>=4)elements.push({type:'way',id:match[1],tags,geometry});
      if(elements.length>=1000)break;
    }
    return res.status(200).json({elements});
  }catch(error){console.error('OSM map query failed:',error.message);return res.status(502).json({error:'녹지 지도 자료 조회에 실패했습니다. 잠시 후 다시 시도하세요.'});}
};

