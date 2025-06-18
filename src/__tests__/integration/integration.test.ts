import { processOrder } from '../../functions/processOrder';
import { InvocationContext, HttpRequest } from '@azure/functions';

/**
 * Integration tests that run against real Azure services
 * These tests require:
 * - Azurite running locally for storage
 * - Valid Service Bus connection or mocked service bus
 */
describe('Order Processing Integration Tests', () => {
  let mockContext: InvocationContext;

  beforeEach(() => {
    mockContext = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    // Ensure environment variables are set for integration tests  
    process.env.AzureWebJobsStorage = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';
    process.env.SKIP_SERVICE_BUS = 'true'; // Skip Service Bus for integration tests
  });

  it('should process order end-to-end with real storage', async () => {
    // Arrange: Valid order data
    const validOrder = {
      employeeId: 'integration-test-emp',
      bikeModel: 'Integration Test Bike',
      startDate: '2024-01-01T10:00:00Z',
      endDate: '2024-01-07T10:00:00Z',
      price: 399.99,
      currency: 'USD',
      companyId: 'integration-test-company'
    };

    const mockRequest: HttpRequest = {
      json: jest.fn().mockResolvedValue(validOrder)
    } as any;

    // Act: Process order
    const result = await processOrder(mockRequest, mockContext);

    // Assert: Check successful processing
    expect(result.status).toBe(201);
    expect(result.jsonBody.success).toBe(true);
    expect(result.jsonBody.orderId).toBeDefined();
    expect(result.jsonBody.message).toBe('Order processed successfully');

    // Assert: Check logging occurred
    expect(mockContext.log).toHaveBeenCalledWith('Order processing started');
    expect(mockContext.log).toHaveBeenCalledWith(
      expect.stringMatching(/Created order .+ for employee integration-test-emp/)
    );
    expect(mockContext.log).toHaveBeenCalledWith(
      expect.stringMatching(/Order .+ processed successfully in \d+ms/)
    );
  }, 15000); // Longer timeout for integration test

  it('should handle storage service failures gracefully', async () => {
    // Arrange: Valid order but invalid storage connection
    const validOrder = {
      employeeId: 'test-emp',
      bikeModel: 'Test Bike',
      startDate: '2024-01-01T10:00:00Z',
      endDate: '2024-01-07T10:00:00Z',
      price: 199.99,
      currency: 'USD',
      companyId: 'test-company'
    };

    const mockRequest: HttpRequest = {
      json: jest.fn().mockResolvedValue(validOrder)
    } as any;

    // Temporarily set invalid storage connection
    const originalStorage = process.env.AzureWebJobsStorage;
    process.env.AzureWebJobsStorage = 'invalid-connection-string';

    // Act: Process order with invalid storage
    const result = await processOrder(mockRequest, mockContext);

    // Assert: Check error handling
    expect(result.status).toBe(500);
    expect(result.jsonBody.success).toBe(false);
    expect(mockContext.error).toHaveBeenCalled();

    // Cleanup: Restore original connection
    process.env.AzureWebJobsStorage = originalStorage;
  });
});