import { processOrder } from '../../functions/processOrder';
import { InvocationContext, HttpRequest } from '@azure/functions';
import { StorageService } from '../../services/storageService';
import { MessagingService } from '../../services/messagingService';

// Mock the services
jest.mock('../../services/storageService');
jest.mock('../../services/messagingService');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-order-id-123')
}));

// Mock retry utility to avoid delays in tests
jest.mock('../../utils/retry', () => ({
  withRetry: jest.fn((operation) => operation())
}));

describe('processOrder Function', () => {
  let mockContext: InvocationContext;
  let mockRequest: HttpRequest;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockMessagingService: jest.Mocked<MessagingService>;

  beforeEach(() => {
    // Setup mock context
    mockContext = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    // Setup mock services
    mockStorageService = {
      initializeContainer: jest.fn().mockResolvedValue(undefined),
      storeOrder: jest.fn().mockResolvedValue(undefined),
      getOrder: jest.fn().mockResolvedValue(null)
    } as any;

    mockMessagingService = {
      sendOrderMessage: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock constructors
    (StorageService as jest.Mock).mockImplementation(() => mockStorageService);
    (MessagingService as jest.Mock).mockImplementation(() => mockMessagingService);
  });

  describe('Valid Order Processing', () => {
    it('should process a valid order successfully', async () => {
      // Arrange: Valid order data
      const validOrderData = {
        employeeId: 'emp-123',
        bikeModel: 'Mountain Bike Pro',
        startDate: '2024-01-01T10:00:00Z',
        endDate: '2024-01-07T10:00:00Z',
        price: 299.99,
        currency: 'EUR',
        companyId: 'company-123'
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(validOrderData)
      } as any;

      // Act: Process the order
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check successful response
      expect(result.status).toBe(201);
      expect(result.jsonBody).toEqual({
        success: true,
        orderId: 'test-order-id-123',
        message: 'Order processed successfully'
      });

      // Assert: Check all services were called
      expect(mockStorageService.initializeContainer).toHaveBeenCalledTimes(1);
      expect(mockStorageService.storeOrder).toHaveBeenCalledTimes(1);
      expect(mockMessagingService.sendOrderMessage).toHaveBeenCalledTimes(1);
      expect(mockMessagingService.close).toHaveBeenCalledTimes(1);

      // Assert: Check logging
      expect(mockContext.log).toHaveBeenCalledWith('Order processing started');
      expect(mockContext.log).toHaveBeenCalledWith('Created order test-order-id-123 for employee emp-123');
    });

    it('should create order with correct structure', async () => {
      // Arrange: Valid order data
      const validOrderData = {
        employeeId: 'emp-456',
        bikeModel: 'Road Bike Elite',
        startDate: '2024-02-01T09:00:00Z',
        endDate: '2024-02-05T18:00:00Z',
        price: 199.50,
        currency: 'EUR',
        companyId: 'company-456'
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(validOrderData)
      } as any;

      // Act: Process the order
      await processOrder(mockRequest, mockContext);

      // Assert: Check the order object passed to storage
      const storedOrder = mockStorageService.storeOrder.mock.calls[0][0];
      expect(storedOrder).toMatchObject({
        id: 'test-order-id-123',
        employeeId: 'emp-456',
        bikeModel: 'Road Bike Elite',
        status: 'PENDING',
        price: 199.50,
        currency: 'EUR',
        companyId: 'company-456'
      });
      expect(storedOrder.startDate).toBeInstanceOf(Date);
      expect(storedOrder.endDate).toBeInstanceOf(Date);
      expect(storedOrder.createdAt).toBeInstanceOf(Date);
      expect(storedOrder.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Validation Errors', () => {
    it('should handle missing required fields', async () => {
      // Arrange: Invalid data - missing fields
      const invalidData = {
        employeeId: '',
        bikeModel: 'Mountain Bike',
        // missing other required fields
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(invalidData)
      } as any;

      // Act: Process invalid order
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check validation error response
      expect(result.status).toBe(400);
      expect(result.jsonBody.success).toBe(false);
      expect(result.jsonBody.message).toBe('Validation failed');
      expect(result.jsonBody.errors).toBeDefined();
      expect(Array.isArray(result.jsonBody.errors)).toBe(true);

      // Assert: Services should not be called
      expect(mockStorageService.storeOrder).not.toHaveBeenCalled();
      expect(mockMessagingService.sendOrderMessage).not.toHaveBeenCalled();
    });

    it('should handle invalid date order (endDate before startDate)', async () => {
      // Arrange: Invalid date order
      const invalidDateOrder = {
        employeeId: 'emp-123',
        bikeModel: 'Mountain Bike',
        startDate: '2024-01-07T10:00:00Z',
        endDate: '2024-01-01T10:00:00Z', // Before start date
        price: 299.99,
        currency: 'USD',
        companyId: 'company-123'
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(invalidDateOrder)
      } as any;

      // Act: Process invalid order
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check validation error
      expect(result.status).toBe(400);
      expect(result.jsonBody.success).toBe(false);
      expect(result.jsonBody.errors).toContain('End date must be after start date');
    });

    it('should handle empty request body', async () => {
      // Arrange: Empty body
      mockRequest = {
        json: jest.fn().mockResolvedValue(null)
      } as any;

      // Act: Process empty request
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check validation error
      expect(result.status).toBe(400);
      expect(result.jsonBody.success).toBe(false);
      expect(result.jsonBody.message).toBe('Request body is required');
    });

    it('should handle invalid JSON', async () => {
      // Arrange: Invalid JSON
      mockRequest = {
        json: jest.fn().mockRejectedValue(new SyntaxError('Invalid JSON'))
      } as any;

      // Act: Process invalid JSON
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check JSON error
      expect(result.status).toBe(400);
      expect(result.jsonBody.success).toBe(false);
      expect(result.jsonBody.message).toBe('Invalid JSON in request body');
    });
  });

  describe('Service Errors', () => {
    it('should handle storage initialization failure', async () => {
      // Arrange: Valid data but storage fails
      const validData = {
        employeeId: 'emp-123',
        bikeModel: 'Mountain Bike',
        startDate: '2024-01-01T10:00:00Z',
        endDate: '2024-01-07T10:00:00Z',
        price: 299.99,
        currency: 'USD',
        companyId: 'company-123'
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(validData)
      } as any;

      // Mock storage failure
      mockStorageService.initializeContainer.mockRejectedValue(
        new Error('Storage initialization failed')
      );

      // Act: Process order with storage failure
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check error handling
      expect(result.status).toBe(500);
      expect(result.jsonBody.success).toBe(false);
      expect(mockContext.error).toHaveBeenCalled();

      // Assert: Cleanup should still happen
      expect(mockMessagingService.close).toHaveBeenCalled();
    });

    it('should handle messaging service failure', async () => {
      // Arrange: Valid data but messaging fails
      const validData = {
        employeeId: 'emp-123',
        bikeModel: 'Mountain Bike',
        startDate: '2024-01-01T10:00:00Z',
        endDate: '2024-01-07T10:00:00Z',
        price: 299.99,
        currency: 'USD',
        companyId: 'company-123'
      };

      mockRequest = {
        json: jest.fn().mockResolvedValue(validData)
      } as any;

      // Mock messaging failure after storage succeeds
      mockMessagingService.sendOrderMessage.mockRejectedValue(
        new Error('Service Bus unavailable')
      );

      // Act: Process order with messaging failure
      const result = await processOrder(mockRequest, mockContext);

      // Assert: Check error handling
      expect(result.status).toBe(500);
      expect(result.jsonBody.success).toBe(false);

      // Assert: Storage should have been called (partial success)
      expect(mockStorageService.storeOrder).toHaveBeenCalled();
      
      // Assert: Cleanup should still happen
      expect(mockMessagingService.close).toHaveBeenCalled();
    });
  });
});