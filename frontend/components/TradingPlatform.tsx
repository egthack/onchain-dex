import React from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarChart3, ChevronDown, Clock, BookOpen, ArrowUpDown } from 'lucide-react';

const TradingPlatform = () => {
  // const [orderType, setOrderType] = useState('limit');
  // const [selectedPair, setSelectedPair] = useState('ETH-USDT');

  // sample data
  const orderBookData = {
    asks: [
      { price: '2150.50', size: '1.2345', total: '2654.99' },
      { price: '2150.40', size: '0.5678', total: '1221.12' },
      { price: '2150.30', size: '2.3456', total: '5043.92' },
    ],
    bids: [
      { price: '2150.20', size: '1.8765', total: '4034.88' },
      { price: '2150.10', size: '0.9876', total: '2123.45' },
      { price: '2150.00', size: '3.4567', total: '7432.11' },
    ]
  };

  const recentTrades = [
    { time: '12:30:45', price: '2150.30', size: '0.5432', side: 'buy' },
    { time: '12:30:42', price: '2150.20', size: '1.2345', side: 'sell' },
    { time: '12:30:40', price: '2150.40', size: '0.3456', side: 'buy' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* navigation header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center space-x-4">
          <span className="text-xl font-bold text-blue-600">RiseX</span>
          <div className="flex items-center px-3 py-1 bg-gray-100 rounded cursor-pointer">
            <span className="mr-2">hogehoge</span>
            <ChevronDown size={16} />
          </div>
          <span className="text-green-500 font-semibold">2150.30 USDT</span>
          <span className="text-green-500">+2.5%</span>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" className="text-gray-600">
            <Clock size={16} className="mr-2" />
            24h Volume: 15.2K ETH
          </Button>
        </div>
      </div>

      {/* main content */}
      <div className="flex flex-1 p-4 space-x-4">
        <Card className="w-1/4 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center">
              <BookOpen size={16} className="mr-2" />
              Order Book
            </h3>
            <span className="text-xs text-gray-500">Depth: 0.1</span>
          </div>
          
          {/* sell order */}
          <div className="space-y-1 mb-4">
            {orderBookData.asks.map((ask) => (
              <div key={ask.price} className="flex text-sm justify-between">
                <span className="text-red-500">{ask.price}</span>
                <span>{ask.size}</span>
                <span className="text-gray-500">{ask.total}</span>
              </div>
            ))}
          </div>

          {/* Current Price */}
          <div className="flex justify-between py-2 border-y border-gray-200">
            <span className="font-semibold">2150.30</span>
            <span className="text-gray-500">$2150.30</span>
          </div>

          {/* Buy Orders */}
          <div className="space-y-1 mt-4">
            {orderBookData.bids.map((bid) => (
              <div key={bid.price} className="flex text-sm justify-between">
                <span className="text-green-500">{bid.price}</span>
                <span>{bid.size}</span>
                <span className="text-gray-500">{bid.total}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Chart Area */}
        <Card className="flex-1 p-4">
          <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-200 rounded">
            <BarChart3 size={48} className="text-gray-400" />
            <span className="ml-2 text-gray-500">Trading Chart Area</span>
          </div>
        </Card>

        {/* Right Sidebar - Order Form and Trade History */}
        <div className="w-1/4 space-y-4">
          {/* Order Form */}
          <Card className="p-4">
            <Tabs defaultValue="limit">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="limit" className="flex-1">Limit</TabsTrigger>
                <TabsTrigger value="market" className="flex-1">Market</TabsTrigger>
                <TabsTrigger value="stop" className="flex-1">Stop</TabsTrigger>
              </TabsList>

              <TabsContent value="limit" className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="price-input" className="block text-sm text-gray-600">Price</label>
                  <Input id="price-input" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="amount-input" className="block text-sm text-gray-600">Amount</label>
                  <Input id="amount-input" placeholder="0.00" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Button size="sm" variant="ghost" className="text-xs">25%</Button>
                  <Button size="sm" variant="ghost" className="text-xs">50%</Button>
                  <Button size="sm" variant="ghost" className="text-xs">75%</Button>
                  <Button size="sm" variant="ghost" className="text-xs">100%</Button>
                </div>
                <div className="space-y-2">
                  <Button className="w-full bg-green-500 hover:bg-green-600">Buy ETH</Button>
                  <Button className="w-full bg-red-500 hover:bg-red-600">Sell ETH</Button>
                </div>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Trade History */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center">
                <ArrowUpDown size={16} className="mr-2" />
                Recent Trades
              </h3>
            </div>
            <div className="space-y-2">
              {recentTrades.map((trade) => (
                <div key={trade.price} className="flex text-sm justify-between">
                  <span className="text-gray-500">{trade.time}</span>
                  <span className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                    {trade.price}
                  </span>
                  <span>{trade.size}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TradingPlatform;