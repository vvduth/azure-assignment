import { MessagingService } from '../../services/messagingService';
import { ServiceBusClient } from '@azure/service-bus';
import { Order } from '../../types/Order';
import { OrderProcessingError } from '../../utils/errors';

// Mock Azure Service Bus SDK
jest.mock('@azure/service-bus');

describe('MessagingService', () => {
  let messagingService: MessagingService;
  let mockServiceBusClient: jest.Mocked<ServiceBusClient>;
  let mockSender: any;
  let mockContext: any;

  beforeEach(() => {
    // Setup mocks
    mockSender = {
      sendMessages: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({})
    };

    mockServiceBusClient = {
      createSender: jest.fn().mockReturnValue(mockSender),
      close: jest.fn().mockResolvedValue({})
    } as any;

    (ServiceBusClient as jest.Mock).mockImplementation(() => mockServiceBusClient);

    mockContext = {
      log: jest.fn(),
      error: jest.fn()
    };

    messagingService = new MessagingService('test-connection-string', 'test-queue');
  });

  describe('Constructor', () => {
    it('should create ServiceBusClient and sender', () => {
      // Assert: Check constructor calls
      expect(ServiceBusClient).toHaveBeenCalledWith('test-connection-string');
      expect(mockServiceBusClient.createSender).toHaveBeenCalledWith('test-queue');
    });

    it('should use default queue name when not provided', () => {
      // Act: Create service without queue name
      new MessagingService('test-connection-string');

      // Assert: Check default queue name
      expect(mockServiceBusClient.createSender).toHaveBeenCalledWith('order-processing');
    });
  });

  describe('sendOrderMessage', () => {
    it('should send order message successfully', async () => {
      // Arrange: Test order
      const testOrder: Order = {
        id: 'test-order-123',
        employeeId: 'emp-456',
        bikeModel: 'Test Bike',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        status: 'PENDING',
        price: 199.99,
        currency: 'EUR',
        companyId: 'test-company-456',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act: Send message
      await messagingService.sendOrderMessage(testOrder, mockContext);

      // Assert: Check message sending
      expect(mockSender.sendMessages).toHaveBeenCalledTimes(1);

      // Assert: Check message structure
      const sentMessage = mockSender.sendMessages.mock.calls[0][0];
      expect(sentMessage).toEqual({
        body: {
          orderId: 'test-order-123',
          companyId: 'test-company-456',
          employeeId: 'emp-456',
          status: 'PENDING',
          price: 199.99,
          currency: 'EUR'
        },
        messageId: 'test-order-123',
        correlationId: 'test-company-456-test-order-123',
        contentType: 'application/json'
      });

      // Assert: Check logging
      expect(mockContext.log).toHaveBeenCalledWith('Order message sent to Service Bus for order test-order-123');
    });

    it('should handle message sending failure', async () => {
      // Arrange: Test order and mock failure
      const testOrder: Order = {
        id: 'test-order-123',
        employeeId: 'emp-456',
        bikeModel: 'Test Bike',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        status: 'PENDING',
        price: 199.99,
        currency: 'EUR',
        companyId: 'test-company-456',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSender.sendMessages.mockRejectedValue(new Error('Service Bus unavailable'));

      // Act & Assert: Check error handling
      await expect(messagingService.sendOrderMessage(testOrder, mockContext)).rejects.toThrow(OrderProcessingError);
      expect(mockContext.error).toHaveBeenCalledWith('Failed to send message to Service Bus:', expect.any(Error));
    });
  });

  describe('close', () => {
    it('should close sender and client', async () => {
      // Act: Close service
      await messagingService.close();

      // Assert: Check cleanup
      expect(mockSender.close).toHaveBeenCalledTimes(1);
      expect(mockServiceBusClient.close).toHaveBeenCalledTimes(1);
    });

    it('should handle close errors gracefully', async () => {
      // Arrange: Mock close failure
      mockSender.close.mockRejectedValue(new Error('Close failed'));

      // Act & Assert: Should not throw
      await expect(messagingService.close()).rejects.toThrow('Close failed');
    });
  });
});