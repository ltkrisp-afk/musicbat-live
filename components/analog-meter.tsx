import type {CSSProperties} from 'react';
/** Status/position instruments, never represented as measured audio amplitude. */
export function AnalogMeter({label,value}:{label:string;value:number}) {
 const level=Math.max(0,Math.min(1,value));
 return <div className="mb-meter" role="img" aria-label={`${label}: ${Math.round(level*100)} percent`}>
  <svg viewBox="0 0 220 112" aria-hidden="true">
   <path d="M28 76 Q110 4 192 76" className="mb-meter-arc" />
   <path d="M162 54 Q179 62 192 76" className="mb-meter-peak" />
   {[0,1,2,3,4,5,6,7,8].map(i=>{const a=(-145+i*13.75)*Math.PI/180;const x=110+89*Math.cos(a),y=130+89*Math.sin(a);return <line key={i} x1={x} y1={y} x2={110+100*Math.cos(a)} y2={130+100*Math.sin(a)} className="mb-meter-tick" />;})}
   <text x="24" y="47">0</text><text x="103" y="25">50</text><text x="181" y="47">100</text>
   <g className="mb-meter-needle" style={{'--needle':`${-53+level*106}deg`} as CSSProperties}><path d="M110 117 L110 30"/><circle cx="110" cy="117" r="5"/></g>
   <text x="110" y="98" textAnchor="middle" className="mb-meter-name">{label}</text>
  </svg>
 </div>;
}
