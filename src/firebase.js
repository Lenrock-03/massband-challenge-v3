// src/firebase.js
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBbT-Ay8U5OlbMVRmMyQ5QXFuXVycz2wJM",
  authDomain: "massband-challenge-neustart.firebaseapp.com",
  projectId: "massband-challenge-neustart",
  storageBucket: "massband-challenge-neustart.firebasestorage.app",
  messagingSenderId: "666904323268",
  appId: "1:666904323268:web:fb84d21eac674be661d591"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
