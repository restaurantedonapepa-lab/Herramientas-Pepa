import { db } from '../firebase';
import { collection, getDocs, query, writeBatch, doc } from 'firebase/firestore';

export const repairSales = async () => {
  console.log('Iniciando reparación de ventas...');
  const salesRef = collection(db, 'sales');
  const q = query(salesRef);
  
  try {
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let repairedCount = 0;
    
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      // Si el timestamp es un objeto literal (ej: { seconds: X, nanoseconds: Y })
      // y no tiene el método toDate(), convertirlo a Timestamp de Firebase o Date
      if (data.timestamp && typeof data.timestamp === 'object' && !data.timestamp.toDate) {
        // Asumimos formato compatible con Firestore Timestamp { seconds, nanoseconds }
        // Si no, intentaremos crear una fecha válida
        const seconds = data.timestamp.seconds || 0;
        const nanoseconds = data.timestamp.nanoseconds || 0;
        
        if (seconds > 0) {
            batch.update(docSnap.ref, {
                timestamp: new Date(seconds * 1000 + nanoseconds / 1000000)
            });
            repairedCount++;
        }
      }
    });
    
    if (repairedCount > 0) {
        await batch.commit();
        console.log(`Reparación completada. Se repararon ${repairedCount} registros.`);
    } else {
        console.log('No se encontraron registros para reparar.');
    }
    return repairedCount;
  } catch (error) {
    console.error('Error durante la reparación:', error);
    return -1;
  }
};
