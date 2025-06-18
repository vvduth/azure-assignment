import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { Order } from "../types/Order";
import { OrderProcessingError } from "../utils/errors";
import { InvocationContext } from "@azure/functions";

export class StorageService {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;

  constructor(connectionString: string) {
    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient("orders");
  }

  async initializeContainer(): Promise<void> {
    try {
      await this.containerClient.createIfNotExists();
    } catch (error) {
      throw new OrderProcessingError(
        "Failed to initialize storage container",
        "STORAGE_INIT_ERROR"
      );
    }
  }
  async storeOrder(order: Order, context: InvocationContext): Promise<void> {
    try {
      const blobName = `${order.companyId}/${order.id}.json`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      const orderData = JSON.stringify(order, null, 2);

      await blockBlobClient.upload(orderData, orderData.length, {
        blobHTTPHeaders: {
          blobContentType: "application/json",
        },
        metadata: {
          companyId: order.companyId,
          employeeId: order.employeeId,
          status: order.status,
        },
      });

      context.log(`Order ${order.id} stored successfully in blob storage`);
    } catch (error) {
      context.error("Failed to store order in blob storage:", error);
      throw new OrderProcessingError(
        "Failed to store order in storage",
        "STORAGE_ERROR"
      );
    }
  }
  async getOrder(orderId: string, companyId: string): Promise<Order | null> {
    try {
      const blobName = `${companyId}/${orderId}.json`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      const response = await blockBlobClient.download();
      const orderData = await this.streamToString(response.readableStreamBody!);

      return JSON.parse(orderData) as Order;
    } catch (error) {
      return null;
    }
  }
  private async streamToString(
    readableStream: NodeJS.ReadableStream
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString());
      });
      readableStream.on("error", reject);
    });
  }
}
