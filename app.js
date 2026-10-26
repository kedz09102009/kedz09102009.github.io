// ===== 1. CẤU HÌNH =====
// Danh sách môn học: n = tên hiển thị, c = màu. Đổi tên/màu ở đây.
const BUILD='2026-10-18-no-daily-xp-cap-v16'; // Bản phát hành: bỏ trần XP 300/ngày trên bảng xếp hạng tuần
const GLOBAL_RACE_ROOM='XDU92JXZ'; // Giữ namespace hiện tại để thành viên hiện có không bị mất khỏi bảng
const DEF_SUBJ=[{id:'toan',n:'Toán',c:'#3b6fd4',ic:'🧮'},{id:'ly',n:'Lý',c:'#d9822b',ic:'🔭'},{id:'anh',n:'Anh',c:'#c2467a',ic:'🗣️'},{id:'khac',n:'Khác',c:'#6b7280'}];
const SUBJ={}; // tra cứu nhanh theo id môn; được dựng lại từ S.subjects bằng rebuildSubj(). Thêm/đổi tên/đổi màu/ẩn môn ngay trong phần Cài đặt.
// ===== 2. DỮ LIỆU (biến S) =====
// S chứa mọi thứ: sessions = các buổi học đã lưu, active = buổi đang học,
// ach = thành tích đã mở khoá, goalD/goalW = mục tiêu ngày/tuần (phút).
// S được lưu vào localStorage (bộ nhớ của trình duyệt) bằng hàm save().
let S={sessions:[],active:null,sel:'toan',ach:{},del:{},su:0,goalD:120,goalW:600,pomo:false,rem:'',u:0,ver:1,rev:0,minD:15,goalDays:5,rest:1,room:'',name:'',goals:[],subjects:DEF_SUBJ.map(x=>({...x}))},fin=false,focus=0,topic='',typ='',vN='',vC='',delId=0,hAll=false,EF=null,chM='w',GF=null,cY=new Date().getFullYear(),cM=new Date().getMonth();
let analyticsRange=7; // khoảng thời gian đang xem trong phần phân tích; không ảnh hưởng dữ liệu lưu trữ
let goalsShowAll=false; // chỉ hiện ba mục tiêu đầu để trang gọn hơn
const VER=1; // phiên bản định dạng dữ liệu. Sau này nếu đổi cách lưu, tăng số này và xử lý trong migrate()
function migrate(o){if(!o||typeof o!='object')return{};
  o.sessions=(Array.isArray(o.sessions)?o.sessions:[]).filter(x=>x&&typeof x.ts=='number'&&typeof x.dur=='number'&&typeof x.subj=='string'); // bỏ bản ghi hỏng
  o.del=o.del||{};o.ach=o.ach||{};o.ver=o.ver||1;if(!Array.isArray(o.subjects)||!o.subjects.length)delete o.subjects;if(!Array.isArray(o.goals))delete o.goals;return o}
try{const r=localStorage.getItem('studylog');if(r)S=Object.assign(S,migrate(JSON.parse(r)))}catch(e){}
function rebuildSubj(){Object.keys(SUBJ).forEach(k=>delete SUBJ[k]);S.subjects.forEach(x=>{SUBJ[x.id]=x})}
// Đảm bảo mọi môn có buổi học đều có trong danh sách môn (phòng khi dữ liệu đến từ nơi khác)
function ensureSubjects(){S.sessions.forEach(x=>{if(!S.subjects.some(y=>y.id==x.subj))S.subjects.push({id:x.subj,n:x.subj,c:'#6b7280'})});rebuildSubj()}
// Các môn hiển thị khi chọn (không gồm môn đã ẩn, trừ môn đang chọn)
function vis(sel){const v=Object.keys(SUBJ).filter(k=>!SUBJ[k].hid||k==sel);return v.length?v:Object.keys(SUBJ)}
function subUI(){return S.subjects.map(x=>`<div class="in"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(x.c)?x.c:'#6b7280'}" onchange="subSet('${x.id}','c',this.value)"><input type="text" style="flex:1;margin:0;min-width:90px" value="${esc(x.n)}" onchange="subSet('${x.id}','n',this.value.trim())"><label><input type="checkbox" ${x.hid?'checked':''} onchange="subSet('${x.id}','hid',this.checked)"> Ẩn</label></div>`).join('')+'<div class="in"><input type="text" id="ns" style="flex:1;margin:0" placeholder="Tên môn mới (vd: Hoá, Lập trình...)"><button class="btn g" onclick="subAdd()">＋ Thêm môn</button></div>'}
function subSet(id,k,v){const x=S.subjects.find(y=>y.id==id);if(!x)return;if(k=='n'&&!v)return render();x[k]=v;if(k=='hid'&&!v)delete x.hid;S.su=Date.now();rebuildSubj();save();render()}
function subAdd(){const n=$('ns').value.trim();if(!n)return;const P=['#2f8f6e','#8a5cc2','#c2a02f','#2a9bb5','#d65a4a','#5b7bd5'];
  S.subjects.push({id:'s'+Date.now().toString(36),n,c:P[S.subjects.length%P.length]});S.su=Date.now();rebuildSubj();save();render()}
ensureSubjects();
// Lưu S vào localStorage. Sau mỗi thay đổi dữ liệu: gọi save() rồi render().
// Hai nơi lưu: localStorage (bản nhớ tạm trong trình duyệt) và, nếu đang chạy server.py, file data.json trên máy.
let serverMode=false,disk='local',st,ro=false,lastW=0,user=null,peers=undefined,cstat='',unM=null,unR=null,cpt,ppt,cloudHooked=false,cloudSynced=false,cloudRev=0,raceRank=0,racePrev={},raceBoom=0,lastChk=0,updShown=false,roomPublishError=null,roomPublishBusy=false,roomPublishPromise=null,roomReadError=false;
function cache(){try{localStorage.setItem('studylog',JSON.stringify(S))}catch(e){}}
function save(){if(ro)return;cache();cPush();pubSummary();if(serverMode){clearTimeout(st);st=setTimeout(toServer,800)}}
// Ghi lên server kèm số phiên bản (rev). Nếu data.json đã bị nơi khác sửa (409): gộp dữ liệu rồi ghi lại.
function toServer(n=0){if(ro||n>3)return;
  fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json','X-Base-Rev':String(S.rev||0)},body:JSON.stringify(S)})
   .then(r=>r.json().then(o=>{
     if(r.status===409){merge(o);S.rev=o.rev||0;cache();render();return toServer(n+1)}
     if(!r.ok)throw 0;S.rev=o.rev;cache();disk='ok';stat()}))
   .catch(()=>{disk='err';stat()})}
function stat(){const e=$('sy');if(e)e.textContent={ok:'💾 Dữ liệu đang được lưu vào file data.json trên máy bạn',err:'⚠ Không ghi được data.json — hãy kiểm tra server.py còn chạy không',local:'Đang lưu trong trình duyệt. Chạy server.py để lưu vào file data.json trên máy bạn.'}[disk]}
const $=id=>document.getElementById(id);
// Điều hướng nhanh chỉ cuộn tới mục, không chuyển tab hay tải trang mới.
function jumpToSection(id){
  if(!id)return;
  const el=$(id);if(!el)return;
  const fold=el.matches&&el.matches('details.fold')?el:(el.closest?el.closest('details.fold'):null);
  if(fold)fold.open=true;
  const target=id==='pageTop'?document.body:el;
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({behavior:reduced?'auto':'smooth',block:id==='pageTop'?'start':'start'});
  const sel=$('quickJump');if(sel)sel.value='';
}

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const dk=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const hm=s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+'g '+pad(m)+'p':m+' phút'};
const clk=s=>pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);
const el=()=>{const a=S.active;return a?Math.floor((a.acc+(a.run?Date.now()-a.run:0))/1000):0};
const H=3600;
// ===== 4. THÀNH TÍCH =====
// Mỗi dòng: [id, biểu tượng, tên, mô tả, hàm trả về [tiến độ hiện tại, mục tiêu]]
// Muốn thêm thành tích: thêm một dòng vào mảng A.
const A=[
['first','🌱','Bước đầu tiên','Hoàn thành 1 buổi học',s=>[s.n,1]],
['s3','🔥','Giữ lửa','Học 3 ngày liên tiếp',s=>[s.best,3]],
['s7','⚡','Một tuần bền bỉ','Học 7 ngày liên tiếp',s=>[s.best,7]],
['s30','🏆','Thói quen thép','Học 30 ngày liên tiếp',s=>[s.best,30]],
['h10','⏱️','10 giờ đầu tiên','Tổng cộng 10 giờ học',s=>[s.tot/H,10]],
['h25','📖','25 giờ','Tổng cộng 25 giờ học',s=>[s.tot/H,25]],
['h50','📚','50 giờ','Tổng cộng 50 giờ học',s=>[s.tot/H,50]],
['h100','🎓','100 giờ','Tổng cộng 100 giờ học',s=>[s.tot/H,100]],
['h250','🌟','250 giờ','Tổng cộng 250 giờ học',s=>[s.tot/H,250]],
['h500','💎','500 giờ','Tổng cộng 500 giờ học',s=>[s.tot/H,500]],
['h1000','👑','Nghìn giờ','Tổng cộng 1.000 giờ học',s=>[s.tot/H,1000]],
['h2500','🏅','2.500 giờ','Tổng cộng 2.500 giờ học',s=>[s.tot/H,2500]],
['h5000','🌌','5.000 giờ','Tổng cộng 5.000 giờ học',s=>[s.tot/H,5000]],
['h10000','🧙','Bậc thầy 10.000 giờ','Tổng cộng 10.000 giờ học',s=>[s.tot/H,10000]],
['deep','🧠','Tập trung sâu','Một buổi học liền 60 phút',s=>[s.long/60,60]],
['long','🚀','Marathon','Một buổi học liền 2 giờ',s=>[s.long/60,120]],
['bal','⚖️','Cân bằng','Học từ 3 môn khác nhau trong 7 ngày',s=>[s.bal,3]],
['mas','⭐','Nền tảng vững','3 môn khác nhau, mỗi môn đạt 10 giờ',s=>[Object.keys(s.by).filter(k=>k!='khac'&&s.by[k]>=10*H).length,3]],
['f5','🎯','Chất lượng','5 buổi tự chấm 5 sao',s=>[s.f5,5]],
['early','🌅','Chim sớm','Bắt đầu học trước 7 giờ sáng',s=>[s.early,1]],
['wk2','📅','Hai tuần đều','Đạt mục tiêu số ngày học 2 tuần liên tiếp',s=>[s.wbest,2]],
['wk4','🗓️','Tháng đều đặn','Đạt mục tiêu số ngày học 4 tuần liên tiếp',s=>[s.wbest,4]],
['wk12','🌳','Một quý bền bỉ','Đạt mục tiêu số ngày học 12 tuần liên tiếp',s=>[s.wbest,12]],
['d20','📈','20 trên 30','Học ít nhất 20 ngày trong 30 ngày gần nhất',s=>[s.m30,20]],
['back','🔄','Trở lại','Học lại sau khi nghỉ từ 3 ngày trở lên',s=>[s.back,1]]
];
// Danh sách thành tích đầy đủ = thành tích chung (mảng A) + thành tích riêng cho từng môn (tự tạo theo danh sách môn)
function achAll(){const L=A.slice();
  Object.keys(SUBJ).forEach(k=>{const m=SUBJ[k];if(k=='khac'||(m.hid&&!S.sessions.some(x=>x.subj==k)))return;const n=m.n,i=m.ic||'📘';
    L.push([k+'25',i,n+' 25 giờ','25 giờ học môn '+n,s=>[(s.by[k]||0)/H,25]]);
    L.push([k+'100',i,n+' 100 giờ','100 giờ học môn '+n,s=>[(s.by[k]||0)/H,100]]);
    L.push([k+'acc','🎯','Chính xác: '+n,'Làm ≥50 bài '+n+' với ≥90% đúng',s=>{const[a,b]=s.q[k]||[0,0];return[a>=50&&b>=.9*a?1:Math.min(a,49)/50,1]}])});
  return L}

// Chia thời lượng một buổi học theo từng ngày (buổi học qua nửa đêm được tách làm hai ngày)
function spans(x){const out=[];let end=x.ts,left=x.dur*1000,i=0;
  while(left>0&&i++<400){const d=new Date(end-1);d.setHours(0,0,0,0);const take=Math.min(left,end-d.getTime());out.push([dk(d.getTime()),take/1000]);end-=take;left-=take}
  return out}
// Phát hiện máy ngủ / đóng trang khi đồng hồ đang chạy: dừng đồng hồ tại lần "còn sống" cuối cùng, rồi hỏi bạn
function chkGap(now){const a=S.active;if(!a||!a.run||fin)return false;
  const hb=Math.max(a.hb||0,a.run);
  if(now-hb>3e5){a.acc+=Math.max(0,hb-a.run);a.run=0;a.brk=0;a.gap={ms:now-hb,at:hb};save();return true}
  a.hb=now;return false}
function gap(y){const a=S.active;if(y)a.acc+=a.gap.ms;a.gap=null;save();render()}
// Hỏi lại khi đồng hồ chạy liên tục quá lâu (3 giờ, rồi mỗi 3 giờ nữa)
function ask(y){const a=S.active;a.ask=false;if(y)a.nx=el()+10800;else if(a.run)toggle();save();render()}
// ===== 3. THỐNG KÊ =====
// Duyệt qua mọi buổi học để tính tổng giờ, chuỗi ngày, XP, thời gian theo môn...
function stats(){
  const o={q:{},xp:0,pn:0,pc:0,ty:{},tot:0,n:S.sessions.length,long:0,by:{},f5:0,early:0,days:{},bal:0};
  const rec=new Set();
  S.sessions.forEach(x=>{o.tot+=x.dur;o.xp+=sxp(x); // buổi nhập tay chỉ được nửa XP; số bài tính XP có giới hạn theo thời lượng
    o.pn+=x.n||0;o.pc+=x.c||0;(o.q[x.subj]=o.q[x.subj]||[0,0]);o.q[x.subj][0]+=x.n||0;o.q[x.subj][1]+=x.c||0;if(x.type)o.ty[x.type]=(o.ty[x.type]||0)+x.dur;o.by[x.subj]=(o.by[x.subj]||0)+x.dur;if(!x.man)o.long=Math.max(o.long,x.dur);if(x.focus==5)o.f5++;
    if(!x.man&&new Date(x.st||x.ts).getHours()<7)o.early++;spans(x).forEach(([k,sec])=>{o.days[k]=(o.days[k]||0)+sec});
    if(Date.now()-x.ts<6048e5&&x.subj!='khac')rec.add(x.subj)});
  o.xp+=Object.keys(S.ach).length*50;o.bal=rec.size;
  const ok=k=>(o.days[k]||0)>=(S.minD||15)*60; // chỉ ngày học đủ số phút tối thiểu mới tính vào chuỗi
  const ds=Object.keys(o.days).filter(ok).sort(),REST=S.rest==null?1:S.rest,tk=dk(Date.now());
  const wkOf=d=>{const w=new Date(d);w.setDate(w.getDate()-((w.getDay()+6)%7));return dk(w)};
  let best=0,run=0;const u={};
  // Duyệt từng ngày từ ngày học đầu tiên đến nay. Ngày bỏ lỡ làm đứt chuỗi, trừ khi tuần đó còn "ngày nghỉ miễn chuỗi".
  if(ds.length)for(const d=new Date(ds[0]+'T12:00:00');dk(d)<=tk;d.setDate(d.getDate()+1)){const k=dk(d);
    if(ok(k)){run++;best=Math.max(best,run)}else if(k!==tk){const w=wkOf(d);u[w]=(u[w]||0)+1;if(u[w]>REST)run=0}}
  o.best=best;o.cur=run;o.restLeft=Math.max(0,REST-(u[wkOf(new Date())]||0));
  o.back=0;ds.forEach((k,i)=>{if(i>=3&&Math.round((new Date(k+'T12:00:00')-new Date(ds[i-1]+'T12:00:00'))/864e5)>=4)o.back=1}); // học lại sau ≥3 ngày nghỉ
  o.m30=0;for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);if(ok(dk(d)))o.m30++}
  const wc={};ds.forEach(k=>{const w=wkOf(new Date(k+'T12:00:00'));wc[w]=(wc[w]||0)+1}); // số ngày học theo từng tuần
  let wr=0;o.wbest=0;const wks=Object.keys(wc).sort();
  if(wks.length)for(const w=new Date(wks[0]+'T12:00:00');dk(w)<=wks[wks.length-1];w.setDate(w.getDate()+7)){if((wc[dk(w)]||0)>=(S.goalDays||5)){wr++;o.wbest=Math.max(o.wbest,wr)}else wr=0}return o;
}
function toast(t){const e=$('toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',3500)}
function checkAch(){const s=stats(),nw=[];
  achAll().forEach(a=>{const[c,t]=a[4](s);if(!S.ach[a[0]]&&c>=t){S.ach[a[0]]=Date.now();nw.push(a[1]+' '+a[2])}});
  if(nw.length)toast('Mở khoá thành tích: '+nw.join(', '))}
// ===== 5. HÀNH ĐỘNG khi bấm nút (bắt đầu, tạm dừng, kết thúc, lưu...) =====
function pick(k){if(S.active)return;S.sel=k;save();render()}
function start(){const n=Date.now();S.active={subj:S.sel,acc:0,run:n,st:n};fin=false;focus=0;topic='';typ='';vN='';vC='';save();render()}
function toggle(){const a=S.active;if(a.brk){a.brk=0;a.run=Date.now()}else if(a.run){a.acc+=Date.now()-a.run;a.run=0}else a.run=Date.now();save();render()}
function stop(){const a=S.active;a.brk=0;if(a.run){a.acc+=Date.now()-a.run;a.run=0}if(a.acc<6e4){toast('Buổi học dưới 1 phút nên không được lưu');S.active=null;save();render();return}fin=true;save();render()}
function cancel(){S.active=null;fin=false;save();render()}
function setF(n){keep();focus=n;render()}
function saveS(){const a=S.active,n=Date.now(),N=Math.max(0,+$('fn').value||0),C=Math.min(N,Math.max(0,+$('fc').value||0));
  S.sessions.push({id:n,subj:a.subj,dur:Math.round(a.acc/1000),ts:n,st:a.st,topic:$('tp').value.trim(),focus:focus,type:typ,n:N,c:C});
  S.active=null;fin=false;checkAch();save();render()}
function del(id){if(delId!==id){delId=id;render();setTimeout(()=>{if(delId===id){delId=0;render()}},3000);return}
  S.sessions=S.sessions.filter(x=>x.id!==id);S.del[id]=Date.now();delId=0;save();render()}
// ===== 6. VẼ GIAO DIỆN =====
// render() dựng lại HTML của cả trang từ dữ liệu S.
// Vẽ lại giao diện nhưng giữ con trỏ đang gõ dở (nếu có)
function render(){
  const ae=document.activeElement;let box=null,idx=-1,pos=null;
  if(ae&&ae.tagName=='INPUT'){box=ae.closest('#timer,#ed,#set');if(box){idx=[...box.querySelectorAll('input')].indexOf(ae);try{pos=ae.selectionStart}catch(e){}}}
  draw();
  if(box){const n=document.getElementById(box.id).querySelectorAll('input')[idx];if(n){n.focus();try{if(pos!=null)n.setSelectionRange(pos,pos)}catch(e){}}}}
function draw(){if(!SUBJ[S.sel])S.sel=vis('')[0];
  const a=S.active,sub=a?a.subj:S.sel;
  let t='<div class="chips">'+vis(sub).map(k=>`<button class="chip ${k==sub?'on':''}" ${a?'disabled':''} style="${k==sub?'background:'+SUBJ[k].c:''}" onclick="pick('${k}')">${SUBJ[k].n}</button>`).join('')+'</div>';
  {const td=stats().days[dk(Date.now())]||0,p=Math.min(td/(S.goalD*60),1)*100;t+=`<div class="ring" style="--p:${p.toFixed(1)}"><div class="inr"><div class="clock" id="clk">${clk(el())}</div><small class="s">Hôm nay ${Math.round(td/60)}/${S.goalD} phút</small></div></div>`}if(S.pomo&&a&&!fin)t+='<div class="empty" id="pm" style="padding:0 0 8px"></div>';
  if(a&&a.gap)t+=`<div class="warn">⏸ Đồng hồ tự tạm dừng lúc ${new Date(a.gap.at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} vì không có hoạt động trong ${hm(Math.round(a.gap.ms/1000))}. Bạn có học trong khoảng đó không?<div class="row" style="margin-top:8px"><button class="btn g" onclick="gap(0)">Không, bỏ khoảng này</button><button class="btn g" onclick="gap(1)">Có, tính cả</button></div></div>`;
  if(a&&a.ask&&a.run&&!fin)t+=`<div class="warn">⏰ Đồng hồ đã chạy ${hm(el())}. Bạn còn đang học chứ?<div class="row" style="margin-top:8px"><button class="btn g" onclick="ask(0)">Tạm dừng</button><button class="btn g" onclick="ask(1)">Vẫn đang học</button></div></div>`;
  if(!a)t+='<div class="row"><button class="btn" onclick="start()">▶ Bắt đầu học</button></div><label class="in" style="justify-content:center;margin-top:10px"><input type="checkbox" '+(S.pomo?'checked':'')+' onchange="cp(this.checked)"> 🍅 Pomodoro (25 phút học / 5 phút nghỉ)</label>';
  else if(!fin)t+=`<div class="row"><button class="btn g" onclick="toggle()">${a.brk?'⏭ Bỏ nghỉ':a.run?'⏸ Tạm dừng':'▶ Tiếp tục'}</button><button class="btn" onclick="stop()">■ Kết thúc</button></div>`;
  else{const ty=['Lý thuyết','Bài tập','Ôn lại','Thực hành'].concat(a.subj=='anh'?['Nghe/nói']:[]);t+=`<input type="text" id="tp" oninput="topic=this.value" placeholder="Hôm nay học nội dung gì? (vd: Đạo hàm, Dao động cơ…)" value="${esc(topic)}"><div style="text-align:center">${ty.map(x=>`<button class="chip t ${typ==x?'on':''}" onclick="setT('${x}')">${x}</button>`).join('')}</div><div class="in" style="justify-content:center">Bài đã làm <input type="number" min="0" id="fn" oninput="vN=this.value" value="${esc(vN)}"> Bài đúng <input type="number" min="0" id="fc" oninput="vC=this.value" value="${esc(vC)}"></div><div class="stars" style="text-align:center"><small style="color:var(--mut)">Mức tập trung</small><br>${[1,2,3,4,5].map(n=>`<button class="${n<=focus?'on':''}" onclick="setF(${n})">★</button>`).join('')}</div><div class="row" style="margin-top:8px"><button class="btn g" onclick="cancel()">Bỏ buổi này</button><button class="btn" onclick="saveS()">Lưu buổi học</button></div>`}
  $('timer').innerHTML=t;
  const s=stats(),today=s.days[dk(Date.now())]||0;$('recap').innerHTML=recapUI(s);
  $('stats').innerHTML=[[hm(today),'Hôm nay'],[s.cur+' 🔥','Chuỗi ngày'],[hm(s.tot),'Tổng thời gian'],[s.n,'Số buổi']].map(x=>`<div class="stat"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
  const lv=Math.floor(Math.sqrt(s.xp/50))+1,lo=50*(lv-1)**2,hi=50*lv*lv;
  const w0=new Date();w0.setHours(0,0,0,0);w0.setDate(w0.getDate()-((w0.getDay()+6)%7));
  let wk=0;for(let i=0;i<7;i++){const dd=new Date(w0);dd.setDate(dd.getDate()+i);wk+=s.days[dk(dd)]||0}
  const gb=(l,v,g)=>`<div class="sub"><span>${l}</span><span>${hm(v)} / ${hm(g*60)}</span></div><div class="bar"><i style="width:${Math.min(v/(g*60),1)*100}%;background:var(--ac)"></i></div>`;
  $('lvl').innerHTML=`<div class="lv"><b>Cấp ${lv}</b><div style="flex:1"><div class="bar"><i style="width:${(s.xp-lo)/(hi-lo)*100}%;background:var(--ac)"></i></div><small class="s">${s.xp} XP · còn ${hi-s.xp} XP lên cấp ${lv+1}</small></div></div><small class="s">1 XP/phút học · +2 XP mỗi bài làm · +1 XP mỗi bài đúng · +50 XP mỗi thành tích</small><div style="margin-top:10px">${gb('🎯 Hôm nay',today,S.goalD)}${gb('📅 Tuần này',wk,S.goalW)}</div>`;
  const okd=k=>(s.days[k]||0)>=(S.minD||15)*60,gd=S.goalDays||5;let wd=0,dots='';
  ['T2','T3','T4','T5','T6','T7','CN'].forEach((n,i)=>{const dd=new Date(w0);dd.setDate(dd.getDate()+i);const k=dk(dd),on=okd(k);if(on)wd++;dots+=`<span class="dt ${on?'on':''} ${k==dk(Date.now())?'td':''}">${n}</span>`});
  $('hab').innerHTML=`<div class="dots">${dots}</div><div class="sub"><span>Tuần này</span><span>${wd}/${gd} ngày${wd>=gd?' ✅':''}</span></div><div class="bar"><i style="width:${Math.min(wd/gd,1)*100}%;background:var(--ac)"></i></div><small class="s" style="margin-top:8px">30 ngày qua: ${s.m30}/30 ngày · Chuỗi: ${s.cur} ngày 🔥 · Ngày nghỉ miễn chuỗi tuần này: còn ${s.restLeft}</small>`;
  const th=s.ty['Lý thuyết']||0,pr=(s.ty['Bài tập']||0)+(s.ty['Nghe/nói']||0)+(s.ty['Thực hành']||0),tm=Math.max(1,...Object.values(s.ty));
  const q=k=>{let n=0,c=0;S.sessions.forEach(x=>{if(x.subj==k){n+=x.n||0;c+=x.c||0}});return[n,c]};
  const qs=Object.keys(SUBJ).map(k=>[SUBJ[k].n,...q(k)]).filter(x=>x[1]).map(x=>`${x[0]}: ${x[1]} bài, ${Math.round(x[2]/x[1]*100)}% đúng`).join(' · ');
  $('act').innerHTML=(Object.keys(s.ty).length?Object.keys(s.ty).map(k=>`<div class="sub"><span>${k}</span><span>${hm(s.ty[k])}</span></div><div class="bar"><i style="width:${s.ty[k]/tm*100}%;background:var(--ac)"></i></div>`).join(''):'<div class="empty">Chọn loại hoạt động khi lưu buổi học để xem thống kê ở đây.</div>')+`<div class="sub" style="margin-top:12px"><span>📝 Bài tập</span><span>${s.pn} bài · ${s.pn?Math.round(s.pc/s.pn*100)+'% đúng':'chưa có'}</span></div>`+(qs?`<small class="s">${qs}</small>`:'')+(th>pr*2&&th>1800?'<small class="s" style="margin-top:8px">💡 Bạn đang đọc lý thuyết nhiều hơn luyện tập — thử làm thêm bài tập nhé.</small>':'');
  $('set').innerHTML=`<b>Môn học</b>${subUI()}<div style="height:10px"></div><div class="in">🎯 Mục tiêu ngày <input type="number" min="1" value="${S.goalD}" onchange="cfg('goalD',Math.max(1,+this.value||120))"> phút</div><div class="in">📅 Mục tiêu tuần <input type="number" min="1" value="${S.goalW}" onchange="cfg('goalW',Math.max(1,+this.value||600))"> phút</div><div class="in">🎨 Tông màu ${THEMES.map(([k,n,a,b])=>`<button class="sw ${themeGet()==k?'on':''}" style="background:linear-gradient(135deg,${a},${b})" title="${n}" aria-label="${n}" onclick="themeSet('${k}')"></button>`).join('')}</div><div class="in">✨ Hiệu ứng chuyển động <select onchange="bgSet(this.value)">${[['auto','Theo hệ thống'],['on','Luôn bật'],['off','Tắt (tiết kiệm pin)']].map(([k,n])=>`<option value="${k}" ${bgMode()==k?'selected':''}>${n}</option>`).join('')}</select></div>${bgMode()=='auto'&&redMotion()?'<small class="s">⚠ Máy bạn đang bật "giảm chuyển động" nên hiệu ứng đang tắt. Chọn "Luôn bật" để xem hiệu ứng.</small>':''}<div class="in">📆 Mục tiêu số ngày học mỗi tuần <input type="number" min="1" max="7" value="${S.goalDays||5}" onchange="cfg('goalDays',Math.min(7,Math.max(1,+this.value||5)))"> ngày</div><div class="in">🛌 Ngày nghỉ miễn chuỗi mỗi tuần <input type="number" min="0" max="3" value="${S.rest==null?1:S.rest}" onchange="cfg('rest',Math.min(3,Math.max(0,+this.value||0)))"> ngày</div><div class="in">🔥 Ngày tính vào chuỗi khi học ≥ <input type="number" min="1" value="${S.minD||15}" onchange="cfg('minD',Math.max(1,+this.value||15))"> phút</div><div class="in">⏰ Nhắc học lúc <input type="time" value="${S.rem||''}" onchange="setRem(this.value)"></div><small class="s">Nhắc trong trang chỉ chạy khi trang đang mở. Muốn nhắc cả khi đã đóng trang, hãy thêm vào lịch điện thoại.</small><div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn g" onclick="exp()">⬇ Tải bản sao lưu</button><button class="btn g" onclick="ics()">📆 Nhắc qua lịch điện thoại</button><label class="btn g">⬆ Nhập sao lưu<input type="file" accept=".json,application/json" hidden onchange="imp(this)"></label><label class="btn g">♻ Khôi phục (thay thế toàn bộ)<input type="file" accept=".json,application/json" hidden onchange="imp(this,1)"></label></div><small class="s" id="sy" style="margin-top:8px"></small><small class="s" style="margin-top:6px">Phiên bản ${BUILD} · <button class="x" onclick="chkNew(true)">Kiểm tra bản mới</button></small>`;
  const f0=new Date(cY,cM,1),nd=new Date(cY,cM+1,0).getDate(),off=(f0.getDay()+6)%7;
  let cells=['T2','T3','T4','T5','T6','T7','CN'].map(x=>`<small class="s" style="text-align:center">${x}</small>`).join(''),mt=0,md=0;
  for(let i=0;i<off;i++)cells+='<i></i>';
  for(let d=1;d<=nd;d++){const v=s.days[cY+'-'+pad(cM+1)+'-'+pad(d)]||0,r=v/(S.goalD*60);mt+=v;if(v)md++;cells+=`<b class="cd l${!v?0:r<.25?1:r<.5?2:r<1?3:4}" title="${hm(v)}">${d}</b>`}
  $('cal').innerHTML=`<div class="in" style="justify-content:space-between"><button class="x" onclick="mv(-1)">◀</button><b>Tháng ${cM+1}/${cY}</b><button class="x" onclick="mv(1)">▶</button></div><div class="cal">${cells}</div><small class="s" style="margin-top:8px">${md} ngày có học · ${hm(mt)} · màu càng đậm càng gần mục tiêu ngày</small>`;
  $('ed').innerHTML=EF?`<div class="card" style="margin-bottom:10px"><b>${EF.id?'Sửa buổi học':'Thêm buổi học'}</b><div class="chips" style="margin:8px 0">${vis(EF.subj).map(k=>`<button class="chip t ${EF.subj==k?'on':''}" onclick="EF.subj='${k}';render()">${SUBJ[k].n}</button>`).join('')}</div><div class="in">Ngày <input type="date" value="${EF.date}" oninput="EF.date=this.value"> Giờ bắt đầu <input type="time" value="${EF.time}" oninput="EF.time=this.value"> <input type="number" min="1" value="${EF.min}" oninput="EF.min=+this.value"> phút</div><input type="text" placeholder="Nội dung đã học" value="${esc(EF.topic)}" oninput="EF.topic=this.value"><div style="text-align:center">${['Lý thuyết','Bài tập','Ôn lại','Thực hành','Nghe/nói'].map(x=>`<button class="chip t ${EF.type==x?'on':''}" onclick="EF.type=EF.type=='${x}'?'':'${x}';render()">${x}</button>`).join('')}</div><div class="in" style="justify-content:center">Bài làm <input type="number" min="0" value="${EF.n}" oninput="EF.n=+this.value"> Bài đúng <input type="number" min="0" value="${EF.c}" oninput="EF.c=+this.value"></div><div class="stars" style="text-align:center">${[1,2,3,4,5].map(n=>`<button class="${n<=EF.focus?'on':''}" onclick="EF.focus=EF.focus==${n}?0:${n};render()">★</button>`).join('')}</div><div class="row" style="margin-top:8px"><button class="btn g" onclick="EF=null;render()">Huỷ</button><button class="btn" onclick="saveEd()">Lưu</button></div></div>`:'';
  $('race').innerHTML=raceUI(s);cs();raceFx();$('goals').innerHTML=goalsUI();$('gf').innerHTML=goalForm();
  const mx=Math.max(1,...Object.values(s.by));
  $('subj').innerHTML=Object.keys(SUBJ).filter(k=>!SUBJ[k].hid||s.by[k]).map(k=>`<div class="sub"><span>${SUBJ[k].n}</span><span>${hm(s.by[k]||0)}</span></div><div class="bar"><i style="width:${(s.by[k]||0)/mx*100}%;background:${SUBJ[k].c}"></i></div>`).join('');
  $('week').innerHTML=weekUI();
  $('analytics').innerHTML=analyticsUI(s);
  const AL=achAll(),un=AL.filter(x=>S.ach[x[0]]).length;
  $('achT').textContent=`Thành tích (${un}/${AL.length})`;
  $('ach').innerHTML=AL.map(x=>{const[c,t]=x[4](s),u=S.ach[x[0]],p=Math.min(c/t,1)*100;
    return `<div class="a ${u?'':'lock'}"><div class="ic">${x[1]}</div><div style="flex:1"><b>${x[2]}</b><small>${x[3]}</small>${u?`<small>Đạt ${new Date(u).toLocaleDateString('vi-VN')}</small>`:`<div class="bar"><i style="width:${p}%;background:var(--ac)"></i></div>`}</div></div>`}).join('');
  const L=S.sessions.slice().sort((a,b)=>b.ts-a.ts).slice(0,hAll?1e6:30);
  $('hist').innerHTML=L.length?L.map(x=>`<div class="h"><span class="dot" style="background:${SUBJ[x.subj].c}"></span><div class="m"><div>${esc(x.topic||SUBJ[x.subj].n)}</div><small>${SUBJ[x.subj].n} · ${new Date(x.ts).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${x.type?' · '+x.type:''}${x.n?' · '+x.c+'/'+x.n+' đúng':''}${x.focus?' · '+'★'.repeat(x.focus):''}</small></div><b>${hm(x.dur)}</b><button class="x" onclick="openEd(${x.id})">Sửa</button><button class="x" onclick="del(${x.id})">${delId==x.id?'Chắc chắn?':'Xoá'}</button></div>`).join(''):'<div class="empty">Chưa có buổi học nào. Chọn môn và bấm Bắt đầu!</div>';if(S.sessions.length>30)$('hist').innerHTML+=`<button class="x" onclick="hAll=!hAll;render()">${hAll?'Thu gọn':'Xem tất cả ('+S.sessions.length+')'}</button>`;stat();
}
const clk2=s=>pad(Math.floor(s/60))+':'+pad(s%60);
function keep(){vN=$('fn').value;vC=$('fc').value;topic=$('tp').value}
function setT(x){keep();typ=x;render()}
function setRem(v){S.rem=v;S.su=Date.now();save();try{if(window.Notification&&Notification.permission=='default')Notification.requestPermission()}catch(e){}}
// Báo cho bạn biết: tiếng bíp + thông báo trong trang + thông báo của hệ thống (nếu bạn đã cho phép)
function ping(m){beep();toast(m);try{if(window.Notification&&Notification.permission=='granted'){
  // Trên điện thoại phải gửi thông báo qua service worker; trên máy tính dùng cách thường
  const sw=navigator.serviceWorker&&navigator.serviceWorker.getRegistration?navigator.serviceWorker.getRegistration():Promise.resolve();
  sw.then(r=>r?r.showNotification('Nhật ký học tập',{body:m}):new Notification('Nhật ký học tập',{body:m})).catch(()=>{})}}catch(e){}}
// Giữ màn hình sáng khi đồng hồ đang chạy (điện thoại tắt màn hình thì trình duyệt đóng băng trang)
let wl=null;
async function wake(){try{const on=S.active&&S.active.run;
  if(on&&!document.hidden&&!wl&&navigator.wakeLock){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null})}
  else if(!on&&wl){await wl.release();wl=null}}catch(e){}}
if(document.addEventListener)document.addEventListener('visibilitychange',wake);
function askNotif(){try{if(window.Notification&&Notification.permission=='default')Notification.requestPermission()}catch(e){}}
function beep(){try{const x=new (window.AudioContext||window.webkitAudioContext)(),o=x.createOscillator(),g=x.createGain();o.connect(g);g.connect(x.destination);g.gain.value=.15;o.frequency.value=880;o.start();o.stop(x.currentTime+.4)}catch(e){}}
function merge(r){mergeCore(r);ensureSubjects()}
function mergeCore(r){const del=Object.assign({},r.del,S.del),m={};
  [...(r.sessions||[]),...S.sessions].forEach(x=>{if(del[x.id])return;const y=m[x.id];if(!y||(x.m||0)>(y.m||0))m[x.id]=x});
  S.sessions=Object.values(m);S.del=del;S.ach=Object.assign({},r.ach,S.ach);
  if((r.su||0)>(S.su||0)){S.goalD=r.goalD;S.goalW=r.goalW;S.pomo=r.pomo;S.rem=r.rem;S.minD=r.minD||15;S.goalDays=r.goalDays||5;S.room=r.room||'';S.name=r.name||'';S.rest=r.rest==null?1:r.rest;if(Array.isArray(r.subjects)&&r.subjects.length)S.subjects=r.subjects;if(Array.isArray(r.goals))S.goals=r.goals;S.su=r.su}}
function cfg(k,v){S[k]=v;S.su=Date.now();save();render()}
function cp(v){if(v)askNotif();cfg('pomo',v)}
function mv(d){cM+=d;if(cM<0){cM=11;cY--}if(cM>11){cM=0;cY++}render()}
function openEd(id){const x=S.sessions.find(y=>y.id===id),t=x?(x.st||x.ts-x.dur*1e3):Date.now(),d=new Date(t),tm=pad(d.getHours())+':'+pad(d.getMinutes());
  EF=x?{id:x.id,k:dk(t)+' '+tm,subj:x.subj,date:dk(t),time:tm,min:Math.max(1,Math.round(x.dur/60)),topic:x.topic||'',type:x.type||'',n:x.n||0,c:x.c||0,focus:x.focus||0}:{id:0,subj:S.sel,date:dk(t),time:tm,min:30,topic:'',type:'',n:0,c:0,focus:0};
  render();try{$('ed').scrollIntoView({block:'center'})}catch(e){}}
function saveEd(){const t=new Date(EF.date+'T'+(EF.time||'12:00')).getTime();
  if(isNaN(t)||!(EF.min>0)){toast('Kiểm tra lại ngày giờ và thời lượng');return}
  const N=Math.max(0,EF.n|0),C=Math.min(N,Math.max(0,EF.c|0)),o={subj:EF.subj,dur:Math.round(EF.min*60),st:t,ts:t+Math.round(EF.min*6e4),topic:EF.topic.trim(),focus:EF.focus,type:EF.type,n:N,c:C,m:Date.now()};
  if(EF.id&&EF.date+' '+EF.time===EF.k){delete o.st;delete o.ts} // không đổi ngày giờ thì giữ nguyên giờ bắt đầu/kết thúc cũ
  if(EF.id){const x=S.sessions.find(y=>y.id===EF.id);if(x)Object.assign(x,o)}else S.sessions.push(Object.assign({id:Date.now(),man:1},o));
  EF=null;checkAch();save();render()}
async function ics(){if(!S.rem){toast('Hãy đặt giờ nhắc trước');return}try{const st=dk(Date.now()).replace(/-/g,'')+'T'+S.rem.replace(':','')+'00';
  await sv('nhac-hoc.ics',['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NhatKyHocTap//VI','BEGIN:VEVENT','UID:nhatky-hoc@local','DTSTAMP:'+new Date().toISOString().replace(/[-:]|\.\d+/g,''),'DTSTART:'+st,'DURATION:PT1H','RRULE:FREQ=DAILY','SUMMARY:📖 Đến giờ học','BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY','DESCRIPTION:Đến giờ học','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n'))}catch(e){}}
// Tải một file về máy (dùng cho sao lưu và file lịch nhắc)
function sv(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=name;document.body.appendChild(a);a.click();a.remove()}
async function exp(){try{await sv('nhat-ky-hoc-tap-'+dk(Date.now())+'.json',JSON.stringify(S,null,1))}catch(e){}}
function imp(i,rep){const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const o=JSON.parse(r.result);if(!Array.isArray(o.sessions)||(o.ver||1)>VER)throw 0;
    if(rep){if(!confirm('Thay thế TOÀN BỘ dữ liệu hiện tại bằng nội dung file này?'))return;const k=S.rev,a=S.active;Object.assign(S,migrate(o),{rev:k,active:a})}else merge(migrate(o));
    ensureSubjects();checkAch();save();render();toast((rep?'Đã khôi phục ':'Đã gộp ')+o.sessions.length+' buổi học từ file')}catch(e){toast('File không hợp lệ')}};r.readAsText(f);i.value=''}
// ===== 7. ĐỒNG HỒ chạy mỗi giây: cập nhật giờ, Pomodoro (25p học = 15e5 ms, 5p nghỉ = 3e5 ms), nhắc học =====
function tick(){if(ro)return;wake();const a=S.active;
  if(a&&!fin){const now=Date.now();
    if(chkGap(now)){ping('⏸ Đồng hồ tự tạm dừng vì không có hoạt động quá lâu');render();return}
    if(!a.ask&&a.run&&el()>(a.nx||10800)){a.ask=true;ping('⏰ Đồng hồ đã chạy '+hm(el())+'. Bạn còn đang học chứ?');render();return}
    if(now-lastW>15e3){lastW=now;if(!ro)cache()}
    const c=$('clk'),n=el();if(c)c.textContent=clk(n);
    if(S.pomo){
      if(a.run&&a.acc+now-a.run-(a.blk||0)>=15e5){a.acc+=now-a.run;a.run=0;a.blk=a.acc;a.brk=now+3e5;ping('🍅 Đủ 25 phút! Nghỉ 5 phút nhé');save();render()}
      else if(a.brk&&now>=a.brk){a.brk=0;a.run=now;ping('Hết giờ nghỉ, học tiếp nào!');save();render()}
      const p=$('pm');if(p)p.textContent=a.brk?'☕ Nghỉ còn '+clk2(Math.max(0,Math.ceil((a.brk-now)/1000))):a.run?'🍅 Còn '+clk2(Math.max(0,Math.ceil((15e5-(a.acc+now-a.run-(a.blk||0)))/1000)))+' đến giờ nghỉ':''}
    document.title=a.run?clk(n)+' · Đang học':a.brk?'☕ Nghỉ còn '+clk2(Math.max(0,Math.ceil((a.brk-now)/1000))):a.gap?'⏸ Đã tạm dừng':'Nhật ký học tập'}
  if(S.rem){const d=new Date(),k=dk(d);
    if(pad(d.getHours())+':'+pad(d.getMinutes())>=S.rem&&S.remd!==k){S.remd=k;save();
      if(!a&&!S.sessions.some(x=>dk(x.ts)==k)){ping('⏰ Đến giờ học rồi — hôm nay bạn chưa học buổi nào!');}}}}
// ===== Hiệu ứng chuyển động và tông màu =====
// Nền màu trôi chậm phía sau trang; khi bấm nút có gợn sóng, nút nhún và tia sáng bắn ra; khi gõ chữ hoặc số ô nhập nảy nhẹ.
// Mọi hiệu ứng chỉ chạy khi <body> có lớp "fx". Bật/tắt trong Cài đặt; lựa chọn lưu riêng cho từng thiết bị.
// auto = theo cài đặt "giảm chuyển động" của hệ thống, on = luôn bật, off = tắt
const bgMode=()=>{try{const v=localStorage.getItem('nk_bg');return v==='0'?'off':(v==='on'||v==='off')?v:'auto'}catch(e){return'auto'}};
const redMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const fxOn=()=>{const m=bgMode();return m=='on'||(m=='auto'&&!redMotion())};
function bgApply(){document.body.classList[fxOn()?'add':'remove']('fx')}
function bgSet(m){try{localStorage.setItem('nk_bg',m)}catch(e){}bgApply();render()}
// Tông màu: mỗi mục là [mã, tên, màu 1, màu 2]. Màu chi tiết của từng tông nằm trong style.css (các lớp th-...).
const THEMES=[['teal','Xanh ngọc','#1f8a6e','#37c4a2'],['violet','Tím','#6d4ae0','#a07bff'],['rose','Hồng','#d6336c','#ff7aa8'],['sunset','Cam','#e8590c','#ffa94d'],['ocean','Xanh dương','#1c7ed6','#4dabf7'],['multi','Đa sắc','#7b61ff','#19c8b4']];
const themeGet=()=>{try{const v=localStorage.getItem('nk_th');return THEMES.some(t=>t[0]==v)?v:'teal'}catch(e){return'teal'}};
function themeApply(){const c=document.body.classList;THEMES.forEach(t=>c.remove('th-'+t[0]));if(themeGet()!='teal')c.add('th-'+themeGet())}
function themeSet(k){try{localStorage.setItem('nk_th',k)}catch(e){}themeApply();render()}
document.body.insertAdjacentHTML('afterbegin','<div id="bg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i></div>');bgApply();themeApply();
if(document.addEventListener){
  // Bấm nút: gợn sóng lan ra, nút nhún, tia sáng bắn ra từ chỗ bấm (Android còn rung nhẹ)
  document.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('fx'))return;
    const b=e.target.closest&&e.target.closest('.btn,.chip,.seg button,.x,.stars button,.sw');if(!b)return;
    const r=b.getBoundingClientRect(),z=Math.max(r.width,r.height)*2.4,p=document.createElement('span');
    p.className='rip'+(b.matches&&b.matches('.btn:not(.g)')?' w':'');
    p.style.cssText=`width:${z}px;height:${z}px;left:${e.clientX-r.left-z/2}px;top:${e.clientY-r.top-z/2}px`;b.appendChild(p);setTimeout(()=>p.remove(),650);
    b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump');setTimeout(()=>b.classList.remove('bump'),420);
    for(let i=0;i<9;i++){const q=document.createElement('i'),a=Math.PI*2*i/9+Math.random()*.5,d=34+Math.random()*28;
      q.className='pt c'+(i%3);q.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;--dx:${(Math.cos(a)*d).toFixed(1)}px;--dy:${(Math.sin(a)*d).toFixed(1)}px`;document.body.appendChild(q);setTimeout(()=>q.remove(),700)}
    try{if(navigator.vibrate)navigator.vibrate(6)}catch(x){}});
  // Gõ chữ hoặc số: ô nhập nảy nhẹ
  document.addEventListener('input',e=>{const t=e.target;if(!document.body.classList.contains('fx')||!t||!t.matches||!t.matches('input[type=text],input[type=number],input[type=date],input[type=time]'))return;
    t.classList.remove('typing');void t.offsetWidth;t.classList.add('typing');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('typing'),240)})}
// ===== Biểu đồ đường (SVG tự vẽ, không dùng thư viện) =====
// series: [{c: màu, v: [số phút mỗi ngày, null = chưa có], dash: nét đứt, fill: tô vùng dưới đường}]
function chart(series,labels,o){const W=340,H=160,L=30,R=10,T=14,B=22,pw=W-L-R,ph=H-T-B;
  const mx=Math.max(o.ref||0,10,...series.flatMap(s=>s.v.filter(v=>v!=null)))*1.15;
  const X=i=>L+(labels.length>1?i*pw/(labels.length-1):pw/2),Y=v=>T+ph-v/mx*ph;let g='';
  for(let i=0;i<=3;i++){const y=T+ph*i/3;g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" class="gl"/><text x="${L-4}" y="${y+3}" class="gt" text-anchor="end">${Math.round(mx*(1-i/3))}</text>`}
  if(o.ref)g+=`<line x1="${L}" x2="${W-R}" y1="${Y(o.ref)}" y2="${Y(o.ref)}" class="gr"/>`;
  labels.forEach((l,i)=>{if(!o.skip||i%o.skip==0)g+=`<text x="${X(i)}" y="${H-6}" class="gt" text-anchor="middle">${l}</text>`});
  series.forEach(s=>{const pts=s.v.map((v,i)=>v==null?null:[X(i),Y(v)]);let d='',pen=false;
    pts.forEach(p=>{if(!p){pen=false;return}d+=(pen?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);pen=true});
    const f=pts.filter(Boolean);if(!f.length)return;
    if(s.fill&&f.length>1)g+=`<path d="${d} L${f[f.length-1][0].toFixed(1)} ${T+ph} L${f[0][0].toFixed(1)} ${T+ph}Z" style="fill:${s.c}" opacity=".13"/>`;
    g+=`<path d="${d}" fill="none" style="stroke:${s.c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${s.dash?' stroke-dasharray="5 4" opacity=".55"':''}/>`;
    if(o.dots&&!s.dash)pts.forEach(p=>{if(p)g+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" style="fill:${s.c}"/>`})});
  return`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Biểu đồ thời gian học (phút)">${g}</svg>`}
// Số giây học theo từng ngày và từng môn (buổi qua nửa đêm đã được tách ngày)
function perDay(){const r={};S.sessions.forEach(x=>spans(x).forEach(([k,sec])=>{const o=r[k]=r[k]||{};o[x.subj]=(o[x.subj]||0)+sec}));return r}
function weekUI(){const pd=perDay(),w0=mon(),tk=dk(Date.now()),wd=[],DN=['T2','T3','T4','T5','T6','T7','CN'];
  for(let i=0;i<7;i++){const d=new Date(w0);d.setDate(d.getDate()+i);wd.push(d)}
  const mn=(k,sj)=>{const o=pd[k]||{};return(sj?(o[sj]||0):Object.values(o).reduce((p,c)=>p+c,0))/60};
  const segs=[['w','Tuần này'],['sub','Theo môn'],['30','30 ngày']].map(([k,n])=>`<button class="${chM==k?'on':''}" onclick="chM='${k}';render()">${n}</button>`).join('');
  let svg,note='';
  if(chM=='30'){const L=[],V=[];for(let i=29;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);L.push(d.getDate());V.push(mn(dk(d)))}
    svg=chart([{c:'var(--ac)',v:V,fill:1}],L,{ref:S.goalD,skip:5});note=`Trung bình ${Math.round(V.reduce((p,c)=>p+c,0)/30)} phút mỗi ngày · đường cam là mục tiêu ngày`}
  else if(chM=='sub'){const ks=Object.keys(SUBJ).filter(k=>wd.some(d=>mn(dk(d),k)>0));
    svg=chart(ks.map(k=>({c:SUBJ[k].c,v:wd.map(d=>dk(d)>tk?null:mn(dk(d),k))})),DN,{dots:1});
    note=ks.length?ks.map(k=>`<span class="lgi"><i style="background:${SUBJ[k].c}"></i>${esc(SUBJ[k].n)}</span>`).join(''):'Chưa có buổi học nào trong tuần này'}
  else{const cur=wd.map(d=>dk(d)>tk?null:mn(dk(d))),prev=wd.map(d=>{const p=new Date(d);p.setDate(p.getDate()-7);return mn(dk(p))}),sm=a=>a.reduce((p,c)=>p+(c||0),0);
    svg=chart([{c:'var(--tx)',v:prev,dash:1},{c:'var(--ac)',v:cur,fill:1}],DN,{ref:S.goalD,dots:1});
    note=`Tuần này ${hm(Math.round(sm(cur)*60))} · tuần trước ${hm(Math.round(sm(prev)*60))} (nét đứt) · đường cam là mục tiêu ngày`}
  return`<div class="seg">${segs}</div>${svg}<small class="s" style="margin-top:6px">${note}</small>`}
// ===== Mục tiêu và nhiệm vụ =====
// Mỗi mục tiêu có một môn (hoặc tất cả môn), hạn (tuỳ chọn) và các nhiệm vụ. Nhiệm vụ theo tuần tự tính lại mỗi thứ Hai.
const TT=[['hours','Giờ học mỗi tuần'],['days','Ngày học mỗi tuần'],['problems','Bài làm mỗi tuần'],['check','Việc cần làm (đánh dấu)']],TU={hours:'giờ/tuần',days:'ngày/tuần',problems:'bài/tuần'};
function weekByRange(w0){const k0=dk(w0),end=new Date(w0);end.setDate(end.getDate()+7);const r={},add=(key,f)=>f(r[key]=r[key]||{sec:0,days:{},n:0});
  S.sessions.forEach(x=>{spans(x).forEach(([k,sec])=>{if(k>=k0&&k<dk(end))[x.subj,'*'].forEach(key=>add(key,o=>{o.sec+=sec;o.days[k]=(o.days[k]||0)+sec}))});
    if(x.ts>=w0.getTime()&&x.ts<end.getTime())[x.subj,'*'].forEach(key=>add(key,o=>{o.n+=x.n||0}))});return r}
function weekBy(){return weekByRange(mon())}
function goalsUI(){
  if(!S.goals.length)return'<div class="empty">Chưa có mục tiêu. Ví dụ: "Đạt 8 điểm Hóa" kèm nhiệm vụ "học 8 giờ mỗi tuần".</div>';
  const thisMonday=mon(),prevMonday=new Date(thisMonday);prevMonday.setDate(prevMonday.getDate()-7);
  const prevKey=dk(prevMonday),prevEnd=new Date(thisMonday);prevEnd.setDate(prevEnd.getDate()-1);
  const dateRange=d=>d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
  const prevWB=weekByRange(prevMonday),wb=weekBy(),shown=goalsShowAll?S.goals:S.goals.slice(0,3);
  const previousSummary=S.goals.map(g=>{
    const d=prevWB[g.subj||'*']||{sec:0,days:{},n:0};
    const items=(g.tasks||[]).map(t=>{
      if(t.t==='check'){
        const done=!!(t.doneWeeks&&t.doneWeeks[prevKey]);
        const label=esc(t.txt||'Việc cần làm');
        return {ok:done,unknown:!done&&!t.doneWeeks,html:`<div class="sub"><span>${label}</span><b>${done?'Hoàn thành ✓':(t.doneWeeks?'Chưa hoàn thành':'Chưa có dữ liệu lịch sử')}</b></div>`};
      }
      let cur=0,label='';
      if(t.t==='hours'){cur=d.sec/3600;label=`${cur.toFixed(1)}/${t.v} giờ học`}
      else if(t.t==='days'){cur=Object.values(d.days).filter(v=>v>=(S.minD||15)*60).length;label=`${cur}/${t.v} ngày học đủ`}
      else {cur=d.n;label=`${cur}/${t.v} bài làm`}
      const ok=cur>=t.v;
      return {ok,unknown:false,html:`<div class="sub"><span>${label}</span><b>${ok?'Hoàn thành ✓':'Chưa đạt'}</b></div><div class="bar"><i style="width:${Math.min(cur/Math.max(1,t.v),1)*100}%;background:${ok?'var(--ac)':'var(--mut)'}"></i></div>`};
    });
    const known=items.filter(x=>!x.unknown),complete=known.filter(x=>x.ok).length,unknown=items.some(x=>x.unknown);
    const status=items.length===0?'Chưa có nhiệm vụ':unknown?'Có nhiệm vụ chưa lưu lịch sử':complete===items.length?'Hoàn thành tất cả':`${complete}/${items.length} nhiệm vụ hoàn thành`;
    return `<div style="padding:9px 0;border-bottom:1px solid var(--bd)"><div class="sub"><b>${esc(g.title)}</b><b>${status}</b></div>${items.map(x=>x.html).join('')}</div>`;
  }).join('');
  const summary=`<div class="card" style="margin-bottom:12px"><b>📊 Tổng kết nhiệm vụ tuần trước</b><small class="s" style="display:block;margin:5px 0 8px">${dateRange(prevMonday)} – ${dateRange(prevEnd)} · Tiến độ được tính từ nhật ký học tập đã lưu.</small>${previousSummary}<small class="s" style="display:block;margin-top:8px">Các nhiệm vụ dạng giờ/ngày/bài được tính từ dữ liệu tuần trước. Nhiệm vụ đánh dấu thủ công chỉ có lịch sử từ lúc bật ghi nhận trở đi.</small></div>`;
  const cards=shown.map(g=>{
    const d=wb[g.subj||'*']||{sec:0,days:{},n:0},sj=g.subj&&SUBJ[g.subj];
    const rows=g.tasks.map((t,i)=>{
      if(t.t=='check')return`<label class="tk"><input type="checkbox" ${t.done?'checked':''} onchange="chk('${g.id}',${i},this.checked)"> <span${t.done?' style="text-decoration:line-through;opacity:.6"':''}>${esc(t.txt||'')}</span></label>`;
      let cur,lab;const tar=t.v;
      if(t.t=='hours'){cur=d.sec/3600;lab=cur.toFixed(1)+'/'+tar+' giờ'}else if(t.t=='days'){cur=Object.values(d.days).filter(v=>v>=(S.minD||15)*60).length;lab=cur+'/'+tar+' ngày'}else{cur=d.n;lab=cur+'/'+tar+' bài'}
      return`<div class="sub"><span>${{hours:'Học',days:'Học đủ',problems:'Làm'}[t.t]} ${tar} ${TU[t.t].split('/')[0]} mỗi tuần</span><span>${lab}${cur>=tar?' ✅':''}</span></div><div class="bar"><i style="width:${Math.min(cur/tar,1)*100}%;background:${sj?sj.c:'var(--ac)'}"></i></div>`
    }).join('');
    let due='';if(g.due){const n=Math.ceil((new Date(g.due+'T23:59:59')-Date.now())/864e5);due=' · '+(n>=0?'hạn còn '+n+' ngày':'đã quá hạn')}
    return`<div class="goal"><div class="gh"><b>${esc(g.title)}</b><span><button class="x" onclick="openGoal('${g.id}')">Sửa</button><button class="x" onclick="delGoal('${g.id}')">Xoá</button></span></div><small class="s">${sj?esc(sj.n):'Tất cả môn'}${due}</small>${rows}</div>`
  }).join('');
  const toggle=S.goals.length>3?`<button class="btn g goals-toggle" onclick="toggleGoals()">${goalsShowAll?'Thu gọn mục tiêu':'Xem tất cả '+S.goals.length+' mục tiêu'}</button>`:'';
  return summary+cards+toggle;
}
function toggleGoals(){goalsShowAll=!goalsShowAll;render()}
function goalForm(){if(!GF)return'';
  return`<div class="card" style="margin-bottom:10px"><b>${GF.id?'Sửa mục tiêu':'Thêm mục tiêu'}</b><input type="text" placeholder="Mục tiêu (vd: Đạt 8 điểm Hóa)" value="${esc(GF.title)}" oninput="GF.title=this.value">
  <div class="chips" style="margin:6px 0"><button class="chip t ${GF.subj?'':'on'}" onclick="GF.subj='';render()">Tất cả môn</button>${vis(GF.subj).map(k=>`<button class="chip t ${GF.subj==k?'on':''}" onclick="GF.subj='${k}';render()">${esc(SUBJ[k].n)}</button>`).join('')}</div>
  <div class="in">Hạn <input type="date" value="${GF.due}" oninput="GF.due=this.value"> <small class="s">(không bắt buộc)</small></div><b style="font-size:14px">Nhiệm vụ</b>
  ${GF.tasks.map((t,i)=>`<div class="in"><select onchange="GF.tasks[${i}].t=this.value;render()">${TT.map(([k,n])=>`<option value="${k}" ${t.t==k?'selected':''}>${n}</option>`).join('')}</select>${t.t=='check'?`<input type="text" style="flex:1;margin:0" placeholder="Việc cần làm" value="${esc(t.txt||'')}" oninput="GF.tasks[${i}].txt=this.value">`:`<input type="number" min="1" value="${t.v}" oninput="GF.tasks[${i}].v=+this.value"> <span>${TU[t.t]}</span>`}<button class="x" onclick="GF.tasks.splice(${i},1);render()">Xoá</button></div>`).join('')}
  <button class="btn g" onclick="GF.tasks.push({t:'hours',v:5});render()">＋ Thêm nhiệm vụ</button>
  <div class="row" style="margin-top:10px"><button class="btn g" onclick="GF=null;render()">Huỷ</button><button class="btn" onclick="saveGoal()">Lưu</button></div></div>`}
function openGoal(id){const g=S.goals.find(y=>String(y.id)===String(id));GF=g?JSON.parse(JSON.stringify(g)):{id:0,title:'',subj:'',due:'',tasks:[{t:'hours',v:8}]};render();try{$('gf').scrollIntoView({block:'center'})}catch(e){}}
function saveGoal(){const ts=GF.tasks.filter(t=>t.t=='check'?(t.txt||'').trim():t.v>0);
  if(!GF.title.trim()){toast('Hãy đặt tên cho mục tiêu');return}
  const g={id:GF.id||Date.now(),title:GF.title.trim(),subj:GF.subj,due:GF.due,tasks:ts};
  if(GF.id){S.goals=S.goals.map(y=>y.id===GF.id?g:y)}else S.goals.push(g);
  GF=null;S.su=Date.now();save();render()}
function delGoal(id){if(!confirm('Xoá mục tiêu này?'))return;S.goals=S.goals.filter(y=>String(y.id)!==String(id));S.su=Date.now();save();render()}
function chk(id,i,v){const g=S.goals.find(y=>String(y.id)===String(id));if(!g)return;const t=g.tasks[i];t.done=v;if(v){t.doneWeeks=t.doneWeeks||{};t.doneWeeks[dk(mon())]=true}S.su=Date.now();save();render()}
// ===== 8. ĐỒNG BỘ ĐÁM MÂY + CHẠY ĐUA =====
// Cần cấu hình Firebase (xem HUONG-DAN-DONG-BO.md). Chưa cấu hình thì phần này không làm gì và phần mềm vẫn chạy bình thường.
// cloud.js cung cấp đối tượng window.cloud; ở đây chỉ dùng các hàm: onAuth, signIn, signOut, watchMine, setMine, setMember, delMember, watchRoom.
const sig=o=>(o.sessions||[]).map(x=>x.id+':'+(x.m||0)).sort().join()+'|'+Object.keys(o.del||{}).sort().join()+'|'+Object.keys(o.ach||{}).sort().join()+'|'+(o.su||0);
const mon=()=>{const w=new Date();w.setHours(0,0,0,0);w.setDate(w.getDate()-((w.getDay()+6)%7));return w};
// XP của một buổi học (dùng chung cho tổng XP và XP tuần)
function sxp(x){const m=Math.floor(x.dur/60),cap=Math.max(10,m*2),n=Math.min(x.n||0,cap),c=Math.min(x.c||0,n);return Math.round((m+2*n+c)*(x.man?.5:1))}
// XP tuần = toàn bộ XP từ các buổi học trong tuần + 30 XP cho mỗi ngày học đủ số phút tối thiểu; không giới hạn XP theo ngày
function weekFor(w0,s){const end=new Date(w0);end.setDate(end.getDate()+7);const per={};let mins=0,hasData=false;
  S.sessions.forEach(x=>{if(x.ts>=w0.getTime()&&x.ts<end.getTime()){const k=dk(x.ts);per[k]=(per[k]||0)+sxp(x);mins+=x.dur/60;hasData=true}});
  let xp=0,days=0;Object.keys(per).forEach(k=>{xp+=per[k]});
  for(let i=0;i<7;i++){const d=new Date(w0);d.setDate(d.getDate()+i);const sec=s.days[dk(d)]||0;if(sec>0)hasData=true;if(sec>=(S.minD||15)*60)days++}
  return{xpWeek:xp+30*days,daysWeek:days,minWeek:Math.round(mins),hasData}
}
function weekMe(s){return weekFor(mon(),s)}
function previousWeekMe(s){const w=new Date(mon());w.setDate(w.getDate()-7);return weekFor(w,s)}
// Chỉ những số liệu tổng hợp này được gửi cho bạn bè (không có môn học, nội dung, ghi chú)
// ===== PHÂN TÍCH HỌC TẬP NÂNG CAO =====
function setAnalyticsRange(n){analyticsRange=[7,30,90].includes(+n)?+n:7;render()}
function analyticsUI(s){
  const n=[7,30,90].includes(+analyticsRange)?+analyticsRange:7;
  const today=new Date();today.setHours(0,0,0,0);
  const start=new Date(today);start.setDate(start.getDate()-n+1);
  const end=new Date(today);end.setDate(end.getDate()+1);
  const keys=[];
  for(let d=new Date(start);d<end;d.setDate(d.getDate()+1))keys.push(dk(d));
  const prevStart=new Date(start);prevStart.setDate(prevStart.getDate()-n);
  const prevKeys=[];
  for(let d=new Date(prevStart);d<start;d.setDate(d.getDate()+1))prevKeys.push(dk(d));
  const sumDays=ks=>ks.reduce((t,k)=>t+(s.days[k]||0),0);
  const total=sumDays(keys),prevTotal=sumDays(prevKeys);
  const t0=start.getTime(),t1=end.getTime();
  const list=S.sessions.filter(x=>typeof x.ts==='number'&&x.ts>=t0&&x.ts<t1);
  const dur=list.reduce((t,x)=>t+(x.dur||0),0);
  const mins=list.reduce((t,x)=>t+(x.n||0),0),correct=list.reduce((t,x)=>t+(x.c||0),0);
  const judged=list.filter(x=>(x.focus||0)>0),focusAvg=judged.length?judged.reduce((t,x)=>t+x.focus,0)/judged.length:null;
  const qualified=keys.filter(k=>(s.days[k]||0)>=(S.minD||15)*60).length;
  const active=keys.filter(k=>(s.days[k]||0)>0).length;
  const bySubj={},byType={};
  list.forEach(x=>{bySubj[x.subj]=(bySubj[x.subj]||0)+(x.dur||0);if(x.type)byType[x.type]=(byType[x.type]||0)+(x.dur||0)});
  const subjRows=Object.entries(bySubj).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const typeRows=Object.entries(byType).sort((a,b)=>b[1]-a[1]);
  const maxSub=Math.max(1,...subjRows.map(x=>x[1])),maxType=Math.max(1,...typeRows.map(x=>x[1]));
  const fmtPct=x=>Math.round(x*100)+'%';
  const trend=prevTotal>0?`${total>=prevTotal?'▲':'▼'} ${Math.abs(Math.round((total-prevTotal)/prevTotal*100))}% so với ${n} ngày trước`:'';
  const trendHTML=prevTotal>0?`<small class="s an-trend ${total>=prevTotal?'positive':'negative'}">${trend}</small>`:'<small class="s an-trend">Chưa có đủ dữ liệu để so sánh kỳ trước</small>';
  const groups=[];const step=n===7?1:7;
  for(let i=0;i<keys.length;i+=step){const chunk=keys.slice(i,i+step),v=chunk.reduce((t,k)=>t+(s.days[k]||0),0),d=new Date(chunk[0]+'T12:00:00');
    let label;if(n===7)label=['CN','T2','T3','T4','T5','T6','T7'][d.getDay()];else label=pad(d.getDate())+'/'+pad(d.getMonth()+1);
    groups.push({label,v,title:chunk.length>1?`${chunk[0]} – ${chunk[chunk.length-1]}: ${hm(v)}`:`${chunk[0]}: ${hm(v)}`})}
  const maxGroup=Math.max(1,...groups.map(x=>x.v));
  const chart=`<div class="an-chart" role="img" aria-label="Biểu đồ thời gian học trong ${n} ngày">${groups.map(g=>`<div class="an-bar-slot" title="${esc(g.title)}"><b>${g.v?hm(g.v):'–'}</b><i class="an-bar" style="height:${g.v?Math.max(5,g.v/maxGroup*76):2}px"></i><span>${g.label}</span></div>`).join('')}</div>`;
  const subjHTML=subjRows.length?subjRows.map(([k,v])=>{const sub=SUBJ[k],label=sub?sub.n:k;return`<div class="an-row"><div class="an-row-head"><span>${esc(label)}</span><span>${hm(v)} · ${fmtPct(v/Math.max(1,Object.values(bySubj).reduce((t,x)=>t+x,0)))}</span></div><div class="bar"><i style="width:${v/maxSub*100}%;background:${sub?sub.c:'var(--ac)'}"></i></div></div>`}).join(''):'<div class="empty">Chưa có dữ liệu theo môn trong khoảng này.</div>';
  const typeHTML=typeRows.length?typeRows.map(([k,v])=>`<div class="an-row"><div class="an-row-head"><span>${esc(k)}</span><span>${hm(v)}</span></div><div class="bar"><i style="width:${v/maxType*100}%;background:var(--ac)"></i></div></div>`).join(''):'<div class="empty">Chưa phân loại hoạt động. Hãy chọn loại khi lưu buổi học.</div>';
  const accuracy=mins?Math.round(correct/mins*100):null;
  const avgSession=list.length?Math.round(dur/list.length):0;
  const cards=[
    [hm(total),'Tổng thời gian học'],
    [String(list.length),'Buổi học đã lưu'],
    [`${qualified}/${n}`,'Ngày đạt chuẩn học'],
    [mins?accuracy+'%':'–','Tỉ lệ bài đúng'],
    [focusAvg==null?'–':focusAvg.toFixed(1)+' / 5','Tập trung trung bình'],
    [list.length?hm(avgSession):'–','Thời lượng mỗi buổi']
  ].map(([v,l])=>`<div class="an-kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  const insights=[];
  if(list.length){
    if(prevTotal>0){const pct=Math.round((total-prevTotal)/prevTotal*100);insights.push(pct>0?`Thời gian học tăng ${pct}% so với ${n} ngày liền trước.`:pct<0?`Thời gian học giảm ${Math.abs(pct)}% so với ${n} ngày liền trước.`:`Thời gian học giữ nguyên so với ${n} ngày liền trước.`)}
    if(accuracy!==null&&accuracy<70)insights.push(`Tỉ lệ bài đúng hiện là ${accuracy}%; nên xem lại lỗi sai trước khi tăng số lượng bài.`);
    const theory=byType['Lý thuyết']||0,practice=(byType['Bài tập']||0)+(byType['Thực hành']||0)+(byType['Ôn lại']||0);
    if(theory>practice*2&&theory>=3600)insights.push('Thời gian lý thuyết đang cao hơn nhiều so với luyện tập; hãy thử thêm một phiên làm bài và chữa lỗi.');
    if(focusAvg!==null&&focusAvg<3.5)insights.push(`Mức tập trung trung bình ${focusAvg.toFixed(1)}/5; thử chia phiên học thành các chặng ngắn hơn.`);
    if(!insights.length)insights.push(`Bạn đã học ${active} ngày trong ${n} ngày và đạt chuẩn ${qualified} ngày. Tiếp tục giữ nhịp học hiện tại.`);
  }else insights.push('Chưa có buổi học được lưu trong khoảng này. Khi bạn ghi thêm buổi học, phần phân tích sẽ tự cập nhật.');
  return`<div class="an-filters" role="group" aria-label="Khoảng thời gian phân tích">${[[7,'7 ngày'],[30,'30 ngày'],[90,'90 ngày']].map(([v,l])=>`<button class="chip ${n===v?'on':''}" onclick="setAnalyticsRange(${v})" ${n===v?'aria-pressed="true"':'aria-pressed="false"'}>${l}</button>`).join('')}</div>
  <div class="an-meta">${keys[0]} – ${keys[keys.length-1]} · tính theo ngày trong lịch</div>
  <div class="an-kpis">${cards}</div>
  <div class="an-compare"><span>So với giai đoạn liền trước</span>${trendHTML}</div>
  <div class="an-detail-grid"><section><b class="an-subtitle">📈 Nhịp học</b>${chart}<small class="s">${n===7?'Mỗi cột là một ngày.':'Mỗi cột là một nhóm tối đa 7 ngày.'} Tổng thời gian được chia theo ngày từ nhật ký đã lưu.</small></section><section><b class="an-subtitle">📚 Thời gian theo môn</b>${subjHTML}</section></div>
  <details class="an-more"><summary>Phân tích loại hoạt động và gợi ý</summary><div class="an-detail-grid"><section>${typeHTML}</section><section><b class="an-subtitle">💡 Nhận xét từ dữ liệu</b>${insights.map(x=>`<div class="an-insight">${esc(x)}</div>`).join('')}</section></div></details>`
}
function recapUI(s){
  const m0=mon(),a0=new Date(m0);a0.setDate(a0.getDate()-7);const b0=new Date(a0);b0.setDate(b0.getDate()-7);
  const ks=d0=>[...Array(7)].map((_,i)=>{const d=new Date(d0);d.setDate(d.getDate()+i);return dk(d)});
  const K=ks(a0),D=s.days,sum=k=>k.reduce((t,x)=>t+(D[x]||0),0),T=sum(K),P=sum(ks(b0)),mn=(S.minD||15)*60,gw=(S.goalW||1)*60;
  const L=S.sessions.filter(x=>x.ts>=a0.getTime()&&x.ts<m0.getTime());
  if(!T&&!L.length)return'<div class="empty">Chưa có dữ liệu tuần trước. Sau tuần học đầu tiên, bảng tổng kết sẽ hiện ở đây.</div>';
  const by={};S.sessions.forEach(x=>spans(x).forEach(([k,sec])=>{if(K.includes(k))by[x.subj]=(by[x.subj]||0)+sec}));
  const dv=K.map(k=>D[k]||0),mx=Math.max(1,...dv),bi=dv.indexOf(Math.max(...dv)),dn=dv.filter(v=>v>=mn).length,N=['T2','T3','T4','T5','T6','T7','CN'];
  const xp=L.reduce((t,x)=>t+sxp(x),0),fs=L.filter(x=>x.focus>0),af=fs.length?(fs.reduce((t,x)=>t+x.focus,0)/fs.length).toFixed(1):'–';
  const lg=L.filter(x=>!x.man).reduce((t,x)=>Math.max(t,x.dur),0),pn=L.reduce((t,x)=>t+(x.n||0),0),pc=L.reduce((t,x)=>t+(x.c||0),0);
  const ac=achAll().filter(a=>S.ach[a[0]]>=a0.getTime()&&S.ach[a[0]]<m0.getTime());
  const dl=P?Math.round((T-P)/P*100):null,ch=dl==null?'':`<small class="s" style="color:${dl>=0?'var(--ac)':'var(--ly)'}">${dl>=0?'▲':'▼'} ${Math.abs(dl)}% so với tuần trước nữa</small>`;
  const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{const j=SUBJ[k];return`<div class="sub"><span>${j?(j.ic?j.ic+' ':'')+j.n:k}</span><span>${hm(v)} · ${Math.round(v/T*100)}%</span></div><div class="bar"><i style="width:${v/T*100}%;background:${j?j.c:'var(--ac)'}"></i></div>`}).join('');
  const bars=dv.map((v,i)=>`<div class="rcb"><i style="height:${Math.max(v?6:2,v/mx*70)}px;background:${v>=mn?'var(--ac)':'var(--bd)'}" title="${hm(v)}"></i><span>${N[i]}</span></div>`).join('');
  const miss=gw-T,w=vis('').filter(k=>k!='khac').sort((a,b)=>(by[a]||0)-(by[b]||0))[0];
  const tip=(miss<=0?'🎉 Đạt mục tiêu tuần! Nếu thấy vừa sức, thử nâng mục tiêu thêm khoảng 10%.':`Tuần trước còn thiếu ${hm(miss)} so với mục tiêu ${hm(gw)}.`)+(w&&SUBJ[w]&&(by[w]||0)<T*.15?` Môn ${SUBJ[w].n} còn ít, thử xếp thêm 1–2 buổi tuần này.`:'');
  return`<div class="rc-h"><b>${hm(T)}</b><small class="s">/ mục tiêu ${hm(gw)}</small>${ch}</div>
  <div class="bar"><i style="width:${Math.min(T/gw,1)*100}%;background:var(--ac)"></i></div>
  <div class="rcb-w">${bars}</div>${T?`<small class="s">Ngày học nhiều nhất: ${N[bi]} (${hm(dv[bi])})</small>`:''}
  <div class="rc-g">${[[dn+'/'+(S.goalDays||5),'ngày học đủ'],[L.length,'buổi học'],['+'+xp,'XP'],[af+' ★','tập trung TB'],[hm(lg),'buổi dài nhất'],[pn?Math.round(pc/pn*100)+'%':'–','bài làm đúng']].map(x=>`<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
  ${rows}${ac.length?`<div class="rc-a">Thành tích mới: ${ac.map(a=>a[1]+' '+a[2]).join(' · ')}</div>`:''}
  <div class="rc-tip">${tip}</div>`}
function summary(){const s=stats(),w=mon(),pw=new Date(w);pw.setDate(pw.getDate()-7);const prev=previousWeekMe(s);return Object.assign({name:(S.name||'Bạn').slice(0,30),streak:s.cur,xp:s.xp,level:Math.floor(Math.sqrt(s.xp/50))+1,week:dk(w),prevWeek:dk(pw),t:Date.now(),sourceRev:cloudRev},weekMe(s),{xpPrevWeek:prev.xpWeek,daysPrevWeek:prev.daysWeek,minPrevWeek:prev.minWeek,prevWeekHasData:prev.hasData})}
const pk=()=>JSON.stringify({sessions:S.sessions,ach:S.ach,del:S.del,goalD:S.goalD,goalW:S.goalW,pomo:S.pomo,rem:S.rem,minD:S.minD,goalDays:S.goalDays,rest:S.rest,subjects:S.subjects,goals:S.goals,room:S.room,name:S.name,su:S.su||0,ver:S.ver});
// Chỉ đẩy dữ liệu lên sau khi đã nhận bản trên mạng lần đầu (cloudSynced), để máy mới không ghi đè dữ liệu cũ trên mạng
function cPush(){if(!user||ro||!cloudSynced||!window.cloud||!cloud.setMine)return;clearTimeout(cpt);cpt=setTimeout(async()=>{try{const latest=await cloud.setMine({j:pk(),u:Date.now()});
    // The cloud transaction returns the merged profile. Adopt it so phone and desktop converge,
    // instead of letting whichever device writes last erase sessions from the other device.
    if(latest&&latest.j)cAdopt(latest);cstat='ok';cs()}catch(e){cstat='err';cs();console.warn('Đồng bộ hồ sơ chưa thành công:',e)}},1200)}
function roomPublishErrorText(){
  const e=String(roomPublishError||'');
  if(e.includes('permission-denied'))return 'Firebase đã từ chối đăng ký. Cần kiểm tra Firestore Security Rules để cho phép người dùng đăng ký hồ sơ của chính tài khoản mình trong đường đua chung.';
  if(e.includes('unavailable')||e.includes('network')||e.includes('deadline-exceeded'))return 'Không kết nối được Firebase. Kiểm tra mạng rồi nhấn thử lại.';
  if(e.includes('verification-failed'))return 'Đã gửi yêu cầu đăng ký nhưng chưa xác nhận được hồ sơ trên đường đua chung. Hãy thử lại.';
  return 'Chưa đăng ký được thành viên ('+e.slice(0,90)+'). Hãy thử lại hoặc kiểm tra quyền truy cập Firebase vào đường đua chung.';
}
async function publishRoomMember(showFeedback=false){
  if(!user||ro||!cloudSynced||S.room!==GLOBAL_RACE_ROOM||!window.cloud||!cloud.ready||!cloud.setMember)return false;
  if(roomPublishPromise){const ok=await roomPublishPromise;if(showFeedback)toast(ok?'✓ Đã đăng ký thành viên trong phòng.':roomPublishErrorText());return ok}
  clearTimeout(ppt);ppt=null;
  const room=S.room,uid=user.uid;
  roomPublishBusy=true;roomPublishError=null;render();
  roomPublishPromise=(async()=>{
    try{
      await cloud.setMember(room,summary());
      // Verify that the document was actually written and is visible to this signed-in user.
      if(cloud.getMember){const saved=await cloud.getMember(room);if(!saved)throw new Error('verification-failed')}
      if(S.room!==room||!user||user.uid!==uid)return false;
      roomPublishError=null;
      return true;
    }catch(e){
      if(S.room===room&&user&&user.uid===uid)roomPublishError=e&&e.code?e.code:(e&&e.message?e.message:'unknown');
      console.warn('Không thể đăng ký/cập nhật thành viên trong đường đua chung:',e);
      return false;
    }finally{
      roomPublishBusy=false;roomPublishPromise=null;render();
    }
  })();
  const ok=await roomPublishPromise;
  if(showFeedback)toast(ok?'✓ Đã đăng ký và xác nhận thành viên trong phòng.':roomPublishErrorText());
  return ok;
}
function pubSummary(){if(!user||ro||!cloudSynced||S.room!==GLOBAL_RACE_ROOM||!window.cloud||!cloud.ready)return;clearTimeout(ppt);ppt=setTimeout(()=>publishRoomMember(false),650)}
function retryRoomRegistration(){publishRoomMember(true)}
function refreshRoom(){startRoom();publishRoomMember(true)}
function ensureGlobalRaceRoom(){
  if(!user||ro)return false;
  if(S.room===GLOBAL_RACE_ROOM)return false;
  // Room preference is part of the synced profile; advance its marker so the canonical room wins on all devices.
  S.room=GLOBAL_RACE_ROOM;
  S.su=Math.max(Date.now(),(Number(S.su)||0)+1);
  cache();
  return true;
}
function cAdopt(d){
  if(ro)return;
  if(d&&d.updatedAt&&typeof d.updatedAt.toMillis==='function')cloudRev=Math.max(cloudRev,d.updatedAt.toMillis());
  let o;try{o=JSON.parse(d.j)}catch(e){return}
  const b=sig(S),r0=S.room;
  merge(migrate(o));
  // Ignore legacy per-user room settings: every signed-in account uses the same global race.
  ensureGlobalRaceRoom();
  if(sig(S)!==b){cache();render()}
  if(S.room!==r0)startRoom();
  if(sig(S)!==sig(o))cPush();
  pubSummary();
}
function cs(){const e=$('cs');if(e)e.textContent={ok:'✓ Đã đồng bộ',err:'⚠ Lỗi đồng bộ — dữ liệu vẫn lưu trên máy này'}[cstat]||''}
function startRoom(){
  if(unR){unR();unR=null}
  peers=undefined;roomReadError=false;
  if(user&&!ro){
    ensureGlobalRaceRoom();
    pubSummary();
    unR=cloud.watchRoom(GLOBAL_RACE_ROOM,l=>{peers=Array.isArray(l)?l:null;roomReadError=!Array.isArray(l);render()});
  }
}
function cloudInit(){
  if(!window.cloud||!window.cloud.ready||cloudHooked)return;
  cloudHooked=true;
  cloud.onAuth(u=>{
    user=u;cloudSynced=false;
    if(unM){unM();unM=null}
    if(u){
      if(!S.name&&u.displayName){S.name=u.displayName;S.su=Math.max(Date.now(),(Number(S.su)||0)+1);cache()}
      ensureGlobalRaceRoom();
      unM=cloud.watchMine(d=>{
        cloudSynced=true;
        if(d)cAdopt(d);else cPush();
        ensureGlobalRaceRoom();
        // Once the profile is hydrated, listen to and publish the member record in the one shared race.
        startRoom();pubSummary();cstat='ok';cs();render();
      });
      startRoom();
    }else{
      if(unR){unR();unR=null}
      peers=undefined;roomReadError=false;
    }
    render();
  });
}
function setName(v){S.name=v.trim().slice(0,30);S.su=Math.max(Date.now(),(Number(S.su)||0)+1);save();render()}
function refreshRace(){startRoom();publishRoomMember(true)}
function retryRoomRegistration(){publishRoomMember(true)}
function raceUI(s){
  if(!window.cloud||!window.cloud.ready)return'<div class="empty">Chưa bật đồng bộ. Hãy kiểm tra cấu hình Firebase trong config.js.</div>';
  if(!user)return'<div class="row"><button class="btn" onclick="cloud.signIn().catch(()=>toast(\'Đăng nhập chưa thành công\'))">Đăng nhập Google để tự động vào đường đua chung</button></div>';
  let h=`<div class="in race-profile"><span>👤 Tên hiển thị</span><input type="text" style="flex:1;margin:0;min-width:100px" value="${esc(S.name)}" onchange="setName(this.value)"><button class="x" onclick="cloud.signOut()">Đăng xuất</button></div><small class="s" id="cs"></small>`;
  const wk=dk(mon()),L=(peers||[]).map(p=>Object.assign({},p,{x:p.week===wk?Number(p.xpWeek)||0:0,d:p.week===wk?Number(p.daysWeek)||0:0})).sort((a,b)=>b.x-a.x||String(a.name||'').localeCompare(String(b.name||''),'vi')),
    top=Math.max(0,...L.map(p=>p.x)),cap=Math.max(600,Math.ceil(top*1.15/100)*100),
    PAL=['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9','#4dabf7','#9775fa','#f783ac'],colOf=id=>PAL[[...String(id)].reduce((a,c)=>a+c.charCodeAt(0),0)%PAL.length],
    tail=`<small class="s race-footnote" style="margin-top:10px">Đường đua chung · XP tuần = toàn bộ XP từ buổi học + 30 XP cho mỗi ngày đạt số phút tối thiểu; không giới hạn XP/ngày. Tính lại từ thứ Hai · Vạch đích: ${cap} XP.</small>`;
  const count=peers===undefined?'Đang tải…':peers===null?'Lỗi kết nối':`${L.length} thành viên`;
  h+=`<div class="sub race-room-head" style="margin-top:12px"><span>🌍 <b>Đường đua chung</b><i class="live" title="Cập nhật trực tiếp"></i></span><span class="race-count">${count}</span><button class="x" onclick="refreshRace()">Làm mới</button></div>`;
  if(peers===undefined)return h+'<div class="empty">Đang kết nối và đăng ký bạn vào đường đua chung…</div>'+tail;
  if(peers===null)return h+'<div class="empty">Không tải được đường đua chung. Hãy kiểm tra mạng và quyền truy cập Firebase rồi thử lại.</div><button class="btn g" onclick="refreshRace()">Thử kết nối lại</button>'+tail;
  if(!L.length)return h+'<div class="empty">Chưa có thành viên nào trong đường đua chung. Hãy thử đăng ký lại.</div><button class="btn g" onclick="retryRoomRegistration()">Đăng ký / thử lại</button>'+tail;
  const mi=L.findIndex(p=>p.id===user.uid),me=L[mi],nm=p=>esc(p.name||'?');
  if(raceRank&&mi>=0&&mi+1<raceRank)raceBoom=mi===0?44:26;
  if(mi>=0)raceRank=mi+1;
  let msg='';
  if(L.length<2)msg='Bạn là người đầu tiên trên đường đua chung. Mời bạn bè đăng nhập để cùng thi đua!';
  else if(me){
    if(mi===0)msg=me.x>L[1].x?`🔥 Bạn đang dẫn đầu, hơn ${nm(L[1])} ${me.x-L[1].x} XP. Giữ vững nhé!`:`⚖️ Bạn và ${nm(L[1])} đang ngang điểm!`;
    else msg=L[mi-1].x>me.x?`🏃 Bạn đang xếp thứ ${mi+1}. Còn ${L[mi-1].x-me.x} XP để vượt ${nm(L[mi-1])}.`:`⚖️ Bạn và ${nm(L[mi-1])} đang ngang điểm!`;
  }
  if(msg)h+=`<div class="rbanner">${msg}</div>`;
  h+=L.map((p,i)=>{
    const isMe=p.id===user.uid,pc=Math.max(2,Math.min(96,p.x/cap*100)),pv=racePrev[p.id],from=pv?pv.pc:0,xf=pv?pv.x:0,
      cls=['rr',i===0&&p.x>0?'lead':'',!pv?'ent':pv.rank>i+1?'up':pv.rank<i+1?'dn':''].join(' '),c=isMe?'var(--ac)':colOf(p.id),bg=isMe?'linear-gradient(90deg,var(--ac),var(--ac2))':c;
    racePrev[p.id]={pc,x:p.x,rank:i+1};
    return`<div class="rr ${cls}" style="--i:${i}"><div class="race-head"><div class="race-person"><span class="rk">${['🥇','🥈','🥉'][i]||(i+1)+'.'}</span><span class="rn">${esc(p.name||'?')}${isMe?' <small>(bạn)</small>':''}<span class="race-level">Cấp ${p.level||1}</span></span></div><div class="race-metrics"><b class="cu" data-from="${xf}" data-to="${p.x}" data-suf=" XP">${p.x} XP</b><span>${p.d}/7 ngày</span><span>🔥 ${p.streak||0}</span></div></div><div class="trk"><i class="fill" style="--from:${from}%;--to:${pc}%;background:${bg}"></i><span class="av${isMe?' me':''}" style="--from:${from}%;--to:${pc}%;background:${c}">${i===0&&p.x>0?'<i class="crown">👑</i>':''}${esc([...(p.name||'?')][0].toUpperCase())}</span><span class="flag">🏁</span></div></div>`
  }).join('');
  const hasMe=L.some(p=>p.id===user.uid);
  if(!hasMe){
    const status=roomPublishBusy?'Đang đăng ký hồ sơ vào đường đua chung…':roomPublishError?roomPublishErrorText():'Tài khoản chưa xuất hiện trong danh sách Firebase.';
    h+=`<div class="race-missing-note ${roomPublishError?'race-error':''}"><b>⚠ Chưa đăng ký được vào đường đua chung</b><div style="margin-top:4px">${esc(status)}</div><button class="btn g" style="margin-top:8px" onclick="retryRoomRegistration()" ${roomPublishBusy?'disabled':''}>${roomPublishBusy?'Đang xác minh…':'Đăng ký / thử lại'}</button></div>`;
  }else if(roomPublishError)h+=`<div class="race-missing-note race-error">${esc(roomPublishErrorText())}</div>`;
  const prevDate=new Date(mon());prevDate.setDate(prevDate.getDate()-7);const prevKey=dk(prevDate),prevL=L.map(p=>{
    const hasSavedPrev=p.prevWeek===prevKey&&typeof p.xpPrevWeek==='number'&&p.prevWeekHasData===true;
    const isStillLastWeek=p.week===prevKey&&typeof p.xpWeek==='number';
    const known=hasSavedPrev||isStillLastWeek;
    return Object.assign({},p,{prevKnown:known,px:hasSavedPrev?p.xpPrevWeek:(isStillLastWeek?p.xpWeek:null),pd:hasSavedPrev?(p.daysPrevWeek||0):(isStillLastWeek?(p.daysWeek||0):null)});
  }).sort((a,b)=>{if(a.prevKnown!==b.prevKnown)return a.prevKnown?-1:1;return (b.px||0)-(a.px||0)});
  h+=`<div class="sub race-prev-head"><b>🏆 Xếp hạng tuần trước</b><small class="s">${prevKey}</small></div><small class="s">Điểm được tính từ dữ liệu tuần đã kết thúc. Thành viên chưa đồng bộ sẽ được ghi rõ, không mặc định là 0 XP.</small>`;
  h+=prevL.map((p,i)=>`<div class="rh race-prev-row"><span><span class="rk">${p.prevKnown?(['🥇','🥈','🥉'][i]||(i+1)+'.'):'—'}</span><span class="rn">${esc(p.name||'?')}${p.id===user.uid?' <small>(bạn)</small>':''} · Cấp ${p.level||1}</span></span><span class="rx"><b>${p.prevKnown?p.px+' XP':'Chưa đồng bộ'}</b>${p.prevKnown?' · '+p.pd+'/7 ngày':''}</span></div>`).join('');
  return h+tail;
}
// Hiệu ứng sau khi vẽ bảng đua: số XP chạy từ giá trị cũ lên giá trị mới, pháo giấy khi bạn vượt lên. Chỉ chạy khi hiệu ứng đang bật.
function raceFx(){try{if(!document.body.classList.contains('fx'))return;
  document.querySelectorAll('#race .cu').forEach(e=>{const a=+e.dataset.from,b=+e.dataset.to;if(a===b)return;const t0=performance.now();
    (function f(t){const k=Math.min(1,(t-t0)/800),v=Math.round(a+(b-a)*(1-Math.pow(1-k,3)));e.textContent=v+(e.dataset.suf||'');if(k<1)requestAnimationFrame(f)})(t0)});
  if(raceBoom){confetti(raceBoom);raceBoom=0}}catch(e){}}
function confetti(n){const r=$('race').getBoundingClientRect();if(!r)return;const C=['var(--ac)','var(--ac2)','#ffd43b','#ff6b6b','#4dabf7','#f783ac'];
  for(let i=0;i<n;i++){const q=document.createElement('i');q.className='cf';
    q.style.cssText=`left:${r.left+Math.random()*r.width}px;top:${Math.max(40,r.top+10)}px;background:${C[i%6]};--dx:${((Math.random()-.5)*140).toFixed(0)}px;--dy:${(180+Math.random()*220).toFixed(0)}px;--r:${(Math.random()*720-360)|0}deg`;
    document.body.appendChild(q);setTimeout(()=>q.remove(),1600)}}
window.addEventListener('cloudready',cloudInit);cloudInit();
// ===== Báo trang đã cũ =====
// Định kỳ tải app.js mới nhất từ mạng (bỏ qua bộ nhớ đệm) và so số BUILD. Khác nhau thì hiện thanh báo "tải lại".
// style.css ghi số phiên bản của nó trong biến --css-build. Nếu khác BUILD thì giao diện (CSS) và mã (JS) đang lệch nhau, tức là một trong hai file còn cũ.
const cssOld=()=>{try{if(typeof getComputedStyle!='function')return false;return getComputedStyle(document.documentElement).getPropertyValue('--css-build').replace(/["'\s]/g,'')!==BUILD}catch(e){return false}};
async function chkNew(manual){lastChk=Date.now();if(cssOld()){showNew();return}try{const r=await fetch('app.js?chk='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;
  const m=new RegExp("const BUILD="+"'([^']+)'").exec(await r.text());
  if(m&&m[1]!==BUILD)showNew();else if(manual)toast('✓ Bạn đang dùng phiên bản mới nhất')}
  catch(e){if(manual)toast('Không kiểm tra được lúc này (có thể đang ngoại tuyến)')}}
function showNew(){if(updShown)return;updShown=true;
  document.body.insertAdjacentHTML('beforeend','<div id="upd"><span>✨ Đã có phiên bản mới. Trang này đã cũ, vui lòng tải lại.</span><button class="btn" onclick="reloadNew()">Tải lại ngay</button><button class="x" onclick="this.parentNode.remove();updShown=false">Để sau</button></div>')}
// Làm mới an toàn: chỉ xoá cache của Nhật ký học tập, huỷ worker đang giữ bản cũ,
// rồi mở URL có dấu thời gian để buộc điều hướng mới thay vì tải lại từ bản cache cũ.
async function reloadNew(){
  const b=document.querySelector('#upd .btn');if(b){b.disabled=true;b.textContent='Đang làm mới…'}
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      const base=new URL('./',location.href);
      await Promise.all(regs.filter(r=>{try{return new URL(r.scope).origin===base.origin&&new URL(r.scope).pathname===base.pathname}catch(e){return false}}).map(r=>r.unregister()));
    }
    if(window.caches){const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith('nhatky-')).map(k=>caches.delete(k)))}
  }catch(e){console.warn('Không thể xoá toàn bộ cache; sẽ thử tải lại từ mạng.',e)}
  const u=new URL(location.href);u.searchParams.set('_refresh',String(Date.now()));location.replace(u.href)
}
setTimeout(chkNew,4000);setInterval(chkNew,30*60*1000);
if(document.addEventListener)document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastChk>3e5)chkNew()});
setInterval(tick,1000);
// Refresh the shared race entry periodically so a signed-in participant stays registered.
setInterval(()=>{if(user&&cloudSynced&&!ro){ensureGlobalRaceRoom();pubSummary()}},45000);
// Chỉ cho MỘT tab được ghi dữ liệu (tránh hai tab ghi đè lẫn nhau). Tab đến sau chỉ hiện thông báo.
window.addEventListener('pagehide',()=>{if(!ro)cache()});
if(navigator.locks)navigator.locks.request('nhatky-hoc-tap',{ifAvailable:true},lock=>{
  if(lock){boot();return new Promise(()=>{})}
  ro=true;document.body.insertAdjacentHTML('beforeend','<div id="ro"><div><h2>Đang mở ở tab khác</h2><p>Nhật ký học tập đang chạy ở một tab hoặc cửa sổ khác. Hãy dùng tab đó. Khi tab kia đóng, trang này sẽ tự tải lại.</p></div></div>');
  navigator.locks.request('nhatky-hoc-tap',()=>location.reload())});
else boot();
render();
// Chỉ chạy ở tab được phép ghi dữ liệu: kiểm tra đồng hồ bị bỏ quên, rồi thử kết nối server.py.
// Nếu có server: gộp dữ liệu trong data.json với dữ liệu của trình duyệt rồi ghi lại vào data.json.
if('serviceWorker' in navigator&&location.protocol=='https:'){navigator.serviceWorker.register('sw.js').catch(()=>{});
  if(navigator.serviceWorker.controller)navigator.serviceWorker.addEventListener('controllerchange',()=>{setTimeout(()=>chkNew(false),500)})} // chỉ khi chạy từ trang web https (bản điện thoại)
function boot(){try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  if(chkGap(Date.now()))toast('⏸ Đồng hồ đã tự tạm dừng vì trang bị đóng hoặc máy ngủ');
  render();
  fetch('/api/data').then(r=>{if(!r.ok)throw 0;return r.json()}).then(o=>{
    if((o.ver||1)>VER){disk='err';stat();toast('data.json do phiên bản mới hơn tạo ra — không ghi đè');return}
    serverMode=true;merge(migrate(o));S.rev=o.rev||0;cache();toServer();render()}).catch(()=>{})}
