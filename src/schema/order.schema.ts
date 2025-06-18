import { z } from 'zod';

export const CreateOrderSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  bikeModel: z.string().min(1, "Bike model is required"),
  startDate: z.string().datetime("Invalid start date format"),
  endDate: z.string().datetime("Invalid end date format"),
  price: z.number().positive("Price must be positive"),
  currency: z.string().length(3, "Currency must be 3 characters"),
  companyId: z.string().min(1, "Company ID is required")
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

export type CreateOrderInputType = z.infer<typeof CreateOrderSchema>;