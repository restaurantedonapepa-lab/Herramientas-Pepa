import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export const diagnoseSales = async () => {
  console.log('Iniciando diagnóstico de ventas...');
  const salesRef = collection(db, 'sales');
  const q = query(salesRef, orderBy('timestamp', 'desc'), limit(1000));
  
  try {
    const snapshot = await getDocs(q);
    const brokenRecords: any[] = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp;
      
      let date;
      if (timestamp && timestamp.toDate) {
        date = timestamp.toDate();
      } else if (timestamp) {
        date = new Date(timestamp);
      }
      
      if (!date || isNaN(date.getTime())) {
        brokenRecords.push({ id: doc.id, data });
      }
    });
    
    console.log(`Diagnóstico finalizado. Se encontraron ${brokenRecords.length} registros con fecha inválida.`);
    if (brokenRecords.length > 0) {
      console.log('Ejemplos de registros rotos:', brokenRecords.slice(0, 5));
    }
    return brokenRecords;
  } catch (error) {
    console.error('Error durante el diagnóstico:', error);
    return [];
  }
};
