import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import { getWalletBalance } from "../../ton/wallet-service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("Tools");
export const tonGetBalanceTool: Tool = {
  name: "ton_get_balance",
  description: "Check your current TON balance in TON units.",
  parameters: Type.Object({}),
  category: "data-bearing",
};
export const tonGetBalanceExecutor: ToolExecutor<{}> = async (_params, context): Promise<ToolResult> => {
  try {
    const ctx = context as Record<string, unknown>
    const address = ctx["walletAddress"] as string | undefined
    if (!address) return { success: false, error: "Wallet not initialized." }
    const balance = await getWalletBalance(address)
    const ton = Number(balance) / 1e9
    return {
      success: true,
      data: {
        address,
        balance: ton.toFixed(4),
        balanceNano: balance.toString(),
        message: "Your wallet balance: " + ton.toFixed(4) + " TON",
        summary: ton.toFixed(4) + " TON",
      },
    }
  } catch (error) {
    log.error({ err: error }, "Error in ton_get_balance")
    return { success: false, error: getErrorMessage(error) }
  }
};
