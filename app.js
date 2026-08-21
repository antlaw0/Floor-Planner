const APP_VERSION="7.0.0";
const VIEWBOX_WIDTH=2020, VIEWBOX_HEIGHT=1900;
const STORAGE_KEY="floor-planner-v7";
const DEFAULT_FLOORPLAN="assets/floorplan.jpg";
const COLORS=["#e53935","#fb8c00","#fdd835","#43a047","#00acc1","#1e88e5","#3949ab","#8e24aa","#d81b60","#f5f5f5"];
const state={
  configs:[],library:[],objects:[],selectedId:null,configName:"",
  scaleInchesPerPlanUnit:null,gridInches:6,movementInches:6,snap:true,
  gridVisible:true,majorGridVisible:true,zoom:100,fitW:320,fitH:300,
  profile:"desktop",drag:null
};

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uid=prefix=>prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);
function announce(msg){$("announce").textContent=msg; setTimeout(()=>{if($("announce").textContent===msg)$("announce").textContent=""},3500)}
function parseInches(value){
  const s=String(value??"").trim().toLowerCase().replace(/[″]/g,'"').replace(/[′]/g,"'");
  if(!s)return NaN;
  if(/^\d+(\.\d+)?$/.test(s))return Number(s)*12;
  const feet=(s.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)/)||[])[1];
  const inches=(s.match(/(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)/)||[])[1];
  if(feet!==undefined||inches!==undefined)return Number(feet||0)*12+Number(inches||0);
  const parts=s.split(/[\s-]+/).filter(Boolean);
  if(parts.length===2&&parts.every(x=>!Number.isNaN(Number(x))))return Number(parts[0])*12+Number(parts[1]);
  return NaN;
}
function formatInches(v){
  v=Math.max(0,Number(v)||0); const ft=Math.floor(v/12), inch=Math.round((v-ft*12)*10)/10;
  return ft?`${ft}' ${inch}"`:`${inch}"`;
}
function clone(o){return JSON.parse(JSON.stringify(o))}
function saveLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify({version:APP_VERSION,configs:state.configs,library:state.library,settings:{scale:state.scaleInchesPerPlanUnit,grid:state.gridInches,movement:state.movementInches,snap:state.snap,gridVisible:state.gridVisible,majorGridVisible:state.majorGridVisible}}))}
function loadLocal(){
  try{
    const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    if(d){state.configs=d.configs||[];state.library=d.library||[];Object.assign(state,{scaleInchesPerPlanUnit:d.settings?.scale||null,gridInches:d.settings?.grid||6,movementInches:d.settings?.movement||6,snap:d.settings?.snap!==false,gridVisible:d.settings?.gridVisible!==false,majorGridVisible:d.settings?.majorGridVisible!==false})}
  }catch(e){announce("Local data could not be read.")}
}
function screenSize(){const v=visualViewport;return{w:v?.width||innerWidth,h:v?.height||innerHeight}}
function detectProfile(){
  const {w,h}=screenSize(),short=Math.min(w,h),long=Math.max(w,h);
  if(w>=1180&&w>h*1.05)return"desktop";
  if(short>=600&&long>=760)return w<h?"fold-portrait":"fold-landscape";
  return"phone";
}
function applyLayout(){
  state.profile=detectProfile();document.body.dataset.layout=state.profile;
  const size=screenSize(), header=document.querySelector(".topbar"), available=Math.max(240,size.h-(header?.getBoundingClientRect().height||0));
  document.documentElement.style.setProperty("--app-available-height",available+"px");
  $("layoutProfile").textContent=state.profile==="fold-portrait"?"Fold portrait":state.profile==="fold-landscape"?"Fold landscape":state.profile==="phone"?"Phone":"Desktop";
  if(state.profile!=="desktop")document.querySelectorAll(".control-panel").forEach((p,i)=>p.open=i===0);
  requestAnimationFrame(fitStage);
}
function fitStage(){
  const vp=$("stageViewport"), aspect=VIEWBOX_WIDTH/VIEWBOX_HEIGHT;
  if(!vp)return;
  let w=Math.max(1,vp.clientWidth-4),h=w/aspect;
  if(h>Math.max(1,vp.clientHeight-4)){h=vp.clientHeight-4;w=h*aspect}
  state.fitW=Math.max(1,w);state.fitH=Math.max(1,h);
  const z=state.zoom/100;$("stageWrap").style.width=state.fitW*z+"px";$("stageWrap").style.height=state.fitH*z+"px";
  positionFloatingToolbar();
}
function setZoom(v){state.zoom=clamp(Number(v)||100,60,220);$("zoomRange").value=state.zoom;$("zoomValue").textContent=state.zoom+"%";fitStage()}
function stageScale(){return state.scaleInchesPerPlanUnit||1}
function planUnitsForInches(inches){return inches/stageScale()}
function objectDimensions(o){return{w:planUnitsForInches(o.widthIn),h:planUnitsForInches(o.lengthIn)}}
function createObject(data={}){
  const o={id:uid("obj"),label:data.label||"Furniture",shape:data.shape||"rect",color:data.color||COLORS[5],widthIn:Number(data.widthIn)||72,lengthIn:Number(data.lengthIn)||36,x:Number(data.x)||500,y:Number(data.y)||500,rotation:Number(data.rotation)||0,libraryId:data.libraryId||null};
  state.objects.push(o);selectObject(o.id);renderObjects();announce(`${o.label} added`);
}
function getSelected(){return state.objects.find(o=>o.id===state.selectedId)||null}
function selectedToEditor(){
  const o=getSelected();if(!o)return;
  $("objectLabel").value=o.label;$("objectShape").value=o.shape;$("objectColor").value=o.color;$("objectWidth").value=formatInches(o.widthIn);$("objectLength").value=formatInches(o.lengthIn);$("objectRotation").value=o.rotation;
}
function editorData(){
  const w=parseInches($("objectWidth").value),l=parseInches($("objectLength").value);
  if(!Number.isFinite(w)||w<=0||!Number.isFinite(l)||l<=0){announce("Enter valid width and length, such as 7' 6\" and 3' 2\".");return null}
  return{label:$("objectLabel").value.trim()||"Furniture",shape:$("objectShape").value,color:$("objectColor").value,widthIn:w,lengthIn:l,rotation:Number($("objectRotation").value)||0}
}
function updateEditor(){
  const o=getSelected(),d=editorData();if(!o||!d)return;
  Object.assign(o,d);renderObjects();saveLocal();announce(`${o.label} updated`)
}
function clearEditor(){$("objectLabel").value="";$("objectWidth").value="";$("objectLength").value="";$("objectRotation").value="0";state.selectedId=null;renderObjects()}
function makeSvgEl(tag,attrs={}){const e=document.createElementNS("http://www.w3.org/2000/svg",tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
function renderObjects(){
  const layer=$("objectsLayer");layer.replaceChildren();
  state.objects.forEach(o=>{
    const {w,h}=objectDimensions(o),g=makeSvgEl("g",{class:"furniture","data-id":o.id,transform:`translate(${o.x} ${o.y}) rotate(${o.rotation})`});
    let shape;
    if(o.shape==="circle"){const r=Math.min(w,h)/2;shape=makeSvgEl("circle",{cx:0,cy:0,r,fill:o.color,fillOpacity:.72,stroke:"#fff","stroke-width":3})}
    else shape=makeSvgEl("rect",{x:-w/2,y:-h/2,width:w,height:h,rx:5,fill:o.color,fillOpacity:.72,stroke:"#fff","stroke-width":3});
    g.append(shape);
    const t=makeSvgEl("text",{class:"furniture-label","text-anchor":"middle","dominant-baseline":"middle",x:0,y:0});t.textContent=o.label;g.append(t);
    g.addEventListener("pointerdown",e=>startDrag(e,o.id));g.addEventListener("click",e=>{e.stopPropagation();selectObject(o.id)});
    layer.append(g);
  });
  renderSelection();renderPlacedList();positionFloatingToolbar()
}
function renderSelection(){
  const layer=$("selectionLayer");layer.replaceChildren();const o=getSelected();
  $("selectionStatus").textContent=o?`${o.label} • ${formatInches(o.widthIn)} × ${formatInches(o.lengthIn)} • ${Math.round(o.rotation)}°`:"No furniture selected";
  if(!o){$("floatingToolbar").hidden=true;return}
  const {w,h}=objectDimensions(o),g=makeSvgEl("g",{transform:`translate(${o.x} ${o.y}) rotate(${o.rotation})`});
  if(o.shape==="circle"){const r=Math.min(w,h)/2;g.append(makeSvgEl("circle",{class:"selection-box",cx:0,cy:0,r:r+8}))}
  else g.append(makeSvgEl("rect",{class:"selection-box",x:-w/2-8,y:-h/2-8,width:w+16,height:h+16,rx:8}));
  layer.append(g);$("selectedObjectName").textContent=o.label;$("floatingToolbar").hidden=false
}
function clientToStage(e){
  const r=$("stage").getBoundingClientRect();
  return{x:(e.clientX-r.left)*VIEWBOX_WIDTH/r.width,y:(e.clientY-r.top)*VIEWBOX_HEIGHT/r.height}
}
function snapValue(v){
  if(!state.snap)return v;
  const units=planUnitsForInches(state.movementInches||6);
  return Math.round(v/units)*units
}
function startDrag(e,id){
  e.preventDefault();e.stopPropagation();selectObject(id);const o=getSelected(),p=clientToStage(e);
  state.drag={id,dx:o.x-p.x,dy:o.y-p.y,pointer:e.pointerId};e.currentTarget.setPointerCapture?.(e.pointerId);
  const move=ev=>{if(!state.drag||state.drag.pointer!==ev.pointerId)return;const q=clientToStage(ev);o.x=snapValue(q.x+state.drag.dx);o.y=snapValue(q.y+state.drag.dy);renderObjects()};
  const up=ev=>{if(state.drag?.pointer===ev.pointerId){state.drag=null;saveLocal();document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up)}};
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up)
}
function selectObject(id){state.selectedId=id;selectedToEditor();renderSelection();renderPlacedList();positionFloatingToolbar()}
function positionFloatingToolbar(){
  const bar=$("floatingToolbar"),o=getSelected();if(!o||bar.hidden)return;
  const {w,h}=objectDimensions(o),p={x:o.x,y:o.y};const stage=$("stage").getBoundingClientRect(),wrap=$("stageWrap").getBoundingClientRect();
  const sx=stage.width/VIEWBOX_WIDTH,sy=stage.height/VIEWBOX_HEIGHT;
  const left=clamp((p.x+w/2)*sx-10,5,wrap.width-bar.offsetWidth-5),top=clamp((p.y-h/2)*sy-bar.offsetHeight-8,5,wrap.height-bar.offsetHeight-5);
  bar.style.left=left+"px";bar.style.top=top+"px"
}
function rotateSelected(){const o=getSelected();if(!o)return;o.rotation=(o.rotation+90)%360;$("objectRotation").value=o.rotation;renderObjects();saveLocal()}
function duplicateSelected(){const o=getSelected();if(!o)return;createObject({...clone(o),id:null,x:o.x+planUnitsForInches(state.movementInches),y:o.y+planUnitsForInches(state.movementInches),label:o.label+" copy"});saveLocal()}
function deleteSelected(){const o=getSelected();if(!o)return;state.objects=state.objects.filter(x=>x.id!==o.id);state.selectedId=null;renderObjects();saveLocal();announce(`${o.label} deleted`)}
function renderPlacedList(){
  const s=$("placedSelect"),current=s.value;s.replaceChildren();
  state.objects.forEach(o=>{const op=document.createElement("option");op.value=o.id;op.textContent=`${o.label} — ${formatInches(o.widthIn)} × ${formatInches(o.lengthIn)}`;s.append(op)});
  if(state.objects.some(o=>o.id===current))s.value=current;else if(state.selectedId)s.value=state.selectedId
}
function renderLibrary(){
  const s=$("librarySelect"),cur=s.value;s.replaceChildren();
  state.library.forEach(f=>{const o=document.createElement("option");o.value=f.id;o.textContent=`${f.label} — ${formatInches(f.widthIn)} × ${formatInches(f.lengthIn)}`;s.append(o)});
  if(state.library.some(x=>x.id===cur))s.value=cur
}
function addLibrary(){
  const id=$("librarySelect").value,f=state.library.find(x=>x.id===id);if(!f){openPicker();return}
  createObject({...clone(f),id:null,libraryId:f.id,x:500,y:500});saveLocal()
}
function saveSelectedToLibrary(){
  const o=getSelected();if(!o){announce("Select furniture first.");return}
  const f=clone(o);f.id=uid("lib");delete f.x;delete f.y;delete f.libraryId;state.library.push(f);renderLibrary();saveLocal();announce(`${f.label} saved to library`)
}
function editLibrary(){
  const f=state.library.find(x=>x.id===$("librarySelect").value);if(!f)return;
  $("objectLabel").value=f.label;$("objectShape").value=f.shape;$("objectColor").value=f.color;$("objectWidth").value=formatInches(f.widthIn);$("objectLength").value=formatInches(f.lengthIn);$("objectRotation").value=f.rotation||0;announce("Library item loaded into editor")
}
function deleteLibrary(){const id=$("librarySelect").value;if(!id)return;state.library=state.library.filter(f=>f.id!==id);renderLibrary();saveLocal()}
function openPicker(){
  const list=$("pickerList");list.replaceChildren();
  if(!state.library.length){list.innerHTML='<p class="hint">No saved furniture yet. Create one below.</p>'}
  state.library.forEach(f=>{const row=document.createElement("div");row.className="picker-item";row.innerHTML=`<div><strong>${f.label}</strong><div class="meta">${formatInches(f.widthIn)} × ${formatInches(f.lengthIn)}</div></div><button data-id="${f.id}" class="primary">Add</button>`;row.querySelector("button").onclick=()=>{const item=state.library.find(x=>x.id===f.id);createObject({...clone(item),id:null,x:500,y:500,libraryId:item.id});saveLocal();$("furniturePicker").hidden=true};list.append(row)});
  $("furniturePicker").hidden=false
}
function newConfig(){state.objects=[];state.selectedId=null;$("configName").value="";renderObjects();announce("New empty layout")}
function currentConfig(){return{name:state.configName||"Untitled layout",version:APP_VERSION,objects:clone(state.objects),settings:{scale:state.scaleInchesPerPlanUnit,grid:state.gridInches,movement:state.movementInches,snap:state.snap}}}
function saveConfig(){
  state.configName=$("configName").value.trim()||"Untitled layout";const c=currentConfig(),idx=state.configs.findIndex(x=>x.name===state.configName);
  if(idx>=0)state.configs[idx]=c;else state.configs.push(c);renderConfigList();saveLocal();announce(`${state.configName} saved`)
}
function renderConfigList(){const s=$("configSelect"),cur=s.value;s.replaceChildren();state.configs.forEach(c=>{const o=document.createElement("option");o.value=c.name;o.textContent=c.name;s.append(o)});if(state.configs.some(c=>c.name===cur))s.value=cur}
function loadConfig(){
  const c=state.configs.find(x=>x.name===$("configSelect").value);if(!c)return;state.objects=clone(c.objects||[]);state.configName=c.name;$("configName").value=c.name;
  if(c.settings){state.scaleInchesPerPlanUnit=c.settings.scale||state.scaleInchesPerPlanUnit;state.gridInches=c.settings.grid||6;state.movementInches=c.settings.movement||6;state.snap=c.settings.snap!==false}
  syncControls();state.selectedId=null;renderObjects();announce(`${c.name} loaded`)
}
function deleteConfig(){const name=$("configSelect").value;if(!name)return;state.configs=state.configs.filter(c=>c.name!==name);renderConfigList();saveLocal();announce(`${name} deleted`)}
function syncControls(){
  $("snapToggle").checked=state.snap;$("snapToGrid").checked=state.snap;$("gridSpacing").value=String(state.gridInches);$("movementUnit").value=String(state.movementInches);$("gridVisible").checked=state.gridVisible;$("majorGridVisible").checked=state.majorGridVisible;updateGrid()
}
function updateGrid(){
  const pxPerInch=state.scaleInchesPerPlanUnit?1/state.scaleInchesPerPlanUnit:1/0.25;
  const minor=clamp(state.gridInches*pxPerInch,8,80),major=minor*5;
  const minorPattern=$("gridPattern"),majorPattern=$("gridMajorPattern");minorPattern.setAttribute("width",minor);minorPattern.setAttribute("height",minor);minorPattern.querySelector("path").setAttribute("d",`M ${minor} 0 L 0 0 0 ${minor}`);
  majorPattern.setAttribute("width",major);majorPattern.setAttribute("height",major);
  $("gridMinor").style.display=state.gridVisible?"":"none";$("gridMajor").style.display=state.majorGridVisible?"":"none";
}
function updateScaleStatus(){
  $("scaleStatus").textContent=state.scaleInchesPerPlanUnit?`Scale: ${state.scaleInchesPerPlanUnit.toFixed(3)} in/plan unit`:"Scale: not calibrated";
  $("calibrationResult").textContent=state.scaleInchesPerPlanUnit?`1 plan unit = ${state.scaleInchesPerPlanUnit.toFixed(3)} real inches.`:"Not calibrated.";
}
function calibrate(){const real=parseInches($("knownDistance").value),plan=Number($("planDistance").value);if(!Number.isFinite(real)||real<=0||!Number.isFinite(plan)||plan<=0){announce("Enter both a real distance and plan distance.");return}state.scaleInchesPerPlanUnit=real/plan;updateScaleStatus();updateGrid();renderObjects();saveLocal();announce("Scale calibrated")}
function resetScale(){state.scaleInchesPerPlanUnit=null;updateScaleStatus();updateGrid();renderObjects();saveLocal();announce("Scale reset")}
function configDownload(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function readJson(file,cb){const r=new FileReader();r.onload=()=>{try{cb(JSON.parse(r.result))}catch(e){announce("That JSON file could not be read.")}};r.readAsText(file)}
function exportBackup(){configDownload(`floor-planner-backup-${new Date().toISOString().slice(0,10)}.json`,{app:"Floor Planner",version:APP_VERSION,configs:state.configs,library:state.library,settings:{scale:state.scaleInchesPerPlanUnit,grid:state.gridInches,movement:state.movementInches,snap:state.snap,gridVisible:state.gridVisible,majorGridVisible:state.majorGridVisible}})}
function exportConfig(){const c=currentConfig();configDownload(`${c.name.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.json`,c)}
function exportFurniture(){const o=getSelected();if(!o){announce("Select furniture first.");return}configDownload(`${o.label.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.json`,o)}
function importBackup(file){readJson(file,d=>{if(d.configs)state.configs=d.configs;if(d.library)state.library=d.library;if(d.settings){state.scaleInchesPerPlanUnit=d.settings.scale||null;state.gridInches=d.settings.grid||6;state.movementInches=d.settings.movement||6;state.snap=d.settings.snap!==false;state.gridVisible=d.settings.gridVisible!==false;state.majorGridVisible=d.settings.majorGridVisible!==false}saveLocal();renderAll();announce("Backup restored")})}
function importConfig(file){readJson(file,d=>{const c=d.name?d:{name:"Imported layout",objects:d.objects||[]};state.configs=state.configs.filter(x=>x.name!==c.name);state.configs.push(c);renderConfigList();saveLocal();announce("Configuration imported")})}
function importFurniture(file){readJson(file,d=>{const f={...d,id:uid("lib")};delete f.x;delete f.y;state.library.push(f);renderLibrary();saveLocal();announce("Furniture imported")})}
function loadFloorplan(src){const img=$("floorplanImage");img.setAttribute("href",src);img.style.display="";localStorage.setItem("floorplan-image",src)}
function resetFloorplan(){localStorage.removeItem("floorplan-image");$("floorplanImage").setAttribute("href",DEFAULT_FLOORPLAN);$("floorplanImage").style.display="";announce("Repository floor plan restored")}
function renderAll(){renderConfigList();renderLibrary();syncControls();updateScaleStatus();renderObjects()}
function openPanel(id){const p=$(id);if(!p)return;document.querySelectorAll(".control-panel").forEach(x=>{if(state.profile!=="desktop")x.open=x===p});p.open=true;p.scrollIntoView({behavior:"smooth",block:"start"})}
function wire(){
  $("addFurnitureButton").onclick=openPicker;$("mobileAdd").onclick=openPicker;$("pickerNew").onclick=()=>{$("furniturePicker").hidden=true;openPanel("editorPanel");clearEditor();$("objectLabel").focus()}
  $("closePicker").onclick=()=>$("furniturePicker").hidden=true;$("helpButton").onclick=()=>$("gettingStarted").hidden=false;$("closeGettingStarted").onclick=()=>$("gettingStarted").hidden=true;$("startPlanning").onclick=()=>{$("gettingStarted").hidden=true;if($("dontShowGuide").checked)localStorage.setItem("fp-guide-seen","1")}
  $("backupTopButton").onclick=()=>openPanel("backupPanel");$("fitView").onclick=()=>{state.zoom=100;fitStage();$("stageViewport").scrollTo({top:0,left:0,behavior:"smooth"})};$("zoomRange").oninput=e=>setZoom(e.target.value);$("zoomIn").onclick=()=>setZoom(state.zoom+10);$("zoomOut").onclick=()=>setZoom(state.zoom-10)
  $("snapToggle").onchange=e=>{state.snap=e.target.checked;syncControls();saveLocal()};$("snapToGrid").onchange=e=>{state.snap=e.target.checked;syncControls();saveLocal()}
  $("saveConfig").onclick=saveConfig;$("newConfig").onclick=newConfig;$("loadConfig").onclick=loadConfig;$("deleteConfig").onclick=deleteConfig
  $("addLibraryFurniture").onclick=addLibrary;$("editLibraryFurniture").onclick=editLibrary;$("deleteLibraryFurniture").onclick=deleteLibrary
  $("createFurniture").onclick=()=>{const d=editorData();if(!d)return;createObject(d);saveLocal()};$("updateFurniture").onclick=updateEditor;$("clearEditor").onclick=clearEditor;$("saveToLibrary").onclick=saveSelectedToLibrary
  $("selectPlaced").onclick=()=>{if($("placedSelect").value)selectObject($("placedSelect").value)};$("duplicatePlaced").onclick=duplicateSelected;$("deletePlaced").onclick=deleteSelected;$("placedSelect").onchange=e=>{if(e.target.value)selectObject(e.target.value)}
  $("gridVisible").onchange=e=>{state.gridVisible=e.target.checked;updateGrid();saveLocal()};$("majorGridVisible").onchange=e=>{state.majorGridVisible=e.target.checked;updateGrid();saveLocal()};$("gridSpacing").onchange=e=>{state.gridInches=Number(e.target.value);updateGrid();saveLocal()};$("movementUnit").onchange=e=>{state.movementInches=Number(e.target.value);saveLocal()}
  $("calibrateScale").onclick=calibrate;$("resetScale").onclick=resetScale
  $("exportBackup").onclick=exportBackup;$("exportConfig").onclick=exportConfig;$("exportFurniture").onclick=exportFurniture
  $("importBackup").onchange=e=>e.target.files[0]&&importBackup(e.target.files[0]);$("importConfig").onchange=e=>e.target.files[0]&&importConfig(e.target.files[0]);$("importFurniture").onchange=e=>e.target.files[0]&&importFurniture(e.target.files[0])
  $("floorplanUpload").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadFloorplan(r.result);r.readAsDataURL(f)};$("resetFloorplan").onclick=resetFloorplan
  $("floatingToolbar").addEventListener("click",e=>{const a=e.target.dataset.action;if(a==="rotate")rotateSelected();if(a==="edit"){openPanel("editorPanel");selectedToEditor()}if(a==="duplicate")duplicateSelected();if(a==="delete")deleteSelected()})
  $("mobileEdit").onclick=()=>{openPanel("editorPanel");selectedToEditor()};$("mobileRotate").onclick=rotateSelected;$("mobileDuplicate").onclick=duplicateSelected;$("mobileDelete").onclick=deleteSelected
  document.querySelectorAll("[data-panel-target]").forEach(b=>b.onclick=()=>openPanel(b.dataset.panelTarget))
  $("stage").addEventListener("click",()=>{state.selectedId=null;renderSelection();renderPlacedList()})
  addEventListener("resize",()=>{clearTimeout(window._fpResize);window._fpResize=setTimeout(applyLayout,80)});addEventListener("orientationchange",applyLayout);visualViewport?.addEventListener("resize",()=>{clearTimeout(window._fpVV);window._fpVV=setTimeout(applyLayout,80)})
}
function initialize(){
  loadLocal();wire();applyLayout();renderAll();
  const savedFloor=localStorage.getItem("floorplan-image");if(savedFloor)loadFloorplan(savedFloor);else resetFloorplan();
  if(!localStorage.getItem("fp-guide-seen"))$("gettingStarted").hidden=false;
  announce("Ready. Tap ＋ Furniture to begin.");
}
initialize();
