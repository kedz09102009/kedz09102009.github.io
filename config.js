// Dán cấu hình Firebase của bạn vào đây (xem HUONG-DAN-DONG-BO.md). Để trống = không dùng đồng bộ.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAweYQ8ysi8OGLeFAHU9mPJ5MO4J55yuOU",
  authDomain: "kietphan-7da93.firebaseapp.com",
  projectId: "kietphan-7da93",
  storageBucket: "kietphan-7da93.firebasestorage.app",
  messagingSenderId: "655506105636",
  appId: "1:655506105636:web:757f52508fec75c92f7fb1",
  measurementId: "G-HDP6F566VW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
window.FIREBASE_CONFIG={apiKey:"",authDomain:"",projectId:"",storageBucket:"",messagingSenderId:"",appId:""};
