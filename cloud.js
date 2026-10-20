// Cầu nối Firebase: Google Auth, Firestore và đồng bộ an toàn giữa nhiều thiết bị.
// Firebase Web API key không phải thông tin xác thực bí mật; quyền truy cập thực tế phải được khóa bằng Firestore Security Rules.
const cfg=window.FIREBASE_CONFIG;
function parseState(doc){try{return JSON.parse(doc&&doc.j||'{}')}catch(e){return{}}}
function mergeStates(remoteDoc, incomingDoc){
  const remote=parseState(remoteDoc),local=parseState(incomingDoc);
  const deleted={};
  for(const [id,t] of Object.entries(remote.del||{}))deleted[id]=t;
  for(const [id,t] of Object.entries(local.del||{}))deleted[id]=Math.max(Number(deleted[id])||0,Number(t)||0);
  const sessions=new Map();
  for(const x of [...(remote.sessions||[]),...(local.sessions||[])]){
    if(!x||x.id==null||deleted[String(x.id)])continue;
    const k=String(x.id),old=sessions.get(k);
    if(!old||(Number(x.m)||0)>(Number(old.m)||0)||((Number(x.m)||0)===(Number(old.m)||0)&&x===local.sessions?.find?.(z=>String(z.id)===k)))sessions.set(k,x);
  }
  const ach={...(remote.ach||{})};
  for(const [k,v] of Object.entries(local.ach||{}))ach[k]=Math.max(Number(ach[k])||0,Number(v)||0);
  const pref=(Number(remote.su)||0)>(Number(local.su)||0)?remote:local;
  const other=pref===remote?local:remote;
  const out={...remote,...local,sessions:[...sessions.values()],del:deleted,ach};
  for(const k of ['goalD','goalW','pomo','rem','minD','goalDays','rest','room','name','subjects','goals','su','ver']){
    if(pref[k]!==undefined)out[k]=pref[k];else if(other[k]!==undefined)out[k]=other[k];
  }
  return JSON.stringify(out);
}
if(cfg&&cfg.apiKey){
  try{
    const B='https://www.gstatic.com/firebasejs/10.12.2/';
    const [{initializeApp},A,F]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
    const app=initializeApp(cfg),auth=A.getAuth(app),db=F.getFirestore(app),uid=()=>auth.currentUser.uid;
    window.cloud={ready:true,
      onAuth:cb=>A.onAuthStateChanged(auth,cb),
      signIn:()=>A.signInWithPopup(auth,new A.GoogleAuthProvider()),
      signOut:()=>A.signOut(auth),
      watchMine:cb=>F.onSnapshot(F.doc(db,'users',uid()),s=>cb(s.exists()?s.data():null),err=>{console.warn('Không đọc được hồ sơ Firebase:',err)}),
      // Atomic merge protects session history when phone and computer save close together/offline changes reconnect.
      setMine:d=>F.runTransaction(db,async tx=>{const ref=F.doc(db,'users',uid()),snap=await tx.get(ref);const old=snap.exists()?snap.data():null;
        const result={...(old||{}),...d,j:old&&old.j?mergeStates(old,d):d.j,u:Math.max(Number(old&&old.u)||0,Number(d.u)||0,Date.now()),updatedAt:F.serverTimestamp()};tx.set(ref,result);return result}),
      setMember:(r,d)=>F.runTransaction(db,async tx=>{const ref=F.doc(db,'rooms',r,'members',uid()),snap=await tx.get(ref),old=snap.exists()?snap.data():null;
        // A join always registers the authenticated user's own document in this room.
        // Do not silently reject a new registration; preserve newer summaries only when the doc already exists.
        if(old){const oldRev=Number(old.sourceRev)||0,newRev=Number(d.sourceRev)||0;if(oldRev>newRev||(oldRev===newRev&&(Number(old.t)||0)>(Number(d.t)||0)))return old;}tx.set(ref,d);return d}),
      getMember:async r=>{const snap=await F.getDoc(F.doc(db,'rooms',r,'members',uid()));return snap.exists()?snap.data():null},
      delMember:r=>F.deleteDoc(F.doc(db,'rooms',r,'members',uid())),
      watchRoom:(r,cb)=>F.onSnapshot(F.collection(db,'rooms',r,'members'),s=>cb(s.docs.map(x=>Object.assign({id:x.id},x.data())).sort((a,b)=>String(a.id).localeCompare(String(b.id)))),err=>{console.warn('Không đọc được phòng thi đua:',err);cb(null)})};
    window.dispatchEvent(new Event('cloudready'));
  }catch(e){console.warn('Không tải được Firebase (có thể đang offline):',e)}
}
