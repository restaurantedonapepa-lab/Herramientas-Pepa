import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import Swal from 'sweetalert2';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
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
export const logout = () => signOut(auth);

const DEFAULT_IMG_ID = "1CHcrsjPdVxniofL05haOngroR7ulBV7n";

export const getDriveImageUrl = (imageId: string | undefined) => {
  const id = imageId || DEFAULT_IMG_ID;
  return `https://lh3.googleusercontent.com/d/${id}=w400-h400-c`;
};

export const ensureUserProfile = async (user: any) => {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.email === 'restaurantedonapepa@gmail.com' ? 'admin' : 'user',
      lastLogin: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Error ensuring user profile:", error);
  }
};
