import {InvocationContext   } from "@azure/functions"

export class OrderProcessingError extends Error {
    constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'OrderProcessingError';
  }
}

export class ValidationError extends OrderProcessingError {
  constructor(message: string, public validationErrors: string[]) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

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