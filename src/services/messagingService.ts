import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { Order } from '../types/Order';
import { OrderProcessingError } from '../utils/errors';
import { InvocationContext } from '@azure/functions';

export class MessagingService {
  private serviceBusClient: ServiceBusClient;
  private sender: ServiceBusSender;

  constructor(connectionString: string, queueName: string = 'order-processing') {
    this.serviceBusClient = new  ServiceBusClient(connectionString);
    this.sender = this.serviceBusClient.createSender(queueName);
  }

  async sendOrderMessage(order: Order, context: InvocationContext): Promise<void> {
    try {
      const message = {
        body: {
          orderId: order.id,
          companyId: order.companyId,
          employeeId: order.employeeId,
          status: order.status,
          price: order.price,
          currency: order.currency
        },
        messageId: order.id,
        correlationId: `${order.companyId}-${order.id}`,
        contentType: 'application/json'
      };

      await this.sender.sendMessages(message);
      context.log(`Order message sent to Service Bus for order ${order.id}`);
    } catch (error) {
      context.error('Failed to send message to Service Bus:', error);
      throw new OrderProcessingError(
        'Failed to send order message',
        'MESSAGING_ERROR'
      );
    }
  }

  async close(): Promise<void> {
    await this.sender.close();
    await this.serviceBusClient.close();
  }
}