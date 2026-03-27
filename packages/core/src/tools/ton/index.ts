import { tonGetAddressTool, tonGetAddressExecutor } from "./get-address.js";
import { tonGetBalanceTool, tonGetBalanceExecutor } from "./get-balance.js";
import { tonPriceTool, tonPriceExecutor } from "./get-price.js";
import { tonSendTool, tonSendExecutor } from "./send.js";
import { tonGetTransactionsTool, tonGetTransactionsExecutor } from "./get-transactions.js";
import { tonMyTransactionsTool, tonMyTransactionsExecutor } from "./my-transactions.js";
import { tonChartTool, tonChartExecutor } from "./chart.js";
import { jettonBalancesTool, jettonBalancesExecutor } from "./jetton-balances.js";
import { jettonHistoryTool, jettonHistoryExecutor } from "./jetton-history.js";
import { jettonHoldersTool, jettonHoldersExecutor } from "./jetton-holders.js";
import { jettonInfoTool, jettonInfoExecutor } from "./jetton-info.js";
import { jettonPriceTool, jettonPriceExecutor } from "./jetton-price.js";
import { jettonSendTool, jettonSendExecutor } from "./jetton-send.js";
import { dexQuoteTool, dexQuoteExecutor } from "./dex-quote.js";
import { nftListTool, nftListExecutor } from "./nft-list.js";
import type { ToolEntry } from "../types.js";

export { tonGetAddressTool, tonGetAddressExecutor };
export { tonGetBalanceTool, tonGetBalanceExecutor };
export { tonPriceTool, tonPriceExecutor };
export { tonSendTool, tonSendExecutor };
export { tonGetTransactionsTool, tonGetTransactionsExecutor };
export { tonMyTransactionsTool, tonMyTransactionsExecutor };
export { tonChartTool, tonChartExecutor };
export { jettonBalancesTool, jettonBalancesExecutor };
export { jettonHistoryTool, jettonHistoryExecutor };
export { jettonHoldersTool, jettonHoldersExecutor };
export { jettonInfoTool, jettonInfoExecutor };
export { jettonPriceTool, jettonPriceExecutor };
export { jettonSendTool, jettonSendExecutor };
export { dexQuoteTool, dexQuoteExecutor };
export { nftListTool, nftListExecutor };

export const tools: ToolEntry[] = [
  { tool: tonSendTool,              executor: tonSendExecutor,              scope: "dm-only" },
  { tool: jettonSendTool,           executor: jettonSendExecutor,           scope: "dm-only" },
  { tool: tonGetAddressTool,        executor: tonGetAddressExecutor },
  { tool: tonGetBalanceTool,        executor: tonGetBalanceExecutor },
  { tool: tonPriceTool,             executor: tonPriceExecutor },
  { tool: tonGetTransactionsTool,   executor: tonGetTransactionsExecutor },
  { tool: tonMyTransactionsTool,    executor: tonMyTransactionsExecutor },
  { tool: tonChartTool,             executor: tonChartExecutor },
  { tool: jettonBalancesTool,       executor: jettonBalancesExecutor },
  { tool: jettonHistoryTool,        executor: jettonHistoryExecutor },
  { tool: jettonHoldersTool,        executor: jettonHoldersExecutor },
  { tool: jettonInfoTool,           executor: jettonInfoExecutor },
  { tool: jettonPriceTool,          executor: jettonPriceExecutor },
  { tool: dexQuoteTool,             executor: dexQuoteExecutor },
  { tool: nftListTool,              executor: nftListExecutor },
];
