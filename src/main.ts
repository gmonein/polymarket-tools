import * as ENV from "./env";
import { Chain, ClobClient } from "@polymarket/clob-client";
import { GetMarketsPayload } from './types/clob-api/GetMarketsPayload'
import { GammaClient } from "./gammaClient";
import { HyperliquidClient } from "./hyperliquidClient";

async function globRequest() {
  const host = ENV.CLOB_API_URL;
  const chainId = parseInt(`${ENV.CHAIN_ID}`) as Chain;
  const clobClient = new ClobClient(host, chainId);

  let markets: GetMarketsPayload['data'] = []
  let cursor = ''
  for(let i = 0; i < 100; i += 1) {
    const page: GetMarketsPayload = await clobClient.getMarkets(`next_cursor=${cursor}`)
    const filtered_markets = page.data.filter(bet => { bet.question.includes('price') || bet.question.includes('Price') })
    markets = [...markets, ...filtered_markets]
    cursor = page.next_cursor
  }
  console.log(markets.map(m => m.question))
}

async function fetchTrades() {
// fetch("https://clob.polymarket.com/prices-history?interval=1m&market=33945469250963963541781051637999677727672635213493648594066577298999471399137&fidelity=180", {
}

async function gammaRequest() {
  const gammaClient = new GammaClient()
  for (let i = 0; i < 10; i += 1) {
    const markets = await gammaClient.listMarkets({
      limit: 50,
      offset: i * 50,
      order: 'createdAt',
      ascending: false,
    })
    const bitcoin_price_markets = markets.filter(e => e.description.includes('Bitcoin'))
    console.log(bitcoin_price_markets.map(e => e.question))
  }
}

async function hyperliquidRequest() {
  const hyperliquidClient = new HyperliquidClient()

  const olhcData = await hyperliquidClient.getOLHC({
    coin: "BTC",
    interval: "1h",
  })
  console.log(olhcData)
}

gammaRequest()
// hyperliquidRequest()
