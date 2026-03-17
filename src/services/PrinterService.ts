import EscPosEncoder from 'esc-pos-encoder';

export interface TicketData {
  businessName: string;
  table: string;
  client: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  type?: 'customer' | 'kitchen';
}

class PrinterService {
  private device: USBDevice | null = null;

  async requestDevice(): Promise<boolean> {
    try {
      // Intentar con filtro de clase impresora, si falla permitir cualquier dispositivo
      try {
        this.device = await navigator.usb.requestDevice({
          filters: [{ classCode: 0x07 }] 
        });
      } catch (e) {
        this.device = await navigator.usb.requestDevice({ filters: [] });
      }

      if (!this.device) return false;

      await this.device.open();
      
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // Buscar la interfaz que tenga el endpoint de impresión (bulk out)
      let targetInterface = 0;
      let targetEndpoint = 0;

      const interfaces = this.device.configuration?.interfaces || [];
      for (const iface of interfaces) {
        const endpoints = iface.alternate.endpoints;
        const outEndpoint = endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
        if (outEndpoint) {
          targetInterface = iface.interfaceNumber;
          targetEndpoint = outEndpoint.endpointNumber;
          break;
        }
      }

      await this.device.claimInterface(targetInterface);
      (this.device as any)._targetEndpoint = targetEndpoint;
      
      return true;
    } catch (error) {
      console.error('Error al conectar impresora:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  async printTicket(data: TicketData): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error('Impresora no conectada');
    }

    const encoder = new EscPosEncoder();
    let result = encoder
      .initialize()
      .codepage('cp850')
      .align('center')
      .bold(true)
      .size('double')
      .line(data.businessName.toUpperCase())
      .size('normal')
      .bold(false)
      .line('*** ' + (data.type === 'kitchen' ? 'COMANDA COCINA' : 'NOTA DE PEDIDO') + ' ***')
      .line('--------------------------------')
      .align('left')
      .line(`Mesa: ${data.table}`)
      .line(`Cliente: ${data.client}`)
      .line(`Fecha: ${new Date().toLocaleString('es-CO')}`)
      .line('--------------------------------');

    data.items.forEach(item => {
      const qtyStr = `${item.quantity} x `.padEnd(6);
      const nameStr = item.name.substring(0, 18);
      result = result.line(`${qtyStr}${nameStr}`);
      if (data.type !== 'kitchen') {
        const priceStr = `$${(item.price * item.quantity).toLocaleString('es-CO')}`;
        result = result.align('right').line(priceStr).align('left');
      }
    });

    result = result.line('--------------------------------');

    if (data.type !== 'kitchen') {
      result = result
        .align('right')
        .bold(true)
        .size('double')
        .line(`TOTAL: $${data.total.toLocaleString('es-CO')}`)
        .size('normal')
        .bold(false)
        .align('center');
    }

    result = result
      .line(' ')
      .line('Gracias por su visita')
      .line('www.donapepacucuta.com')
      .line(' ')
      .line(' ')
      .cut();

    const bytes = result.encode();
    
    const endpointNumber = (this.device as any)._targetEndpoint;

    if (!endpointNumber) {
      throw new Error('No se encontró el endpoint de salida de la impresora');
    }

    await this.device.transferOut(endpointNumber, bytes);
  }
}

export const printerService = new PrinterService();
