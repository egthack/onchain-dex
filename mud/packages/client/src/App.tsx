import { AccountButton } from "@latticexyz/entrykit/internal";
import { useMemo, useState } from "react";
import { useWorldContract } from "./mud/useWorldContract";
import { useSync } from "@latticexyz/store-sync/react";
import { Matches } from "@latticexyz/stash/internal";
import type { getSchemaPrimitives } from "@latticexyz/protocol-parser/internal";
import { stash } from "./mud/stash";
import config from "contracts/mud.config";

type OrderType = getSchemaPrimitives<{
  readonly orderId: { readonly type: "uint256"; readonly internalType: "uint256" };
  readonly user: { readonly type: "address"; readonly internalType: "address" };
  readonly baseToken: { readonly type: "address"; readonly internalType: "address" };
  readonly quoteToken: { readonly type: "address"; readonly internalType: "address" };
  readonly price: { readonly type: "uint256"; readonly internalType: "uint256" };
  readonly amount: { readonly type: "uint256"; readonly internalType: "uint256" };
  readonly isBuy: { readonly type: "bool"; readonly internalType: "bool" };
  readonly active: { readonly type: "bool"; readonly internalType: "bool" };
  readonly timestamp: { readonly type: "uint256"; readonly internalType: "uint256" };
}>;

export function App() {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [topBuyOrders, setTopBuyOrders] = useState<OrderType[]>([]); 
  const [topSellOrders, setTopSellOrders] = useState<OrderType[]>([]); 
  const { Order } = config.tables;

  const sync = useSync();
  const worldContract = useWorldContract();

  function logOrderRecord(orderId: bigint) {
    const { Order } = config.tables;
    const orderRecord = stash.getRecord({ table: Order, key: { orderId } });

    console.log(orderRecord);
  }
    
  // stash.subscribeTable({
  //   table: Order,
  //   subscriber: (update) => {
  //     console.log("Order update", update);
  //   }
  // })


  const buyOrderQuery = stash.subscribeQuery({
    query: [Matches(Order, { active: true, isBuy: true })]
  })

  buyOrderQuery.subscribe((update) => {
    const currentOrder = update[0]?.current;
    if (currentOrder) {
      console.log("Buy Order Update:", currentOrder);
      setTopBuyOrders((prevOrders) => {
        const orderExists = prevOrders.some(order => order.orderId === currentOrder.orderId);
        if (!orderExists) {
          const newOrders = [...prevOrders, currentOrder];
          return newOrders.sort((a, b) => Number(b.price) - Number(a.price)); // bigint を number に変換
        }
        return prevOrders;
      });
    }
  });

  const sellOrderQuery = stash.subscribeQuery({
    query: [Matches(Order, { active: true, isBuy: false })]
  })

  sellOrderQuery.subscribe((update) => {
    const currentOrder = update[0]?.current;
    if (currentOrder) {
      console.log("Sell Order Update:", currentOrder);
      setTopSellOrders((prevOrders) => {
        const orderExists = prevOrders.some(order => order.orderId === currentOrder.orderId);
        if (!orderExists) {
          const newOrders = [...prevOrders, currentOrder];
          return newOrders.sort((a, b) => Number(b.price) - Number(a.price)); // bigint を number に変換
        }
        return prevOrders;
      });
    }
  });

  async function getHighestBuyOrders() {
    const orders = stash.runQuery({
      query: [Matches(Order, { active: true, isBuy: true })],
      options: {
        includeRecords: true
      }
    })

    const orderEntries = Object.entries(orders.records[""].Order);
    const sortedOrderEntries = orderEntries.sort(([, a], [, b]) => {
      return a.price > b.price ? -1 : a.price < b.price ? 1 : 0;
    });
    const sortedOrders = sortedOrderEntries.map(([, order]) => order);
    
    const top15BuyOrders = sortedOrders.slice(0, 15);
    setTopBuyOrders(top15BuyOrders);
  }

  async function getLowestSellOrders() {
    const orders = stash.runQuery({
      query: [Matches(Order, { active: true, isBuy: false })],
      options: {
        includeRecords: true
      }
    })

    const orderEntries = Object.entries(orders.records[""].Order);
    const sortedOrderEntries = orderEntries.sort(([, a], [, b]) => {
      return a.price > b.price ? -1 : a.price < b.price ? 1 : 0;
    });
    const sortedOrders = sortedOrderEntries.map(([, order]) => order);
    
    const top15SellOrders = sortedOrders.slice(0, 15);
    setTopSellOrders(top15SellOrders);
  }

  const handlePlaceOrder = useMemo(() => {
    if (!sync.data || !worldContract) return undefined;

    return async () => {
      try {
        if (amount !== undefined && price !== undefined) {
          const tx = await worldContract.write.placeOrder([
            "0x17E42453D681E11a3bB3a9dcA6faF5dE0eF72624",
            "0xb7427086524627fa8AdF96A04aCF5e3281A929C5",
            BigInt(amount),
            BigInt(price),
          ]);
          await sync.data.waitForTransaction(tx);
          console.log("Order placed successfully");
        } else {
          console.error("Input value is not valid");
        }
      } catch (error) {
        console.error("Failed to place order:", error);
      }
    };
  }, [sync.data, worldContract, amount, price]);

  return (
    <>
      <div className="fixed top-2 right-2">
        <AccountButton />
      </div>
      <div className="fixed top-16 right-2">
        <input
          type="number"
          placeholder="Enter amount"
          className="border border-gray-300 rounded px-2 py-1 mb-2"
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <input
          type="number"
          placeholder="Enter price"
          className="border border-gray-300 rounded px-2 py-1 mb-2"
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <button
          type="button"
          onClick={handlePlaceOrder}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Place Order
        </button>
        <button
          type="button"
          onClick={() => {
            getHighestBuyOrders();
            getLowestSellOrders();
          }}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          Fresh Orders
        </button>
      <div className="mt-4">
        <h3 className="font-bold">Top Buy Orders</h3>
        <ul>
          {topBuyOrders.map((order) => (
            <li key={order.orderId} className="border-b border-gray-300 py-2">
              <span>Amount: {order.amount.toString()}</span>, 
              <span> Price: {order.price.toString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <h3 className="font-bold">Top Sell Orders</h3>
        <ul>
          {topSellOrders.map((order) => (
            <li key={order.orderId} className="border-b border-gray-300 py-2">
              <span>Amount: {order.amount.toString()}</span>, 
              <span> Price: {order.price.toString()}</span>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </>
  );
}
