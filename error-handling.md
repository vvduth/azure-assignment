# Error Handling Strategy

## Overview

The Order Processing Function implements a comprehensive, multi-layered error handling strategy designed to provide clear feedback to clients while maintaining system reliability and security.

## Error Handling Philosophy

### Core Principles

1. **Fail Fast**: Validate input immediately and provide clear error messages
2. **Graceful Degradation**: Handle partial failures without losing processed data
3. **Resource Cleanup**: Always clean up resources, even in error scenarios
4. **Retry Logic**: Automatically retry transient failures with backoff
5. **Security First**: Never expose sensitive information in error responses
6. **Observability**: Log all errors with sufficient context for debugging

## Error Classification

### 1. Client Errors (4xx)

**Purpose**: Indicate problems with the client request that require client-side fixes.

#### Validation Errors (400 Bad Request)
```typescript
// Triggered by: Invalid input data, missing required fields, format errors
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "employeeId: Employee ID is required",
    "price: Price must be positive",
    "endDate: End date must be after start date"
  ]
}
```

**Handling Strategy**:
- Use Zod schema validation for comprehensive input checking
- Provide specific field-level error messages
- Return immediately without processing
- Log validation failures for monitoring

**Implementation**:
```typescript
function validateInput(input: any): CreateOrderRequest {
  const validFields = CreateOrderSchema.safeParse(input);
  
  if (!validFields.success) {
    const validationErrors = validFields.error.errors.map((err: any) => 
      `${err.path.join('.')}: ${err.message}`
    );
    throw new ValidationError('Validation failed', validationErrors);
  }
  
  return validFields.data as CreateOrderRequest;
}
```

### 2. Server Errors (5xx)

**Purpose**: Indicate system-level problems that may be transient or require operational intervention.

#### Configuration Errors (500 Internal Server Error)
```typescript
// Triggered by: Missing environment variables, invalid connection strings
{
  "success": false,
  "message": "Storage connection string is required",
  "code": "STORAGE_CONFIG_ERROR"
}
```

#### Service Errors (500 Internal Server Error)
```typescript
// Triggered by: Azure service failures, network issues, timeouts
{
  "success": false,
  "message": "Failed to store order in storage",
  "code": "STORAGE_ERROR"
}
```

## Error Handling Layers

### Layer 1: Input Validation

**Location**: `parseRequestBody()` and `validateInput()` functions

**Purpose**: Ensure request data is valid before processing begins

**Strategy**:
- Parse JSON with try-catch for syntax errors
- Validate against Zod schema for structure and business rules
- Return detailed field-level error messages
- No retry logic (client must fix input)

```typescript
async function parseRequestBody(request: HttpRequest): Promise<any> {
  try {
    const body = await request.json();
    if (!body) {
      throw new ValidationError('Request body is required', ['Request body cannot be empty']);
    }
    return body;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid JSON in request body', ['Request body must be valid JSON']);
  }
}
```

### Layer 2: Service-Level Error Handling

**Location**: Individual service classes (`StorageService`, `MessagingService`)

**Purpose**: Handle service-specific failures and provide context

**Strategy**:
- Catch service-specific exceptions
- Wrap in custom error types with error codes
- Log errors with full context
- Throw typed errors for upstream handling

```typescript
async storeOrder(order: Order, context: InvocationContext): Promise<void> {
  try {
    // Storage operations...
    context.log(`Order ${order.id} stored successfully in blob storage`);
  } catch (error) {
    context.error("Failed to store order in blob storage:", error);
    throw new OrderProcessingError(
      "Failed to store order in storage",
      "STORAGE_ERROR"
    );
  }
}
```

### Layer 3: Retry Logic

**Location**: `withRetry()` utility function

**Purpose**: Handle transient failures with exponential backoff

**Strategy**:
- Configurable retry attempts (default: 3)
- Exponential backoff with jitter
- Log retry attempts with context
- Fail after max attempts exceeded

```typescript
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context: InvocationContext
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxAttempts) {
        context.error(`Operation failed after ${config.maxAttempts} attempts:`, lastError);
        throw lastError;
      }
      
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      context.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

### Layer 4: Function-Level Error Handling

**Location**: Main `processOrder()` function

**Purpose**: Coordinate all error handling and ensure proper cleanup

**Strategy**:
- Catch all unhandled errors
- Ensure resource cleanup in finally blocks
- Convert errors to appropriate HTTP responses
- Log processing metrics and errors

```typescript
export async function processOrder(
  request: HttpRequest, 
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();
  context.log('Order processing started');

  try {
    // Process order...
    return { status: 201, jsonBody: result };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    context.error(`Order processing failed after ${processingTime}ms`);
    return handleError(error, context);
  } finally {
    // Always clean up resources
    await messagingService.close();
  }
}
```

## Error Response Formatting

### Centralized Error Handler

```typescript
export function handleError(error: unknown, context: InvocationContext) {
  if (error instanceof ValidationError) {
    context.error('Validation error:', error.message, error.validationErrors);
    return {
      status: error.statusCode,
      jsonBody: {
        success: false,
        message: error.message,
        errors: error.validationErrors
      }
    };
  }

  if (error instanceof OrderProcessingError) {
    context.error('Order processing error:', error.message);
    return {
      status: error.statusCode,
      jsonBody: {
        success: false,
        message: error.message,
        code: error.code
      }
    };
  }

  context.error('Unexpected error:', error);
  return {
    status: 500,
    jsonBody: {
      success: false,
      message: 'Internal server error'
    }
  };
}
```

## Retry Configuration

### Default Retry Settings

```typescript
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,           // Maximum retry attempts
  baseDelay: 1000,          // Initial delay in milliseconds
  maxDelay: 10000,          // Maximum delay between retries
  backoffMultiplier: 2      // Exponential backoff multiplier
};
```

### Service-Specific Retry Policies

| Service | Max Attempts | Base Delay | Use Case |
|---------|-------------|------------|----------|
| Storage Container Init | 2 | 1000ms | Quick container creation |
| Storage Order Save | 3 | 1000ms | Standard retry for data persistence |
| Service Bus Message | 3 | 1000ms | Standard retry for messaging |

## Error Monitoring

### Log Correlation

All errors include:
- Request ID for tracing
- Processing time for performance monitoring
- Error context for debugging
- Service-specific error codes

### Error Metrics

Key metrics tracked:
- Error rate by error type
- Retry success/failure rates
- Processing time distribution
- Service availability

### Alert Thresholds

- **Critical**: Error rate > 10% over 5 minutes
- **Warning**: Retry rate > 20% over 10 minutes
- **Info**: Processing time > 5 seconds

## Debugging Guide

### Common Error Scenarios

1. **Storage Connection Issues**
   ```
   Error: Storage connection string is required
   Solution: Verify AzureWebJobsStorage environment variable
   ```

2. **Service Bus Queue Missing**
   ```
   Error: Messaging entity 'order-processing' could not be found
   Solution: Create queue in Service Bus namespace or enable SKIP_SERVICE_BUS
   ```

3. **Validation Failures**
   ```
   Error: End date must be after start date
   Solution: Check request data format and business rules
   ```

### Diagnostic Steps

1. **Check Environment Variables**
   - Verify all required connection strings are set
   - Confirm configuration format is correct

2. **Review Logs**
   - Look for error patterns in Application Insights
   - Check retry attempt logs for transient issues

3. **Test Services Independently**
   - Verify storage account accessibility
   - Confirm Service Bus namespace and queue exist

4. **Validate Request Data**
   - Use schema validation tools
   - Test with known-good sample data

## Best Practices

### For Developers

1. **Always handle errors explicitly** - Don't rely on default error handling
2. **Use appropriate error types** - Custom errors provide better context
3. **Log errors with context** - Include request ID, timing, and relevant data
4. **Clean up resources** - Use try-finally blocks for resource management
5. **Test error scenarios** - Include error cases in unit and integration tests

### For Operations

1. **Monitor error patterns** - Set up alerts for unusual error rates
2. **Review logs regularly** - Look for recurring issues that need fixes
3. **Document error resolutions** - Build knowledge base for common issues
4. **Test disaster recovery** - Ensure error handling works under load

## Security Considerations

### Error Information Disclosure

- **Never expose** sensitive data in error messages
- **Sanitize** connection strings and secrets from logs
- **Use generic messages** for internal server errors
- **Log full details** securely for debugging

### Error Response Security

```typescript
// Good: Generic error message
{
  "success": false,
  "message": "Internal server error"
}

// Bad: Exposes internal details
{
  "success": false,
  "message": "Database connection failed: Server not found at internal.db.server:1433"
}
```
