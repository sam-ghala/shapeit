import { useState, useMemo, useCallback, useRef, useEffect } from "react";

const IS_MOBILE = typeof window !== "undefined" && window.innerWidth <= 860;

const COLS = IS_MOBILE ? 7 : 10;
const ROWS = IS_MOBILE ? 5 : 8;
const CS = IS_MOBILE ? 46 : 52;
const M = IS_MOBILE ? 30 : 40;
const GW = COLS * CS, GH = ROWS * CS;
const EDGE_HIT = IS_MOBILE ? 20 : 18;

const TOP_L = IS_MOBILE
  ? ["1","2","3","4","5","6","7"]
  : ["1","2","3","4","5","6","7","8","9","10"];
const LEFT_L = IS_MOBILE
  ? ["A","B","C","D","E"]
  : ["A","B","C","D","E","F","G","H"];
const RIGHT_L = IS_MOBILE
  ? ["8","9","10","11","12"]
  : ["11","12","13","14","15","16","17","18"];
const BOT_L = IS_MOBILE
  ? ["F","G","H","I","J","K","L"]
  : ["I","J","K","L","M","N","O","P","Q","R"];

const PCOLORS = { red: "#E53935", blue: "#1E88E5", yellow: "#FBC02D", white: "#9E9E9E" };
const PFILL = {
  red: "rgba(229,57,53,0.45)", blue: "rgba(30,136,229,0.45)",
  yellow: "rgba(251,192,45,0.45)", white: "rgba(158,158,158,0.30)"
};
const PGHOST = {
  red: "rgba(229,57,53,0.12)", blue: "rgba(30,136,229,0.12)",
  yellow: "rgba(251,192,45,0.12)", white: "rgba(158,158,158,0.10)"
};

const TH = {
  bg: "#f5f5f5", gridBg: "#ffffff", gridLine: "#d4d4d4",
  textPrimary: "#212121", textSecondary: "#666", textTertiary: "#9e9e9e",
  borderLight: "#e8e8e8", successBg: "#e8f5e9", successText: "#2e7d32",
  infoBg: "rgba(30,136,229,0.10)"
};

// PASTE YOUR GOOGLE APPS SCRIPT URL HERE
const ANALYTICS_URL = "https://script.google.com/macros/s/AKfycbyGgPXi8Ga6l4yI3kKvycbkDVU2B1YpvsB5KKKTBLmP2uFp7cPddOEZDtrN75fsQluA/exec";

function logSubmission() {
  // try {
  //   var nav = navigator;
  //   var conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  //   var timeStr = solveTimeSec != null
  //     ? Math.floor(solveTimeSec/60) + ":" + String(solveTimeSec%60).padStart(2,"0")
  //     : "";
  //   navigator.sendBeacon("/api/log", JSON.stringify({
  //     result: result,
  //     solveTime: timeStr,
  //     queries: queryCount,
  //     platform: IS_MOBILE ? "mobile" : "desktop",
  //     timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  //     locale: nav.language || "",
  //     browser: nav.userAgent || "",
  //     screen: screen.width + "x" + screen.height,
  //     os: nav.platform || "",
  //     viewport: window.innerWidth + "x" + window.innerHeight,
  //     referrer: document.referrer || "",
  //     cores: String(nav.hardwareConcurrency || ""),
  //     memory: String(nav.deviceMemory || ""),
  //     touch: ("ontouchstart" in window) ? "yes" : "no",
  //     dpr: String(window.devicePixelRatio || ""),
  //     depth: String(screen.colorDepth || ""),
  //     dark: window.matchMedia("(prefers-color-scheme:dark)").matches ? "yes" : "no",
  //     connection: conn.effectiveType || "",
  //     dnt: nav.doNotTrack || ""
  //   }));
  // } catch (e) {}
}

const ROTATE_MAP = {
  "/": "\\", "\\": "/b", "/b": "\\b", "\\b": "/",
  "/f": "\\f", "\\f": "/f"
};

function diagOf(type) { return type[0] === "/" ? "/" : "\\"; }
function isFull(type) { return type.endsWith("f"); }

function exposedSides(type) {
  switch (type) {
    case "/": return ["top","left"];
    case "/b": return ["bottom","right"];
    case "\\": return ["top","right"];
    case "\\b": return ["bottom","left"];
    case "/f": case "\\f": return ["top","bottom","left","right"];
    default: return [];
  }
}

function neighborRC(r,c,side) {
  if (side==="top") return [r-1,c];
  if (side==="bottom") return [r+1,c];
  if (side==="left") return [r,c-1];
  return [r,c+1];
}

function sideToEdgeKey(r,c,side) {
  if (side==="top") return `h-${r}-${c}`;
  if (side==="bottom") return `h-${r+1}-${c}`;
  if (side==="left") return `v-${r}-${c}`;
  return `v-${r}-${c+1}`;
}

function computeOutlineEdges(absCells) {
  const cellSet = new Set(absCells.map(([r,c])=>`${r},${c}`));
  const edges = [];
  for (const [r,c,type] of absCells) {
    for (const side of exposedSides(type)) {
      const [nr,nc] = neighborRC(r,c,side);
      if (!cellSet.has(`${nr},${nc}`)) edges.push(sideToEdgeKey(r,c,side));
    }
  }
  return edges;
}

const DESKTOP_PIECES = [
  { id:"wl", color:"white", name:"Lg pyramid",
    cells:[[0,1,"/b"],[0,2,"\\b"],[1,0,"/b"],[1,1,"/f"],[1,2,"\\f"],[1,3,"\\b"]] },
  { id:"bl", color:"blue", name:"Lg pyramid",
    cells:[[0,1,"/b"],[0,2,"\\b"],[1,0,"/b"],[1,1,"/f"],[1,2,"\\f"],[1,3,"\\b"]] },
  { id:"ws", color:"white", name:"Diamond",
    cells:[[0,0,"/b"],[0,1,"\\b"],[1,0,"\\"],[1,1,"/"]] },
  { id:"yl", color:"yellow", name:"Sm triangle",
    cells:[[0,0,"\\f"],[0,1,"/"],[1,0,"/"]] },
  { id:"rd", color:"red", name:"Parallelogram",
    cells:[[0,0,"/b"],[0,1,"/f"],[0,2,"/"]] },
];

const MOBILE_SHAPE_BANK = [
  { name:"Sm diamond", cells:[[0,0,"/b"],[0,1,"\\b"],[1,0,"\\"],[1,1,"/"]] },
  { name:"Sm tri", cells:[[0,0,"\\f"],[0,1,"/"],[1,0,"/"]] },
  { name:"Sm para", cells:[[0,0,"/b"],[0,1,"/"]] },
  { name:"Sm para", cells:[[0,0,"\\b"],[0,1,"\\"]] },
  { name:"Tall dia", cells:[[0,0,"/b"],[1,0,"\\"]] },
  { name:"Arrow", cells:[[0,0,"/b"],[0,1,"/f"],[0,2,"/"]] },
];

const MOBILE_COLORS = ["red","blue","yellow","white"];

function buildMobilePieces(seed) {
  const rng = mulberry32(hashSeed(seed + "-mpieces"));
  const shuffColors = [...MOBILE_COLORS].sort(() => rng() - 0.5);
  const colors3 = shuffColors.slice(0, 3);
  const shuffShapes = [...MOBILE_SHAPE_BANK].sort(() => rng() - 0.5);
  const chosen = shuffShapes.slice(0, 4);
  const colorAssign = [colors3[0], colors3[1], colors3[2], colors3[Math.floor(rng() * 3)]];
  return chosen.map((shape, i) => ({
    id: `m${i}`,
    color: colorAssign[i],
    name: shape.name,
    cells: shape.cells.map(c => [...c]),
  }));
}

let PIECES = DESKTOP_PIECES;

function mulberry32(s){let t=s|0;return()=>{t=(t+0x6D2B79F5)|0;let x=Math.imul(t^(t>>>15),1|t);x=(x+Math.imul(x^(x>>>7),61|x))^x;return((x^(x>>>14))>>>0)/4294967296;};}
function hashSeed(str){let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h+str.charCodeAt(i))|0;return h;}
function getDailySeed(){const d=new Date();const base=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return IS_MOBILE?base+"-m":base;}
function getDayNumber(){const now=new Date();const start=new Date(now.getFullYear(),0,0);return Math.floor((now-start)/86400000);}

function rotateCells(cells,rot){
  let r=cells.map(([dr,dc,t])=>[dr,dc,t]);
  for(let i=0;i<rot;i++) r=r.map(([dr,dc,t])=>[dc,-dr,ROTATE_MAP[t]]);
  const minR=Math.min(...r.map(c=>c[0])),minC=Math.min(...r.map(c=>c[1]));
  return r.map(([dr,dc,t])=>[dr-minR,dc-minC,t]);
}

/*
 * Reflection logic:
 * Each half-cell has "flat" sides where the fill touches the cell boundary,
 * and a diagonal edge. If the laser enters from a flat side, it bounces
 * straight back. If it enters from the diagonal side, it reflects 90°.
 *
 *   "/"  (upper-left filled) → flat: top, left    → diagonal entry: from right, from bottom
 *   "\"  (upper-right filled)→ flat: top, right   → diagonal entry: from left, from bottom
 *   "/b" (lower-right filled)→ flat: bottom, right→ diagonal entry: from left, from top
 *   "\b" (lower-left filled) → flat: bottom, left → diagonal entry: from right, from top
 *   "/f","\f" (full cell)    → all flat           → always bounce back
 */
const FLAT_SIDES = {
  "/":["top","left"], "\\":["top","right"],
  "/b":["bottom","right"], "\\b":["bottom","left"],
  "/f":["top","bottom","left","right"], "\\f":["top","bottom","left","right"]
};
const DIR_TO_ENTRY = {right:"left",left:"right",down:"top",up:"bottom"};
const BOUNCE = {right:"left",left:"right",down:"up",up:"down"};

function reflect(dir,type){
  const entrySide=DIR_TO_ENTRY[dir];
  const flat=FLAT_SIDES[type]||[];
  if(flat.includes(entrySide)) return BOUNCE[dir];
  const d=diagOf(type);
  if(d==="\\") return{right:"down",down:"right",left:"up",up:"left"}[dir];
  return{right:"up",up:"right",left:"down",down:"left"}[dir];
}

function fireLaser(board,side,idx){
  let r,c,dir;
  if(side==="top"){r=0;c=idx;dir="down";}
  else if(side==="bottom"){r=ROWS-1;c=idx;dir="up";}
  else if(side==="left"){r=idx;c=0;dir="right";}
  else{r=idx;c=COLS-1;dir="left";}
  const colors=new Set();const path=[];let steps=0;
  while(r>=0&&r<ROWS&&c>=0&&c<COLS&&steps<200){
    path.push([r,c]);const cell=board[r]?.[c];
    if(cell){colors.add(cell.color);dir=reflect(dir,cell.type);}
    if(dir==="down")r++;else if(dir==="up")r--;
    else if(dir==="right")c++;else c--;steps++;
  }
  let exitSide,exitIdx;
  if(r<0){exitSide="top";exitIdx=c;}
  else if(r>=ROWS){exitSide="bottom";exitIdx=c;}
  else if(c<0){exitSide="left";exitIdx=r;}
  else{exitSide="right";exitIdx=r;}
  return{exitSide,exitIdx,colors:[...colors],path};
}

function getLabel(side,idx){
  if(side==="top")return TOP_L[idx];if(side==="left")return LEFT_L[idx];
  if(side==="right")return RIGHT_L[idx];return BOT_L[idx];
}

function generatePuzzle(seed){
  for(let retry=0;retry<50;retry++){
    const rng=mulberry32(hashSeed(seed+"-"+retry));
    const board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    const placed=[];const order=[...PIECES].sort(()=>rng()-0.5);
    let allPlaced=true;
    for(const piece of order){
      let ok=false;
      for(let att=0;att<1000&&!ok;att++){
        const rot=Math.floor(rng()*4);
        const cells=rotateCells(piece.cells,rot);
        const rs=cells.map(c=>c[0]),cs=cells.map(c=>c[1]);
        const minR=Math.min(...rs),maxR=Math.max(...rs);
        const minC=Math.min(...cs),maxC=Math.max(...cs);
        const spanR=maxR-minR,spanC=maxC-minC;
        if(spanR>=ROWS||spanC>=COLS)continue;
        const sR=Math.floor(rng()*(ROWS-spanR));
        const sC=Math.floor(rng()*(COLS-spanC));
        const abs=cells.map(([dr,dc,t])=>[dr-minR+sR,dc-minC+sC,t]);
        let valid=true;
        for(const[ar,ac]of abs){if(ar<0||ar>=ROWS||ac<0||ac>=COLS||board[ar][ac]!==null){valid=false;break;}}
        if(!valid)continue;
        for(const[ar,ac]of abs){
          for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
            const nr=ar+dr,nc=ac+dc;
            if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&board[nr][nc]!==null){
              if(!abs.some(([a,b])=>a===nr&&b===nc)){valid=false;break;}
            }
          }if(!valid)break;
        }
        if(!valid)continue;
        for(const[ar,ac,t]of abs) board[ar][ac]={color:piece.color,type:t};
        placed.push({...piece,rotation:rot,absCells:abs});ok=true;
      }
      if(!ok){allPlaced=false;break;}
    }
    if(allPlaced) return{board,placed};
  }
  // Last resort fallback (should never reach here)
  const rng=mulberry32(hashSeed(seed));
  const board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
  return{board,placed:[]};
}

function findMatch(guessBoard,edgeColors,piece){
  for(let rot=0;rot<4;rot++){
    const cells=rotateCells(piece.cells,rot);
    const rs=cells.map(c=>c[0]),cs=cells.map(c=>c[1]);
    const minR=Math.min(...rs),maxR=Math.max(...rs);
    const minC=Math.min(...cs),maxC=Math.max(...cs);
    const norm=cells.map(([r,c,t])=>[r-minR,c-minC,t]);
    for(let r=0;r<=ROWS-1-(maxR-minR);r++){
      for(let c=0;c<=COLS-1-(maxC-minC);c++){
        let ok=true;
        const absCells=norm.map(([dr,dc,t])=>[r+dr,c+dc,t]);
        for(const[ar,ac,t]of absCells){
          if(isFull(t))continue;
          const g=guessBoard[ar]?.[ac];
          if(!g||g.color!==piece.color||g.type!==diagOf(t)){ok=false;break;}
        }
        if(!ok)continue;
        const outEdges=computeOutlineEdges(absCells);
        for(const ek of outEdges){if(edgeColors[ek]!==piece.color){ok=false;break;}}
        if(ok)return absCells;
      }
    }
  }
  return null;
}

function fillPoints(x,y,s,type){
  switch(type){
    case"/":return`${x},${y+s} ${x+s},${y} ${x},${y}`;
    case"\\":return`${x},${y} ${x+s},${y} ${x+s},${y+s}`;
    case"/b":return`${x},${y+s} ${x+s},${y} ${x+s},${y+s}`;
    case"\\b":return`${x},${y} ${x},${y+s} ${x+s},${y+s}`;
    case"/f":case"\\f":return`${x},${y} ${x+s},${y} ${x+s},${y+s} ${x},${y+s}`;
    default:return`${x},${y} ${x+s},${y} ${x+s},${y+s} ${x},${y+s}`;
  }
}

function diagLine(x,y,s,type){
  const d=diagOf(type);
  if(d==="/")return{x1:x,y1:y+s,x2:x+s,y2:y};
  return{x1:x,y1:y,x2:x+s,y2:y+s};
}

function edgeToLine(key){
  const[kind,aStr,bStr]=key.split("-");
  const a=parseInt(aStr),b=parseInt(bStr);
  const gxf=(c)=>M+c*CS,gyf=(r)=>M+r*CS;
  if(kind==="h")return{x1:gxf(b),y1:gyf(a),x2:gxf(b)+CS,y2:gyf(a)};
  return{x1:gxf(b),y1:gyf(a),x2:gxf(b),y2:gyf(a)+CS};
}

function PieceOutline({absCells,color,strokeWidth,opacity,dash}){
  const outEdges=computeOutlineEdges(absCells);
  const gx=(c)=>M+c*CS,gy=(r)=>M+r*CS;
  return(<>
    {absCells.filter(([,,t])=>!isFull(t)).map(([r,c,t],i)=>{
      const dl=diagLine(gx(c),gy(r),CS,t);
      return<line key={`d${i}`}{...dl}stroke={color}strokeWidth={strokeWidth}
        strokeLinecap="round"opacity={opacity}strokeDasharray={dash||"none"}/>;
    })}
    {outEdges.map((ek,i)=>{
      const ln=edgeToLine(ek);
      return<line key={`e${i}`}{...ln}stroke={color}strokeWidth={strokeWidth}
        strokeLinecap="round"opacity={opacity}strokeDasharray={dash||"none"}/>;
    })}
  </>);
}

function PiecePreview({piece,found,size=22}){
  const cells=piece.cells;
  const maxR=Math.max(...cells.map(c=>c[0]))+1;
  const maxC=Math.max(...cells.map(c=>c[1]))+1;
  const outEdges=computeOutlineEdges(cells);
  const p=2;
  const w=maxC*size+p*2,h=maxR*size+p*2;
  return(
    <svg width={w}height={h}viewBox={`0 0 ${w} ${h}`}
      style={{opacity:found?0.15:1,flexShrink:0}}>
      {/* Grid background */}
      <rect x={p}y={p}width={maxC*size}height={maxR*size}fill="#f8f8f8"rx={2}/>
      {Array.from({length:maxC+1},(_,i)=>(
        <line key={`gv${i}`}x1={p+i*size}y1={p}x2={p+i*size}y2={p+maxR*size}
          stroke="#ddd"strokeWidth={i===0||i===maxC?1:0.5}/>
      ))}
      {Array.from({length:maxR+1},(_,i)=>(
        <line key={`gh${i}`}x1={p}y1={p+i*size}x2={p+maxC*size}y2={p+i*size}
          stroke="#ddd"strokeWidth={i===0||i===maxR?1:0.5}/>
      ))}
      {/* Piece fill */}
      {cells.map(([r,c,t],i)=>(
        <polygon key={i}points={fillPoints(p+c*size,p+r*size,size,t)}fill={PFILL[piece.color]}/>
      ))}
      {/* Diagonal outlines */}
      {cells.filter(([,,t])=>!isFull(t)).map(([r,c,t],i)=>{
        const dl=diagLine(p+c*size,p+r*size,size,t);
        return<line key={`d${i}`}{...dl}stroke={PCOLORS[piece.color]}strokeWidth={1.5}strokeLinecap="round"/>;
      })}
      {/* H/V outlines */}
      {outEdges.map((ek,i)=>{
        const[kind,aStr,bStr]=ek.split("-");
        const a=parseInt(aStr),b=parseInt(bStr);
        const ln=kind==="h"
          ?{x1:p+b*size,y1:p+a*size,x2:p+b*size+size,y2:p+a*size}
          :{x1:p+b*size,y1:p+a*size,x2:p+b*size,y2:p+a*size+size};
        return<line key={`e${i}`}{...ln}stroke={PCOLORS[piece.color]}strokeWidth={1.5}strokeLinecap="round"/>;
      })}
    </svg>
  );
}

/* ─── How To Play Modal ─── */
function HowToPlay({onClose}){
  const S=28;
  const c1="#E53935",c2="#1E88E5",c3="#FBC02D",c4="#9E9E9E";
  const dot=(color,sz=10)=><span style={{display:"inline-block",width:sz,height:sz,borderRadius:"50%",
    background:color,verticalAlign:"middle",margin:"0 2px",border:color==="#9E9E9E"?"1.5px solid #ccc":"none"}}/>;
  const sec={fontSize:16,fontWeight:700,margin:"22px 0 10px",display:"flex",alignItems:"center",gap:8};
  const p={fontSize:14,lineHeight:1.7,color:"#444",margin:"0 0 12px"};
  const fig={background:"#fafafa",borderRadius:10,padding:12,margin:"10px 0 16px",display:"flex",
    alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8};

  function MiniGrid({w,h,children,label}){
    const gw=w*S,gh=h*S,m=4;
    return(<div style={{textAlign:"center"}}>
      <svg width={gw+m*2}height={gh+m*2}viewBox={`0 0 ${gw+m*2} ${gh+m*2}`}>
        <rect x={m}y={m}width={gw}height={gh}fill="#fff"rx={2}/>
        {Array.from({length:w+1},(_,i)=><line key={`v${i}`}x1={m+i*S}y1={m}x2={m+i*S}y2={m+gh}
          stroke="#ddd"strokeWidth={i===0||i===w?1.5:0.5}/>)}
        {Array.from({length:h+1},(_,i)=><line key={`h${i}`}x1={m}y1={m+i*S}x2={m+gw}y2={m+i*S}
          stroke="#ddd"strokeWidth={i===0||i===h?1.5:0.5}/>)}
        {children(m)}
      </svg>
      {label&&<div style={{fontSize:11,color:"#999",marginTop:4}}>{label}</div>}
    </div>);
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:10000,display:"flex",alignItems:"center",
      justifyContent:"center",background:"rgba(0,0,0,0.45)",padding:12}}onClick={onClose}>
      <div style={{background:"white",borderRadius:16,padding:"28px 24px",maxWidth:560,width:"100%",
        maxHeight:"88vh",overflowY:"auto",boxShadow:"0 12px 48px rgba(0,0,0,0.25)",position:"relative"}}
        onClick={e=>e.stopPropagation()}>
        <button onClick={onClose}style={{position:"absolute",top:12,right:16,background:"none",
          border:"none",fontSize:22,color:"#bbb",cursor:"pointer",padding:4}}>✕</button>

        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,fontWeight:800,marginBottom:4}}>
            <span style={{color:c1}}>S</span><span style={{color:c2}}>h</span>
            <span style={{color:c3}}>a</span><span style={{color:c4}}>p</span>
            <span style={{color:c1}}>e</span><span style={{color:c2}}>I</span>
            <span style={{color:c3}}>t</span>
          </div>
          <div style={{fontSize:14,color:"#888"}}>Find {PIECES.length} hidden pieces on the grid</div>
          <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:8}}>
            {PIECES.map((pc,i)=>dot(PCOLORS[pc.color],14))}
          </div>
        </div>

        {/* ── STEP 1: THE PIECES ── */}
        <div style={sec}>{dot(c1,12)}{dot(c2,12)}{dot(c3,12)} The {PIECES.length} hidden pieces</div>
        <p style={p}>Each puzzle hides these {PIECES.length} colored pieces somewhere on the {COLS}x{ROWS} grid. Your job is to find exactly where each one is.</p>
        <div style={{...fig,flexDirection:"row",flexWrap:"wrap",gap:16}}>
          {PIECES.map(pc=>(
            <div key={pc.id}style={{textAlign:"center"}}>
              <PiecePreview piece={pc}found={false}size={20}/>
            </div>
          ))}
        </div>

        {/* ── STEP 2: FIRING LASERS ── */}
        <div style={sec}>{dot(c2,12)} Fire lasers to gather clues</div>
        <p style={p}>Click any label around the grid (1–10, A–H, etc.) to shoot a laser into that row or column. The laser travels in a straight line until it hits a piece edge.</p>

        <div style={fig}>
          <div style={{fontSize:12,color:"#666",marginBottom:4,fontWeight:600}}>Laser enters from "4", bounces off diagonal, exits at "B"</div>
          <MiniGrid w={5}h={3}>{(m)=>{
            const h=S/2;
            return<>
            {/* Yellow right triangle: hypotenuse from (1,3)top-right to (3,3)bottom-left, vertical right edge, horizontal bottom */}
            <polygon points={`${m+3*S},${m+3*S} ${m+5*S},${m+S} ${m+5*S},${m+3*S}`}fill="rgba(251,192,45,0.2)"/>
            <line x1={m+3*S}y1={m+3*S}x2={m+5*S}y2={m+S}stroke={c3}strokeWidth={2.5}/>
            <line x1={m+5*S}y1={m+S}x2={m+5*S}y2={m+3*S}stroke={c3}strokeWidth={2.5}/>
            <line x1={m+5*S}y1={m+3*S}x2={m+3*S}y2={m+3*S}stroke={c3}strokeWidth={2.5}/>
            {/* Laser: enters col 4 center, goes down to diagonal, bounces left */}
            <line x1={m+3*S+h}y1={m}x2={m+3*S+h}y2={m+2*S+h}stroke={c2}strokeWidth={2}strokeDasharray="5 3"opacity={0.7}/>
            <line x1={m+3*S+h}y1={m+2*S+h}x2={m}y2={m+2*S+h}stroke={c2}strokeWidth={2}strokeDasharray="5 3"opacity={0.7}/>
            <circle cx={m+3*S+h}cy={m+2*S+h}r={3}fill={c2}opacity={0.5}/>
            <circle cx={m+3*S+h}cy={m-1}r={4}fill={c2}/>
            <circle cx={m-1}cy={m+2*S+h}r={4}fill={c2}/>
            <text x={m+3*S+h}y={m-10}textAnchor="middle"fontSize={10}fill="#666"fontWeight={600}>4</text>
            <text x={m-10}y={m+2*S+h+4}textAnchor="middle"fontSize={10}fill="#666"fontWeight={600}>B</text>
            </>;
          }}</MiniGrid>
          <div style={{fontSize:12,color:"#888"}}>The diagonal edge reflects the laser 90 degrees</div>
        </div>

        <div style={fig}>
          <div style={{fontSize:12,color:"#666",marginBottom:4,fontWeight:600}}>Flat edge bounces laser straight back</div>
          <MiniGrid w={5}h={4}>{(m)=>{
            const h=S/2;
            return<>
            <polygon points={`${m+S},${m+3*S} ${m+2*S},${m+2*S} ${m+4*S},${m+2*S} ${m+3*S},${m+3*S}`}fill="rgba(229,57,53,0.2)"/>
            <line x1={m+S}y1={m+3*S}x2={m+2*S}y2={m+2*S}stroke={c1}strokeWidth={2.5}/>
            <line x1={m+2*S}y1={m+2*S}x2={m+4*S}y2={m+2*S}stroke={c1}strokeWidth={2.5}/>
            <line x1={m+4*S}y1={m+2*S}x2={m+3*S}y2={m+3*S}stroke={c1}strokeWidth={2.5}/>
            <line x1={m+3*S}y1={m+3*S}x2={m+S}y2={m+3*S}stroke={c1}strokeWidth={2.5}/>
            <line x1={m+2*S+h-2}y1={m}x2={m+2*S+h-2}y2={m+2*S}stroke={c2}strokeWidth={2}strokeDasharray="5 3"opacity={0.7}/>
            <line x1={m+2*S+h+2}y1={m+2*S}x2={m+2*S+h+2}y2={m}stroke={c2}strokeWidth={2}strokeDasharray="5 3"opacity={0.5}/>
            <circle cx={m+2*S+h}cy={m-1}r={4}fill={c2}/>
            <text x={m+2*S+h}y={m-10}textAnchor="middle"fontSize={10}fill="#666"fontWeight={600}>3</text>
            </>;
          }}</MiniGrid>
          <div style={{fontSize:12,color:"#888"}}>Laser enters "3" and exits "3", bounced off the flat top of the parallelogram</div>
        </div>

        {/* ── STEP 3: READING THE CLUES ── */}
        <div style={sec}>{dot(c3,12)} Reading the query log</div>
        <p style={p}>After each laser, the log shows the entry point, exit point, and which piece colors the laser passed through (in random order).</p>

        <div style={fig}>
          <div style={{background:"white",borderRadius:8,padding:"8px 16px",border:"1px solid #e8e8e8",
            fontSize:13,display:"flex",gap:20,alignItems:"center",width:"100%",maxWidth:340}}>
            <span style={{color:"#999",fontSize:12}}>1</span>
            <span style={{fontWeight:700}}>P</span>
            <span style={{fontWeight:700}}>3</span>
            <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
              {dot(c3,14)}{dot(c1,14)}{dot(c4,14)}{dot(c2,14)}
            </div>
          </div>
          <div style={{fontSize:12,color:"#888",marginTop:2}}>
            Laser entered at P, exited at 3. Hit {dot(c3)} yellow, {dot(c1)} red, {dot(c4)} white, and {dot(c2)} blue
          </div>
        </div>

        <p style={p}>Colors appear in random order. You know <em>which</em> colors were hit, but not the sequence. A result with no colors means the laser passed through empty space.</p>

        {/* ── STEP 4: PLACING YOUR GUESS ── */}
        <div style={sec}>{dot(c1,12)} Drawing your guess</div>
        <p style={p}>Select a color, then build piece outlines on the grid:</p>

        <div style={{...fig,flexDirection:"row",gap:24,flexWrap:"wrap"}}>
          <div style={{textAlign:"center"}}>
            <MiniGrid w={2}h={2}label="Click cell: diagonal">{(m)=><>
              <line x1={m+2}y1={m+2}x2={m+S-2}y2={m+S-2}stroke={c1}strokeWidth={3}strokeLinecap="round"/>
            </>}</MiniGrid>
          </div>
          <div style={{textAlign:"center"}}>
            <MiniGrid w={2}h={2}label="Click again: flip">{(m)=><>
              <line x1={m+2}y1={m+S-2}x2={m+S-2}y2={m+2}stroke={c1}strokeWidth={3}strokeLinecap="round"/>
            </>}</MiniGrid>
          </div>
          <div style={{textAlign:"center"}}>
            <MiniGrid w={2}h={2}label="Click grid line: edge">{(m)=><>
              <line x1={m}y1={m+S}x2={m+S}y2={m+S}stroke={c2}strokeWidth={3.5}strokeLinecap="round"/>
            </>}</MiniGrid>
          </div>
        </div>

        <div style={fig}>
          <div style={{fontSize:12,color:"#666",marginBottom:4,fontWeight:600}}>Complete outline and the piece fills in</div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",justifyContent:"center"}}>
            <MiniGrid w={3}h={1}label="Red parallelogram">{(m)=><>
              <polygon points={`${m},${m+S} ${m+S},${m} ${m+3*S},${m} ${m+2*S},${m+S}`}fill="rgba(229,57,53,0.3)"/>
              <line x1={m}y1={m+S}x2={m+S}y2={m}stroke={c1}strokeWidth={2}/>
              <line x1={m+S}y1={m}x2={m+3*S}y2={m}stroke={c1}strokeWidth={2}/>
              <line x1={m+3*S}y1={m}x2={m+2*S}y2={m+S}stroke={c1}strokeWidth={2}/>
              <line x1={m+2*S}y1={m+S}x2={m}y2={m+S}stroke={c1}strokeWidth={2}/>
            </>}</MiniGrid>
            <MiniGrid w={2}h={2}label="White diamond">{(m)=><>
              <polygon points={`${m+S},${m} ${m+2*S},${m+S} ${m+S},${m+2*S} ${m},${m+S}`}fill="rgba(158,158,158,0.2)"/>
              <line x1={m+S}y1={m}x2={m+2*S}y2={m+S}stroke={c4}strokeWidth={2}/>
              <line x1={m+2*S}y1={m+S}x2={m+S}y2={m+2*S}stroke={c4}strokeWidth={2}/>
              <line x1={m+S}y1={m+2*S}x2={m}y2={m+S}stroke={c4}strokeWidth={2}/>
              <line x1={m}y1={m+S}x2={m+S}y2={m}stroke={c4}strokeWidth={2}/>
            </>}</MiniGrid>
          </div>
        </div>

        {/* ── STEP 5: SUBMITTING ── */}
        <div style={sec}>{dot(c4,12)} Submit when ready</div>
        <p style={p}>Once you've placed all {PIECES.length} pieces, hit <span style={{background:"#1E88E5",color:"white",
          padding:"2px 10px",borderRadius:4,fontSize:13,fontWeight:600}}>Submit solution</span>. 
          Every piece must be in the <em>exact</em> correct position to win.</p>

        <div style={{display:"flex",gap:16,justifyContent:"center",margin:"14px 0 8px",flexWrap:"wrap"}}>
          <div style={{background:"white",borderRadius:12,padding:"18px 24px",textAlign:"center",
            boxShadow:"0 4px 20px rgba(0,0,0,0.1)",minWidth:180}}>
            <div style={{fontSize:22,fontWeight:700,marginBottom:6}}>
              <span style={{color:c1}}>S</span><span style={{color:c2}}>o</span>
              <span style={{color:c3}}>l</span><span style={{color:c4}}>v</span>
              <span style={{color:c1}}>e</span><span style={{color:c2}}>d</span>
              <span style={{color:c3}}>!</span>
            </div>
            <div style={{fontSize:12,color:"#333",fontWeight:600}}>Solved in 2:34</div>
            <div style={{fontSize:11,color:"#666",marginTop:2}}>with 12 queries</div>
            <div style={{marginTop:8,background:"#1E88E5",color:"white",padding:"4px 14px",
              borderRadius:6,fontSize:11,fontWeight:600,display:"inline-block"}}>Share result</div>
          </div>
          <div style={{background:"white",borderRadius:12,padding:"18px 24px",textAlign:"center",
            boxShadow:"0 4px 20px rgba(0,0,0,0.1)",minWidth:180}}>
            <div style={{fontSize:22,fontWeight:700,color:c1,marginBottom:6}}>Incorrect</div>
            <div style={{fontSize:11,color:"#666"}}>12 queries used</div>
            <div style={{fontSize:11,color:"#999",marginTop:4}}>The correct solution<br/>is shown on the board</div>
          </div>
        </div>
        <p style={{...p,textAlign:"center",fontSize:13,color:"#999"}}>If wrong, the correct answer is shown. One shot, make it count.</p>

        {/* ── TIPS ── */}
        <div style={sec}>{dot(c2,12)} Tips</div>
        <div style={{background:"#f8f8f8",borderRadius:10,padding:"14px 16px",margin:"0 0 16px",fontSize:13,
          lineHeight:1.8,color:"#555"}}>
          <span style={{fontWeight:600}}>Start with edges.</span> Fire lasers along the borders to figure out which rows and columns contain pieces.<br/><br/>
          <span style={{fontWeight:600}}>Count the colors.</span> If a laser hits 3+ colors, those pieces are all lined up in that row/column.<br/><br/>
          <span style={{fontWeight:600}}>Use the dimmed labels.</span> Already-queried labels are grayed out. Click them again to re-highlight the results.<br/><br/>
          <span style={{fontWeight:600}}>Shapes fill automatically.</span> When you complete an outline, it fills with color. Helpful to track your progress.
        </div>

        <div style={{textAlign:"center",fontSize:13,color:"#aaa",marginTop:12}}>
          A new puzzle every day. Good luck! {dot(c1)}{dot(c2)}{dot(c3)}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Game ─── */
export default function ShapeIt(){
  const[puzzleSeed,setPuzzleSeed]=useState(getDailySeed());
  const puzzle=useMemo(()=>{
    if(IS_MOBILE) PIECES=buildMobilePieces(puzzleSeed);
    return generatePuzzle(puzzleSeed);
  },[puzzleSeed]);
  const[selColor,setSelColor]=useState("red");
  const[guess,setGuess]=useState(()=>Array.from({length:ROWS},()=>Array(COLS).fill(null)));
  const[history,setHistory]=useState([]);
  const[edgeColors,setEdgeColors]=useState({});
  const[activeLabels,setActiveLabels]=useState(null);
  const[usedLabels,setUsedLabels]=useState(new Set());
  const[celebrating,setCelebrating]=useState(false);
  const[gameOver,setGameOver]=useState(false);
  const[submitResult,setSubmitResult]=useState(null);
  const[overlayDismissed,setOverlayDismissed]=useState(false);
  const[hoverEdge,setHoverEdge]=useState(null);
  const[hoverCell,setHoverCell]=useState(null);
  const[highlightRow,setHighlightRow]=useState(null);
  const[startTime,setStartTime]=useState(()=>Date.now());
  const[solveTime,setSolveTime]=useState(null);
  const[showHowTo,setShowHowTo]=useState(false);
  const[newFlash,setNewFlash]=useState(false);

  const placedPieces=useMemo(()=>{
    const found={};
    for(const p of PIECES){if(!found[p.id]){const m=findMatch(guess,edgeColors,p);if(m)found[p.id]=m;}}
    return found;
  },[guess,edgeColors]);

  const handleCellClick=useCallback((r,c)=>{
    if(gameOver||celebrating)return;
    setGuess(prev=>{
      const next=prev.map(row=>[...row]);const cur=next[r][c];
      if(!cur)next[r][c]={color:selColor,type:"\\"};
      else if(cur.color===selColor&&cur.type==="\\")next[r][c]={color:selColor,type:"/"};
      else if(cur.color===selColor&&cur.type==="/")next[r][c]=null;
      else next[r][c]={color:selColor,type:"\\"};
      return next;
    });
  },[selColor,gameOver,celebrating]);

  const labelToKey=useMemo(()=>{
    const m={};
    TOP_L.forEach((l,i)=>{m[l]=`top-${i}`;});
    BOT_L.forEach((l,i)=>{m[l]=`bottom-${i}`;});
    LEFT_L.forEach((l,i)=>{m[l]=`left-${i}`;});
    RIGHT_L.forEach((l,i)=>{m[l]=`right-${i}`;});
    return m;
  },[]);

  const handleLabelClick=useCallback((side,idx)=>{
    if(gameOver||celebrating)return;
    const entryKey=`${side}-${idx}`;const label=getLabel(side,idx);
    if(usedLabels.has(entryKey)){
      const matchIndices=[];
      const highlightKeys=new Set();
      history.forEach((h,i)=>{
        if(h.entry===label||h.exit===label){
          matchIndices.push(i);
          if(labelToKey[h.entry])highlightKeys.add(labelToKey[h.entry]);
          if(labelToKey[h.exit])highlightKeys.add(labelToKey[h.exit]);
        }
      });
      if(matchIndices.length>0){
        setHighlightRow(matchIndices);
        setActiveLabels({keys:highlightKeys});
        setTimeout(()=>{setHighlightRow(null);setActiveLabels(null);},4000);
      }
      return;
    }
    const result=fireLaser(puzzle.board,side,idx);
    const exitKey=`${result.exitSide}-${result.exitIdx}`;
    const shuffled=[...result.colors].sort(()=>Math.random()-0.5);
    setHistory(prev=>[...prev,{entry:getLabel(side,idx),exit:getLabel(result.exitSide,result.exitIdx),
      colors:shuffled}]);
    if(shuffled.length>0)setSelColor(shuffled[0]);
    setActiveLabels({entry:entryKey,exit:exitKey});
    setUsedLabels(prev=>{const next=new Set(prev);next.add(entryKey);next.add(exitKey);return next;});
    setTimeout(()=>{setActiveLabels(null);},3800);
  },[puzzle,gameOver,celebrating,usedLabels,history]);

  const handleEdgeClick=useCallback((key)=>{
    if(gameOver||celebrating)return;
    setEdgeColors(prev=>{const next={...prev};if(next[key]===selColor)delete next[key];else next[key]=selColor;return next;});
  },[selColor,gameOver,celebrating]);

  const handleClear=useCallback(()=>{
    if(gameOver||celebrating)return;
    setGuess(Array.from({length:ROWS},()=>Array(COLS).fill(null)));
    setEdgeColors({});
  },[gameOver,celebrating]);

  const handleNewPuzzle=useCallback(()=>{
    setNewFlash(true);
    setTimeout(()=>{
      setPuzzleSeed(Date.now().toString());
      setGuess(Array.from({length:ROWS},()=>Array(COLS).fill(null)));
      setEdgeColors({});setHistory([]);setUsedLabels(new Set());
      setCelebrating(false);setGameOver(false);setSubmitResult(null);
      setOverlayDismissed(false);setStartTime(Date.now());setSolveTime(null);
      setNewFlash(false);
    },400);
  },[]);

  const handleSubmit=useCallback(()=>{
    if(gameOver||celebrating)return;
    let allCorrect=true;
    for(const placed of puzzle.placed){
      const{absCells,color}=placed;
      for(const[r,c,t]of absCells){
        if(isFull(t))continue;
        const g=guess[r]?.[c];
        if(!g||g.color!==color||g.type!==diagOf(t)){allCorrect=false;break;}
      }
      if(!allCorrect)break;
      const outEdges=computeOutlineEdges(absCells);
      for(const ek of outEdges){if(edgeColors[ek]!==color){allCorrect=false;break;}}
      if(!allCorrect)break;
    }
    const elapsed=Math.floor((Date.now()-startTime)/1000);
    if(allCorrect){
      setSolveTime(elapsed);
      setSubmitResult("correct");setCelebrating(true);
      logSubmission("correct",elapsed,history.length);
    }else{
      setSubmitResult("incorrect");setGameOver(true);
      logSubmission("incorrect",elapsed,history.length);
    }
  },[guess,edgeColors,puzzle,gameOver,celebrating,startTime,history.length]);

  const gx=(c)=>M+c*CS;const gy=(r)=>M+r*CS;

  const hEdges=[];
  for(let line=0;line<=ROWS;line++)for(let c=0;c<COLS;c++)
    hEdges.push({key:`h-${line}-${c}`,x:gx(c),y:gy(line)});
  const vEdges=[];
  for(let r=0;r<ROWS;r++)for(let line=0;line<=COLS;line++)
    vEdges.push({key:`v-${r}-${line}`,x:gx(line),y:gy(r)});

  const board=(
    <svg width={GW+2*M}height={GH+2*M}style={{display:"block",maxWidth:"100%",height:"auto"}}
      viewBox={`0 0 ${GW+2*M} ${GH+2*M}`}>
      <rect x={M}y={M}width={GW}height={GH}fill={TH.gridBg}/>
      {Array.from({length:COLS+1},(_,i)=>(
        <line key={`v${i}`}x1={gx(i)}y1={M}x2={gx(i)}y2={M+GH}
          stroke={TH.gridLine}strokeWidth={i===0||i===COLS?2:1}/>
      ))}
      {Array.from({length:ROWS+1},(_,i)=>(
        <line key={`h${i}`}x1={M}y1={gy(i)}x2={M+GW}y2={gy(i)}
          stroke={TH.gridLine}strokeWidth={i===0||i===ROWS?2:1}/>
      ))}

      {/* Game over: reveal solution */}
      {gameOver&&puzzle.placed.map((p,pi)=>(
        <g key={`ghost-${pi}`}>
          {p.absCells.map(([r,c,t],ci)=>(
            <polygon key={ci}points={fillPoints(gx(c),gy(r),CS,t)}fill={PFILL[p.color]}/>
          ))}
          <PieceOutline absCells={p.absCells}color={PCOLORS[p.color]}strokeWidth={3}opacity={0.7}/>
        </g>
      ))}

      {/* Placed piece fills */}
      {Object.entries(placedPieces).map(([pid,absCells])=>{
        const piece=PIECES.find(p=>p.id===pid);
        return(<g key={`mf-${pid}`}>
          {absCells.map(([r,c,t],i)=>(
            <polygon key={i}points={fillPoints(gx(c),gy(r),CS,t)}fill={PFILL[piece.color]}/>
          ))}
        </g>);
      })}

      {/* Player guess diagonals */}
      {guess.map((row,r)=>row.map((cell,c)=>{
        if(!cell)return null;
        const isPlaced=Object.values(placedPieces).some(cells=>cells.some(([cr,cc])=>cr===r&&cc===c));
        if(isPlaced)return null;
        const x=gx(c),y=gy(r);const dl=diagLine(x,y,CS,cell.type);
        return<line key={`g${r}-${c}`}{...dl}stroke={PCOLORS[cell.color]}strokeWidth={3.5}strokeLinecap="round"/>;
      }))}

      {/* Placed piece outlines */}
      {Object.entries(placedPieces).map(([pid,absCells])=>{
        const piece=PIECES.find(p=>p.id===pid);
        return<PieceOutline key={`mo-${pid}`}absCells={absCells}color={PCOLORS[piece.color]}strokeWidth={4}opacity={1}/>;
      })}

      {/* Player colored edges */}
      {hEdges.map(({key,x,y})=>{const ec=edgeColors[key];if(!ec)return null;
        return<line key={`ec-${key}`}x1={x}y1={y}x2={x+CS}y2={y}stroke={PCOLORS[ec]}strokeWidth={4}strokeLinecap="round"/>;
      })}
      {vEdges.map(({key,x,y})=>{const ec=edgeColors[key];if(!ec)return null;
        return<line key={`ec-${key}`}x1={x}y1={y}x2={x}y2={y+CS}stroke={PCOLORS[ec]}strokeWidth={4}strokeLinecap="round"/>;
      })}

      {/* Hover previews */}
      {hoverEdge&&(()=>{
        const[kind,aStr,bStr]=hoverEdge.split("-");
        const a=parseInt(aStr),b=parseInt(bStr);
        if(kind==="h")return<line x1={gx(b)}y1={gy(a)}x2={gx(b)+CS}y2={gy(a)}
          stroke={PCOLORS[selColor]}strokeWidth={4}strokeLinecap="round"opacity={0.3}style={{pointerEvents:"none"}}/>;
        return<line x1={gx(b)}y1={gy(a)}x2={gx(b)}y2={gy(a)+CS}
          stroke={PCOLORS[selColor]}strokeWidth={4}strokeLinecap="round"opacity={0.3}style={{pointerEvents:"none"}}/>;
      })()}
      {hoverCell&&(()=>{
        const[r,c]=hoverCell;const cur=guess[r]?.[c];
        let pt="\\";
        if(cur&&cur.color===selColor&&cur.type==="\\")pt="/";
        else if(cur&&cur.color===selColor&&cur.type==="/")return null;
        else if(cur)pt="\\";
        const x=gx(c),y=gy(r);const dl=diagLine(x,y,CS,pt);
        return<line{...dl}stroke={PCOLORS[selColor]}strokeWidth={3}strokeLinecap="round"opacity={0.25}style={{pointerEvents:"none"}}/>;
      })()}

      {/* Edge click targets */}
      {hEdges.map(({key,x,y})=>(
        <rect key={`ht-${key}`}x={x}y={y-EDGE_HIT/2}width={CS}height={EDGE_HIT}
          fill="transparent"style={{cursor:"pointer"}}
          onMouseEnter={()=>!edgeColors[key]&&setHoverEdge(key)}onMouseLeave={()=>setHoverEdge(null)}
          onClick={e=>{e.stopPropagation();setHoverEdge(null);handleEdgeClick(key);}}/>
      ))}
      {vEdges.map(({key,x,y})=>(
        <rect key={`ht-${key}`}x={x-EDGE_HIT/2}y={y}width={EDGE_HIT}height={CS}
          fill="transparent"style={{cursor:"pointer"}}
          onMouseEnter={()=>!edgeColors[key]&&setHoverEdge(key)}onMouseLeave={()=>setHoverEdge(null)}
          onClick={e=>{e.stopPropagation();setHoverEdge(null);handleEdgeClick(key);}}/>
      ))}

      {/* Labels */}
      {Array.from({length:COLS},(_,i)=>{
        const tK=`top-${i}`,bK=`bottom-${i}`;
        const tA=activeLabels&&(activeLabels.entry===tK||activeLabels.exit===tK||(activeLabels.keys&&activeLabels.keys.has(tK)));
        const bA=activeLabels&&(activeLabels.entry===bK||activeLabels.exit===bK||(activeLabels.keys&&activeLabels.keys.has(bK)));
        const tU=usedLabels.has(tK),bU=usedLabels.has(bK);
        const tF=tA?"#1E88E5":tU?"#c8c8c8":TH.textSecondary;
        const bF=bA?"#1E88E5":bU?"#c8c8c8":TH.textSecondary;
        return(<g key={`tl${i}`}>
          <rect x={gx(i)}y={0}width={CS}height={M-4}fill="transparent"
            style={{cursor:gameOver?"default":"pointer"}}onClick={()=>handleLabelClick("top",i)}/>
          {tA&&<circle cx={gx(i)+CS/2}cy={M/2}r={16}fill="rgba(30,136,229,0.15)"/>}
          <text x={gx(i)+CS/2}y={M/2}textAnchor="middle"dominantBaseline="central"
            fontSize={tA?16:14}fontWeight={tA?700:600}fill={tF}
            style={{pointerEvents:"none",userSelect:"none"}}>{TOP_L[i]}</text>
          <rect x={gx(i)}y={M+GH+4}width={CS}height={M-4}fill="transparent"
            style={{cursor:gameOver?"default":"pointer"}}onClick={()=>handleLabelClick("bottom",i)}/>
          {bA&&<circle cx={gx(i)+CS/2}cy={M+GH+M/2+2}r={16}fill="rgba(30,136,229,0.15)"/>}
          <text x={gx(i)+CS/2}y={M+GH+M/2+2}textAnchor="middle"dominantBaseline="central"
            fontSize={bA?16:14}fontWeight={bA?700:600}fill={bF}
            style={{pointerEvents:"none",userSelect:"none"}}>{BOT_L[i]}</text>
        </g>);
      })}
      {Array.from({length:ROWS},(_,i)=>{
        const lK=`left-${i}`,rK=`right-${i}`;
        const lA=activeLabels&&(activeLabels.entry===lK||activeLabels.exit===lK||(activeLabels.keys&&activeLabels.keys.has(lK)));
        const rA=activeLabels&&(activeLabels.entry===rK||activeLabels.exit===rK||(activeLabels.keys&&activeLabels.keys.has(rK)));
        const lU=usedLabels.has(lK),rU=usedLabels.has(rK);
        const lF=lA?"#1E88E5":lU?"#c8c8c8":TH.textSecondary;
        const rF=rA?"#1E88E5":rU?"#c8c8c8":TH.textSecondary;
        return(<g key={`ll${i}`}>
          <rect x={0}y={gy(i)}width={M-4}height={CS}fill="transparent"
            style={{cursor:gameOver?"default":"pointer"}}onClick={()=>handleLabelClick("left",i)}/>
          {lA&&<circle cx={M/2}cy={gy(i)+CS/2}r={16}fill="rgba(30,136,229,0.15)"/>}
          <text x={M/2}y={gy(i)+CS/2}textAnchor="middle"dominantBaseline="central"
            fontSize={lA?16:14}fontWeight={lA?700:600}fill={lF}
            style={{pointerEvents:"none",userSelect:"none"}}>{LEFT_L[i]}</text>
          <rect x={M+GW+4}y={gy(i)}width={M-4}height={CS}fill="transparent"
            style={{cursor:gameOver?"default":"pointer"}}onClick={()=>handleLabelClick("right",i)}/>
          {rA&&<circle cx={M+GW+M/2+2}cy={gy(i)+CS/2}r={16}fill="rgba(30,136,229,0.15)"/>}
          <text x={M+GW+M/2+2}y={gy(i)+CS/2}textAnchor="middle"dominantBaseline="central"
            fontSize={rA?16:14}fontWeight={rA?700:600}fill={rF}
            style={{pointerEvents:"none",userSelect:"none"}}>{RIGHT_L[i]}</text>
        </g>);
      })}

      {/* Cell click targets */}
      {Array.from({length:ROWS},(_,r)=>
        Array.from({length:COLS},(_,c)=>(
          <rect key={`cl${r}-${c}`}x={gx(c)+EDGE_HIT/2}y={gy(r)+EDGE_HIT/2}
            width={CS-EDGE_HIT}height={CS-EDGE_HIT}
            fill="transparent"style={{cursor:"crosshair"}}
            onMouseEnter={()=>setHoverCell([r,c])}onMouseLeave={()=>setHoverCell(null)}
            onClick={()=>{setHoverCell(null);handleCellClick(r,c);}}/>
        ))
      )}
    </svg>
  );

  const logRef=useRef(null);
  const isMobile=typeof window!=="undefined"&&window.innerWidth<=860;

  useEffect(()=>{
    if(logRef.current&&!isMobile){
      logRef.current.scrollTop=logRef.current.scrollHeight;
    }
  },[history.length,isMobile]);

  const displayHistory=isMobile?[...history].reverse():history;

  const queryLog=(
    <div>
      <div style={{fontSize:11,fontWeight:600,color:TH.textTertiary,marginBottom:10,
        textTransform:"uppercase",letterSpacing:"0.08em"}}>Query log</div>
      <div ref={logRef}style={{maxHeight:420,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${TH.gridLine}`}}>
              {["#","In","Out","Colors"].map(h=>(
                <th key={h}style={{textAlign:"left",padding:"6px 6px",fontWeight:600,fontSize:12,color:TH.textTertiary}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.length===0&&(
              <tr><td colSpan={4}style={{padding:"20px 6px",color:TH.textTertiary,fontSize:13}}>
                Click a label to fire
              </td></tr>
            )}
            {displayHistory.map((h,di)=>{
              const origIdx=isMobile?history.length-1-di:di;
              const isHL=highlightRow&&highlightRow.includes(origIdx);
              return(
              <tr key={origIdx}style={{borderBottom:`1px solid ${TH.borderLight}`,
                background:isHL?"rgba(30,136,229,0.12)":"transparent",transition:"background 0.2s"}}>
                <td style={{padding:"7px 6px",color:TH.textTertiary,fontSize:12}}>{origIdx+1}</td>
                <td style={{padding:"7px 6px",fontWeight:600}}>{h.entry}</td>
                <td style={{padding:"7px 6px",fontWeight:600}}>{h.exit}</td>
                <td style={{padding:"7px 6px"}}>
                  {h.colors.length===0
                    ?<span style={{fontSize:12,color:TH.textTertiary}}>—</span>
                    :<div style={{display:"flex",gap:4}}>
                      {h.colors.map((col,j)=>(
                        <div key={j}style={{width:16,height:16,borderRadius:"50%",
                          background:PCOLORS[col],
                          border:col==="white"?`2px solid ${TH.gridLine}`:"none"}}title={col}/>
                      ))}
                    </div>
                  }
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",color:TH.textPrimary,
      background:TH.bg,minHeight:"100vh"}}>

      {/* New puzzle popup */}
      {newFlash&&<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.3)",
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <style>{`@keyframes flashPop{0%{transform:scale(.8);opacity:0}30%{transform:scale(1.02);opacity:1}100%{transform:scale(1);opacity:1}}`}</style>
        <div style={{background:"white",borderRadius:16,padding:"28px 32px",maxWidth:"calc(100vw - 32px)",
          width:340,boxShadow:"0 8px 40px rgba(0,0,0,.15)",textAlign:"center",
          animation:"flashPop 0.35s ease-out forwards"}}>
          <div style={{fontSize:22,fontWeight:700,color:TH.textPrimary,marginBottom:6}}>New puzzle</div>
          <div style={{fontSize:14,color:TH.textTertiary}}>Loading...</div>
        </div>
      </div>}

      {/* Header */}
      <div className="header-bar"style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"16px 24px",maxWidth:1100,margin:"0 auto"}}>
        <span style={{fontSize:22,fontWeight:700}}>ShapeIt</span>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <button onClick={()=>setShowHowTo(true)}style={{padding:"6px 14px",fontSize:12,
            fontWeight:500,borderRadius:8,cursor:"pointer",background:TH.gridBg,
            color:TH.textSecondary,border:`1px solid ${TH.gridLine}`}}>How to play</button>
          <span style={{fontSize:13,color:TH.textTertiary}}>Day {getDayNumber()}</span>
        </div>
      </div>

      {/* Main layout */}
      <div className="game-layout"style={{display:"flex",gap:28,padding:"0 12px 20px",
        alignItems:"flex-start",justifyContent:"center",flexWrap:"wrap"}}>

        {/* LEFT PANEL — colors + buttons (desktop only, mobile reordered via CSS) */}
        <div className="panel-controls"style={{width:160,display:"flex",flexDirection:"column",gap:16,flexShrink:0}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:TH.textTertiary,marginBottom:8,
              textTransform:"uppercase",letterSpacing:"0.08em"}}>Color</div>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(PCOLORS).map(([name,hex])=>(
                <button key={name}onClick={()=>setSelColor(name)}style={{
                  width:32,height:32,borderRadius:"50%",background:hex,padding:0,
                  border:selColor===name?`3px solid ${TH.textPrimary}`:"3px solid transparent",
                  cursor:"pointer",outline:"none",
                  boxShadow:selColor===name?`0 0 0 2px ${TH.bg}`:"none"
                }}/>
              ))}
            </div>
          </div>
          <div className="hide-mobile"style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Desktop: pieces here */}
            <div>
              <div style={{fontSize:11,fontWeight:600,color:TH.textTertiary,marginBottom:8,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>Pieces</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {PIECES.map(p=>(
                  <div key={p.id}style={{padding:4}}>
                    <PiecePreview piece={p}found={!!placedPieces[p.id]}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleClear}style={{flex:1,padding:"10px 8px",fontSize:12,fontWeight:500,
                borderRadius:8,cursor:"pointer",background:TH.gridBg,color:TH.textSecondary,
                border:`1px solid ${TH.gridLine}`,opacity:gameOver?0.4:1}}>Clear</button>
              <button onClick={handleNewPuzzle}style={{flex:1,padding:"10px 8px",fontSize:12,fontWeight:500,
                borderRadius:8,cursor:"pointer",background:TH.gridBg,color:TH.textSecondary,
                border:`1px solid ${TH.gridLine}`}}>New</button>
            </div>
            {!gameOver&&!celebrating&&(
              <button onClick={handleSubmit}style={{padding:"12px 14px",fontSize:14,fontWeight:600,
                borderRadius:8,cursor:"pointer",background:"#1E88E5",color:"#fff",border:"none"}}>
                Submit solution
              </button>
            )}
            <div style={{fontSize:11,color:TH.textTertiary,lineHeight:1.8}}>
              Click cell: diagonal<br/>Click grid line: edge<br/>Click label: fire laser
            </div>
          </div>
        </div>

        {/* BOARD */}
        <div className="panel-board"style={{flexShrink:0}}>
          {board}
        </div>

        {/* QUERY LOG */}
        <div className="panel-log"style={{width:220,minWidth:190,flexShrink:0}}>
          {queryLog}
        </div>

        {/* MOBILE-ONLY: pieces + buttons at bottom */}
        <div className="panel-mobile-bottom"style={{display:"none",width:"100%",maxWidth:600,
          flexDirection:"column",gap:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:TH.textTertiary,marginBottom:6,
              textTransform:"uppercase",letterSpacing:"0.08em"}}>Pieces</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
              {PIECES.map(p=>(
                <div key={p.id}style={{padding:2}}>
                  <PiecePreview piece={p}found={!!placedPieces[p.id]}size={16}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleClear}style={{flex:1,padding:"10px 8px",fontSize:12,fontWeight:500,
              borderRadius:8,cursor:"pointer",background:TH.gridBg,color:TH.textSecondary,
              border:`1px solid ${TH.gridLine}`,opacity:gameOver?0.4:1}}>Clear</button>
            <button onClick={handleNewPuzzle}style={{flex:1,padding:"10px 8px",fontSize:12,fontWeight:500,
              borderRadius:8,cursor:"pointer",background:TH.gridBg,color:TH.textSecondary,
              border:`1px solid ${TH.gridLine}`}}>New</button>
          </div>
          {!gameOver&&!celebrating&&(
            <button onClick={handleSubmit}style={{padding:"12px 14px",fontSize:14,fontWeight:600,
              borderRadius:8,cursor:"pointer",background:"#1E88E5",color:"#fff",border:"none"}}>
              Submit solution
            </button>
          )}
        </div>
      </div>

      {showHowTo&&<HowToPlay onClose={()=>setShowHowTo(false)}/>}
      {celebrating&&!overlayDismissed&&<CelebrationOverlay queries={history.length}
        solveTime={solveTime}onClose={()=>{setCelebrating(false);setOverlayDismissed(true);}}/>}
      {gameOver&&!overlayDismissed&&<GameOverOverlay queries={history.length}
        onNewPuzzle={handleNewPuzzle}onClose={()=>setOverlayDismissed(true)}/>}

      {/* Footer */}
      <div style={{textAlign:"center",padding:"24px 16px 16px",fontSize:12,color:TH.textTertiary}}>
        Authors: <a href="https://robinerb.github.io"style={{color:TH.textSecondary,textDecoration:"none",
          borderBottom:`1px solid ${TH.borderLight}`}}target="_blank"rel="noopener noreferrer">Robin Erb</a> & <a
          href="https://samghalayini.com"style={{color:TH.textSecondary,textDecoration:"none",
          borderBottom:`1px solid ${TH.borderLight}`}}target="_blank"rel="noopener noreferrer">Sam Ghalayini</a>
      </div>
    </div>
  );
}

/* ─── Celebration ─── */
const CELEBRATE_COLORS=["#E53935","#1E88E5","#FBC02D","#9E9E9E"];
const CELEBRATE_TYPES=["triangle","diamond","square"];

function CelebrationOverlay({queries,solveTime,onClose}){
  const[copied,setCopied]=useState(false);
  const particles=useMemo(()=>Array.from({length:60},(_,i)=>({
    id:i,type:CELEBRATE_TYPES[i%3],color:CELEBRATE_COLORS[i%4],
    left:Math.random()*100,delay:Math.random()*2.5,duration:2.5+Math.random()*2.5,
    size:12+Math.random()*26,spinDir:Math.random()>0.5?1:-1,
    drift:(Math.random()-0.5)*120,spinAmount:360+Math.random()*720,
  })),[]);
  const timeStr=`${Math.floor((solveTime||0)/60)}:${String((solveTime||0)%60).padStart(2,"0")}`;
  return(<>
    <style>{`
      @keyframes sf{0%{transform:translateY(-60px) translateX(0) rotate(0) scale(.3);opacity:0}
      8%{opacity:1;transform:translateY(0) translateX(0) rotate(30deg) scale(1)}
      85%{opacity:.7}100%{transform:translateY(calc(100vh + 40px)) translateX(var(--d)) rotate(var(--s)) scale(.5);opacity:0}}
      @keyframes sb{0%{transform:scale(.3) rotate(-10deg);opacity:0}50%{transform:scale(1.1) rotate(2deg);opacity:1}
      70%{transform:scale(.95) rotate(-1deg)}100%{transform:scale(1) rotate(0);opacity:1}}
    `}</style>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden",
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      {particles.map(p=>{
        const s={position:"absolute",left:`${p.left}%`,top:0,width:p.size,height:p.size,opacity:0,
          animation:`sf ${p.duration}s ${p.delay}s ease-out infinite`,"--d":`${p.drift}px`,"--s":`${p.spinDir*p.spinAmount}deg`};
        return(<div key={p.id}style={s}><svg width={p.size}height={p.size}viewBox="0 0 24 24">
          {p.type==="triangle"&&<polygon points="12,2 22,22 2,22"fill={p.color}opacity={0.85}/>}
          {p.type==="diamond"&&<polygon points="12,1 23,12 12,23 1,12"fill={p.color}opacity={0.85}/>}
          {p.type==="square"&&<rect x="3"y="3"width="18"height="18"fill={p.color}opacity={0.85}transform="rotate(15 12 12)"/>}
        </svg></div>);
      })}
      <div style={{position:"relative",
        animation:"sb .6s .2s ease-out both",background:"white",borderRadius:16,
        padding:"28px 32px",maxWidth:"calc(100vw - 32px)",width:340,margin:16,
        boxShadow:"0 8px 40px rgba(0,0,0,.15)",textAlign:"center",pointerEvents:"auto"}}>
        <button onClick={onClose}style={{position:"absolute",top:10,right:14,background:"none",
          border:"none",fontSize:22,color:"#bbb",cursor:"pointer",padding:4}}>✕</button>
        <div style={{fontSize:38,fontWeight:700,marginBottom:4}}>
          {"Solved!".split("").map((ch,i)=><span key={i}style={{color:CELEBRATE_COLORS[i%4]}}>{ch}</span>)}
        </div>
        <div style={{fontSize:18,color:"#333",marginTop:10,fontWeight:600}}>
          Solved in {timeStr}
        </div>
        <div style={{fontSize:15,color:"#666",marginTop:4}}>
          with {queries} {queries===1?"query":"queries"}
        </div>
        <button onClick={()=>{
          const text=`playshapeit.com 🟥🟦🟨\nsolved in ${timeStr}\nwith ${queries} ${queries===1?"query":"queries"}`;
          if(navigator.clipboard){navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}
        }}style={{marginTop:16,padding:"10px 28px",fontSize:14,fontWeight:600,borderRadius:8,cursor:"pointer",
          background:copied?"#4CAF50":"#1E88E5",color:"#fff",border:"none",transition:"background 0.2s"}}>
          {copied?"Copied!":"Share result"}
        </button>
      </div>
    </div>
  </>);
}

/* ─── Game Over ─── */
function GameOverOverlay({queries,onNewPuzzle,onClose}){
  const particles=useMemo(()=>Array.from({length:50},(_,i)=>({
    id:i,type:CELEBRATE_TYPES[i%3],color:["#aaa","#bbb","#999","#ccc"][i%4],
    left:Math.random()*100,delay:Math.random()*3,duration:2.5+Math.random()*2.5,
    size:10+Math.random()*20,spinDir:Math.random()>0.5?1:-1,
    drift:(Math.random()-0.5)*120,spinAmount:180+Math.random()*360,
  })),[]);
  return(<>
    <style>{`
      @keyframes sfg{0%{transform:translateY(-40px) translateX(0) rotate(0) scale(.3);opacity:0}
      8%{opacity:.5;transform:translateY(0) translateX(0) rotate(20deg) scale(1)}
      85%{opacity:.3}100%{transform:translateY(calc(100vh + 40px)) translateX(var(--d)) rotate(var(--s)) scale(.4);opacity:0}}
      @keyframes sbf{0%{transform:scale(.3);opacity:0}40%{transform:scale(1.05);opacity:1}
      60%{transform:scale(.97)}100%{transform:scale(1);opacity:1}}
    `}</style>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden",
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      {particles.map(p=>{
        const s={position:"absolute",left:`${p.left}%`,top:0,width:p.size,height:p.size,opacity:0,
          animation:`sfg ${p.duration}s ${p.delay}s ease-out infinite`,"--d":`${p.drift}px`,"--s":`${p.spinDir*p.spinAmount}deg`};
        return(<div key={p.id}style={s}><svg width={p.size}height={p.size}viewBox="0 0 24 24">
          {p.type==="triangle"&&<polygon points="12,2 22,22 2,22"fill={p.color}opacity={0.5}/>}
          {p.type==="diamond"&&<polygon points="12,1 23,12 12,23 1,12"fill={p.color}opacity={0.5}/>}
          {p.type==="square"&&<rect x="3"y="3"width="18"height="18"fill={p.color}opacity={0.5}transform="rotate(15 12 12)"/>}
        </svg></div>);
      })}
      <div style={{position:"relative",
        animation:"sbf .5s .15s ease-out both",background:"white",borderRadius:16,
        padding:"28px 32px",maxWidth:"calc(100vw - 32px)",width:340,margin:16,
        boxShadow:"0 8px 40px rgba(0,0,0,.18)",textAlign:"center",pointerEvents:"auto"}}>
        <button onClick={onClose}style={{position:"absolute",top:10,right:14,background:"none",
          border:"none",fontSize:22,color:"#bbb",cursor:"pointer",padding:4}}>✕</button>
        <div style={{fontSize:36,fontWeight:700,color:"#E53935",marginBottom:4}}>Incorrect</div>
        <div style={{fontSize:15,color:"#666",marginTop:8}}>
          {queries} {queries===1?"query":"queries"} used
        </div>
        <div style={{fontSize:13,color:"#999",marginTop:6}}>
          The correct solution is shown on the board
        </div>
        <button onClick={onNewPuzzle}style={{marginTop:18,padding:"10px 28px",fontSize:14,fontWeight:600,
          borderRadius:8,cursor:"pointer",background:"#1E88E5",color:"#fff",border:"none"}}>
          Try another puzzle
        </button>
      </div>
    </div>
  </>);
}