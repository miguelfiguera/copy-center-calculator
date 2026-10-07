import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configuración pública de la app web. No es un secreto: la seguridad está en las reglas de Firestore.
export const firebaseConfig = {
  projectId: 'speed-copy-calculadora',
  appId: '1:794863172879:web:68320f9c45f26e399c527a',
  apiKey: 'AIzaSyAv0mfWeYsh_iQ8bK3M06yvYX6Fc81t5w0',
  authDomain: 'speed-copy-calculadora.firebaseapp.com',
  storageBucket: 'speed-copy-calculadora.firebasestorage.app',
  messagingSenderId: '794863172879',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Caché persistente: el catálogo y las ventas quedan en el navegador y la app funciona sin conexión.
// Las ventas hechas sin internet se envían solas cuando vuelve la conexión.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
