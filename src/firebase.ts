import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDoc, 
  collection, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import Swal from 'sweetalert2';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with robust persistent multi-tab IndexedDB cache
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  console.warn('Firestore Notice / Error: ', JSON.stringify(errInfo));
  // Do not throw fatal uncaught exceptions for quota or offline issues so local cache continues to work
  if (errMsg.includes('Quota limit exceeded') || errMsg.includes('resource-exhausted') || errMsg.includes('client is offline')) {
    console.info('Modo Local Activo: La base de datos está operando con almacenamiento local persistente.');
    return;
  }
}

// Test connection softly without failing on quota limits
async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    // Soft error handling
  }
}
testConnection();

export const loginWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Login Error:", error);
    if (error.code === 'auth/cancelled-by-user') return;
    
    let message = "No se pudo iniciar sesión.";
    if (error.code === 'auth/unauthorized-domain') {
      message = `El dominio ${window.location.hostname} no está autorizado. \n\nAsegúrate de añadir "herramientas-pepa.vercel.app" en la consola de Firebase > Authentication > Settings > Authorized Domains.`;
    } else if (error.code === 'auth/popup-blocked') {
      message = "Ventana emergente bloqueada por el navegador.";
    } else {
      message = `Error: ${error.message}`;
    }

    Swal.fire({
      icon: 'error',
      title: 'Error de Login',
      text: message,
      confirmButtonColor: '#dc2626'
    });
    throw error;
  }
};

export const loginWithOneTap = async (response: any) => {
  try {
    const credential = GoogleAuthProvider.credential(response.credential);
    return await signInWithCredential(auth, credential);
  } catch (error: any) {
    console.error("One Tap Login Error:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

const DEFAULT_IMG_ID = "1CHcrsjPdVxniofL05haOngroR7ulBV7n";

export const getDriveImageUrl = (imageId: string | undefined) => {
  if (!imageId) return `https://lh3.googleusercontent.com/d/${DEFAULT_IMG_ID}=w400-h400-c`;
  
  // Si es una URL completa (de Firebase Storage), la devolvemos tal cual
  if (imageId.startsWith('http')) return imageId;
  
  // Si es un ID de Drive
  return `https://lh3.googleusercontent.com/d/${imageId}=w400-h400-c`;
};

export const ensureUserProfile = async (user: any) => {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.email === 'restaurantedonapepa@gmail.com' ? 'admin' : 'cliente',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
    } else {
      await setDoc(userRef, {
        lastLogin: serverTimestamp(),
        displayName: user.displayName,
        photoURL: user.photoURL,
      }, { merge: true });
    }
  } catch (error) {
    console.error("Error ensuring user profile:", error);
  }
};
