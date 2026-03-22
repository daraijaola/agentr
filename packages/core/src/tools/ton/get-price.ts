import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import { getTonPrice } from "../../ton/wallet-service.js";
import { getErrorMessage } from "../../utils/errors.js";

export const tonPriceTool: Tool = {
  name: "ton_price",
  description: "Fetch the current TON/USD market price.",
  parameters: Type.Object({}),
};

export const tonPriceExecutor: ToolExecutor<{}> = async (_params, _context): Promise<ToolResult> => {
  try {
    const price = await getTonPrice();
    if (!price || price === 0) {
      return { success: false, error: "Failed to fetch TON price." };
    }
    return {
      success: true,
      data: {
        price,
        currency: "USD",
        message: `Current TON price: $${price.toFixed(4)} USD`,
      },
    };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
};
