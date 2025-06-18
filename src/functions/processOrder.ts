import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { v4 as uuidv4 } from 'uuid';
import { Order, CreateOrderRequest, OrderProcessingResult } from '../types/Order';
import { CreateOrderSchema } from "../schema/order.schema";
import { handleError, ValidationError, OrderProcessingError } from '../utils/errors';
import { StorageService } from '../services/storageService';
import { MessagingService } from '../services/messagingService';
import { withRetry } from '../utils/retry';

export async function processOrder(
  request: HttpRequest, 
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();
  context.log('Order processing started');

  try {
    //  validation
    const requestBody = await parseRequestBody(request);
    const validatedInput = validateInput(requestBody);
    
    // create order object
    const order = createOrder(validatedInput);
    context.log(`Created order ${order.id} for employee ${order.employeeId}`);

    // Initialize services
    const storageService = new StorageService(
      process.env.AzureWebJobsStorage || ''
    );
    
    const messagingService = new MessagingService(
      process.env.ServiceBusConnectionString || ''
    );

    try {
      // Initialize storage container
      await withRetry(
        () => storageService.initializeContainer(),
        { maxAttempts: 2 },
        context
      );

      // Store order with retry logic
      await withRetry(
        () => storageService.storeOrder(order, context),
        { maxAttempts: 3 },
        context
      );

      // Send message to Service Bus with retry logic
      await withRetry(
        () => messagingService.sendOrderMessage(order, context),
        { maxAttempts: 3 },
        context
      );

      // Log success metrics
      const processingTime = Date.now() - startTime;
      context.log(`Order ${order.id} processed successfully in ${processingTime}ms`);

      const result: OrderProcessingResult = {
        success: true,
        orderId: order.id,
        message: 'Order processed successfully'
      };

      return {
        status: 201,
        jsonBody: result
      };

    } finally {
      // Clean up resources
      await messagingService.close();
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    context.error(`Order processing failed after ${processingTime}ms`);
    return handleError(error, context);
  }
}

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

function createOrder(input: CreateOrderRequest): Order {
  return {
    id: uuidv4(),
    employeeId: input.employeeId,
    bikeModel: input.bikeModel,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    status: 'PENDING',
    price: input.price,
    currency: input.currency,
    companyId: input.companyId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Register the function
app.http('processOrder', {
  methods: ['POST'],
  authLevel: 'function',
  handler: processOrder
});