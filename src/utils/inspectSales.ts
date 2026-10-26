import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export const inspectSalesAndExport = async () => {
  console.log('--- INSPECCIÓN Y EXPORTACIÓN DE DATOS ---');
  const salesRef = collection(db, 'sales');
  const q = query(salesRef, orderBy('timestamp', 'desc'), limit(50));
  
  let report = 'Reporte de Diagnóstico de Ventas\n\n';
  
  try {
    const snapshot = await getDocs(q);
    
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      report += `ID: ${docSnap.id}\n`;
      report += `Tipo timestamp: ${typeof data.timestamp}\n`;
      report += `Valor: ${JSON.stringify(data.timestamp)}\n`;
      report += '-------------------\n';
    });
    
    // Crear archivo para descarga
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagnostico_ventas.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    return 'Descarga iniciada';
  } catch (error) {
    console.error('Error:', error);
    return 'Error';
  }
};
