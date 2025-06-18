

// Mock Azure Functions context for all tests
global.mockContext = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn()
};

// Mock environment variables
process.env.AzureWebJobsStorage = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=test;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';
process.env.ServiceBusConnectionString = 'Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test';

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});