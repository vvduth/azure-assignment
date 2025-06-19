# Order Processing Function Documentation

## Overview

The Order Processing Function is a robust Azure Functions HTTP endpoint that handles bike rental order processing. It provides comprehensive validation, storage, messaging, and error handling capabilities.

## Architecture

```
HTTP Request → Validation → Order Creation → Storage → Messaging → Response
     ↓              ↓            ↓           ↓          ↓
   JSON Parse → Schema Check → UUID Gen → Blob Store → Service Bus
```

### Core Components

- **Validation Layer**: Zod schema validation with detailed error messages
- **Storage Service**: Azure Blob Storage for persistent order data
- **Messaging Service**: Azure Service Bus for order notifications
- **Retry Logic**: Exponential backoff for resilient external service calls
- **Error Handling**: Multi-layered error handling with proper HTTP status codes

## API Reference

### Endpoint
```
POST /api/processOrder
Content-Type: application/json
Authorization: Function Key Required
```

### Request Schema

```typescript
interface CreateOrderRequest {
  employeeId: string;      // Employee identifier (required, min 1 char)
  bikeModel: string;       // Bike model name (required, min 1 char)
  startDate: string;       // ISO 8601 datetime (required)
  endDate: string;         // ISO 8601 datetime (required, must be after startDate)
  price: number;           // Rental price (required, must be positive)
  currency: string;        // 3-character currency code (required, exactly 3 chars)
  companyId: string;       // Company identifier (required, min 1 char)
}
```

### Request Example

```json
{
  "employeeId": "emp-12345",
  "bikeModel": "Mountain Bike Pro",
  "startDate": "2024-01-01T10:00:00Z",
  "endDate": "2024-01-07T18:00:00Z",
  "price": 299.99,
  "currency": "USD",
  "companyId": "company-abc"
}
```

### Response Schema

#### Success Response (201 Created)
```json
{
  "success": true,
  "orderId": "uuid-generated-order-id",
  "message": "Order processed successfully"
}
```

#### Validation Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "employeeId: Employee ID is required",
    "endDate: End date must be after start date"
  ]
}
```

#### Server Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to store order in storage",
  "code": "STORAGE_ERROR"
}
```

## Usage Examples

### Using cURL

```bash
# Valid order request
curl -X POST "https://your-function-app.azurewebsites.net/api/processOrder" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{
    "employeeId": "emp-123",
    "bikeModel": "Electric Bike",
    "startDate": "2024-01-01T09:00:00Z",
    "endDate": "2024-01-03T17:00:00Z",
    "price": 150.00,
    "currency": "EUR",
    "companyId": "company-xyz"
  }'
```

### Using JavaScript/TypeScript

```typescript
async function createOrder(orderData: CreateOrderRequest): Promise<OrderProcessingResult> {
  const response = await fetch('/api/processOrder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-functions-key': 'YOUR_FUNCTION_KEY'
    },
    body: JSON.stringify(orderData)
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(`Order creation failed: ${result.message}`);
  }
  
  return result;
}
```

## Environment Configuration

### Required Environment Variables

```bash
# Azure Storage connection string (required)
AzureWebJobsStorage="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=..."

# Azure Service Bus connection string (required unless SKIP_SERVICE_BUS=true)
ServiceBusConnectionString="Endpoint=sb://namespace.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=..."

# Optional: Skip Service Bus for testing
SKIP_SERVICE_BUS="true"
```

### Local Development Setup

```bash
# For local development with Azurite
AzureWebJobsStorage="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
SKIP_SERVICE_BUS="true"
```

## Data Storage

### Blob Storage Structure

Orders are stored in Azure Blob Storage with the following structure:

```
Container: orders
Path: {companyId}/{orderId}.json
Metadata:
  - companyId: Company identifier
  - employeeId: Employee identifier  
  - status: Order status (PENDING/APPROVED/REJECTED)
```

### Service Bus Messages

Order notifications are sent to Azure Service Bus with this structure:

```json
{
  "body": {
    "orderId": "uuid",
    "companyId": "company-id",
    "employeeId": "employee-id",
    "status": "PENDING",
    "price": 299.99,
    "currency": "USD"
  },
  "messageId": "order-uuid",
  "correlationId": "company-id-order-uuid",
  "contentType": "application/json"
}
```

## Performance Characteristics

- **Cold Start**: ~2-3 seconds for first request
- **Warm Execution**: ~200-500ms typical response time
- **Retry Logic**: Up to 3 attempts with exponential backoff
- **Timeout**: 10 seconds maximum per operation
- **Concurrency**: Scales automatically based on load

## Monitoring and Logging

### Log Levels

- **Info**: Order processing start/completion, successful operations
- **Warning**: Retry attempts, recoverable errors
- **Error**: Validation failures, service errors, unrecoverable failures

### Key Metrics

- Processing time per order
- Success/failure rates
- Retry attempt frequency
- Storage and messaging service health

### Example Log Output

```
[2024-01-01T10:00:00.000Z] Order processing started
[2024-01-01T10:00:00.001Z] Created order abc-123 for employee emp-456
[2024-01-01T10:00:00.050Z] Order abc-123 stored successfully in blob storage
[2024-01-01T10:00:00.100Z] Service Bus messaging skipped for testing
[2024-01-01T10:00:00.101Z] Order abc-123 processed successfully in 101ms
```

## Security Considerations

- **Authentication**: Function key required for all requests
- **Input Validation**: Comprehensive schema validation prevents injection attacks
- **Error Sanitization**: Sensitive information not exposed in error responses
- **Connection Strings**: Stored securely in Azure Key Vault or App Settings
- **HTTPS Only**: All communication encrypted in transit

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests (requires Azurite)
```bash
# Start Azurite first
azurite --silent --location c:\temp\azurite

# Run integration tests
npm run test:integration
```

### Manual Testing
```bash
# Start function locally
npm start

# Test with sample data
curl -X POST http://localhost:7071/api/processOrder -H "Content-Type: application/json" -d @sample-order.json
```

## Troubleshooting

### Common Issues

1. **"Storage connection string is required"**
   - Check `AzureWebJobsStorage` environment variable
   - Verify connection string format

2. **"Service Bus queue not found"**
   - Create `order-processing` queue in Service Bus namespace
   - Or set `SKIP_SERVICE_BUS=true` for testing

3. **"Validation failed"**
   - Check request body matches schema exactly
   - Verify date formats are ISO 8601
   - Ensure endDate > startDate

### Debug Mode

Enable verbose logging by setting log level to Debug in host.json:

```json
{
  "logging": {
    "logLevel": {
      "default": "Debug"
    }
  }
}
```