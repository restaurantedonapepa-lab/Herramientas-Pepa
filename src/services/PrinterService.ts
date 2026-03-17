import EscPosEncoder from 'esc-pos-encoder';

export class PrinterService {
  private device: USBDevice | null = null;

  async requestDevice() {
    try {
      this.device = await navigator.usb.requestDevice({
        filters: [
          { classCode: 0x07 } // Clase de Impresoras
        ]
      });
      await this.device.open();
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }
      await this.device.claimInterface(0);
      return true;
    } catch (error) {
      console.error('Error al conectar con la impresora USB:', error);
      return false;
    }
  }

  async printTicket(data: {
    businessName: string;
    table: string;
    client: string;
    items: { name: string; quantity: number; price: number }[];
    total: number;
  }) {
    if (!this.device) {
      const connected = await this.requestDevice();
      if (!connected) throw new Error('No hay impresora conectada');
    }

    const encoder = new EscPosEncoder();
    let result = encoder
      .initialize()
      .align('center')
      .size('normal')
      .text(data.businessName.toUpperCase())
      .newline()
      .text('--------------------------------')
      .newline()
      .align('left')
      .text(`MESA: ${data.table}`)
      .newline()
      .text(`CLIENTE: ${data.client}`)
      .newline()
      .text(`FECHA: ${new Date().toLocaleString()}`)
      .newline()
      .text('--------------------------------')
      .newline();

    data.items.forEach(item => {
      const line = `${item.quantity}x ${item.name.substring(0, 20)}`;
      const price = `$${(item.price * item.quantity).toLocaleString()}`;
      const spaces = 32 - line.length - price.length;
      result = result.text(line + ' '.repeat(Math.max(1, spaces)) + price).newline();
    });

    result = result
      .text('--------------------------------')
      .newline()
      .align('right')
      .size('double')
      .text(`TOTAL: $${data.total.toLocaleString()}`)
      .newline()
      .size('normal')
      .align('center')
      .newline()
      .text('¡Gracias por su visita!')
      .newline()
      .cut()
      .encode();

    try {
      await this.device?.transferOut(1, result);
    } catch (error) {
      console.error('Error al enviar datos a la impresora:', error);
      throw error;
    }
  }

  isConnected() {
    return !!this.device && this.device.opened;
  }
}

export const printerService = new PrinterService();
