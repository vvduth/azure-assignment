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
