// Cầu nối với Firebase (đăng nhập Google + cơ sở dữ liệu Firestore).
// Nếu config.js chưa điền cấu hình thì file này không làm gì cả và phần mềm chạy như bình thường.
const cfg=window.FIREBASE_CONFIG;
if(cfg&&cfg.apiKey){
  try{
    const B='https://www.gstatic.com/firebasejs/10.12.2/';
    const [{initializeApp},A,F]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
    const app=initializeApp(cfg),auth=A.getAuth(app),db=F.getFirestore(app),uid=()=>auth.currentUser.uid;
    window.cloud={ready:true,
      onAuth:cb=>A.onAuthStateChanged(auth,cb),
      signIn:()=>A.signInWithPopup(auth,new A.GoogleAuthProvider()),
      signOut:()=>A.signOut(auth),
      watchMine:cb=>F.onSnapshot(F.doc(db,'users',uid()),s=>cb(s.exists()?s.data():null),()=>{}),
      setMine:d=>F.setDoc(F.doc(db,'users',uid()),d),
      setMember:(r,d)=>F.setDoc(F.doc(db,'rooms',r,'members',uid()),d),
      delMember:r=>F.deleteDoc(F.doc(db,'rooms',r,'members',uid())),
      watchRoom:(r,cb)=>F.onSnapshot(F.collection(db,'rooms',r,'members'),s=>cb(s.docs.map(x=>Object.assign({id:x.id},x.data()))),()=>cb(null))};
    window.dispatchEvent(new Event('cloudready'));
  }catch(e){console.warn('Không tải được Firebase (có thể đang offline):',e)}
}
