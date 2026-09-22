'use strict';
// OpenStreetMap polygons projected to local metres and sampled on a 20 m grid.
// This is a map-data estimate, not classification of satellite pixels.
const GreenArea = (() => {
  const radius = 500, step = 20;
  const green = e => {
    const t = e.tags || {};
    return ['forest','grass','meadow','village_green','orchard'].includes(t.landuse) ||
      ['wood','grassland','scrub'].includes(t.natural) ||
      ['park','garden','nature_reserve'].includes(t.leisure);
  };
  function project(lat, lon, center) {
    const r = Math.PI / 180;
    return [(lon-center[1])*111320*Math.cos(center[0]*r), (lat-center[0])*111320];
  }
  function inside(point, ring) {
    let hit = false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if ((a[1]>point[1]) !== (b[1]>point[1]) &&
          point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
    }
    return hit;
  }
  function estimate(elements, center) {
    const ways = elements.filter(e => e.type === 'way' && green(e) &&
      Array.isArray(e.geometry) && e.geometry.length >= 4 &&
      e.geometry.length <= 5000 && e.geometry[0].lat === e.geometry.at(-1).lat &&
      e.geometry[0].lon === e.geometry.at(-1).lon).slice(0,1000);
    const rings = ways.map(e => e.geometry.map(p => project(p.lat,p.lon,center)));
    let hits=0, cells=0;
    for (let y=-radius+step/2;y<radius;y+=step) for (let x=-radius+step/2;x<radius;x+=step) {
      if (x*x+y*y>radius*radius) continue;
      cells++;
      if (rings.some(r => inside([x,y],r))) hits++;
    }
    return {squareMetres:hits*step*step, radiusMetres:radius, mappedPolygons:ways.length,
      sampledSquareMetres:cells*step*step, geometries:ways.map(e=>e.geometry.map(p=>[p.lat,p.lon]))};
  }
  async function fetchEstimate(center) {
    if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) throw Error('유효한 장치 좌표가 필요합니다.');
    const [lat,lon]=center;
    const filter='["landuse"~"^(forest|grass|meadow|village_green|orchard)$"]'+
      ';way(around:500,'+lat+','+lon+')["natural"~"^(wood|grassland|scrub)$"]'+
      ';way(around:500,'+lat+','+lon+')["leisure"~"^(park|garden|nature_reserve)$"]';
    const query='[out:json][timeout:25];(way(around:500,'+lat+','+lon+')'+filter+');out geom;';
    const response=await fetch('https://overpass-api.de/api/interpreter',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('녹지 지도 자료 조회에 실패했습니다 ('+response.status+').');
    const data=await response.json();
    if (!Array.isArray(data.elements)) throw Error('녹지 지도 응답 형식이 올바르지 않습니다.');
    return estimate(data.elements,center);
  }
  return {estimate,fetchEstimate};
})();
if (typeof module !== 'undefined') module.exports=GreenArea;

