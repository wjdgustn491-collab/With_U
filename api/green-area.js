'use strict';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 지원합니다.'});
  const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)
    return res.status(400).json({error:'유효한 위도·경도가 필요합니다.'});
  const around=`around:500,${lat.toFixed(7)},${lon.toFixed(7)}`;
  const query='[out:json][timeout:25];('+
    `way(${around})["landuse"~"^(forest|grass|meadow|village_green|orchard)$"];`+
    `way(${around})["natural"~"^(wood|grassland|scrub)$"];`+
    `way(${around})["leisure"~"^(park|garden|nature_reserve)$"];);out geom;`;
  try{
    const upstream=await fetch('https://overpass-api.de/api/interpreter',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'WITH-U-green-area/1.0'},
      body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(27000),redirect:'error'});
    if(!upstream.ok)throw Error('upstream '+upstream.status);
    const data=await upstream.json();
    if(!Array.isArray(data.elements)||data.elements.length>5000)throw Error('invalid response');
    return res.status(200).json({elements:data.elements});
  }catch(error){console.error('Overpass query failed:',error.message);return res.status(502).json({error:'녹지 지도 자료 조회에 실패했습니다. 잠시 후 다시 시도하세요.'});}
};

