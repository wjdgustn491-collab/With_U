'use strict';
// Estimate one mapped green parcel at the device, clipped to a 100 m radius.
// OpenStreetMap boundaries are not a classification of satellite pixels.
const GreenArea = (() => {
  const radius = 100, nearbyLimit = 30, step = 5;
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
  function unproject(x,y,center){
    return [center[0]+y/111320,center[1]+x/(111320*Math.cos(center[0]*Math.PI/180))];
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
  function area(ring) {
    let sum=0;
    for(let i=0;i<ring.length-1;i++)sum+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
    return Math.abs(sum)/2;
  }
  function distanceToRing(ring) {
    let best=Infinity;
    for(let i=0;i<ring.length-1;i++){
      const [ax,ay]=ring[i], [bx,by]=ring[i+1], dx=bx-ax, dy=by-ay;
      const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
      best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
    }
    return best;
  }
  function estimate(elements, center) {
    const candidates = elements.filter(e => e.type === 'way' && green(e) &&
      Array.isArray(e.geometry) && e.geometry.length >= 4 &&
      e.geometry.length <= 5000 && e.geometry[0].lat === e.geometry.at(-1).lat &&
      e.geometry[0].lon === e.geometry.at(-1).lon).slice(0,1000)
      .map(e=>({way:e,ring:e.geometry.map(p=>project(p.lat,p.lon,center))}));
    const containing=candidates.filter(c=>inside([0,0],c.ring));
    // A smaller mapped parcel is more specific than a surrounding park boundary.
    const selected=containing.length
      ? containing.reduce((best,c)=>area(c.ring)<area(best.ring)?c:best)
      : candidates.map(c=>({...c,distance:distanceToRing(c.ring)}))
        .filter(c=>c.distance<=nearbyLimit)
        .sort((a,b)=>a.distance-b.distance || area(a.ring)-area(b.ring))[0];
    let hits=0, cells=0;
    const patches=[];
    for(let y=-radius+step/2;y<radius;y+=step){
      let run=null;
      for(let x=-radius+step/2;x<=radius+step/2;x+=step){
        const inCircle=x*x+y*y<=radius*radius;
        if(inCircle)cells++;
        const hit=inCircle&&selected&&inside([x,y],selected.ring);
        if(hit){hits++;if(run===null)run=x-step/2;}
        if(!hit&&run!==null){
          patches.push([unproject(run,y-step/2,center),unproject(x-step/2,y+step/2,center)]);
          run=null;
        }
      }
    }
    return {squareMetres:hits*step*step, radiusMetres:radius,mappedPolygons:selected?1:0,
      selectionMode:selected?(containing.length?'contains':'nearest'):'none',
      distanceMetres:selected?(containing.length?0:selected.distance):null,
      sampledSquareMetres:cells*step*step,patches};
  }
  async function fetchEstimate(center) {
    if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) throw Error('유효한 장치 좌표가 필요합니다.');
    const [lat,lon]=center;
    const response=await fetch('/api/green-area?v=3&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon),
      {cache:'no-store',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('녹지 지도 자료 조회에 실패했습니다 ('+response.status+').');
    const data=await response.json();
    if (!Array.isArray(data.elements)) throw Error('녹지 지도 응답 형식이 올바르지 않습니다.');
    return estimate(data.elements,center);
  }
  return {estimate,fetchEstimate};
})();
if (typeof module !== 'undefined') module.exports=GreenArea;

