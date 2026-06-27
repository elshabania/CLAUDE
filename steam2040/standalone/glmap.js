/* WebGL2 map for the standalone app: instanced link ribbons (per-link colour +
 * width from a data texture) plus instanced zone dots. Handles 150k links and
 * 3.7k zones on the GPU. */

const LINK_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aP0;
layout(location=2) in vec2 aP1;
layout(location=3) in float aLink;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uScale; uniform float uWidthScale;
uniform highp usampler2D uStyle; uniform int uTexW;
out vec4 vColor; out float vDraw;
void main(){
  ivec2 t = ivec2(int(aLink)%uTexW, int(aLink)/uTexW);
  uvec4 s = texelFetch(uStyle, t, 0);
  vColor = vec4(float(s.r)/255.0,float(s.g)/255.0,float(s.b)/255.0,1.0);
  vDraw = float(s.a);
  float w = max(vDraw/28.0*uWidthScale, 0.8);
  vec2 p0=(aP0-uCenter)*uScale, p1=(aP1-uCenter)*uScale;
  vec2 base=mix(p0,p1,aCorner.x), dir=p1-p0; float len=length(dir);
  vec2 nrm = len>0.0 ? vec2(-dir.y,dir.x)/len : vec2(0.0,1.0);
  vec2 scr = base + nrm*(aCorner.y*w*0.5);
  gl_Position = vec4(scr/(uRes*0.5),0.0,1.0);
}`;
const LINK_FRAG = `#version 300 es
precision highp float; in vec4 vColor; in float vDraw; out vec4 o;
void main(){ if(vDraw<0.5) discard; o=vColor; }`;

const DOT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos; layout(location=1) in vec4 aCol;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uScale; uniform float uSize;
out vec4 vCol;
void main(){ vCol=aCol; vec2 scr=(aPos-uCenter)*uScale; gl_Position=vec4(scr/(uRes*0.5),0.0,1.0); gl_PointSize=uSize; }`;
const DOT_FRAG = `#version 300 es
precision highp float; in vec4 vCol; out vec4 o;
void main(){ vec2 d=gl_PointCoord-0.5; if(dot(d,d)>0.25) discard; o=vCol; }`;

function sh(gl,t,src){ const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(gl,v,f){ const p=gl.createProgram(); gl.attachShader(p,sh(gl,gl.VERTEX_SHADER,v)); gl.attachShader(p,sh(gl,gl.FRAGMENT_SHADER,f));
  gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

export class GLMap {
  constructor(canvas){
    this.canvas=canvas; const gl=canvas.getContext("webgl2",{antialias:true}); if(!gl) throw new Error("WebGL2 unavailable"); this.gl=gl;
    this.linkProg=prog(gl,LINK_VERT,LINK_FRAG); this.dotProg=prog(gl,DOT_VERT,DOT_FRAG);
    this.center=[0,0]; this.scale=1; this.widthScale=1; this.nSeg=0; this.nLinks=0; this.bounds=[0,0,1,1];
    this.showLinks=true; this.showDots=false; this.dotSize=4; this.dpr=window.devicePixelRatio||1;
    this.lvao=gl.createVertexArray(); gl.bindVertexArray(this.lvao);
    const corners=new Float32Array([0,-1,0,1,1,-1,1,1]); const cb=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,cb); gl.bufferData(gl.ARRAY_BUFFER,corners,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.bindVertexArray(null);
    this.dvao=gl.createVertexArray();
  }
  setLinks(offsets, xy, bounds){
    const gl=this.gl; this.bounds=bounds; const nLinks=offsets.length-1; this.nLinks=nLinks;
    let nSeg=0; for(let i=0;i<nLinks;i++) nSeg+=Math.max(0,(offsets[i+1]-offsets[i])-1); this.nSeg=nSeg;
    const p0=new Float32Array(nSeg*2),p1=new Float32Array(nSeg*2),lk=new Float32Array(nSeg);
    const cell=400,grid=new Map(),segP0=new Float32Array(nSeg*2),segP1=new Float32Array(nSeg*2),segLink=new Int32Array(nSeg);
    let s=0; for(let i=0;i<nLinks;i++){ const a=offsets[i],b=offsets[i+1];
      for(let k=a;k<b-1;k++){ const x0=xy[k*2],y0=xy[k*2+1],x1=xy[(k+1)*2],y1=xy[(k+1)*2+1];
        p0[s*2]=x0;p0[s*2+1]=y0;p1[s*2]=x1;p1[s*2+1]=y1;lk[s]=i; segP0[s*2]=x0;segP0[s*2+1]=y0;segP1[s*2]=x1;segP1[s*2+1]=y1;segLink[s]=i;
        const mx=(x0+x1)/2,my=(y0+y1)/2,key=((mx/cell)|0)+","+((my/cell)|0); let arr=grid.get(key); if(!arr)grid.set(key,arr=[]); arr.push(s); s++; } }
    this._grid=grid; this._cell=cell; this._segP0=segP0; this._segP1=segP1; this._segLink=segLink;
    gl.bindVertexArray(this.lvao); this._ibuf(1,p0); this._ibuf(2,p1); this._ibuf(3,lk,1); gl.bindVertexArray(null);
  }
  _ibuf(loc,data,sz){ const gl=this.gl; const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,sz||2,gl.FLOAT,false,0,0); gl.vertexAttribDivisor(loc,1); }
  setStyle(bytes){ const gl=this.gl,n=this.nLinks,texW=2048,texH=Math.ceil(n/texW),data=new Uint8Array(texW*texH*4);
    for(let i=0;i<n;i++){ data[i*4]=bytes[i*5];data[i*4+1]=bytes[i*5+1];data[i*4+2]=bytes[i*5+2];data[i*4+3]=bytes[i*5+4]; }
    if(!this.styleTex)this.styleTex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.styleTex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8UI,texW,texH,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,data); this.texW=texW; this.render(); }
  setDots(xy, rgba){ const gl=this.gl; this.nDots=xy.length/2; gl.bindVertexArray(this.dvao);
    const pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb); gl.bufferData(gl.ARRAY_BUFFER,xy,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    if(!this.dotCol) this.dotCol=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.dotCol); gl.bufferData(gl.ARRAY_BUFFER,rgba,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.UNSIGNED_BYTE,true,0,0); gl.bindVertexArray(null); this._dotXY=xy; }
  updateDotColors(rgba){ const gl=this.gl; gl.bindBuffer(gl.ARRAY_BUFFER,this.dotCol); gl.bufferSubData(gl.ARRAY_BUFFER,0,rgba); this.render(); }
  resize(){ this.dpr=window.devicePixelRatio||1; this.canvas.width=this.canvas.clientWidth*this.dpr; this.canvas.height=this.canvas.clientHeight*this.dpr; this.gl.viewport(0,0,this.canvas.width,this.canvas.height); this.render(); }
  resetView(){ const[xmn,ymn,xmx,ymx]=this.bounds; this.center=[(xmn+xmx)/2,(ymn+ymx)/2]; const w=Math.max(xmx-xmn,1),h=Math.max(ymx-ymn,1);
    this.scale=Math.min(this.canvas.width/w,this.canvas.height/h)*0.92; this.render(); }
  s2w(sx,sy){ const px=sx*this.dpr-this.canvas.width/2, py=-(sy*this.dpr-this.canvas.height/2); return [px/this.scale+this.center[0],py/this.scale+this.center[1]]; }
  zoomAt(sx,sy,f){ const b=this.s2w(sx,sy); this.scale*=f; const a=this.s2w(sx,sy); this.center[0]+=b[0]-a[0]; this.center[1]+=b[1]-a[1]; this.render(); }
  pan(dx,dy){ this.center[0]-=dx*this.dpr/this.scale; this.center[1]+=dy*this.dpr/this.scale; this.render(); }
  flyTo(x,y,scale){ this.center=[x,y]; if(scale)this.scale=scale; this.render(); }
  pick(sx,sy,tol=7){ if(!this._grid)return -1; const[wx,wy]=this.s2w(sx,sy),r=tol*this.dpr/this.scale,cx=(wx/this._cell)|0,cy=(wy/this._cell)|0; let best=-1,bd=r*r;
    for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){ const a=this._grid.get(gx+","+gy); if(!a)continue;
      for(const s of a){ const d=segD2(wx,wy,this._segP0[s*2],this._segP0[s*2+1],this._segP1[s*2],this._segP1[s*2+1]); if(d<bd){bd=d;best=this._segLink[s];} } } return best; }
  render(){ const gl=this.gl; gl.clearColor(0.047,0.075,0.125,1); gl.clear(gl.COLOR_BUFFER_BIT);
    if(this.showLinks && this.nSeg && this.styleTex){ gl.useProgram(this.linkProg); gl.bindVertexArray(this.lvao);
      gl.uniform2f(u(gl,this.linkProg,"uRes"),this.canvas.width,this.canvas.height); gl.uniform2f(u(gl,this.linkProg,"uCenter"),this.center[0],this.center[1]);
      gl.uniform1f(u(gl,this.linkProg,"uScale"),this.scale); gl.uniform1f(u(gl,this.linkProg,"uWidthScale"),this.widthScale); gl.uniform1i(u(gl,this.linkProg,"uTexW"),this.texW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.styleTex); gl.uniform1i(u(gl,this.linkProg,"uStyle"),0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,this.nSeg); }
    if(this.showDots && this.nDots){ gl.useProgram(this.dotProg); gl.bindVertexArray(this.dvao);
      gl.uniform2f(u(gl,this.dotProg,"uRes"),this.canvas.width,this.canvas.height); gl.uniform2f(u(gl,this.dotProg,"uCenter"),this.center[0],this.center[1]);
      gl.uniform1f(u(gl,this.dotProg,"uScale"),this.scale); gl.uniform1f(u(gl,this.dotProg,"uSize"),this.dotSize*this.dpr);
      gl.drawArrays(gl.POINTS,0,this.nDots); }
    if(this.onAfterRender)this.onAfterRender(); }
}
const _ul={}; function u(gl,p,n){ const k=n; if(!p._u)p._u={}; if(p._u[k]===undefined)p._u[k]=gl.getUniformLocation(p,n); return p._u[k]; }
function segD2(px,py,ax,ay,bx,by){ const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy; let t=L>0?((px-ax)*dx+(py-ay)*dy)/L:0; t=Math.max(0,Math.min(1,t)); const cx=ax+t*dx,cy=ay+t*dy; return (px-cx)**2+(py-cy)**2; }
