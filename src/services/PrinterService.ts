import EscPosEncoder from 'esc-pos-encoder';

export interface TicketData {
  businessName: string;
  table: string;
  client: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  type?: 'customer' | 'kitchen';
  shippingInfo?: {
    phone: string;
    address: string;
    notes: string;
  };
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
      
      // Intentar resetear el dispositivo para liberar bloqueos previos
      try {
        await this.device.reset();
      } catch (e) {
        console.warn('No se pudo resetear el dispositivo:', e);
      }

      // Forzar configuración 1 si es posible
      try {
        if (this.device.configuration === null || this.device.configuration.configurationValue !== 1) {
          await this.device.selectConfiguration(1);
        }
      } catch (e) {
        console.warn('Error seleccionando configuración:', e);
      }

      // Buscar todas las interfaces que tengan el endpoint de impresión (bulk out)
      const interfaces = this.device.configuration?.interfaces || [];
      const candidates: { iface: number; endpoint: number }[] = [];

      for (const iface of interfaces) {
        const endpoints = iface.alternate.endpoints;
        const outEndpoint = endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
        if (outEndpoint) {
          candidates.push({
            iface: iface.interfaceNumber,
            endpoint: outEndpoint.endpointNumber
          });
        }
      }

      if (candidates.length === 0) {
        throw new Error('No se encontró un canal de salida válido en la impresora.');
      }

      // Intentar reclamar cada interfaz candidata hasta que una funcione
      let success = false;
      let lastError = null;

      for (const candidate of candidates) {
        try {
          await this.device.claimInterface(candidate.iface);
          (this.device as any)._targetEndpoint = candidate.endpoint;
          (this.device as any)._targetInterface = candidate.iface;
          success = true;
          break;
        } catch (e) {
          lastError = e;
          console.warn(`No se pudo reclamar la interfaz ${candidate.iface}, intentando la siguiente...`);
        }
      }

      if (!success) {
        if (lastError && (lastError as any).name === 'SecurityError') {
          throw new Error('BLOQUEO_OS');
        }
        throw lastError || new Error('No se pudo reclamar ninguna interfaz de la impresora.');
      }
      
      return true;
    } catch (error: any) {
      console.error('Error crítico al conectar impresora:', error);
      
      if (error.message === 'BLOQUEO_OS' || error.name === 'SecurityError') {
        throw new Error('SISTEMA_BLOQUEADO');
      }
      
      throw error;
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

    if (data.shippingInfo) {
      result = result
        .bold(true)
        .line('DOMICILIO:')
        .bold(false)
        .line(`Tel: ${data.shippingInfo.phone}`)
        .line(`Dir: ${data.shippingInfo.address}`);
      if (data.shippingInfo.notes) {
        result = result.line(`Notas: ${data.shippingInfo.notes}`);
      }
      result = result.line('--------------------------------');
    }

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
