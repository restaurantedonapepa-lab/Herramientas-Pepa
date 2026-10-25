import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export const diagnoseSales = async () => {
  console.log('Iniciando diagnóstico profundo de ventas...');
  const salesRef = collection(db, 'sales');
  const q = query(salesRef, orderBy('timestamp', 'desc'), limit(1000));
  
  try {
    const snapshot = await getDocs(q);
    const recordsWithIssues: any[] = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp;
      
      // DIAGNÓSTICO: Inspección detallada del tipo de timestamp
      let date;
      let issue = '';
      
      if (!timestamp) {
        issue = 'Timestamp inexistente';
      } else if (typeof timestamp === 'object' && timestamp.toDate) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        issue = `Tipo de dato inesperado: ${typeof timestamp} - Valor: ${JSON.stringify(timestamp)}`;
      }
      
      if (!issue && (!date || isNaN(date.getTime()))) {
        issue = `Fecha inválida (NaN) - Valor: ${JSON.stringify(timestamp)}`;
      }
      
      if (issue) {
        recordsWithIssues.push({ id: doc.id, issue, data });
      }
    });
    
    console.log(`Diagnóstico finalizado. Se encontraron ${recordsWithIssues.length} registros con problemas.`);
    if (recordsWithIssues.length > 0) {
      console.log('Detalles de registros con problemas:', recordsWithIssues.slice(0, 10));
    }
    return recordsWithIssues;
  } catch (error) {
    console.error('Error durante el diagnóstico:', error);
    return [];
  }
};
