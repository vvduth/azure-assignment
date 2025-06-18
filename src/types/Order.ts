export interface Order {
  id: string;
  employeeId: string;
  bikeModel: string;
  startDate: Date;
  endDate: Date;
  status: "PENDING" | "APPROVED" | "REJECTED";
  price: number;
  currency: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderRequest {
  employeeId: string;
  bikeModel: string;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
  companyId: string;
}

export interface OrderProcessingResult {
  success: boolean;
  orderId: string;
  message: string;
  errors?: string[];
}
