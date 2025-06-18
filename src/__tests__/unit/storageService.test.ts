import { StorageService } from '../../services/storageService';
import { BlobServiceClient } from '@azure/storage-blob';
import { Order } from '../../types/Order';
import { OrderProcessingError } from '../../utils/errors';

// Mock Azure Storage SDK
jest.mock('@azure/storage-blob');

describe('StorageService', () => {
  let storageService: StorageService;
  let mockBlobServiceClient: jest.Mocked<BlobServiceClient>;
  let mockContainerClient: any;
  let mockBlockBlobClient: any;
  let mockContext: any;

  beforeEach(() => {
    // Setup mocks
    mockBlockBlobClient = {
      upload: jest.fn().mockResolvedValue({}),
      download: jest.fn().mockResolvedValue({
        readableStreamBody: 'mock-stream'
      })
    };

    mockContainerClient = {
      createIfNotExists: jest.fn().mockResolvedValue({}),
      getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient)
    };

    mockBlobServiceClient = {
      getContainerClient: jest.fn().mockReturnValue(mockContainerClient)
    } as any;

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue(mockBlobServiceClient);

    mockContext = {
      log: jest.fn(),
      error: jest.fn()
    };

    storageService = new StorageService('test-connection-string');
  });

  describe('Constructor', () => {
    it('should create BlobServiceClient with connection string', () => {
      // Assert: Check constructor was called correctly
      expect(BlobServiceClient.fromConnectionString).toHaveBeenCalledWith('test-connection-string');
      expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith('orders');
    });
  });

  describe('initializeContainer', () => {
    it('should create container if not exists', async () => {
      // Act: Initialize container
      await storageService.initializeContainer();

      // Assert: Check container creation
      expect(mockContainerClient.createIfNotExists).toHaveBeenCalledTimes(1);
    });

    it('should handle container creation failure', async () => {
      // Arrange: Mock container creation failure
      mockContainerClient.createIfNotExists.mockRejectedValue(new Error('Container creation failed'));

      // Act & Assert: Check error handling
      await expect(storageService.initializeContainer()).rejects.toThrow(OrderProcessingError);
      await expect(storageService.initializeContainer()).rejects.toThrow('Failed to initialize storage container');
    });
  });

  describe('storeOrder', () => {
    it('should store order successfully', async () => {
      // Arrange: Test order
      const testOrder: Order = {
        id: 'test-id',
        employeeId: 'emp-123',
        bikeModel: 'Test Bike',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        status: 'PENDING',
        price: 299.99,
        currency: 'USD',
        companyId: 'test-company',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act: Store order
      await storageService.storeOrder(testOrder, mockContext);

      // Assert: Check blob operations
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('test-company/test-id.json');
      expect(mockBlockBlobClient.upload).toHaveBeenCalled();

      // Assert: Check upload parameters
      const uploadCall = mockBlockBlobClient.upload.mock.calls[0];
      const uploadedData = uploadCall[0];
      const uploadedOrder = JSON.parse(uploadedData);
      
      expect(uploadedOrder.id).toBe('test-id');
      expect(uploadedOrder.employeeId).toBe('emp-123');
      expect(uploadedOrder.companyId).toBe('test-company');

      // Assert: Check metadata
      const uploadOptions = uploadCall[2];
      expect(uploadOptions.metadata).toEqual({
        companyId: 'test-company',
        employeeId: 'emp-123',
        status: 'PENDING'
      });

      // Assert: Check logging
      expect(mockContext.log).toHaveBeenCalledWith('Order test-id stored successfully in blob storage');
    });

    it('should handle storage failure', async () => {
      // Arrange: Test order and mock failure
      const testOrder: Order = {
        id: 'test-id',
        employeeId: 'emp-123',
        bikeModel: 'Test Bike',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        status: 'PENDING',
        price: 299.99,
        currency: 'USD',
        companyId: 'test-company',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockBlockBlobClient.upload.mockRejectedValue(new Error('Upload failed'));

      // Act & Assert: Check error handling
      await expect(storageService.storeOrder(testOrder, mockContext)).rejects.toThrow(OrderProcessingError);
      expect(mockContext.error).toHaveBeenCalledWith('Failed to store order in blob storage:', expect.any(Error));
    });
  });

  describe('getOrder', () => {
    it('should retrieve order successfully', async () => {
      // Arrange: Mock order data
      const orderData = {
        id: 'test-id',
        employeeId: 'emp-123',
        companyId: 'test-company'
      };

      // Mock stream conversion
      storageService['streamToString'] = jest.fn().mockResolvedValue(JSON.stringify(orderData));

      // Act: Get order
      const result = await storageService.getOrder('test-id', 'test-company');

      // Assert: Check result
      expect(result).toEqual(orderData);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('test-company/test-id.json');
      expect(mockBlockBlobClient.download).toHaveBeenCalled();
    });

    it('should return null for non-existent order', async () => {
      // Arrange: Mock download failure
      mockBlockBlobClient.download.mockRejectedValue(new Error('Blob not found'));

      // Act: Get non-existent order
      const result = await storageService.getOrder('non-existent', 'test-company');

      // Assert: Check null return
      expect(result).toBeNull();
    });
  });
});